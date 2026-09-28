import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray, like } from "drizzle-orm";

import { attachments, auditLogs, quotes, users } from "@dss/core/schema";
import { db, pgClient } from "@/lib/db";
import {
  QUOTE_ATTACHMENT_IN_TRASH_MESSAGE,
  QUOTE_ATTACHMENT_NOT_FOUND_MESSAGE,
  QUOTE_ATTACHMENT_REPLACED_REASON,
  QuoteAttachmentRejectedError,
  createAttachmentRecord,
} from "./attachments";
import { createQuote } from "./quotes";
import { softDeleteQuote } from "./quote-trash";
import { getQuoteAttachmentUploadTarget, listQuoteAttachmentSlots } from "../queries/attachments";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  canonicalMimeTypeForExtension,
} from "@/lib/domain/attachment-allowlist";
import type { QuoteAttachmentSlotCategory } from "@/lib/domain/attachment-category";
import { buildQuoteAttachmentStoredPath } from "@/lib/domain/attachment-path";
import { createLocalFileSystemStorageAdapter } from "@/lib/storage/local-fs-adapter";
import type { StorageAdapter } from "@/lib/storage/storage-adapter";
import type { QuoteFields } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 첨부 올리기 — 파일이 실제로 놓이고, 그 기록이 DB 에 남는가 (조각 3d-3b)
 * ============================================================================
 * A/S 관리 시스템의 `mutations/attachments.integration.test.ts` 가 보는 네 축 가운데
 * **이 사이트에 있는 것**을 본다. 저쪽은 접수 건 · 제품 모델 첨부가 주인공이고(이
 * 사이트에는 그 화면도 그 조회도 없다) 견적서 갈래는 저쪽
 * `mutations/quote-attachments.integration.test.ts` 에 있다. 여기 있는 것은 그 견적서
 * 갈래다:
 *
 *  1. **행과 감사 로그가 같은 트랜잭션에서 함께 남는가** — FILE_UPLOAD.
 *  2. 🔴 **칸마다 한 파일** — 같은 칸에 다시 올리면 옛 파일이 첨부 휴지통으로 가고
 *     (소프트 삭제 + FILE_DELETE 감사 + 고정 사유), 살아 있는 파일은 하나다.
 *     **디스크 실물은 남는다.**
 *  3. **휴지통의 견적서 · 없는 견적서에는 붙지 않는다** — 잠근 트랜잭션의 판정이
 *     던지고, 행도 감사도 남지 않는다.
 *  4. **조회 둘** — 올리기가 본문을 받기 전에 보는 대상(getQuoteAttachmentUploadTarget)과
 *     화면이 볼 칸(listQuoteAttachmentSlots).
 *
 * 🔴 **`listQuoteAttachmentSlots` 는 아직 어느 화면도 부르지 않는다**(3d-4 의 몫이다).
 * 아무도 안 부르는데 시험도 없으면 썩으므로 여기서 덮는다 — 그 조회가 **내부 경로를
 * 싣지 않는다**는 것이 그중 가장 값진 단언이다.
 *
 * 🔴 **인가는 여기서 시험하지 않는다.** 같은 출처 · 세션 · 문턱(quotes WRITE)은 라우트의
 * 몫이고(api/quotes/[id]/attachments/route.ts), 그 순서는 글자를 읽는 시험이 지킨다
 * (app/api/quotes/attachments-route-source.test.ts). 권한 표는 단위 시험이 본다.
 *
 * ── 🔴 디스크는 임시 폴더에 쓴다 ────────────────────────────────────────
 * `UPLOADS_DIR` 은 **A/S 의 실제 업로드 폴더**를 가리킨다 — 두 사이트가 같은 저장 루트를
 * 본다. `getAttachmentStorage()` 를 그대로 부르면 거기에 시험 쓰레기가 쌓인다. 그래서
 * 어댑터를 `createLocalFileSystemStorageAdapter(임시 루트)` 로 직접 만든다(저쪽 시험의
 * 같은 방식). 이 스위트가 만든 파일은 after() 에서 폴더째 사라진다.
 *
 * ── 🔴 격리 규약 ────────────────────────────────────────────────────────
 * 이 스위트가 만드는 견적서의 발행번호는 `PO-ATTACH-TEST-{실행토큰}-` 으로 시작한다.
 * 🔴 **다른 스위트와 같게 바꾸지 마라** — 두 저장소가 같은 `dss_as_test` 를 쓰므로
 * (docs/DB_TESTS.md) 겹치면 한쪽 after() 가 다른 쪽이 만든 줄을 치운다. 이미 쓰이는
 * 이름: PO 의 `PO-ATTRASH-TEST-` · `PO-TEST-LOOKUP-` · `po-test-picker-`, A/S 의
 * `QUOTE-ATTACH-TEST-` · `ATTRASH-TEST-` · `AS-TEST-QUOTE-LOOKUP-`.
 * 고객사 · 제품 · 수리 건은 만들지 않는다(견적서와 첨부 둘뿐이라 접수 월도 쓰지 않는다).
 *
 * after() 는 이 스위트가 만든 첨부(id) → 견적서 감사 → 견적서(접두어) 차례로 지운다.
 * 🔴 **첨부의 감사 로그는 지우지 않는다** — 이웃 첨부 시험들과 같은 규칙이다(감사는
 * append-only 이고 3년 보존 대상이다).
 * ============================================================================
 */

