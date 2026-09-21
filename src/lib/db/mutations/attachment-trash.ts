import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { attachments } from "@dss/core/schema";
import { db } from "@/lib/db";
import { insertAuditLog } from "./audit-logs";

/**
 * ============================================================================
 * 🔴 견적서를 휴지통에 넣고 · 되살리고 · 지울 때 딸려 가는 **첨부**만
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(613줄)은 첨부 휴지통 전체다 — 파일 하나를 지우고
 * 되살리는 통로(`softDeleteAttachment` · `restoreAttachment`), 내려받기 감사, 잠긴
 * 접수 건 판정까지. **첨부 화면은 조각 3d 에서 온다**(설계서 G절). 여기 있는 것은
 * 그중 **견적서 휴지통이 부르는 네 함수뿐**이고, 저쪽 파일의 같은 이름 함수에서
 * 글자를 바꾸지 않고 가져왔다.
 *
 * 🔴 **왜 조각 3d 를 기다리지 않는가** — 두 사이트가 **같은 `dss_as`** 를 본다.
 * 견적서를 휴지통에 넣으면 붙어 있던 결재 PDF · 수기 엑셀도 **같은 트랜잭션에서**
 * 첨부 휴지통으로 가야 한다(quote-trash.ts 머리말의 '견적서의 첨부'). 이 사이트만
 * 그것을 빼먹으면, 여기서 지운 견적서를 A/S 에서 되살렸을 때 파일이 따라오지 않고
 * 반대로 「휴지통 견적서에 살아 있는 파일」이 남는다. 화면이 없다고 **자료의 규칙까지
 * 빼고 갈 수는 없다.**
 *
 * ── ⚠️ 이 파일은 storage.delete()를 부르지 않는다 ───────────────────────
 * 저쪽 파일에서 가장 중요한 사실이고 여기서도 같다. 보안 정책
 * (SECURITY_POLICY.md 10번)이 파일을 *반영구 보관*으로 정하고 있고, 더 실용적인
 * 이유가 있다 — **복원하려면 실물이 있어야 한다.** 여기 네 함수는 DB 의 표시만
 * 바꾼다.
 *
 * ── 🔴 조각 3d 가 오면 ──────────────────────────────────────────────────
 * 저쪽 613줄이 이 파일에 더해진다. **그때 이 넷을 두 벌로 만들지 말 것** — 파일
 * 이름 · 함수 이름 · 상수 이름을 A/S 와 똑같이 두었다. 특히
 * `QUOTE_DELETED_ATTACHMENT_REASON` 은 **DB 에 실제로 적히는 글자**라, 두 벌이 되어
 * 한쪽만 바뀌면 되살리기가 「함께 간 파일」을 못 가른다.
 * ============================================================================
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 이 첨부의 주인을 감사 기록에 어떻게 적을 것인가.
 *
 * **어느 주인인지를 먼저 적고 그 주인의 키만 싣는다** — 두 키를 늘 함께 실으면
 * 모델 첨부의 기록에 `repairCaseId: null` 이 남고, 나중에 그 줄만 읽는 사람은 무슨
 * 파일이었는지 알 수 없다. 사람이 읽는 이름(견적서는 발행번호)도 함께 싣는다.
 *
 * 🔴 저쪽 파일의 같은 함수에서 글자를 바꾸지 않았다. **이 사이트가 부르는 자리는
 * 견적서 갈래 하나뿐**이지만 갈래를 쳐 내지 않은 것은 일부러다 — 같은 `audit_logs`
 * 표에 A/S 가 남긴 줄과 나란히 쌓이므로, 줄의 모양이 사이트마다 달라지면 그 표를
 * 읽는 화면(A/S 의 감사 화면)이 두 모양을 알아야 한다.
 */
function ownerAuditFields(owner: {
  repairCaseId: string | null;
  productModelId: string | null;
  /** 셋째 주인(2026-09-15 Q2). */
  quoteId: string | null;
  /** 생략하면 이름 키를 싣지 않는다(값이 null 인 것과 다르다). */
  intakeNumber?: string | null;
  /** 생략하면 이름 키를 싣지 않는다(값이 null 인 것과 다르다). */
  modelName?: string | null;
  /** 생략하면 이름 키를 싣지 않는다(값이 null 인 것과 다르다). */
  quoteNumber?: string | null;
}): Record<string, unknown> {
  if (owner.repairCaseId !== null) {
    return {
      ownerType: "REPAIR_CASE",
      repairCaseId: owner.repairCaseId,
      ...(owner.intakeNumber === undefined ? {} : { intakeNumber: owner.intakeNumber }),
    };
  }
  if (owner.productModelId !== null) {
    return {
      ownerType: "PRODUCT_MODEL",
      productModelId: owner.productModelId,
      ...(owner.modelName === undefined ? {} : { modelName: owner.modelName }),
    };
  }
  if (owner.quoteId !== null) {
    return {
      ownerType: "QUOTE",
      quoteId: owner.quoteId,
      ...(owner.quoteNumber === undefined ? {} : { quoteNumber: owner.quoteNumber }),
    };
  }
  return { ownerType: "NONE" };
}

