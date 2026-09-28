import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { isTrustedOrigin } from "@/lib/auth/request-guards";
import { getSessionUser } from "@/lib/auth/session";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  canonicalMimeTypeForExtension,
  isAllowedExtension,
  isContentCompatibleWithExtension,
  isExtensionAllowedForCategory,
  normalizeFileExtension,
} from "@/lib/domain/attachment-allowlist";
import {
  attachmentCategoryLabels,
  isAttachmentCategory,
  isQuoteAttachmentSlotCategory,
  type QuoteAttachmentSlotCategory,
} from "@/lib/domain/attachment-category";
import { ATTACHMENT_OWNER_PERMISSIONS } from "@/lib/domain/attachment-download-policy";
import { buildQuoteAttachmentStoredPath } from "@/lib/domain/attachment-path";
import { QuoteAttachmentRejectedError, createAttachmentRecord } from "@/lib/db/mutations/attachments";
import { getQuoteAttachmentUploadTarget } from "@/lib/db/queries/attachments";
import { getAttachmentStorage } from "@/lib/storage/local-fs-adapter";
import { AttachmentTooLargeError } from "@/lib/storage/storage-adapter";

/**
 * ============================================================================
 * POST /api/quotes/{id}/attachments?fileName=&category= — 견적서에 결재 PDF · 수기 엑셀을 붙이는 통로
 * ============================================================================
 * 🔴 조각 3d-3b 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/[id]/attachments/route.ts`)에서 가져왔다.
 * 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른 것은 아래 두 가지뿐이다.
 *
 * ── 🔴 다른 것 ① 문지기 — 다섯 걸음이 두 걸음이다 ────────────────────────
 * 저쪽은 `isTrustedOrigin` → `getAuthSource()`(mock 저장 모드) → `readSession()` →
 * `resolveActingUserForSession()` → `approvalStatus` 확인의 다섯 걸음이다. 이 사이트는
 *   · `isTrustedOrigin(request)` — **그대로 쓴다.** 라우트 핸들러는 Next 가 CSRF 를
 *     막아 주지 않는다(서버 액션과 다른 점) — 이 통로가 그 문지기의 첫 사용처다.
 *   · `getSessionUser()` — 한 걸음이 나머지 넷을 대신한다. mock 저장 모드가 없고,
 *     매 요청 users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은
 *     세션을 전부 거른다(auth/session.ts — `approval_status = 'APPROVED'` 가 그 조회의
 *     WHERE 에 들어 있다). 그래서 `DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`
 *     두 코드가 이 통로에 없다. 받기 통로 · 서버 액션들이 이미 그렇게 옮겨져 있다
 *     (api/quotes/[id]/xlsx/route.ts · server/actions/attachments.ts 머리말).
 *
 * ── 🔴 다른 것 ② 사내 공유폴더 복사는 **아직 오지 않았다** ───────────────
 * 저쪽은 결재 PDF 기록이 성공한 뒤 그 파일을 사내 공유폴더에 `… - 有印.pdf` 로
 * 복사하고(`server/services/quote-issue.ts` 의 archiveSignedQuotePdf) 그 결과를 201
 * 응답의 `archive` 칸에 싣는다. 이 사이트에는 그 두 파일이 없고 이번에 가져오지
 * 않았다 — 공유폴더는 **발행(조각 3c-3)** 의 몫이다. 이 통로의 `archive` 는 분류와
 * 무관하게 **언제나 `null`** 이다(아래 응답의 곁말).
 *
 * ── 접수 건 통로와 다른 점(저쪽 머리말 그대로) ──────────────────────────
 *   권한      **quotes WRITE**(판정 파일의 표 ATTACHMENT_OWNER_PERMISSIONS.CHANGE.QUOTE) —
 *             견적서 한 장에 대한 판정은 없다
 *   대상 조회  getQuoteAttachmentUploadTarget
 *   분류      **요청값(category) — 두 칸만**
 *             SIGNED_QUOTE_PDF(pdf) · QUOTE_EXCEL(xlsx · xls)
 *   설명      받지 않는다(칸 이름이 곧 설명이다)
 *   상한      **칸마다 한 파일 — 다시 올리면 바꾼다.** 옛 파일은
 *             첨부 휴지통으로(mutations/attachments.ts 의
 *             '셋째 주인'). 거절이 아니라 교체라 409 가 없다
 *   경로      quotes/{견적서id}/{첨부id}.{확장자}
 *   실패 코드  QUOTE_NOT_FOUND(404) · QUOTE_IN_TRASH(409)
 *
 * ── 휴지통의 견적서에는 붙이지 못한다 — 두 번 본다 ───────────────────────
 *  1) 본문을 받기 **전에** — 대상 조회의 isDeleted 로. 빠른 거절일 뿐이다.
 *  2) 행을 넣을 때 — createAttachmentRecord 가 **견적서 행을 잠근 같은 트랜잭션**에서
 *     다시 본다. 20MB 를 받는 동안 누가 견적서를 휴지통에 넣었으면 거기서
 *     QuoteAttachmentRejectedError(QUOTE_IN_TRASH)로 되돌아오고, 이미 놓은 파일은 여기서
 *     치운다. 칸 교체도 그 잠금 안에서 한다 — 같은 칸에 동시에 올려도 살아 남는 파일은
 *     하나다.
 *
 * 휴지통의 견적서를 404 로 숨기지 않고 409 로 갈라 답하는 까닭: 이 통로를 부르는 사람은
 * 문턱(quotes WRITE ⊇ READ)을 넘어 그 견적서를 이미 보던 사람이다 — 숨길 존재가 없고,
 * 404 는 「견적서가 사라졌다」로 잘못 읽힌다(개선 요청 통로의 '404 가 아니라 403' 과 같은
 * 판단).
 *
 * ⚠️ 4번(파일 이동)과 5번(DB)을 뒤집지 않는다 — 실물 없는 DB 행이 주인 없는 파일보다
 * 나쁘다(mutations/attachments.ts 머리말).
 * ============================================================================
 */

