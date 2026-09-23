import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { recordQuoteExport } from "@/lib/db/mutations/quote-exports";
import { listLiveQuoteAttachments } from "@/lib/db/queries/attachments";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { decideAttachmentDownload } from "@/lib/domain/attachment-download-policy";
import { AttachmentPathError, resolveAttachmentAbsolutePath } from "@/lib/domain/attachment-path";
import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "@/lib/domain/quote-document-support";
import { buildQuoteFileName, quoteContentDisposition } from "@/lib/domain/quote-file-name";
import { renderQuoteWorkbook } from "@/lib/server/services/quote-workbook";
import { getAttachmentStorage, resolveUploadsRoot } from "@/lib/storage/local-fs-adapter";
import { QuoteTemplateError } from "@/lib/storage/quote-template";
import { isValidQuoteId } from "@/lib/validation/quote-input";
import { QUOTE_EXCEL_MISSING_MESSAGE, decideQuoteDownloadSource } from "./download-source";

/**
 * ============================================================================
 * GET /api/quotes/{id}/xlsx — 이 사이트에서 견적서가 밖으로 나가는 단 하나의 통로
 * ============================================================================
 * 저장된 값(quotes + quote_items)에 원본 양식을 씌워 **그 자리에서 만든** xlsx 를
 * 흘려보낸다. 만들어진 파일은 디스크에 남기지 않는다 — 남기면 그 폴더가 로그인 ·
 * 권한 · 감사를 우회하는 두 번째 통로가 된다. (공유폴더에 남기는 발행은 **조각
 * 3c-3** 의 일이고, 3d 뒤로 미뤄져 있다.)
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 세션(= 살아 있는 계정) → 2) 권한(quotes READ) → 3) id 형식 → 4) 견적서 조회
 *  → 5) 앱 양식이 있는 종류인가 → 6) 엑셀 전용인가(갈라진다) → 7) 양식 읽기 · 채우기
 *  → 8) 감사(EXCEL_EXPORT) → 9) 전송
 *
 * 🔴 **2번이 4번보다 앞인 것이 이 파일의 요점**이다 — 권한이 없는 사람에게는 "그
 * id 의 견적서가 있다"는 사실조차 알려 주지 않는다. 3번(형식)도 조회 앞이다: 형식이
 * 틀린 글자로 DB 를 때리지 않는다.
 *
 * ── 🔴 A/S 의 같은 통로를 베끼지 않았다 ─────────────────────────────────
 * 하는 일은 저쪽(`RF_Service_System/src/app/api/quotes/[id]/xlsx/route.ts`)과 같고
 * 응답 머리글 · 파일 이름 · 감사 기록도 같다. 다른 것은 **문지기 도구**다:
 *   · 저쪽은 `getAuthSource()`(mock 저장 모드) → `readSession()` →
 *     `resolveActingUserForSession()` → `approvalStatus` 확인의 네 걸음이다.
 *   · 이 사이트에는 mock 모드가 없고, `getSessionUser()` 한 걸음이 그 일을 전부
 *     한다 — 매 요청 users 한 행을 읽어 정지 · 삭제 · 잠김 · 승인 대기 · 포털이 끊은
 *     세션을 거른다(lib/auth/session.ts). 서버 액션들이 이미 그렇게 옮겨져 있다
 *     (lib/server/actions/quotes.ts 머리말 ①②).
 *
 * ── 🔴 쿠키가 아예 없는 요청은 여기까지 오지 않는다 (실측 2026-09-22) ────
 * `src/proxy.ts` 의 matcher 가 **`/api/auth` 가 아닌 API 주소를 일부러 다 잡는다** —
 * 「새 API 를 만들 때 아무도 손대지 않으면 「로그인 필요」가 기본이 되는 쪽이, 조용히
 * 열려 있는 쪽보다 안전하다」(그 파일 머리말). 🔴 **이 통로가 그 첫 주인공**이다:
 * 쿠키가 없으면 303 으로 통합로그인에 보내지고, 가려던 주소를 싣고 오므로 로그인을
 * 마치면 그대로 파일이 내려온다.
 *
 * 그래서 아래 401 은 **쿠키는 있는데 쓸 수 없는 경우**를 받는다 — 서명이 틀렸거나
 * 만료됐거나 포털이 끊었거나 계정이 정지·삭제·잠김·승인 대기인 경우다(실측으로
 * 401 을 확인했다). 🔴 프록시가 있으니 이 검사를 빼도 된다고 여기면 안 된다: 그것은
 * 쿠키가 **있는지**만 보는 낙관적 확인이고(그 파일 머리말), 관문은 여기다.
 *
 * ── 왜 READ 로 충분한가 ─────────────────────────────────────────────────
 * 이 통로는 **아무것도 바꾸지 않는다.** 이미 저장된 값을 보기 좋은 형태로 옮겨 줄
 * 뿐이라, 목록에서 그 견적서를 볼 수 있는 사람이면 그 내용을 파일로도 받을 수 있는
 * 것이 맞다. WRITE 를 요구하면 "화면에서는 금액까지 다 보이는데 파일로는 못 받는"
 * 상태가 되고, 그 사람은 결국 화면을 보고 손으로 옮겨 적는다. 수정 권한자도 같은
 * 링크로 받는다 — 목록의 받기가 권한으로 갈리지 않는 까닭이다.
 *
 * 대신 **감사는 남긴다** — 직인이 찍힌 문서가 나가는 일이다
 * (db/mutations/quote-exports.ts 의 '왜 남기는가').
 *
 * ── 🔴 엑셀 전용 견적서는 붙인 엑셀을 그대로 내려준다 (조각 3d-2) ────────
 * 품목 없이 손으로 만든 엑셀을 붙여 저장한 장(quotes.is_excel_only)은 그 엑셀이 곧
 * 보낸 문서다(사용자 결정). 그런 장이면 5번 뒤에서 갈라져 7번(양식 채우기) 대신
 * **엑셀 칸에 지금 붙어 있는 파일**을 저장소에서 읽어 그대로 흘려보낸다 — 무엇을
 * 고르는지는 형제 파일 download-source.ts, 그 파일을 내보내도 되는지(악성코드 검사
 * 상태)는 첨부 내려받기와 **같은 판정 함수**(decideAttachmentDownload)가 정한다.
 * 파일 이름은 아래의 이름 규칙 그대로에 확장자만 붙인 파일의 것(xlsx · xls)을 따른다.
 * 붙인 엑셀이 없으면 404 와 사람이 읽는 문장이다 — 앱 양식으로 대신 채우지 않는다
 * (그 장에는 품목이 없어 빈 견적서가 나간다). 권한(READ) · 감사(EXCEL_EXPORT)는
 * 일반 견적서와 같다.
 *
 * 🔴 **2026-09-23 까지 이 자리는 501 거절이었다**(조각 3c-2 — `domain/
 * quote-excel-only-download.ts`). 이 사이트에 파일을 붙이는 칸이 없어 돌려줄 파일이
 * 없다는 것이 까닭이었는데, 두 사이트가 **같은 `attachments` 표**를 보므로 A/S 에서
 * 붙인 엑셀은 처음부터 여기 있었다. 3d-2 가 그 파일을 읽어 내리는 길을 가져오면서
 * 그 상수 파일은 사라졌다. 🔴 **붙이는 칸은 아직 없다**(3d-3 · 3d-4) — 이 통로는
 * **읽기만** 한다.
 *
 * **일반 견적서는 한 바이트도 달라지지 않는다** — 그 길에는 조회 하나 늘지 않는다.
 *
 * 🔴 그 갈래는 `canRenderQuoteDocument`(5번)와 **별개의 조건**이다. 그 판정은
 * 「앱 양식이 있는 종류인가」를 묻고 엑셀 전용이면 언제나 참을 돌려준다 — 그 함수를
 * 고치지 않는 까닭이 그 파일 머리말에 있다.
 *
 * ── 실패 응답에 경로를 싣지 않는다 ──────────────────────────────────────
 * 양식을 못 읽었을 때 그 경로를 응답에 담으면 오류 메시지가 디스크 구조를 알려 주는
 * 창구가 된다. 경로는 서버 로그에만 남는다(storage/quote-template.ts). **붙인 엑셀의
 * 저장 경로도 같다** — 아래 세 거절 갈래 가운데 어느 것도 경로 · 첨부 id 를 응답에
 * 싣지 않는다. 값 자체도 로그에 담지 않는다 — 품명 · 신고증상에 고객사 사정이 섞인다.
 * ============================================================================
 */