/**
 * 견적서를 휴지통에 넣으며 함께 첨부 휴지통으로 보낸 파일의 삭제 사유 칸 — **고정
 * 문구다.** 사람이 적은 사유와도, 칸 교체로 밀려난 파일의 사유
 * (A/S 의 attachments.ts 의 QUOTE_ATTACHMENT_REPLACED_REASON)와도 다르다.
 *
 * 견적서를 되살릴 때 **이 사유이면서 삭제 시각이 견적서의 삭제 시각과 같은 파일만**
 * 돌려보낸다(restoreAttachmentsTrashedWithQuote). 둘 다 보는 까닭: 사유만 보면 사람이
 * 파일을 지우며 같은 글자를 사유로 적은 경우를 가를 수 없고, 시각만 보면 같은 순간에
 * 다른 까닭으로 휴지통에 간 파일을 가를 수 없다. 둘은 같은 트랜잭션에서 **같은 Date
 * 값 하나**로 적힌다(quote-trash.ts 의 softDeleteQuote).
 *
 * 🔴 **DB 에 실제로 적히는 글자다.** A/S 의 같은 상수와 한 글자라도 달라지면, 저쪽에서
 * 지운 견적서를 여기서 되살릴 때(또는 그 반대) 함께 간 파일을 못 가른다.
 */
export const QUOTE_DELETED_ATTACHMENT_REASON = "견적서 휴지통 — 견적서와 함께";

export type QuoteAttachmentToTrash = {
  id: string;
  category: typeof attachments.$inferSelect.category;
};

/**
 * 견적서의 살아 있는 첨부 — 부르는 쪽(softDeleteQuote)이 견적서 행을 잠근 트랜잭션에서
 * 읽는다. 올리기 · 지우기 · 되살리기도 같은 행을 먼저 잠그므로(A/S 의
 * guardQuoteAttachmentChange) 읽은 목록과 휴지통으로 보낼 때 사이에 한 장이 끼어들거나
 * 빠지지 않는다. 차례는 올린 차례 — 감사에 싣는 id 목록의 차례가 된다. 부분 인덱스
 * (attachments_quote_id_not_deleted_idx)를 타는 모양이다.
 */
export async function listLiveAttachmentsOfQuote(tx: Tx, quoteId: string): Promise<QuoteAttachmentToTrash[]> {
  return tx
    .select({ id: attachments.id, category: attachments.category })
    .from(attachments)
    .where(and(eq(attachments.quoteId, quoteId), eq(attachments.isDeleted, false)))
    .orderBy(asc(attachments.uploadedAt), asc(attachments.id));
}

/**
 * 휴지통으로 가는 견적서의 첨부를 첨부 휴지통으로 보낸다 — **부르는 쪽의 트랜잭션 안에서.**
 * 소프트 삭제 네 칸 + 첨부마다 FILE_DELETE 감사 한 줄. 디스크 실물은 건드리지 않는다.
 *
 * `deletedAt` 은 부르는 쪽이 견적서 행에 적은 **그 값**을 넘긴다 — 되살리기가 「견적서와
 * 함께 간 파일」을 가르는 열쇠 중 하나다(위 QUOTE_DELETED_ATTACHMENT_REASON 주석).
 *
 * 견적서 행은 지워지지 않고 남으므로(소프트 삭제) 주인 칸도 그대로다. 실제로 휴지통에 간
 * id 를 넘겨받은 차례대로 돌려준다(부르는 쪽이 SOFT_DELETE 감사에 싣는다).
 */
export async function trashAttachmentsOfDeletedQuote(
  tx: Tx,
  params: {
    quoteId: string;
    quoteNumber: string;
    attachments: readonly QuoteAttachmentToTrash[];
    actorUserId: string;
    deletedAt: Date;
  }
): Promise<string[]> {
  if (params.attachments.length === 0) return [];

  const updated = await tx
    .update(attachments)
    .set({
      isDeleted: true,
      deletedAt: params.deletedAt,
      deletedBy: params.actorUserId,
      deleteReason: QUOTE_DELETED_ATTACHMENT_REASON,
    })
    .where(
      and(
        inArray(
          attachments.id,
          params.attachments.map((item) => item.id)
        ),
        eq(attachments.isDeleted, false)
      )
    )
    .returning({ id: attachments.id });

  const updatedIds = new Set(updated.map((row) => row.id));
  const trashed = params.attachments.filter((item) => updatedIds.has(item.id));

  for (const item of trashed) {
    await insertAuditLog(tx, {
      actorUserId: params.actorUserId,
      actionType: "FILE_DELETE",
      targetEntity: "attachments",
      targetRecordId: item.id,
      previousValue: { isDeleted: false },
      newValue: {
        isDeleted: true,
        deletedAt: params.deletedAt.toISOString(),
        deleteReason: QUOTE_DELETED_ATTACHMENT_REASON,
        ...ownerAuditFields({
          repairCaseId: null,
          productModelId: null,
          quoteId: params.quoteId,
          quoteNumber: params.quoteNumber,
        }),
        category: item.category,
        storedFileRetained: true,
      },
    });
  }

  return trashed.map((item) => item.id);
}

