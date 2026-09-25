import "server-only";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { attachments, productModels, quotes, repairCases } from "@dss/core/schema";
import { db } from "@/lib/db";
import { insertAuditLog } from "./audit-logs";

/**
 * ============================================================================
 * 첨부 휴지통 — DB에 표시만 하고, 디스크 파일은 남긴다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(612줄)에서 가져왔다 — 저쪽 파일의 같은 이름
 * 함수에서 글자를 바꾸지 않았다. 지금 이 파일에 있는 것은 둘이다:
 *
 *  ① **파일 하나를 지우고 되살리는 통로**(조각 3d-3c, 2026-09-25) —
 *     `softDeleteAttachment` · `restoreAttachment` 와 그 도우미들. 부르는 쪽은
 *     서버 액션(server/actions/attachments.ts)이다.
 *  ② **견적서 휴지통이 부르는 다섯**(이 파일 아래쪽) — 견적서를 휴지통에 넣고 ·
 *     되살리고 · 영구 삭제할 때 딸려 가는 첨부.
 *
 * 🔴 **가져오지 않은 것**: 저쪽의 `recordAttachmentDownload`(내려받기 감사)는 별건이라
 * 두고 왔고, **올리기**(저쪽 `mutations/attachments.ts` 의 createAttachmentRecord ·
 * 칸 교체)는 조각 3d-3b 의 몫이다.
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
 * 이유가 있다 — **복원하려면 실물이 있어야 한다.** 지우면서 파일을 함께 없애면
 * 복원 버튼은 남아 있는데 눌러도 빈 기록만 되살아난다. 그건 되돌릴 수 없는
 * 손실이고, 화면은 그 사실을 사용자에게 알려 줄 방법이 없다. 여기 있는 함수는
 * 전부 DB 의 표시만 바꾼다.
 *
 * 디스크에서 실제로 지우는 절차(영구 삭제)는 **별도 승인 대상**이며 이 파일의
 * 범위가 아니다. 나중에 만들 때도 이 파일에 끼워 넣지 말고, 승인 게이트를 가진
 * 별도 통로로 둘 것.
 *
 * ── 잠긴 접수 건 ────────────────────────────────────────────────────────
 * 출하 완료로 잠긴 건(`repair_cases.is_locked`)에는 파일을 올릴 수 없다(A/S 의
 * 업로드 라우트가 CASE_LOCKED로 막는다). 지우고 되살리는 것도 같은 기준으로
 * 막는다 — 잠금의 뜻이 "이 건의 자료 구성은 확정됐다"인데 첨부만 뺄 수 있으면
 * 그 뜻이 반만 지켜진다. 🔴 이 사이트에는 접수 건 화면이 없지만 판정은 **그대로
 * 가져왔다** — 같은 `attachments` 표라 접수 건 첨부의 id 로도 이 함수를 부를 수
 * 있고, 그때 저쪽과 다른 답을 내면 안 된다.
 *
 * ── 🔴 조각 3d 가 왔다 — 두 벌이 되지 않게 한 약속 (2026-09-25, 3d-3c) ───
 * 이 자리에 적혀 있던 약속 — 「저쪽 613줄이 이 파일에 더해진다. 그때 이 넷을 두 벌로
 * 만들지 말 것」 — 을 지켰다. 아래 다섯(QUOTE_DELETED_ATTACHMENT_REASON ·
 * listLiveAttachmentsOfQuote · trashAttachmentsOfDeletedQuote ·
 * restoreAttachmentsTrashedWithQuote · listAttachmentIdsOfQuote)과 `ownerAuditFields`
 * 는 **한 글자도 손대지 않았고**, 새로 온 함수들이 그 `ownerAuditFields` 를 그대로
 * 쓴다. 특히 `QUOTE_DELETED_ATTACHMENT_REASON` 은 **DB 에 실제로 적히는 글자**라,
 * 두 벌이 되어 한쪽만 바뀌면 되살리기가 「함께 간 파일」을 못 가른다.
 *
 * 🔴 **다음에 올 조각(3d-3b, 올리기)에게** — 저쪽 `mutations/attachments.ts` 에
 * `guardQuoteAttachmentChange`(견적서 행 `FOR UPDATE` 잠금)가 들어 있다. 이 사이트에는
 * 아직 그 파일이 없어 **같은 이름 · 같은 본문으로 이 파일에 두었다.** 그 파일이 오는
 * 날 **이 파일에서 그쪽으로 옮기고 여기서는 import 할 것** — A/S 의 자리가 거기다.
 * 두 벌로 두면 견적서 잠금이 두 곳에서 갈리고, 그러면 「칸마다 한 파일」이 깨진다.
 * ============================================================================
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AttachmentTrashFailureCode =
  | "INVALID_ID"
  | "NOT_FOUND"
  | "ALREADY_IN_STATE"
  | "CASE_LOCKED"
  /** 견적서 첨부 — 그 견적서가 휴지통에 있다(2026-09-15 Q2). */
  | "QUOTE_IN_TRASH"
  /** 견적서 첨부 되살리기 — 그 칸에 이미 살아 있는 파일이 있다(2026-09-15 Q2). */
  | "SLOT_OCCUPIED";