const RUN_TOKEN = randomUUID();
const QUOTE_NUMBER_PREFIX = `PO-ATTACH-TEST-${RUN_TOKEN}-`;

/** 붙일 만한 바이트 — 내용 앞머리 대조는 라우트의 일이라 여기서는 모양만 맞춘다. */
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n견적서 시험용 바이트\n%%EOF\n");
const XLSX_BYTES = new TextEncoder().encode("PK 견적서 시험용 바이트\n");

let actorUserId: string;
let storageRoot: string;
let storage: StorageAdapter;
const touchedQuoteIds: string[] = [];
const createdAttachmentIds: string[] = [];

type QuoteRef = { id: string; version: number };

/** 필수 넷만 채운 한 장 — 이웃 시험(attachment-trash.integration.test.ts)과 같은 모양이다. */
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
    subject: "첨부 올리기 시험",
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

function streamOf(bytes: Uint8Array, chunkSize = 8): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

/**
 * 라우트의 2·4단계 — 임시 파일로 흘려보내고 최종 자리로 옮긴다. **행은 아직 없다.**
 * 이 순서(파일 먼저 · DB 나중)가 통로의 규칙이고, 이 시험도 그대로 따른다.
 */
async function storeFile(params: {
  quoteId: string;
  bytes: Uint8Array;
  extension: string;
}): Promise<{ attachmentId: string; storedPath: string; size: number; sha256: string }> {
  const written = await storage.writeTemp(streamOf(params.bytes), { maxBytes: MAX_ATTACHMENT_SIZE_BYTES });
  const attachmentId = randomUUID().toLowerCase();
  const storedPath = buildQuoteAttachmentStoredPath({
    quoteId: params.quoteId,
    attachmentId,
    extension: params.extension,
  });
  await storage.commit(written.tempPath, storedPath);
  return { attachmentId, storedPath, size: written.size, sha256: written.sha256 };
}