// 파일을 다루므로 Node 런타임이 필요하다(node:crypto · 저장소 어댑터의 node:fs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode =
  | "UNTRUSTED_ORIGIN"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_IN_TRASH"
  | "INVALID_CATEGORY"
  | "CATEGORY_NOT_ALLOWED_FOR_OWNER"
  | "INVALID_FILE_NAME"
  | "EXTENSION_NOT_ALLOWED"
  | "EXTENSION_NOT_ALLOWED_FOR_CATEGORY"
  | "EMPTY_BODY"
  | "FILE_TOO_LARGE"
  | "CONTENT_MISMATCH"
  | "STORAGE_FAILED"
  | "RECORD_FAILED";

function fail(status: number, code: FailureCode, message: string): NextResponse {
  // 무엇이 왜 막혔는지 사람이 읽을 수 있게 돌려준다. 저장 루트나 내부 경로는
  // 싣지 않는다 — 실패 응답이 디스크 구조를 알려 주는 창구가 되면 안 된다.
  return NextResponse.json({ error: message, code }, { status });
}

const MAX_ORIGINAL_FILE_NAME_LENGTH = 255;

const QUOTE_NOT_FOUND_MESSAGE = "해당 견적서를 찾을 수 없습니다.";
const QUOTE_IN_TRASH_MESSAGE = "휴지통에 있는 견적서에는 파일을 붙일 수 없습니다. 견적서를 먼저 되살려 주세요.";