export type AttachmentTrashResult =
  | { ok: true; id: string }
  | { ok: false; code: AttachmentTrashFailureCode; message: string };

/** 되살리려는 견적서 첨부의 칸에 이미 파일이 있을 때. 무엇을 하면 되는지까지 말한다. */
export const QUOTE_ATTACHMENT_SLOT_OCCUPIED_MESSAGE =
  "이 칸에는 이미 다른 파일이 붙어 있습니다. 지금 붙어 있는 파일을 먼저 지운 뒤 되살려 주세요.";

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

// ───────────────────────────────── 파일 하나를 지우고 되살린다 (조각 3d-3c)

/** 견적서에 대한 판정이 막았을 때의 이유. */
export type QuoteAttachmentRejectionCode =
  /** 견적서가 없다 — 그 사이 영구 삭제됐다. */
  | "NOT_FOUND"
  /** 견적서가 휴지통에 있다. */
  | "QUOTE_IN_TRASH";

export const QUOTE_ATTACHMENT_NOT_FOUND_MESSAGE = "해당 견적서를 찾을 수 없습니다.";
export const QUOTE_ATTACHMENT_IN_TRASH_MESSAGE =
  "휴지통에 있는 견적서의 파일은 붙이거나 지우거나 되살릴 수 없습니다. 견적서를 먼저 되살려 주세요.";

export type QuoteAttachmentGuardResult =
  | { ok: true; quote: { id: string; quoteNumber: string } }
  | { ok: false; code: QuoteAttachmentRejectionCode; message: string };

/**
 * 견적서의 첨부를 바꿔도 되는가 — **부르는 쪽의 트랜잭션 안에서** 견적서 행을
 * `FOR UPDATE` 로 잠그고 판정한다. 지우기 · 되살리기(이 파일)가 이것 하나를 부르고,
 * 올리기(조각 3d-3b 의 createAttachmentRecord)도 같은 것을 부르게 된다.
 *
 * 이 잠금이 두 가지를 줄 세운다:
 *  - **칸 교체** — 같은 견적서에 동시에 올린 파일들은 여기서 기다리고, 뒤에 온 쪽은
 *    앞의 것이 넣은 행을 보고 밀어낸다(READ COMMITTED — 문장마다 새 스냅숏). 그래서
 *    칸마다 살아 있는 파일은 늘 하나다.
 *  - **견적서 휴지통** — softDeleteQuote · restoreQuote · permanentlyDeleteQuote 도 같은
 *    행을 먼저 잠근다(quote-trash.ts). 휴지통으로 가는 견적서에 한 장이 끼어들거나,
 *    휴지통의 견적서에 파일이 되살아나는 틈이 없다.
 *
 * ⚠️ 잠금은 `id` 로만 좁힌다. is_deleted 로 좁히면 휴지통의 견적서를 「없음」으로
 * 오판하고, 그 행은 잠그지도 못한다.
 *
 * 🔴 **A/S 에서는 이 함수가 `mutations/attachments.ts` 에 있다.** 이 사이트에는 그
 * 파일이 아직 없어 여기 두었을 뿐이다 — 옮길 때를 파일 머리말에 적어 두었다.
 */
export async function guardQuoteAttachmentChange(tx: Tx, quoteId: string): Promise<QuoteAttachmentGuardResult> {
  const [quote] = await tx
    .select({ id: quotes.id, quoteNumber: quotes.quoteNumber, isDeleted: quotes.isDeleted })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .for("update");

  if (!quote) return { ok: false, code: "NOT_FOUND", message: QUOTE_ATTACHMENT_NOT_FOUND_MESSAGE };
  if (quote.isDeleted) return { ok: false, code: "QUOTE_IN_TRASH", message: QUOTE_ATTACHMENT_IN_TRASH_MESSAGE };
  return { ok: true, quote: { id: quote.id, quoteNumber: quote.quoteNumber } };
}