/** 파일을 놓고 행을 만든다 — 통로가 하는 일 그대로. */
async function upload(params: {
  quoteId: string;
  category?: QuoteAttachmentSlotCategory;
  originalFileName?: string;
}) {
  const category = params.category ?? "SIGNED_QUOTE_PDF";
  const extension = category === "QUOTE_EXCEL" ? "xlsx" : "pdf";
  const bytes = category === "QUOTE_EXCEL" ? XLSX_BYTES : PDF_BYTES;
  const stored = await storeFile({ quoteId: params.quoteId, bytes, extension });
  createdAttachmentIds.push(stored.attachmentId);

  const created = await createAttachmentRecord({
    id: stored.attachmentId,
    owner: { kind: "QUOTE", quoteId: params.quoteId },
    category,
    originalFileName: params.originalFileName ?? `견적서.${extension}`,
    storedPath: stored.storedPath,
    mimeType: canonicalMimeTypeForExtension(extension) ?? "application/octet-stream",
    fileSize: stored.size,
    checksumSha256: stored.sha256,
    description: null,
    uploadedBy: actorUserId,
  });
  return { ...created, storedPath: stored.storedPath, category, size: stored.size, sha256: stored.sha256 };
}

async function readAttachment(attachmentId: string) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  return row;
}

async function attachmentAudits(attachmentId: string, actionType: "FILE_UPLOAD" | "FILE_DELETE") {
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

async function liveInSlot(quoteId: string, category: QuoteAttachmentSlotCategory): Promise<string[]> {
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
  // 역할 판정은 여기서 하지 않는다(라우트의 몫).
  assert.ok(anyone, "expected at least one approved user in the test DB");
  actorUserId = anyone.id;

  // 🔴 실제 업로드 폴더(UPLOADS_DIR)를 건드리지 않는다 — 파일 머리말의 '디스크는 임시 폴더에'.
  storageRoot = await mkdtemp(path.join(tmpdir(), "po-attach-upload-test-"));
  storage = createLocalFileSystemStorageAdapter(storageRoot);
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
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  await pgClient.end({ timeout: 5 });
});

// ─────────────────────────────── 1. 행과 감사 로그가 한 트랜잭션으로 남는다