/** 칸마다 받는 형식을 사람이 읽는 말로 — 분류 허용목록(attachment-allowlist.ts)과 같은 내용이다. */
const SLOT_EXTENSION_HINTS: Record<QuoteAttachmentSlotCategory, string> = {
  SIGNED_QUOTE_PDF: "결재 견적서는 PDF 로만 올릴 수 있습니다",
  QUOTE_EXCEL: "수기 견적서는 엑셀(xlsx · xls)로만 올릴 수 있습니다",
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // ── 1) 본문을 받기 전에 끝내야 하는 확인들 ────────────────────────────
  // 🔴 같은 출처인가 — 맨 처음이다. 라우트 핸들러에는 Next 의 CSRF 방어가 없어,
  // 이것이 없으면 남의 사이트에 심어 둔 <form> 한 줄이 로그인한 사람의 쿠키로 이
  // 통로를 부를 수 있다(auth/request-guards.ts 머리말).
  if (!isTrustedOrigin(request)) {
    return fail(403, "UNTRUSTED_ORIGIN", "요청 출처를 확인할 수 없습니다.");
  }

  // 세션 — 살아 있는 계정을 매 요청 다시 읽는다. 저쪽의 세 걸음(readSession ·
  // resolveActingUserForSession · approvalStatus)이 이 한 줄이다(파일 머리말 ①).
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  // 권한 — 견적서를 고칠 수 있는 사람만(quotes WRITE). 🔴 **견적서를 조회하기 전이다** —
  // 권한이 없는 사람이 응답 갈래(404 냐 403 이냐)로 그 id 의 견적서가 있는지 알아내는
  // 길을 막는다. 무엇을 묻는지는 판정 파일의 표 한 곳이 정한다 — 지우기 · 되살리기
  // 액션과 같은 칸이다.
  const permission = ATTACHMENT_OWNER_PERMISSIONS.CHANGE.QUOTE;
  if (!(await hasPermission(actingUser, permission.areaKey, permission.level))) {
    return fail(403, "FORBIDDEN", "견적서에 파일을 붙일 권한이 없습니다.");
  }

  const { id: quoteId } = await context.params;

  const target = await getQuoteAttachmentUploadTarget(quoteId);
  if (!target) {
    return fail(404, "QUOTE_NOT_FOUND", QUOTE_NOT_FOUND_MESSAGE);
  }
  // 휴지통의 견적서 — 빠른 거절(파일 헤더의 '두 번 본다' 1).
  if (target.isDeleted) {
    return fail(409, "QUOTE_IN_TRASH", QUOTE_IN_TRASH_MESSAGE);
  }

  // ── 메타데이터(쿼리 문자열) 검증 — 아직 본문은 건드리지 않았다 ────────
  const searchParams = request.nextUrl.searchParams;

  const rawCategory = (searchParams.get("category") ?? "").trim();
  if (!isAttachmentCategory(rawCategory)) {
    return fail(400, "INVALID_CATEGORY", "첨부 분류가 올바르지 않습니다.");
  }
  // 견적서에는 두 칸만 붙는다(attachment-category.ts 의 isAttachmentCategoryAllowedForOwner).
  if (!isQuoteAttachmentSlotCategory(rawCategory)) {
    return fail(
      400,
      "CATEGORY_NOT_ALLOWED_FOR_OWNER",
      `'${attachmentCategoryLabels[rawCategory]}' 분류는 견적서에 붙일 수 없습니다. 견적서에는 결재 견적서 PDF 와 수기 견적서 엑셀만 붙입니다.`
    );
  }
  const category: QuoteAttachmentSlotCategory = rawCategory;

  const originalFileName = (searchParams.get("fileName") ?? "").trim();
  if (originalFileName.length === 0 || originalFileName.length > MAX_ORIGINAL_FILE_NAME_LENGTH) {
    return fail(400, "INVALID_FILE_NAME", "파일 이름이 비어 있거나 너무 깁니다.");
  }

  const extension = normalizeFileExtension(originalFileName);
  if (!extension || !isAllowedExtension(extension)) {
    return fail(415, "EXTENSION_NOT_ALLOWED", "허용되지 않는 파일 형식입니다.");
  }
  if (!isExtensionAllowedForCategory(extension, category)) {
    return fail(415, "EXTENSION_NOT_ALLOWED_FOR_CATEGORY", `${SLOT_EXTENSION_HINTS[category]}(.${extension}).`);
  }

  // 브라우저가 알려 준 크기로 미리 자른다. 이 값은 믿을 수 없지만(진짜 판정은
  // 아래 writeTemp가 센 바이트로 한다) 맞을 때는 20MB를 받아 놓고 버리는 일을
  // 통째로 아낀다.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_SIZE_BYTES) {
    return fail(413, "FILE_TOO_LARGE", "파일이 20MB를 넘습니다.");
  }

  const body = request.body;
  if (!body) {
    return fail(400, "EMPTY_BODY", "올릴 파일이 없습니다.");
  }

  const storage = getAttachmentStorage();

  // ── 2) 임시 파일로 흘려보내며 크기·체크섬 계산 ────────────────────────
  let written;
  try {
    written = await storage.writeTemp(body, { maxBytes: MAX_ATTACHMENT_SIZE_BYTES });
  } catch (error) {
    if (error instanceof AttachmentTooLargeError) {
      // 임시 파일은 writeTemp가 던지기 전에 이미 지웠다.
      return fail(413, "FILE_TOO_LARGE", "파일이 20MB를 넘습니다.");
    }
    console.error("견적서 첨부 임시 저장 실패", error);
    return fail(500, "STORAGE_FAILED", "파일을 저장하는 중 문제가 발생했습니다.");
  }

  // ── 3) 확장자 ↔ 실제 내용 대조 ────────────────────────────────────────
  if (written.size === 0) {
    await storage.discard(written.tempPath);
    return fail(400, "EMPTY_BODY", "빈 파일은 올릴 수 없습니다.");
  }
  if (!isContentCompatibleWithExtension(extension, written.header)) {
    await storage.discard(written.tempPath);
    return fail(
      415,
      "CONTENT_MISMATCH",
      `파일 내용이 확장자(.${extension})와 맞지 않습니다. 이름만 바꾼 파일은 올릴 수 없습니다.`
    );
  }

  const attachmentId = randomUUID().toLowerCase();
  const storedPath = buildQuoteAttachmentStoredPath({ quoteId: target.id, attachmentId, extension });

  // ── 4) 파일을 최종 자리로 옮긴다 (DB보다 먼저 — 파일 상단 ⚠️ 참조) ────
  try {
    await storage.commit(written.tempPath, storedPath);
  } catch (error) {
    await storage.discard(written.tempPath);
    console.error("견적서 첨부 파일 이동 실패", error);
    return fail(500, "STORAGE_FAILED", "파일을 저장하는 중 문제가 발생했습니다.");
  }

  // ── 5) 그 다음에 DB (견적서 행 잠금 → 판정 · 칸 교체 → 행 + 감사 로그, 한 트랜잭션) ──
  let created;
  try {
    created = await createAttachmentRecord({
      id: attachmentId,
      owner: { kind: "QUOTE", quoteId: target.id },
      category,
      originalFileName,
      storedPath,
      // 브라우저가 보낸 Content-Type이 아니라 확장자에서 서버가 고른 값이다.
      mimeType: canonicalMimeTypeForExtension(extension) ?? "application/octet-stream",
      fileSize: written.size,
      checksumSha256: written.sha256,
      description: null,
      uploadedBy: actingUser.id,
    });
  } catch (error) {
    // 기록을 만들지 못했으면 방금 놓은 파일은 주인이 없다. 치워 보되, 실패해도
    // 여기서 더 하지 않는다 — 주인 없는 파일은 나중에 훑어 치울 수 있다.
    await storage.delete(storedPath).catch(() => undefined);

    if (error instanceof QuoteAttachmentRejectedError) {
      // 잠근 트랜잭션의 판정이 막았다 — 파일을 받는 동안 견적서가 휴지통으로 갔거나
      // 영구 삭제됐다.
      switch (error.code) {
        case "NOT_FOUND":
          return fail(404, "QUOTE_NOT_FOUND", error.message);
        case "QUOTE_IN_TRASH":
          return fail(409, "QUOTE_IN_TRASH", QUOTE_IN_TRASH_MESSAGE);
      }
    }
    console.error("견적서 첨부 기록 생성 실패", error);
    return fail(500, "RECORD_FAILED", "파일 기록을 저장하는 중 문제가 발생했습니다.");
  }

  return NextResponse.json(
    {
      id: created.id,
      quoteId: target.id,
      category,
      originalFileName,
      fileSize: written.size,
      checksumSha256: written.sha256,
      uploadedAt: created.uploadedAt,
      // 같은 칸의 옛 파일 — 첨부 휴지통으로 갔다(없으면 빈 배열). 화면이 「바꿨다」고 알릴 근거.
      displacedAttachmentIds: created.displacedAttachmentIds,
      // 🔴 공유폴더 복사는 아직 오지 않았다 — 발행(3c-3)의 몫이다. 응답 모양만 A/S 와
      // 맞춰 둔다(모양은 domain/quote-issue-result.ts 의 QuoteIssueArchiveResult).
      // 저쪽은 결재 PDF 칸에서만 값이 차고 수기 엑셀 칸은 null 인데, 여기서는 **분류와
      // 무관하게 언제나 null** 이다.
      archive: null,
    },
    { status: 201 }
  );
}