/**
 * 휴지통에서 되살아나는 견적서의 첨부 중 **견적서와 함께 휴지통에 간 것만** 되살린다 —
 * 부르는 쪽(restoreQuote)의 트랜잭션 안에서, 견적서 행을 잠근 뒤에.
 *
 * 가르는 열쇠는 둘이다: 사유가 QUOTE_DELETED_ATTACHMENT_REASON 이고, 삭제 시각이 견적서의
 * 삭제 시각(`quoteDeletedAt` — 되살리기 전에 읽은 값)과 같은 것. 칸 교체로 밀려난 옛 파일
 * (사유가 다르다)과 사람이 따로 지운 파일은 그대로 휴지통에 남는다 — 되살리면 칸마다 한
 * 파일이 깨지거나, 사람이 치운 것이 돌아온다.
 *
 * 되살아난 파일마다 RESTORE 감사 한 줄. 되살린 id 를 올린 차례대로 돌려준다(부르는 쪽이
 * 견적서의 RESTORE 감사에 싣는다).
 */
export async function restoreAttachmentsTrashedWithQuote(
  tx: Tx,
  params: { quoteId: string; quoteNumber: string; quoteDeletedAt: Date | null; actorUserId: string }
): Promise<string[]> {
  // 삭제 시각이 비어 있는 휴지통 견적서는 정상 경로로 생기지 않는다(softDeleteQuote 가 늘
  // 적는다). 그런 행에는 함께 간 파일을 가를 열쇠가 없으니 아무것도 되살리지 않는다.
  if (params.quoteDeletedAt === null) return [];

  const candidates = await tx
    .select({ id: attachments.id, category: attachments.category })
    .from(attachments)
    .where(
      and(
        eq(attachments.quoteId, params.quoteId),
        eq(attachments.isDeleted, true),
        eq(attachments.deleteReason, QUOTE_DELETED_ATTACHMENT_REASON),
        eq(attachments.deletedAt, params.quoteDeletedAt)
      )
    )
    .orderBy(asc(attachments.uploadedAt), asc(attachments.id));
  if (candidates.length === 0) return [];

  const updated = await tx
    .update(attachments)
    .set({ isDeleted: false, deletedAt: null, deletedBy: null, deleteReason: null })
    .where(
      and(
        inArray(
          attachments.id,
          candidates.map((item) => item.id)
        ),
        eq(attachments.isDeleted, true)
      )
    )
    .returning({ id: attachments.id });

  const updatedIds = new Set(updated.map((row) => row.id));
  const restored = candidates.filter((item) => updatedIds.has(item.id));

  for (const item of restored) {
    await insertAuditLog(tx, {
      actorUserId: params.actorUserId,
      actionType: "RESTORE",
      targetEntity: "attachments",
      targetRecordId: item.id,
      previousValue: { isDeleted: true, deleteReason: QUOTE_DELETED_ATTACHMENT_REASON },
      newValue: {
        isDeleted: false,
        ...ownerAuditFields({
          repairCaseId: null,
          productModelId: null,
          quoteId: params.quoteId,
          quoteNumber: params.quoteNumber,
        }),
        category: item.category,
        // 사람이 이 파일을 골라 되살린 것이 아니라 견적서와 함께 돌아왔다는 사실.
        restoredWithQuote: true,
      },
    });
  }

  return restored.map((item) => item.id);
}

/**
 * 견적서에 붙었던 첨부 **전부**(휴지통 여부와 무관)의 id — 견적서를 영구 삭제하기 직전,
 * 부르는 쪽(permanentlyDeleteQuote)의 트랜잭션에서 읽는다. 영구 삭제되면 FK(ON DELETE
 * SET NULL)가 quote_id 를 비워 그 뒤로는 어느 견적서의 것이었는지 알 수 없으므로, 어느
 * 파일의 연결이 풀렸는지를 PURGE 감사에 남긴다(내자 정리 줄의 unlinkedDomesticOrderIds
 * 와 같은 자리). 첨부 행과 디스크 실물은 그대로 남는다 — 다른 주인과 같은 기존 동작이다.
 */
export async function listAttachmentIdsOfQuote(tx: Tx, quoteId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.quoteId, quoteId))
    .orderBy(asc(attachments.uploadedAt), asc(attachments.id));
  return rows.map((row) => row.id);
}