describe("첨부 올리기: 행과 FILE_UPLOAD 감사가 함께 남는다", () => {
  test("새 첨부가 들어가고 감사 한 줄이 같은 트랜잭션에서 남는다", async () => {
    const quote = await createTestQuote("CREATE");
    const created = await upload({ quoteId: quote.id, originalFileName: "결재 견적서.pdf" });

    const row = await readAttachment(created.id);
    assert.equal(row.quoteId, quote.id);
    assert.equal(row.repairCaseId, null, "주인이 아닌 칸은 비어 있다");
    assert.equal(row.productModelId, null, "주인이 아닌 칸은 비어 있다");
    assert.equal(row.category, "SIGNED_QUOTE_PDF");
    assert.equal(row.originalFileName, "결재 견적서.pdf", "사용자가 준 이름은 이 칸에만 남는다");
    assert.equal(row.isDeleted, false);
    assert.equal(row.previewPath, null, "행이 생기는 순간에는 미리보기가 없다");
    assert.equal(row.description, null);
    assert.equal(row.uploadedBy, actorUserId);
    // 검사 엔진이 없으므로 모든 행이 '미검사'로 시작한다(그것이 사실의 기록이다).
    assert.equal(row.malwareScanStatus, "NOT_SCANNED");
    assert.equal(row.mimeType, "application/pdf", "확장자에서 서버가 고른 정본 MIME 이다");
    assert.equal(row.fileSize, PDF_BYTES.byteLength, "센 바이트가 아니라 다른 값이 들어갔다");
    assert.match(row.checksumSha256, /^[0-9a-f]{64}$/);

    // 🔴 DB 에 적힌 경로는 **옮길 수 있는 값**이어야 한다 — `/` 구분자 · 소문자 · 상대경로.
    // 단위 시험(attachment-path.test.ts)이 만들어지는 쪽을 잡고, 여기서는 실제로 표에
    // 들어간 값을 다시 본다.
    assert.equal(row.storedPath, `quotes/${quote.id}/${created.id}.pdf`);
    assert.equal(row.storedPath.includes("\\"), false, "역슬래시가 들어갔다 — Linux 에서 파일명의 일부가 된다");
    assert.equal(row.storedPath, row.storedPath.toLowerCase());
    // 실물도 그 자리에 있다(임시 루트 기준).
    assert.equal(await storage.exists(row.storedPath), true, "행은 있는데 파일이 없다");

    assert.deepEqual(created.displacedAttachmentIds, [], "빈 칸에 처음 올렸는데 밀어낸 것이 있다");

    const audits = await attachmentAudits(created.id, "FILE_UPLOAD");
    assert.equal(audits.length, 1, "감사가 없거나 두 줄이다");
    assert.equal(audits[0].actorUserId, actorUserId);
    assert.equal(audits[0].previousValue, null, "새로 생긴 파일이라 이전 상태가 없다");
    const value = audits[0].newValue as Record<string, unknown>;
    assert.equal(value.ownerType, "QUOTE");
    assert.equal(value.quoteId, quote.id);
    assert.equal(value.repairCaseId, undefined, "주인이 아닌 키는 싣지 않는다");
    assert.equal(value.productModelId, undefined, "주인이 아닌 키는 싣지 않는다");
    assert.equal(value.category, "SIGNED_QUOTE_PDF");
    assert.equal(value.originalFileName, "결재 견적서.pdf");
    assert.equal(value.storedPath, row.storedPath);
    assert.equal(value.mimeType, "application/pdf");
    assert.equal(value.fileSize, PDF_BYTES.byteLength);
    assert.equal(value.checksumSha256, row.checksumSha256);
    assert.deepEqual(value.displacedAttachmentIds, []);
  });

  test("🔴 옮길 수 없는 경로는 마지막 방어선이 막는다 — 행도 감사도 없다", async () => {
    const quote = await createTestQuote("BAD-PATH");
    const attachmentId = randomUUID().toLowerCase();

    await assert.rejects(
      () =>
        createAttachmentRecord({
          id: attachmentId,
          owner: { kind: "QUOTE", quoteId: quote.id },
          category: "SIGNED_QUOTE_PDF",
          // 대문자가 섞인 경로 — NAS(Linux)로 옮긴 뒤 그 파일만 열리지 않는다.
          storedPath: `QUOTES/${quote.id}/${attachmentId}.pdf`,
          originalFileName: "견적서.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          checksumSha256: "0".repeat(64),
          description: null,
          uploadedBy: actorUserId,
        }),
      /소문자/
    );

    assert.equal(await readAttachment(attachmentId), undefined, "막혔는데 행이 남았다");
    assert.equal((await attachmentAudits(attachmentId, "FILE_UPLOAD")).length, 0);
  });

  test("🔴 견적서에 붙지 않는 분류는 거절한다 — 통로를 거치지 않은 호출의 마지막 방어선", async () => {
    const quote = await createTestQuote("BAD-CATEGORY");
    const stored = await storeFile({ quoteId: quote.id, bytes: PDF_BYTES, extension: "pdf" });
    createdAttachmentIds.push(stored.attachmentId);

    await assert.rejects(
      () =>
        createAttachmentRecord({
          id: stored.attachmentId,
          owner: { kind: "QUOTE", quoteId: quote.id },
          // 접수 건 파일 탭의 분류다 — 견적서에는 결재 PDF · 수기 엑셀 두 칸만 붙는다.
          category: "INTAKE_PHOTO",
          originalFileName: "인수 사진.pdf",
          storedPath: stored.storedPath,
          mimeType: "application/pdf",
          fileSize: stored.size,
          checksumSha256: stored.sha256,
          description: null,
          uploadedBy: actorUserId,
        }),
      /이 주인\(QUOTE\)의 첨부에 쓸 수 없습니다/
    );

    assert.equal(await readAttachment(stored.attachmentId), undefined, "막혔는데 행이 남았다");
  });
});

// ────────────────────────────────────── 2. 칸마다 한 파일 — 새 파일이 밀어낸다

