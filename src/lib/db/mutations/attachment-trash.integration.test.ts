import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

import { attachments, auditLogs, quotes, users } from "@dss/core/schema";
import { db, pgClient } from "@/lib/db";
import {
  QUOTE_ATTACHMENT_IN_TRASH_MESSAGE,
  QUOTE_ATTACHMENT_SLOT_OCCUPIED_MESSAGE,
  restoreAttachment,
  softDeleteAttachment,
} from "./attachment-trash";
import { createQuote } from "./quotes";
import { softDeleteQuote } from "./quote-trash";
import { getAttachmentForDownload } from "../queries/attachment-download";
import type { AttachmentCategory } from "@/lib/domain/attachment-category";
import {
  decideAttachmentDownload,
  isAttachmentOwnerAccessAllowed,
} from "@/lib/domain/attachment-download-policy";
import { buildQuoteAttachmentStoredPath } from "@/lib/domain/attachment-path";
import type { QuoteFields } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 A/S 관리 시스템의 **견적서 갈래만** 옮겨 왔다 (조각 3d-3c)
 * ============================================================================
 * 저쪽에서 이 mutation 을 보는 시험은 둘로 나뉘어 있다:
 *
 *  · `mutations/attachment-trash.integration.test.ts`(803줄) — 접수 건 · 제품 모델
 *    첨부와 내려받기 감사. **이 사이트에는 그 세 가지가 없다** — 접수 건 화면도
 *    모델 화면도 오지 않고(설계서 「A/S 에 남길 것」), `recordAttachmentDownload`
 *    는 가져오지 않았다(mutations/attachment-trash.ts 머리말).
 *  · `mutations/quote-attachments.integration.test.ts`(952줄)의
 *    「첨부 지우기 · 되살리기 — 견적서 행을 잠근다」와 「내려받기 — 조회」 —
 *    **여기 있는 것이 그 두 묶음이다.** 단언을 거의 그대로 옮겼다.
 *
 * 🔴 **CASE_LOCKED(출하 완료로 잠긴 접수 건) 갈래는 여기서 시험하지 않는다.** 그
 * 판정 코드는 저쪽에서 **글자 그대로** 가져왔고(mutations/attachment-trash.ts),
 * 시험하려면 이 저장소에 없는 접수 등록 사슬(인수번호 채번 · 워크플로 · 제품)을
 * 끌고 와야 한다. 그 갈래는 A/S 쪽 시험이 그대로 지킨다.
 *
 * ── 저쪽과 다른 것 셋 ────────────────────────────────────────────────────
 *  ① **환경 불러오기와 import 경로** — 부트스트랩은 명령줄에서 싣고
 *     (`--import ./scripts/test-db-bootstrap.ts`, docs/DB_TESTS.md) 스키마는
 *     서브모듈(`@dss/core/schema`)이다. 그래서 저쪽 첫 줄
 *     `import "../../../../scripts/load-env"` 이 없다.
 *  ② 🔴 **첨부 행을 `createAttachmentRecord` 대신 직접 넣는다**(아래 addFile).
 *     올리기 통로는 조각 3d-3b 의 몫이라 이 저장소에 아직 없다. 이 시험이 보는
 *     것은 **지우기 · 되살리기가 무엇을 판정하는가**이지 올리기가 아니므로, 표에
 *     직접 넣으면 충분하다. 올리기 규칙(칸 교체 · 경로 · 확장자)은 A/S 쪽 시험이
 *     그대로 지킨다. 🔴 그래서 **「같은 칸에 다시 올리면 옛 파일이 밀려난다」는
 *     여기서 흉내 내지 않는다** — 칸이 찬 상태는 살아 있는 파일을 한 장 더 넣어
 *     만든다.
 *  ③ 🔴 **격리 이름을 저쪽과 다르게 두었다**(아래 상수). 두 저장소가 **같은
 *     `dss_as_test`** 를 쓰므로(docs/DB_TESTS.md), 같으면 한쪽 after() 가 다른
 *     쪽이 만든 줄을 치운다.
 * ============================================================================
 * 첨부 휴지통 — 표시만 바꾸고, 조용히 성공하지 않는다
 * ============================================================================
 * 확인하는 것은 일곱 가지다.
 *
 *  1. **소프트 삭제 네 칸 + FILE_DELETE 감사** — 감사에 견적서 주인(ownerType ·
 *     quoteId · 발행번호)과 `storedFileRetained: true` 가 실린다.
 *  2. 🔴 **파일을 가리키는 칸은 하나도 바뀌지 않는다**(stored_path · 체크섬 ·
 *     크기). 지우기가 실물을 건드리지 않는다는 사실이 행에서 보이는 자리다 —
 *     `storage.delete()` 를 부르면 복원 단추가 빈 기록만 되살린다.
 *  3. **두 번 눌러도 조용히 성공하지 않는다** — 이미 휴지통이면 ALREADY_IN_STATE,
 *     없으면 NOT_FOUND, 형식이 아닌 id 면 INVALID_ID(DB 를 때리지 않는다).
 *  4. **되살리면 네 칸이 비고 RESTORE 감사가 남는다.**
 *  5. 🔴 **되살리기는 조용히 밀어내지 않는다** — 그 칸에 살아 있는 파일이 있으면
 *     SLOT_OCCUPIED 로 거절하고 아무것도 바꾸지 않는다.
 *  6. 🔴 **휴지통 견적서의 파일은 지우지도 되살리지도 못한다** — QUOTE_IN_TRASH.
 *  7. **주인이 아무도 없는 첨부**를 지워도 터지지 않고 감사에 "NONE" 이 남는다.
 *
 * 그리고 지우기 액션이 **주인을 DB 에서 다시 읽는** 조회
 * (queries/attachment-download.ts)가 견적서 주인과 그 휴지통 여부를 싣는지 본다.
 *
 * 🔴 **인가는 여기서 시험하지 않는다.** 세션과 문턱(quotes WRITE)은 서버 액션의
 * 몫이고(server/actions/attachments.ts), 권한 표는 단위 시험이 본다
 * (domain/attachment-download-policy.test.ts).
 *
 * ── 격리 규약 ────────────────────────────────────────────────────────────
 * 이 스위트가 만드는 견적서의 발행번호는 `PO-ATTRASH-TEST-{실행토큰}-` 으로
 * 시작한다. 🔴 저쪽 두 시험은 `QUOTE-ATTACH-TEST-` · `ATTRASH-TEST-` 를 쓴다 —
 * **같게 바꾸지 마라.** 고객사 · 제품 · 수리 건은 만들지 않는다(견적서와 첨부
 * 둘뿐이라 접수 월도 쓰지 않는다).
 *
 * after() 는 이 스위트가 만든 첨부(id) → 견적서 감사 → 견적서(접두어) 차례로
 * 지운다. 🔴 **첨부의 감사 로그는 지우지 않는다** — 저쪽 첨부 시험들과 같은
 * 규칙이다(감사는 append-only 이고 3년 보존 대상이다).
 * ============================================================================
 */