/** 첨부와 그것이 붙은 접수 건의 잠금 상태를 한 번에 잡는다. */
async function loadForTrash(tx: Tx, attachmentId: string) {
  const [row] = await tx
    .select({
      id: attachments.id,
      repairCaseId: attachments.repairCaseId,
      productModelId: attachments.productModelId,
      // 견적서 파일이면 견적서 행을 잠그고 휴지통 · 칸을 본다(파일 헤더의 '셋째 주인').
      quoteId: attachments.quoteId,
      originalFileName: attachments.originalFileName,
      category: attachments.category,
      isDeleted: attachments.isDeleted,
      // 접수 건이 영구 삭제되어 연결이 끊긴 첨부는 잠금을 물을 대상이 없다.
      // LEFT JOIN이라 그 경우 null이 온다.
      caseIsLocked: repairCases.isLocked,
      caseIntakeNumber: repairCases.intakeNumber,
      // 모델 첨부의 감사 기록에 남길 사람이 읽는 이름. 접수 건 쪽 intakeNumber
      // 와 같은 자리다(ownerAuditFields 주석). 접수 건 첨부에서는 이 조인이
      // 언제나 비므로 null 이 온다 — 두 조인이 동시에 맞는 행은 CHECK 가 막는다.
      productModelName: productModels.modelName,
      // 견적서 첨부의 감사 기록에 남길 발행번호. 다른 주인에서는 조인이 비어 null 이다.
      quoteNumber: quotes.quoteNumber,
    })
    .from(attachments)
    .leftJoin(repairCases, eq(repairCases.id, attachments.repairCaseId))
    .leftJoin(productModels, eq(productModels.id, attachments.productModelId))
    .leftJoin(quotes, eq(quotes.id, attachments.quoteId))
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  return row ?? null;
}

/**
 * 견적서 파일이면 견적서 행을 잠그고 판정한다(파일 헤더의 '셋째 주인'). 다른 주인이면
 * 아무것도 하지 않는다. 되살리기(`adding`)는 그 칸에 살아 있는 다른 파일이 있는지도 본다 —
 * 견적서 행을 잠근 뒤라 올리기(칸 교체)와 줄을 선다.
 */