describe("첨부 올리기: 칸마다 한 파일 — 같은 칸에 다시 올리면 앞의 것이 밀려난다", () => {
  test("🔴 옛 파일은 첨부 휴지통으로 가고 살아 있는 파일은 하나다 — 실물은 남는다", async () => {
    const quote = await createTestQuote("REPLACE");
    const first = await upload({ quoteId: quote.id, originalFileName: "옛 결재본.pdf" });
    const second = await upload({ quoteId: quote.id, originalFileName: "새 결재본.pdf" });

    assert.deepEqual(second.displacedAttachmentIds, [first.id], "새 파일이 옛 파일을 밀어내지 않았다");
    assert.deepEqual(await liveInSlot(quote.id, "SIGNED_QUOTE_PDF"), [second.id], "🔴 칸에 파일이 둘이다");

    const old = await readAttachment(first.id);
    assert.equal(old.isDeleted, true);
    assert.ok(old.deletedAt, "삭제 시각이 비어 있다");
    assert.equal(old.deletedBy, actorUserId);
    // 🔴 고정 문구다 — 견적서를 되살릴 때 「견적서와 함께 간 파일」과 가르는 열쇠다.
    assert.equal(old.deleteReason, QUOTE_ATTACHMENT_REPLACED_REASON);
    assert.equal(old.deleteReason, "견적서 첨부 교체 — 같은 칸에 새 파일", "DB 에 적히는 글자가 바뀌었다");
    // 🔴 **디스크 실물은 안 지운다** — 복원하려면 실물이 있어야 한다.
    assert.equal(await storage.exists(first.storedPath), true, "밀려난 파일의 실물을 지웠다");
    assert.equal(old.storedPath, first.storedPath, "밀려난 행의 경로가 바뀌었다");

    const deleteAudits = await attachmentAudits(first.id, "FILE_DELETE");
    assert.equal(deleteAudits.length, 1);
    assert.deepEqual(deleteAudits[0].previousValue, { isDeleted: false });
    const removed = deleteAudits[0].newValue as Record<string, unknown>;
    assert.equal(removed.isDeleted, true);
    assert.equal(removed.deleteReason, QUOTE_ATTACHMENT_REPLACED_REASON);
    assert.equal(removed.ownerType, "QUOTE");
    assert.equal(removed.quoteId, quote.id);
    assert.equal(removed.category, "SIGNED_QUOTE_PDF");
    // 무엇이 이 파일을 밀어냈는가 — 같은 트랜잭션의 FILE_UPLOAD 줄과 짝을 이룬다.
    assert.equal(removed.replacedByAttachmentId, second.id);
    assert.equal(removed.storedFileRetained, true, "🔴 디스크 실물을 남긴다는 사실이 기록에도 남는다");

    const uploadAudit = (await attachmentAudits(second.id, "FILE_UPLOAD"))[0].newValue as Record<string, unknown>;
    assert.deepEqual(uploadAudit.displacedAttachmentIds, [first.id]);
  });

  test("다른 칸의 파일은 밀려나지 않는다 — 칸은 분류마다 하나다", async () => {
    const quote = await createTestQuote("REPLACE-OTHER");
    const excel = await upload({ quoteId: quote.id, category: "QUOTE_EXCEL" });
    const pdf = await upload({ quoteId: quote.id, category: "SIGNED_QUOTE_PDF" });
    assert.deepEqual(pdf.displacedAttachmentIds, [], "다른 칸의 파일을 밀어냈다");

    const newPdf = await upload({ quoteId: quote.id, category: "SIGNED_QUOTE_PDF" });
    assert.deepEqual(newPdf.displacedAttachmentIds, [pdf.id]);
    assert.equal((await readAttachment(excel.id)).isDeleted, false, "엑셀 칸이 PDF 교체에 딸려 갔다");
    assert.deepEqual(await liveInSlot(quote.id, "QUOTE_EXCEL"), [excel.id]);
  });
});

// ───────────────────────────────────── 3. 휴지통의 견적서 · 없는 견적서