const RUN_TOKEN = randomUUID();
const QUOTE_NUMBER_PREFIX = `PO-ATTRASH-TEST-${RUN_TOKEN}-`;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

let actorUserId: string;
const touchedQuoteIds: string[] = [];
const createdAttachmentIds: string[] = [];

type QuoteRef = { id: string; version: number };

/** 필수 넷만 채운 한 장 — 이웃 시험(quotes.integration.test.ts)의 fields() 와 같은 모양이다. */
function quoteFields(suffix: string, overrides: Partial<QuoteFields> = {}): QuoteFields {
  return {
    quoteNumber: `${QUOTE_NUMBER_PREFIX}${suffix}`,
    kind: "DOMESTIC",
    quoteDate: "2095-07-10",
    repairCaseId: null,
    intakeNumberText: null,
    customerId: null,
    customerNameText: "시험 공급처",
    modelNameText: null,
    lotNumberText: null,
    serialNumberText: null,
    faultDescriptionText: null,
    subject: "첨부 휴지통 시험",
    validity: null,
    delivery: null,
    payment: null,
    remarks: null,
    workCost: "0",
    laborEquipmentKind: null,
    laborBaseCost: null,
    investigationExcluded: false,
    powerTestExcluded: false,
    laborPowerTestDeduction: null,
    documentExcluded: false,
    isExcelOnly: false,
    manualSupplyAmount: null,
    repairTasks: [],
    workScopeLines: [],
    items: [],
    ...overrides,
  };
}