async function guardQuoteOwner(
  tx: Tx,
  current: { id: string; quoteId: string | null; category: typeof attachments.$inferSelect.category },
  params: { adding: boolean }
): Promise<AttachmentTrashResult | null> {
  if (current.quoteId === null) return null;
  const guard = await guardQuoteAttachmentChange(tx, current.quoteId);
  if (!guard.ok) {
    if (guard.code === "NOT_FOUND") {
      // 읽은 뒤 잠그기 전에 견적서가 영구 삭제됐다 — 다른 첨부의 「없음」과 같은 말.
      return { ok: false, code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." };
    }
    return { ok: false, code: "QUOTE_IN_TRASH", message: guard.message };
  }

  if (params.adding) {
    const [occupied] = await tx
      .select({ value: count() })
      .from(attachments)
      .where(
        and(
          eq(attachments.quoteId, current.quoteId),
          eq(attachments.category, current.category),
          eq(attachments.isDeleted, false),
          ne(attachments.id, current.id)
        )
      );
    if ((occupied?.value ?? 0) > 0) {
      return { ok: false, code: "SLOT_OCCUPIED", message: QUOTE_ATTACHMENT_SLOT_OCCUPIED_MESSAGE };
    }
  }
  return null;
}

/**
 * 첨부를 휴지통으로 보낸다. **디스크 파일은 그대로 둔다**(파일 상단 주석).
 */
export async function softDeleteAttachment(params: {
  attachmentId: string;
  actorUserId: string;
  reason: string | null;
}): Promise<AttachmentTrashResult> {
  if (!UUID_PATTERN.test(params.attachmentId)) {
    return { ok: false, code: "INVALID_ID", message: "파일을 확인할 수 없습니다." };
  }

  return db.transaction(async (tx): Promise<AttachmentTrashResult> => {
    const current = await loadForTrash(tx, params.attachmentId);
    if (!current) {
      return { ok: false, code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." };
    }
    if (current.isDeleted) {
      return { ok: false, code: "ALREADY_IN_STATE", message: "이미 휴지통에 있는 파일입니다." };
    }
    if (current.caseIsLocked === true) {
      return {
        ok: false,
        code: "CASE_LOCKED",
        message: "출하 완료로 잠긴 접수 건의 파일은 지울 수 없습니다.",
      };
    }
    const rejected = await guardQuoteOwner(tx, current, { adding: false });
    if (rejected) return rejected;

    const deletedAt = new Date();
    const updated = await tx
      .update(attachments)
      .set({
        isDeleted: true,
        deletedAt,
        deletedBy: params.actorUserId,
        deleteReason: params.reason,
      })
      .where(and(eq(attachments.id, params.attachmentId), eq(attachments.isDeleted, false)))
      .returning({ id: attachments.id });

    if (updated.length === 0) {
      // 같은 순간에 다른 요청이 먼저 지웠다. 0행 쓰기를 조용히 성공으로
      // 넘기지 않는다 — 이 저장소의 다른 휴지통 mutation과 같은 규율이다.
      return { ok: false, code: "ALREADY_IN_STATE", message: "이미 휴지통에 있는 파일입니다." };
    }

    await insertAuditLog(tx, {
      actorUserId: params.actorUserId,
      actionType: "FILE_DELETE",
      targetEntity: "attachments",
      targetRecordId: params.attachmentId,
      previousValue: { isDeleted: false },
      newValue: {
        isDeleted: true,
        deletedAt: deletedAt.toISOString(),
        deleteReason: params.reason,
        // 접수 건 첨부에서는 예전과 똑같이 repairCaseId · intakeNumber 가
        // 실린다(ownerType 이 앞에 붙는 것만 다르다) — 옛 기록과 새 기록을 한
        // 질의로 읽을 수 있어야 하므로 키를 빼지 않고 더하기만 한다.
        ...ownerAuditFields({
          repairCaseId: current.repairCaseId,
          productModelId: current.productModelId,
          quoteId: current.quoteId,
          intakeNumber: current.caseIntakeNumber,
          modelName: current.productModelName,
          quoteNumber: current.quoteNumber,
        }),
        category: current.category,
        // 디스크 파일을 남긴다는 사실을 기록에도 남긴다 — 나중에 이 로그를 읽는
        // 사람이 "파일도 사라졌나"를 다시 조사하지 않게 한다.
        storedFileRetained: true,
      },
    });

    return { ok: true, id: params.attachmentId };
  });
}

/**
 * 휴지통의 첨부를 되살린다. 실물이 남아 있으므로 표시만 되돌리면 된다.
 *
 * 견적서 파일이면 견적서가 휴지통이 아니어야 하고 **그 칸이
 * 비어 있어야** 한다(파일 헤더의 '셋째 주인').
 */
export async function restoreAttachment(params: {
  attachmentId: string;
  actorUserId: string;
}): Promise<AttachmentTrashResult> {
  if (!UUID_PATTERN.test(params.attachmentId)) {
    return { ok: false, code: "INVALID_ID", message: "파일을 확인할 수 없습니다." };
  }

  return db.transaction(async (tx): Promise<AttachmentTrashResult> => {
    const current = await loadForTrash(tx, params.attachmentId);
    if (!current) {
      return { ok: false, code: "NOT_FOUND", message: "파일을 찾을 수 없습니다." };
    }
    if (!current.isDeleted) {
      return { ok: false, code: "ALREADY_IN_STATE", message: "휴지통에 있는 파일이 아닙니다." };
    }
    if (current.caseIsLocked === true) {
      return {
        ok: false,
        code: "CASE_LOCKED",
        message: "출하 완료로 잠긴 접수 건의 파일은 되살릴 수 없습니다.",
      };
    }
    const rejected = await guardQuoteOwner(tx, current, { adding: true });
    if (rejected) return rejected;

    const updated = await tx
      .update(attachments)
      .set({ isDeleted: false, deletedAt: null, deletedBy: null, deleteReason: null })
      .where(and(eq(attachments.id, params.attachmentId), eq(attachments.isDeleted, true)))
      .returning({ id: attachments.id });

    if (updated.length === 0) {
      return { ok: false, code: "ALREADY_IN_STATE", message: "휴지통에 있는 파일이 아닙니다." };
    }

    await insertAuditLog(tx, {
      actorUserId: params.actorUserId,
      actionType: "RESTORE",
      targetEntity: "attachments",
      targetRecordId: params.attachmentId,
      previousValue: { isDeleted: true },
      newValue: {
        isDeleted: false,
        ...ownerAuditFields({
          repairCaseId: current.repairCaseId,
          productModelId: current.productModelId,
          quoteId: current.quoteId,
          intakeNumber: current.caseIntakeNumber,
          modelName: current.productModelName,
          quoteNumber: current.quoteNumber,
        }),
        category: current.category,
      },
    });

    return { ok: true, id: params.attachmentId };
  });
}

// ─────────────────────────── 견적서를 휴지통에 넣고 · 되살리고 · 지울 때 (2026-09-15 Q2)

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