describe("첨부 올리기: 휴지통의 견적서와 없는 견적서에는 붙지 않는다", () => {
  test("🔴 휴지통의 견적서 — QUOTE_IN_TRASH 로 되돌아오고 행도 감사도 남지 않는다", async () => {
    const quote = await createTestQuote("IN-TRASH");
    await trashQuote(quote);

    // 라우트라면 본문을 받기 전에 이미 걸렀을 자리다. 여기서 보는 것은 **20MB 를 받는
    // 동안 견적서가 휴지통으로 간 경우** — 잠근 트랜잭션이 같은 답을 내야 한다.
    const stored = await storeFile({ quoteId: quote.id, bytes: PDF_BYTES, extension: "pdf" });
    createdAttachmentIds.push(stored.attachmentId);

    const thrown = await createAttachmentRecord({
      id: stored.attachmentId,
      owner: { kind: "QUOTE", quoteId: quote.id },
      category: "SIGNED_QUOTE_PDF",
      originalFileName: "견적서.pdf",
      storedPath: stored.storedPath,
      mimeType: "application/pdf",
      fileSize: stored.size,
      checksumSha256: stored.sha256,
      description: null,
      uploadedBy: actorUserId,
    }).then(
      () => null,
      (caught: unknown) => caught
    );
    assert.ok(thrown instanceof QuoteAttachmentRejectedError);
    assert.equal(thrown.code, "QUOTE_IN_TRASH");
    assert.equal(thrown.message, QUOTE_ATTACHMENT_IN_TRASH_MESSAGE);

    // 트랜잭션이 되돌려져 행도 감사도 없다. 디스크의 파일은 라우트가 치운다.
    assert.equal(await readAttachment(stored.attachmentId), undefined, "막혔는데 행이 남았다");
    assert.equal((await attachmentAudits(stored.attachmentId, "FILE_UPLOAD")).length, 0);
  });

  test("없는 견적서는 NOT_FOUND — 그 사이 영구 삭제된 경우다", async () => {
    const missingQuoteId = randomUUID();
    const attachmentId = randomUUID().toLowerCase();

    const thrown = await createAttachmentRecord({
      id: attachmentId,
      owner: { kind: "QUOTE", quoteId: missingQuoteId },
      category: "QUOTE_EXCEL",
      originalFileName: "견적서.xlsx",
      storedPath: buildQuoteAttachmentStoredPath({
        quoteId: missingQuoteId,
        attachmentId,
        extension: "xlsx",
      }),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSize: 10,
      checksumSha256: "0".repeat(64),
      description: null,
      uploadedBy: actorUserId,
    }).then(
      () => null,
      (caught: unknown) => caught
    );

    assert.ok(thrown instanceof QuoteAttachmentRejectedError);
    assert.equal(thrown.code, "NOT_FOUND");
    assert.equal(thrown.message, QUOTE_ATTACHMENT_NOT_FOUND_MESSAGE);
    assert.equal(await readAttachment(attachmentId), undefined);
  });
});

// ─────────────────────────────────────────────────────── 4. 조회 둘

describe("조회: 올리기가 보는 대상 (getQuoteAttachmentUploadTarget)", () => {
  test("🔴 휴지통의 견적서도 **찾는다** — isDeleted 를 조건이 아니라 값으로 준다", async () => {
    const quote = await createTestQuote("TARGET");

    const live = await getQuoteAttachmentUploadTarget(quote.id);
    assert.deepEqual(live, { id: quote.id, isDeleted: false });

    await trashQuote(quote);
    const trashed = await getQuoteAttachmentUploadTarget(quote.id);
    // 🔴 찾아져야 통로가 「없음」(404)과 「휴지통이라 못 붙임」(409)을 갈라 답할 수 있다.
    assert.deepEqual(trashed, { id: quote.id, isDeleted: true });
  });

  test("없는 id 와 형식이 아닌 id 는 null — DB 를 때리지 않는다", async () => {
    assert.equal(await getQuoteAttachmentUploadTarget(randomUUID()), null);
    for (const bad of ["", "not-a-uuid", "12345", "'; drop table quotes; --"]) {
      assert.equal(await getQuoteAttachmentUploadTarget(bad), null, bad);
    }
  });
});

