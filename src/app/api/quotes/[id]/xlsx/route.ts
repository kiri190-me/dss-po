import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { recordQuoteExport } from "@/lib/db/mutations/quote-exports";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "@/lib/domain/quote-document-support";
import { QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE } from "@/lib/domain/quote-excel-only-download";
import { buildQuoteFileName, quoteContentDisposition } from "@/lib/domain/quote-file-name";
import { renderQuoteWorkbook } from "@/lib/server/services/quote-workbook";
import { QuoteTemplateError } from "@/lib/storage/quote-template";
import { isValidQuoteId } from "@/lib/validation/quote-input";

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
 *  → 5) 앱 양식이 있는 종류인가 → 6) 엑셀 전용인가 → 7) 양식 읽기 · 채우기
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
 * ── 🔴 엑셀 전용 견적서는 거절한다 — A/S 와 **동작이 다르다** ────────────
 * 저쪽은 그 장에서 갈라져 **첨부 칸에 붙어 있는 엑셀을 그대로** 흘려보낸다. 이
 * 사이트에는 파일을 붙이는 칸이 아예 없어(조각 3d) 돌려줄 파일이 존재하지 않으므로,
 * 여기서는 501 과 사람이 읽는 문장으로 멈춘다. 까닭과 문장은
 * domain/quote-excel-only-download.ts 한 곳에 있고 **목록의 곁말이 같은 문장을
 * 쓴다.** 🔴 앱 양식으로 대신 채우지 않는다 — 그 장에는 품목이 없어 빈 견적서가
 * 나간다(저쪽도 같은 판단이다).
 *
 * 🔴 그것은 `canRenderQuoteDocument`(5번)와 **별개의 조건**이다. 그 판정은
 * 「앱 양식이 있는 종류인가」를 묻고 엑셀 전용이면 언제나 참을 돌려준다 — 그 함수를
 * 고치지 않는 까닭이 그 파일과 위 상수 파일 머리말에 있다.
 *
 * ── 실패 응답에 경로를 싣지 않는다 ──────────────────────────────────────
 * 양식을 못 읽었을 때 그 경로를 응답에 담으면 오류 메시지가 디스크 구조를 알려 주는
 * 창구가 된다. 경로는 서버 로그에만 남는다(storage/quote-template.ts).
 * 값 자체도 로그에 담지 않는다 — 품명 · 신고증상에 고객사 사정이 섞인다.
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
  /** 엑셀 전용 견적서 — 이 사이트에는 붙여 둘 칸이 없다(위 머리말 · 조각 3d). */
  | "EXCEL_ONLY_NOT_SUPPORTED"
  | "TEMPLATE_UNAVAILABLE"
  | "RENDER_FAILED";

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
   * ── 6) 🔴 엑셀 전용 견적서 — 이 사이트에는 내줄 파일이 없다 ──────────
   * 위 5번과 **별개의 조건**이다(그 판정은 엑셀 전용이면 언제나 참이다). 까닭과
   * 문장은 domain/quote-excel-only-download.ts 에 있고 목록의 곁말이 같은 문장을
   * 쓴다. 조각 3d 가 첨부 칸을 가져오면 이 갈래가 A/S 의 「붙인 엑셀 그대로」로
   * 바뀐다.
   */
  if (quote.isExcelOnly) {
    return fail(501, "EXCEL_ONLY_NOT_SUPPORTED", QUOTE_EXCEL_ONLY_DOWNLOAD_MESSAGE);
  }

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