/** 양식 파일을 디스크에서 읽는다(node:fs). 기본값과 같은 값이지만 못 박아 둔다. */
export const runtime = "nodejs";
/** 쿠키를 읽고 매 요청 DB 를 본다 — 캐시된 응답을 내놓을 수 있는 통로가 아니다. */
export const dynamic = "force-dynamic";

type FailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  /**
   * 🔴 앱 양식이 아직 없는 종류다(domain/quote-document-support.ts). 「만들지 못했다
   * (RENDER_FAILED)」와 가른 것은 고장이 아니라 아직 안 만든 기능이기 때문이다 —
   * 관리자에게 문의할 일이 아니다. 🔴 **지금 걸리는 종류는 없다**(내자 · OH · 케이블이
   * 모두 열려 있다). 다음 종류를 기다리는 자물쇠다.
   */
  | "KIND_NOT_SUPPORTED"
  | "TEMPLATE_UNAVAILABLE"
  | "RENDER_FAILED"
  /** 엑셀 전용 견적서인데 붙인 엑셀이 없다(조각 3d-2). */
  | "EXCEL_NOT_ATTACHED"
  /** 붙인 엑셀이 악성코드 검사에 막혔다 — 첨부 내려받기와 같은 판정. */
  | "SCAN_BLOCKED"
  | "STORAGE_FAILED";