describe("조회: 화면이 볼 칸 (listQuoteAttachmentSlots)", () => {
  test("🔴 칸마다 하나씩 — **내부 경로를 싣지 않는다**", async () => {
    const quote = await createTestQuote("SLOTS");

    const empty = await listQuoteAttachmentSlots(quote.id);
    assert.deepEqual(Object.keys(empty).sort(), ["QUOTE_EXCEL", "SIGNED_QUOTE_PDF"], "칸이 둘이 아니다");
    assert.deepEqual(empty, { SIGNED_QUOTE_PDF: null, QUOTE_EXCEL: null });

    const pdf = await upload({ quoteId: quote.id, originalFileName: "결재본.pdf" });
    const filled = await listQuoteAttachmentSlots(quote.id);
    assert.equal(filled.QUOTE_EXCEL, null, "붙이지 않은 칸이 차 있다");
    assert.ok(filled.SIGNED_QUOTE_PDF);
    assert.equal(filled.SIGNED_QUOTE_PDF.id, pdf.id);
    assert.equal(filled.SIGNED_QUOTE_PDF.originalFileName, "결재본.pdf");
    assert.equal(filled.SIGNED_QUOTE_PDF.fileSize, PDF_BYTES.byteLength);
    assert.ok(filled.SIGNED_QUOTE_PDF.uploadedByName.length > 0, "올린 사람 이름을 싣지 않는다");
    // 직렬화해서 클라이언트 컴포넌트로 넘길 수 있어야 한다 — Date 가 아니라 ISO 문자열이다.
    assert.equal(typeof filled.SIGNED_QUOTE_PDF.uploadedAt, "string");
    assert.match(filled.SIGNED_QUOTE_PDF.uploadedAt, /^\d{4}-\d{2}-\d{2}T/);

    // 🔴 **이 결과가 화면으로 그대로 넘어간다** — 저장 경로 · 체크섬 · MIME 은 없다.
    assert.deepEqual(Object.keys(filled.SIGNED_QUOTE_PDF).sort(), [
      "fileSize",
      "id",
      "originalFileName",
      "uploadedAt",
      "uploadedByName",
    ]);
  });

  test("칸 교체 뒤에는 새 파일만 보인다 — 밀려난 파일은 칸에 없다", async () => {
    const quote = await createTestQuote("SLOTS-REPLACE");
    const first = await upload({ quoteId: quote.id, category: "QUOTE_EXCEL", originalFileName: "옛 엑셀.xlsx" });
    const second = await upload({ quoteId: quote.id, category: "QUOTE_EXCEL", originalFileName: "새 엑셀.xlsx" });
    assert.deepEqual(second.displacedAttachmentIds, [first.id]);

    const slots = await listQuoteAttachmentSlots(quote.id);
    assert.ok(slots.QUOTE_EXCEL);
    assert.equal(slots.QUOTE_EXCEL.id, second.id);
    assert.equal(slots.QUOTE_EXCEL.originalFileName, "새 엑셀.xlsx");
    assert.equal(slots.SIGNED_QUOTE_PDF, null);
  });

  test("없는 견적서와 형식이 아닌 id 는 빈 칸 둘이다 — 던지지 않는다", async () => {
    assert.deepEqual(await listQuoteAttachmentSlots(randomUUID()), {
      SIGNED_QUOTE_PDF: null,
      QUOTE_EXCEL: null,
    });
    assert.deepEqual(await listQuoteAttachmentSlots("not-a-uuid"), {
      SIGNED_QUOTE_PDF: null,
      QUOTE_EXCEL: null,
    });
  });
});