async function createTestQuote(suffix: string): Promise<QuoteRef> {
  const result = await createQuote({ fields: quoteFields(suffix), actorUserId });
  assert.equal(result.ok, true, `setup create quote failed: ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error("unreachable");
  touchedQuoteIds.push(result.id);
  return { id: result.id, version: result.version };
}

/**
 * 첨부 한 행. 🔴 **`createAttachmentRecord` 대신 직접 넣는다**(머리말 ②) — 올리기
 * 통로는 조각 3d-3b 의 몫이다. 경로만은 규칙대로 만든다
 * (domain/attachment-path.ts) — 지우기가 그 칸을 건드리지 않는 것을 볼 자리다.
 *
 * `quoteId: null` 로 부르면 **주인이 아무도 없는 첨부**가 된다(세 FK 가 모두
 * NULL — 주인이 영구 삭제된 뒤의 정상 상태다. schema/attachments.ts 의 CHECK 는
 * 「둘 다 찬 행」만 막는다).
 */
async function addFile(
  quoteId: string | null,
  category: AttachmentCategory = "SIGNED_QUOTE_PDF"
): Promise<string> {
  const attachmentId = randomUUID().toLowerCase();
  const extension = category === "QUOTE_EXCEL" ? "xlsx" : "pdf";
  createdAttachmentIds.push(attachmentId);
  await db.insert(attachments).values({
    id: attachmentId,
    quoteId,
    category,
    originalFileName: `견적서.${extension}`,
    // 주인이 없는 첨부의 경로는 그 주인이 있던 시절 그대로 남아 있다 — 모양을
    // 만들기 위해 임의의 uuid 를 쓴다(행의 quote_id 와는 무관하다).
    storedPath: buildQuoteAttachmentStoredPath({
      quoteId: quoteId ?? randomUUID(),
      attachmentId,
      extension,
    }),
    mimeType: MIME_BY_EXTENSION[extension],
    fileSize: 1234,
    checksumSha256: "0".repeat(64),
    uploadedBy: actorUserId,
  });
  return attachmentId;
}

async function readAttachment(attachmentId: string) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  return row;
}

async function attachmentAudits(attachmentId: string, actionType: "FILE_DELETE" | "RESTORE") {
  return db
    .select({ actorUserId: auditLogs.actorUserId, previousValue: auditLogs.previousValue, newValue: auditLogs.newValue })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetEntity, "attachments"),
        eq(auditLogs.targetRecordId, attachmentId),
        eq(auditLogs.actionType, actionType)
      )
    );
}

async function liveInSlot(quoteId: string, category: AttachmentCategory): Promise<string[]> {
  const rows = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(eq(attachments.quoteId, quoteId), eq(attachments.category, category), eq(attachments.isDeleted, false))
    );
  return rows.map((row) => row.id);
}

/** 견적서를 휴지통으로 보낸다 — 살아 있던 첨부도 같은 트랜잭션에서 함께 간다. */
async function trashQuote(quote: QuoteRef): Promise<void> {
  const result = await softDeleteQuote({
    quoteId: quote.id,
    expectedVersion: quote.version,
    actorUserId,
    reason: "시험",
  });
  assert.equal(result.ok, true, `soft delete quote failed: ${JSON.stringify(result)}`);
}

before(async () => {
  const [anyone] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.approvalStatus, "APPROVED"), eq(users.isDeleted, false)))
    .limit(1);
  // 행위자는 uploaded_by · deleted_by · created_by · 감사 로그의 actor 로만 쓰인다.
  // 역할 판정은 여기서 하지 않는다(서버 액션의 몫).
  assert.ok(anyone, "expected at least one approved user in the test DB");
  actorUserId = anyone.id;
});

after(async () => {
  if (createdAttachmentIds.length > 0) {
    await db.delete(attachments).where(inArray(attachments.id, createdAttachmentIds));
  }
  if (touchedQuoteIds.length > 0) {
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.targetEntity, "quotes"), inArray(auditLogs.targetRecordId, touchedQuoteIds)));
  }
  await db.delete(quotes).where(like(quotes.quoteNumber, `${QUOTE_NUMBER_PREFIX}%`));
  await pgClient.end({ timeout: 5 });
});

// ───────────────────────────── 1 · 2. 표시만 바꾸고, 파일을 가리키는 칸은 그대로

describe("첨부 휴지통: 표시만 바꾸고 파일을 가리키는 칸은 건드리지 않는다", () => {
  test("소프트 삭제가 네 칸을 채우고 FILE_DELETE 감사에 견적서 주인이 남는다", async () => {
    const quote = await createTestQuote("DELETE");
    const file = await addFile(quote.id);
    const before = await readAttachment(file);

    const removed = await softDeleteAttachment({ attachmentId: file, actorUserId, reason: "잘못 붙임" });
    assert.equal(removed.ok, true, JSON.stringify(removed));

    const row = await readAttachment(file);
    assert.equal(row.isDeleted, true);
    assert.ok(row.deletedAt);
    assert.equal(row.deletedBy, actorUserId);
    assert.equal(row.deleteReason, "잘못 붙임");

    // 🔴 실물을 가리키는 칸은 하나도 바뀌지 않았다 — 지우기는 디스크를 건드리지
    // 않으므로 복원이 같은 파일을 되찾는다(mutations/attachment-trash.ts 머리말).
    assert.equal(row.storedPath, before.storedPath);
    assert.equal(row.checksumSha256, before.checksumSha256);
    assert.equal(row.fileSize, before.fileSize);

    const audits = await attachmentAudits(file, "FILE_DELETE");
    assert.equal(audits.length, 1);
    const value = audits[0].newValue as Record<string, unknown>;
    assert.equal(audits[0].actorUserId, actorUserId);
    assert.deepEqual(audits[0].previousValue, { isDeleted: false });
    assert.equal(value.ownerType, "QUOTE");
    assert.equal(value.quoteId, quote.id);
    assert.equal(value.quoteNumber, `${QUOTE_NUMBER_PREFIX}DELETE`, "사람이 읽는 발행번호도 싣는다");
    assert.equal(value.repairCaseId, undefined, "주인이 아닌 키는 싣지 않는다");
    assert.equal(value.productModelId, undefined, "주인이 아닌 키는 싣지 않는다");
    assert.equal(value.category, "SIGNED_QUOTE_PDF");
    assert.equal(value.deleteReason, "잘못 붙임");
    assert.equal(value.storedFileRetained, true, "🔴 디스크 실물을 남긴다는 사실이 기록에도 남는다");
  });

  test("되살리면 네 칸이 비고 RESTORE 감사가 남는다", async () => {
    const quote = await createTestQuote("RESTORE");
    const file = await addFile(quote.id, "QUOTE_EXCEL");
    await softDeleteAttachment({ attachmentId: file, actorUserId, reason: null });

    const restored = await restoreAttachment({ attachmentId: file, actorUserId });
    assert.equal(restored.ok, true, JSON.stringify(restored));

    const row = await readAttachment(file);
    assert.equal(row.isDeleted, false);
    assert.equal(row.deletedAt, null);
    assert.equal(row.deletedBy, null);
    assert.equal(row.deleteReason, null);

    const audits = await attachmentAudits(file, "RESTORE");
    assert.equal(audits.length, 1);
    const value = audits[0].newValue as Record<string, unknown>;
    assert.deepEqual(audits[0].previousValue, { isDeleted: true });
    assert.equal(value.isDeleted, false);
    assert.equal(value.ownerType, "QUOTE");
    assert.equal(value.quoteId, quote.id);
    assert.equal(value.quoteNumber, `${QUOTE_NUMBER_PREFIX}RESTORE`);
    assert.equal(value.category, "QUOTE_EXCEL");
  });
});

// ───────────────────────────────────── 3. 같은 동작을 두 번 · 없는 대상

describe("첨부 휴지통: 두 번 눌러도 조용히 성공하지 않는다", () => {
  test("이미 휴지통에 있는 것을 또 지우면 거절한다", async () => {
    const quote = await createTestQuote("TWICE-DELETE");
    const file = await addFile(quote.id);
    await softDeleteAttachment({ attachmentId: file, actorUserId, reason: null });

    const again = await softDeleteAttachment({ attachmentId: file, actorUserId, reason: "두 번째" });
    assert.equal(again.ok === false && again.code, "ALREADY_IN_STATE");
    // 두 번째 사유가 첫 번째를 덮어쓰지 않는다 — 아무것도 쓰지 않았다는 뜻이다.
    assert.equal((await readAttachment(file)).deleteReason, null);
    assert.equal((await attachmentAudits(file, "FILE_DELETE")).length, 1);
  });

  test("휴지통에 없는 것을 되살리면 거절한다", async () => {
    const quote = await createTestQuote("TWICE-RESTORE");
    const file = await addFile(quote.id);

    const refused = await restoreAttachment({ attachmentId: file, actorUserId });
    assert.equal(refused.ok === false && refused.code, "ALREADY_IN_STATE");
    assert.equal((await attachmentAudits(file, "RESTORE")).length, 0);
  });

  test("없는 첨부는 NOT_FOUND, 형식이 아닌 id 는 INVALID_ID", async () => {
    const missing = randomUUID();
    const removedMissing = await softDeleteAttachment({ attachmentId: missing, actorUserId, reason: null });
    assert.equal(removedMissing.ok === false && removedMissing.code, "NOT_FOUND");
    const restoredMissing = await restoreAttachment({ attachmentId: missing, actorUserId });
    assert.equal(restoredMissing.ok === false && restoredMissing.code, "NOT_FOUND");

    // 🔴 형식 검사는 DB 를 때리기 전이다 — uuid 가 아닌 글자로 질의하면 22P02 다.
    for (const bad of ["", "not-a-uuid", "'; drop table attachments; --"]) {
      const removed = await softDeleteAttachment({ attachmentId: bad, actorUserId, reason: null });
      assert.equal(removed.ok === false && removed.code, "INVALID_ID", bad);
      const restored = await restoreAttachment({ attachmentId: bad, actorUserId });
      assert.equal(restored.ok === false && restored.code, "INVALID_ID", bad);
    }
  });
});

// ─────────────────────────────── 5. 되살리기는 조용히 밀어내지 않는다

describe("첨부 휴지통: 칸마다 한 파일 — 되살리기는 밀어내지 않는다", () => {
  test("🔴 그 칸에 살아 있는 파일이 있으면 SLOT_OCCUPIED, 아무것도 바뀌지 않는다", async () => {
    const quote = await createTestQuote("SLOT");
    const first = await addFile(quote.id, "SIGNED_QUOTE_PDF");
    await softDeleteAttachment({ attachmentId: first, actorUserId, reason: "옛 파일" });

    // 🔴 저쪽은 여기서 같은 칸에 다시 올려 교체를 일으킨다. 이 저장소에는 올리기
    // 통로가 없어(머리말 ②) 살아 있는 파일을 한 장 직접 넣어 칸을 채운다.
    const second = await addFile(quote.id, "SIGNED_QUOTE_PDF");

    const refused = await restoreAttachment({ attachmentId: first, actorUserId });
    assert.equal(refused.ok === false && refused.code, "SLOT_OCCUPIED");
    assert.equal(refused.ok === false && refused.message, QUOTE_ATTACHMENT_SLOT_OCCUPIED_MESSAGE);
    assert.equal((await readAttachment(first)).isDeleted, true, "거절된 되살리기는 표시를 바꾸지 않는다");
    assert.equal((await readAttachment(second)).isDeleted, false, "🔴 지금 파일을 밀어내지 않는다");
    assert.deepEqual(await liveInSlot(quote.id, "SIGNED_QUOTE_PDF"), [second]);
    assert.equal((await attachmentAudits(first, "RESTORE")).length, 0);

    // 대조 — 지금 파일을 지우면 자리가 나서 되살아난다(막힌 이유가 칸이었다).
    await softDeleteAttachment({ attachmentId: second, actorUserId, reason: null });
    const nowRestored = await restoreAttachment({ attachmentId: first, actorUserId });
    assert.equal(nowRestored.ok, true, JSON.stringify(nowRestored));
    assert.deepEqual(await liveInSlot(quote.id, "SIGNED_QUOTE_PDF"), [first]);
  });

  test("다른 칸이 차 있는 것은 막지 않는다 — 칸은 분류마다 하나다", async () => {
    const quote = await createTestQuote("SLOT-OTHER");
    const pdf = await addFile(quote.id, "SIGNED_QUOTE_PDF");
    await softDeleteAttachment({ attachmentId: pdf, actorUserId, reason: null });
    await addFile(quote.id, "QUOTE_EXCEL");

    const restored = await restoreAttachment({ attachmentId: pdf, actorUserId });
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });
});

// ─────────────────────────────────────── 6. 휴지통에 있는 견적서의 파일

describe("첨부 휴지통: 휴지통 견적서의 파일은 지우지도 되살리지도 못한다", () => {
  test("🔴 견적서와 함께 휴지통에 간 파일은 따로 되살리지 못한다 — QUOTE_IN_TRASH", async () => {
    const quote = await createTestQuote("OWNER-TRASHED");
    const file = await addFile(quote.id, "QUOTE_EXCEL");
    await trashQuote(quote);
    assert.equal((await readAttachment(file)).isDeleted, true, "견적서와 함께 첨부 휴지통으로 갔다");

    const refused = await restoreAttachment({ attachmentId: file, actorUserId });
    assert.equal(refused.ok === false && refused.code, "QUOTE_IN_TRASH");
    assert.equal(refused.ok === false && refused.message, QUOTE_ATTACHMENT_IN_TRASH_MESSAGE);
    assert.equal((await readAttachment(file)).isDeleted, true);
    assert.equal((await attachmentAudits(file, "RESTORE")).length, 0);
  });

  test("🔴 휴지통 견적서에 살아 있는 파일이 어긋나 남아 있어도 지우지 못한다", async () => {
    const quote = await createTestQuote("OWNER-TRASHED-SKEW");
    await trashQuote(quote);
    // 견적서가 이미 휴지통인 뒤에 붙은 살아 있는 파일 — 정상 경로로는 생기지 않는다
    // (올리기가 QUOTE_IN_TRASH 로 막는다). 그래도 지우기는 주인을 다시 본다.
    const file = await addFile(quote.id, "SIGNED_QUOTE_PDF");

    const refused = await softDeleteAttachment({ attachmentId: file, actorUserId, reason: null });
    assert.equal(refused.ok === false && refused.code, "QUOTE_IN_TRASH");
    assert.equal((await readAttachment(file)).isDeleted, false, "거절된 지우기는 표시를 바꾸지 않는다");
    assert.equal((await attachmentAudits(file, "FILE_DELETE")).length, 0);
  });
});

// ───────────────────────────────────────────── 7. 주인이 아무도 없는 첨부

describe("첨부 휴지통: 주인이 아무도 없는 첨부", () => {
  test("지워도 터지지 않고 감사에 NONE 이 남는다 — 주인이 없었다는 사실의 기록", async () => {
    const orphan = await addFile(null);

    const removed = await softDeleteAttachment({ attachmentId: orphan, actorUserId, reason: null });
    assert.equal(removed.ok, true, JSON.stringify(removed));

    const [audit] = await attachmentAudits(orphan, "FILE_DELETE");
    const value = audit.newValue as Record<string, unknown>;
    assert.equal(value.ownerType, "NONE");
    assert.equal(value.quoteId, undefined);
    assert.equal(value.repairCaseId, undefined);

    // 되살리기도 같다 — 물을 주인이 없으니 견적서 잠금도 칸 판정도 없다.
    const restored = await restoreAttachment({ attachmentId: orphan, actorUserId });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(((await attachmentAudits(orphan, "RESTORE"))[0].newValue as Record<string, unknown>).ownerType, "NONE");
  });
});

// ───────────────── 지우기 액션이 주인을 다시 읽는 조회 (queries/attachment-download.ts)

describe("내려받기 조회: 액션이 주인을 DB 에서 다시 읽는 자리", () => {
  test("견적서 주인을 싣는다 — 휴지통에 있는 파일도 찾아진다(조건이 아니라 값이다)", async () => {
    const quote = await createTestQuote("LOOKUP");
    const file = await addFile(quote.id, "SIGNED_QUOTE_PDF");

    const found = await getAttachmentForDownload(file);
    assert.ok(found);
    assert.equal(found.quoteId, quote.id);
    assert.equal(found.repairCaseId, null);
    assert.equal(found.productModelId, null);
    assert.equal(found.quoteInTrash, false);
    assert.equal(found.isDeleted, false);
    assert.equal(found.malwareScanStatus, "NOT_SCANNED");
    assert.equal(decideAttachmentDownload(found).allowed, true, "견적서 주인은 주인 없음(DETACHED)이 아니다");

    // 🔴 액션이 이 값으로 물을 권한을 고른다 — 다른 주인의 파일 권한으로는 열리지 않는다.
    assert.equal(
      isAttachmentOwnerAccessAllowed(found, { REPAIR_CASE: false, PRODUCT_MODEL: false, QUOTE: true }),
      true
    );
    assert.equal(
      isAttachmentOwnerAccessAllowed(found, { REPAIR_CASE: true, PRODUCT_MODEL: true, QUOTE: false }),
      false,
      "🔴 다른 주인의 파일 권한으로 견적서 파일이 열리면 안 된다"
    );

    // 휴지통에 넣어도 **찾아진다** — 「없는 것」과 「휴지통에 있는 것」은 다른 답이다.
    await softDeleteAttachment({ attachmentId: file, actorUserId, reason: null });
    const trashed = await getAttachmentForDownload(file);
    assert.ok(trashed);
    assert.equal(trashed.isDeleted, true);
    assert.equal(decideAttachmentDownload(trashed).allowed === false, true);
  });

  test("주인인 견적서가 휴지통이면 quoteInTrash 가 true 다", async () => {
    const quote = await createTestQuote("LOOKUP-TRASHED");
    const file = await addFile(quote.id, "QUOTE_EXCEL");
    await trashQuote(quote);

    const found = await getAttachmentForDownload(file);
    assert.ok(found);
    assert.equal(found.quoteInTrash, true);
    const decision = decideAttachmentDownload(found);
    assert.equal(decision.allowed === false && decision.reason, "QUOTE_IN_TRASH");
  });

  test("없는 id 와 형식이 아닌 id 는 null — DB 를 때리지 않는다", async () => {
    assert.equal(await getAttachmentForDownload(randomUUID()), null);
    for (const bad of ["", "not-a-uuid", "12345"]) {
      assert.equal(await getAttachmentForDownload(bad), null, bad);
    }
  });
});