/**
 * 거절은 JSON 한 벌이다 — 사람이 읽는 문장(`error`)과 화면이 갈래를 가를 값(`code`).
 * 🔴 **캐시에 남기지 않는다**: 권한과 세션에 따라 답이 달라지는 응답이다.
 */
function fail(status: number, code: FailureCode, message: string): Response {
  return Response.json({ error: message, code }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  // ── 1) 세션 — 살아 있는 계정을 매 요청 다시 읽는다 ───────────────────
  // 강등 · 정지된 계정이 토큰 만료 전까지 예전 권한으로 받아 가는 구멍을 막는다.
  const actingUser = await getSessionUser();
  if (!actingUser) return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");

  // ── 2) 권한 — 🔴 조회보다 앞이다 ─────────────────────────────────────
  if (!(await hasPermission(actingUser, "quotes", "READ"))) {
    return fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }

  // ── 3) id 형식 — 틀린 글자로 DB 를 때리지 않는다 ─────────────────────
  const { id } = await context.params;
  if (!isValidQuoteId(id)) return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");

  // ── 4) 견적서 ────────────────────────────────────────────────────────
  // 지워진 장은 여기서도 없는 것이다(getQuoteForEdit 이 is_deleted 로 좁히고, 앱이
  // 아직 다루지 못하는 종류도 null 로 답한다). 화면에서 지운 견적서를 주소만으로
  // 계속 뽑을 수 있으면 휴지통이 뜻을 잃는다.
  const quote = await getQuoteForEdit(id);
  if (!quote) return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");

  /**
   * ── 5) 앱 양식으로 만들 수 있는 장인가 ────────────────────────────────
   * 양식이 없는 종류를 아래 채우개로 보내면 **거절되는 것이 아니라 남의 양식에 그
   * 종류의 값이 채워진 문서**가 나온다. 목록에서 링크를 감추는 것으로는 이 주소를
   * 직접 여는 길(주소창 · 예전 링크)이 남아 **여기서 막는다.** 판정은
   * domain/quote-document-support.ts 한 곳이다 — 종류를 손으로 가르지 않는다.
   *
   * 501 인 것은 **고장이 아니라 아직 만들지 않은 기능**이기 때문이다.
   */
  if (!canRenderQuoteDocument(quote)) {
    return fail(501, "KIND_NOT_SUPPORTED", QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE);
  }

  /**
   * ── 6) 🔴 엑셀 전용 견적서 — 붙인 엑셀을 그대로(아래 sendAttachedExcel) ──
   * 위 5번과 **별개의 조건**이다(그 판정은 엑셀 전용이면 언제나 참이다). 무엇을
   * 고르는지는 형제 파일 download-source.ts 에 있다. 🔴 **일반 견적서는 이 줄
   * 아래로 그대로 내려간다** — 그 길에는 조회 하나 늘지 않는다.
   */
  if (quote.isExcelOnly) return sendAttachedExcel(quote, actingUser.id);

  // ── 7) 양식을 읽어 채운다 ────────────────────────────────────────────
  let workbook: Buffer;
  try {
    workbook = await renderQuoteWorkbook(quote);
  } catch (err) {
    if (err instanceof QuoteTemplateError) {
      // 문장은 그 오류가 들고 온 것을 쓴다(경로는 담기지 않는다 — 서버 로그에만 있다).
      return fail(503, "TEMPLATE_UNAVAILABLE", err.message);
    }
    // 양식이 바뀌어 셀을 못 찾은 경우가 여기로 온다(xlsx/sheet-patch.ts 는 조용히
    // 넘어가지 않고 던진다 — 빈 칸짜리 견적서가 나가는 것보다 낫다).
    console.error("[quote-xlsx] 견적서를 만들지 못했다", {
      quoteId: quote.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail(500, "RENDER_FAILED", "견적서를 만들지 못했습니다. 관리자에게 문의해 주세요.");
  }

  // ── 8) 감사 — 🔴 파일을 돌려주기 **전에** 남긴다 ─────────────────────
  // 응답을 먼저 반환하면 기록이 누락될 수 있다. 나가지 않은 문서(위 거절들)에는
  // 한 줄도 남지 않는다 — 그래서 이 자리가 모든 관문 뒤다.
  await recordQuoteExport({
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    actorUserId: actingUser.id,
  });

  // ── 9) 전송 ──────────────────────────────────────────────────────────
  // 파일 이름은 **서버가 정한다**(domain/quote-file-name.ts) — 목록의 받기가 평범한
  // 링크 하나인 까닭이다. 클라이언트가 이름을 정하면 화면마다 다른 이름으로 저장된다.
  const fileName = buildQuoteFileName({
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerNameText,
  });

  return new Response(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": quoteContentDisposition(fileName),
      "Content-Length": String(workbook.byteLength),
      // 직인이 찍힌 문서다. 중간 캐시에 남지 않게 한다.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

/**
 * ============================================================================
 * 엑셀 전용 견적서 — 엑셀 칸에 지금 붙어 있는 파일을 그대로 내려준다 (조각 3d-2)
 * ============================================================================
 * 첨부 내려받기 통로(조각 3d-4 가 가져올 api/attachments/[id]/download)와 **같은 방어**를
 * 거친다: 판정 함수(decideAttachmentDownload — 검사 상태), DB 에 적힌 경로도 믿지 않는
 * 경로 검증(resolveAttachmentAbsolutePath), 파일에 닿는 것은 StorageAdapter 로만. 감사는
 * 이 통로의 것(EXCEL_EXPORT)을 남긴다 — 무엇을 누가 받았는지는 견적서 id 와 발행번호가
 * 답한다(db/mutations/quote-exports.ts).
 *
 * 🔴 **`export` 하지 않는다.** Next 는 route.ts 에서 정해진 이름(GET · runtime · dynamic)
 * 말고 다른 것을 내보내지 못하게 한다 — 내보내면 `next build` 가 실패한다. A/S 의 같은
 * 함수도 모듈 안에만 있다(그 파일의 같은 자리).
 *
 * 🔴 **인증 · 권한은 여기 오기 전에 이미 끝났다.** 위 GET 의 1~2번이 그 자리이고, 이
 * 함수 안에는 권한 검사가 없다 — 있으면 「어느 쪽이 관문인가」가 둘로 갈린다.
 *
 * 🔴 **바이트를 메모리에 다 올리지 않는다.** `storage.read()` 가 주는 스트림을 그대로
 * 응답에 싣는다. 크기(Content-Length)와 형식(Content-Type)은 **DB 에 적힌 정본**을 쓴다 —
 * 디스크를 stat 하지 않고, 브라우저가 올릴 때 보낸 값도 쓰지 않는다.
 *
 * 🔴 **`UPLOADS_DIR` 이 없으면 `getAttachmentStorage()` 가 던진다**(try 밖이다 — 조용한
 * 기본값을 두지 않는 까닭이 storage/local-fs-adapter.ts 머리말에 있다). 이 사이트의
 * `.env.local` 에 그 줄이 없으면 엑셀 전용 견적서 받기가 **500** 이 된다 — 그 값은
 * A/S 와 **같은 폴더**를 가리켜야 한다(.env.example 의 「첨부 저장 루트」 절).
 * ============================================================================
 */
async function sendAttachedExcel(
  quote: { id: string; quoteNumber: string; customerNameText: string; isExcelOnly: boolean },
  actorUserId: string
): Promise<Response> {
  const source = decideQuoteDownloadSource(quote, await listLiveQuoteAttachments(quote.id));
  if (source.kind !== "ATTACHED_EXCEL") {
    // 엑셀 전용 장이라 앱 양식(TEMPLATE)으로 떨어질 일은 없다 — 남는 것은 「붙인 엑셀 없음」이다.
    return fail(404, "EXCEL_NOT_ATTACHED", QUOTE_EXCEL_MISSING_MESSAGE);
  }
  const { attachment, extension } = source;

  // 첨부 내려받기와 같은 판정 — 여기까지 온 파일은 주인이 살아 있는 견적서이고 휴지통에
  // 없으므로 막는 것은 검사 상태뿐이다.
  const decision = decideAttachmentDownload({
    repairCaseId: null,
    productModelId: null,
    quoteId: quote.id,
    isDeleted: attachment.isDeleted,
    quoteInTrash: false,
    malwareScanStatus: attachment.malwareScanStatus,
  });
  if (!decision.allowed) {
    return fail(403, "SCAN_BLOCKED", decision.message);
  }

  const storage = getAttachmentStorage();
  let stream: ReadableStream<Uint8Array>;
  try {
    // 루트 밖을 가리키면 여기서 던진다. 존재 여부는 read 가 알려 준다.
    resolveAttachmentAbsolutePath(resolveUploadsRoot(), attachment.storedPath);
    stream = await storage.read(attachment.storedPath);
  } catch (error) {
    if (error instanceof AttachmentPathError) {
      console.error("[quote-xlsx] 붙인 엑셀의 stored_path 가 저장 루트를 벗어난다", {
        quoteId: quote.id,
        attachmentId: attachment.id,
        reason: error.message,
      });
      return fail(500, "STORAGE_FAILED", "파일 경로를 확인할 수 없습니다. 관리자에게 문의해 주세요.");
    }
    console.error("[quote-xlsx] 붙인 엑셀을 읽지 못했다", {
      quoteId: quote.id,
      attachmentId: attachment.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(404, "NOT_FOUND", "저장된 파일을 찾을 수 없습니다. 관리자에게 문의해 주세요.");
  }

  // 감사 — 파일을 돌려주기 전에 남긴다(일반 견적서와 같은 방식 · 같은 자리).
  await recordQuoteExport({ quoteId: quote.id, quoteNumber: quote.quoteNumber, actorUserId });

  // 이름 규칙은 그대로, 확장자만 붙인 파일의 것(xlsx · xls).
  const fileName = buildQuoteFileName({
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerNameText,
    extension,
  });

  return new Response(stream, {
    status: 200,
    headers: {
      // 올릴 때 확장자에서 서버가 고른 정본 MIME 이다(브라우저가 보낸 값이 아니다).
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.fileSize),
      "Content-Disposition": quoteContentDisposition(fileName),
      // 사람이 올린 파일이다 — 형식을 다시 추측하지 않게 한다.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
