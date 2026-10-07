import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { isTrustedOrigin } from "@/lib/auth/request-guards";
import { getSessionUser } from "@/lib/auth/session";
import { quoteContentDisposition } from "@/lib/domain/quote-file-name";
import { QUOTE_ISSUE_RESULT_HEADER, encodeQuoteIssueResult } from "@/lib/domain/quote-issue-result";
import { issueQuoteFile, type QuoteIssueFailureCode } from "@/lib/server/services/quote-issue";
import { getAttachmentStorage } from "@/lib/storage/local-fs-adapter";
import { resolveQuoteArchiveRoot } from "@/lib/storage/quote-archive";
import type { StorageAdapter } from "@/lib/storage/storage-adapter";
import { isValidQuoteId } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **문지기 한 자리뿐**이다 (조각 PO 3c-3, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/[id]/issue/route.ts` — 2026-09-28 실측
 * 152줄). 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른 것은 아래 ① 하나다.
 *
 * ── 🔴 다른 것 ① 문지기 — 다섯 걸음이 두 걸음이다 ────────────────────────
 * 저쪽은 `isTrustedOrigin` → `getAuthSource()`(mock 저장 모드) → `readSession()` →
 * `resolveActingUserForSession()` → `approvalStatus` 확인의 다섯 걸음이다. 이 사이트는
 *   · `isTrustedOrigin(request)` — **그대로 쓴다.** 라우트 핸들러는 Next 가 CSRF 를
 *     막아 주지 않는다(auth/request-guards.ts 머리말). 🔴 **쓰기 통로라 더 그렇다** —
 *     이 통로는 누르면 공유폴더에 파일이 생기고 첨부 칸이 바뀐다.
 *   · `getSessionUser()` — 한 걸음이 나머지 넷을 대신한다. mock 저장 모드가 없고,
 *     매 요청 users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은
 *     세션을 전부 거른다(auth/session.ts — `approval_status = 'APPROVED'` 가 그 조회의
 *     WHERE 에 들어 있다). 그래서 `DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`
 *     두 코드가 이 통로에 없다. 앞선 통로들이 이미 그렇게 옮겨져 있다
 *     (api/quotes/[id]/xlsx/route.ts · api/quotes/[id]/attachments/route.ts ·
 *     api/quotes/parse-excel/route.ts 머리말).
 *
 * ── 🔴 결재는 보지 않는다 (2026-09-18 사용자 결정) ───────────────────────
 * 이 파일은 결재 표를 **한 번도 읽지 않는다.** 결재는 기록이고 발행을 막지 않는다 —
 * `domain/quote-approval-rules.test.ts` 의 ISSUE_PATH_SOURCES 가 이 파일을 글자로
 * 읽어 지킨다. 막아야 할 필요가 생기면 코드를 고치기 전에 먼저 물을 것.
 *
 * ⚠️ 여기 있던 「보기 권한자의 받기는 GET /api/quotes/{id}/xlsx — 목록 줄의 받기 링크가
 * 그 통로다」는 **그때의 기록**이다. 🔴 목록 줄의 받기는 2026-10-07 앞 조각이, 수정 화면과
 * 인쇄 미리보기의 받기는 이 조각이 걷어냈다 — **두 통로 다 부르는 화면이 없다**(아래 머리말).
 * ============================================================================
 */

/**
 * ============================================================================
 * POST /api/quotes/{id}/issue — 발행 통로
 * ============================================================================
 * 견적서 엑셀을 만들어 ① 사내 공유폴더에 저장하고 ② 「수기 견적서 엑셀」 칸에 올리고
 * (칸 교체) ③ 파일 바이트를 돌려준다(2026-09-15 사용자 결정). 엑셀 전용 견적서는 붙인
 * 엑셀을 공유폴더에 복사만 한다. 무엇을 어떻게 하는지는 services/quote-issue.ts 에 있고,
 * 이 파일은 문지기와 응답 모양만 맡는다.
 *
 * 🔴 **지금 이 통로를 부르는 화면이 없다**(2026-10-07). 수정 권한자의 [견적서 받기]
 * 단추를 화면에서 없앴다 — ①공유폴더 · ②엑셀 칸은 [저장]이 하고(server/actions/quotes.ts
 * → archiveQuoteDocumentOnSave), ③받기는 **아예 없앴다**(사용자 결정 — 받는 곳은 공유폴더
 * 하나다). 통로와 서비스(issueQuoteFile)는 **일부러 남겨 두었다** — 정리할지는 사람이
 * 따로 정한다. 지금도 그대로 돌고, 시험이 그 동작을 못 박고 있다. A/S 도 같게 두었다
 * (저쪽 같은 경로 파일의 머리말 — 2026-10-06).
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 요청 출처 → 2) 세션(= 살아 있는 계정 · 승인) → 3) 권한(quotes WRITE)
 *  → 4) id 형식 → 5) 만들기 · 공유폴더 · 첨부 칸 · 감사(EXCEL_EXPORT) → 6) 전송
 *
 * 3번이 견적서 조회보다 앞인 까닭은 GET 과 같다 — 권한이 없는 사람에게는 그 id 의
 * 견적서가 있다는 사실조차 알려 주지 않는다. 실패 응답의 모양 · 코드도 GET 과 같다
 * (`{ error, code }`). 출처 검사(UNTRUSTED_ORIGIN)만 더했다 — 쓰기 통로라서다.
 *
 * ── 왜 GET 이 아니라 POST 인가 ──────────────────────────────────────────
 * 부작용이 있다. 공유폴더에 파일이 생기고 첨부 칸이 바뀐다. GET 이면 링크 한 줄
 * (메일 · 채팅의 주소, img 태그, 미리 불러오기)로 그 일이 일어난다. POST 로 두고 출처를
 * 확인해야 사람이 누른 요청만 그 일을 한다.
 *
 * ── GET 머리말의 「만든 파일은 디스크에 남기지 않는다」와 왜 다른가 ────────
 * 사용자 결정(2026-09-15)이다. 공유폴더는 회사가 수년째 쓰는 기존 서류함이고, 거기에
 * 누가 접근하는지는 이 앱이 아니라 NAS 공유 권한이 정한다 — 앱이 여는 두 번째 통로가
 * 아니라 사람이 원래 쓰던 자리에 사본을 꽂아 주는 것이다. 앱 쪽 사본은 로그인 · 권한 ·
 * 감사 뒤의 첨부 칸에 있다. 그래서 이 일은 수정 권한자(quotes WRITE)만 한다.
 *
 * ── 결과는 응답 헤더 한 줄로 ────────────────────────────────────────────
 * 몸통은 파일이라, 공유폴더 · 첨부 칸이 어떻게 됐는지는 X-Quote-Issue-Result 헤더에 싣는다
 * (domain/quote-issue-result.ts — ASCII 로 접은 JSON). 공유폴더나 첨부가 실패해도 응답은
 * 200 이고 파일이 내려간다 — 결과만 알린다(사용자 결정 4). 헤더 이름은 전역 보안 헤더
 * (next.config.ts)와 겹치지 않는 새 이름이다 — 겹치면 Next 가 조용히 버린다.
 *
 * ── 실패 응답에 경로를 싣지 않는다 ──────────────────────────────────────
 * GET 과 같다. 공유폴더 실패 사유도 경로 없이 만든 짧은 문장이다.
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode =
  | "UNTRUSTED_ORIGIN"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | QuoteIssueFailureCode;

/** 중심 함수의 실패 → 응답 코드. GET 받기 통로와 같은 짝이다. */
const STATUS_BY_ISSUE_FAILURE: Record<QuoteIssueFailureCode, number> = {
  NOT_FOUND: 404,
  EXCEL_NOT_ATTACHED: 404,
  // 🔴 아직 앱 양식이 없는 종류 — **고장이 아니라 안 만든 기능**이라 501 이다.
  // GET 받기 통로가 같은 코드에 같은 응답 코드를 쓴다(그쪽 FailureCode 의 그 항목).
  KIND_NOT_SUPPORTED: 501,
  SCAN_BLOCKED: 403,
  TEMPLATE_UNAVAILABLE: 503,
  RENDER_FAILED: 500,
  STORAGE_FAILED: 500,
};

function fail(status: number, code: FailureCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // ── 1) 요청 출처 — 다른 사이트가 사용자 몰래 부르는 요청을 막는다 ──────────
  if (!isTrustedOrigin(request)) {
    return fail(403, "UNTRUSTED_ORIGIN", "요청 출처를 확인할 수 없습니다.");
  }

  // ── 2) 세션 — 살아 있는 계정을 매 요청 다시 읽는다 ─────────────────────
  // 저쪽의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
  // approvalStatus)이 이 한 줄이다(파일 머리말 ①). 세션에 박힌 값이 아니라 살아 있는
  // 계정을 다시 보므로, 토큰이 발급된 뒤 계정이 정지 · 삭제 · 강등 · 승인 취소됐으면
  // 여기서 걸린다.
  const actingUser = await getSessionUser();
  if (!actingUser) return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");

  // ── 3) 권한 — 견적서를 고칠 수 있는 사람만. 조회보다 앞이다 ─────────────
  if (!(await hasPermission(actingUser, "quotes", "WRITE"))) {
    return fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }

  // ── 4) id 형식 — 틀린 id 로 DB 를 때리지 않는다 ─────────────────────────
  const { id } = await context.params;
  if (!isValidQuoteId(id)) return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");

  // ── 5) 만들기 · 공유폴더 · 첨부 칸 · 감사 ─────────────────────────────
  let storage: StorageAdapter;
  try {
    storage = getAttachmentStorage();
  } catch {
    // 저장 루트 설정이 비었다. 값은 로그에도 싣지 않는다.
    console.error("[quote-issue] 첨부 저장소를 열지 못했다", { quoteId: id });
    return fail(500, "STORAGE_FAILED", "파일 저장소를 확인할 수 없습니다. 관리자에게 문의해 주세요.");
  }

  const outcome = await issueQuoteFile({
    quoteId: id,
    actorUserId: actingUser.id,
    archiveRoot: resolveQuoteArchiveRoot(),
    storage,
  });
  if (!outcome.ok) {
    return fail(STATUS_BY_ISSUE_FAILURE[outcome.code], outcome.code, outcome.message);
  }

  // ── 6) 전송 ──────────────────────────────────────────────────────────
  return new NextResponse(new Uint8Array(outcome.bytes), {
    status: 200,
    headers: {
      "Content-Type": outcome.contentType,
      "Content-Disposition": quoteContentDisposition(outcome.fileName),
      "Content-Length": String(outcome.bytes.byteLength),
      // 직인이 찍힌 문서다. 중간 캐시에 남지 않게 한다.
      "Cache-Control": "no-store, must-revalidate",
      [QUOTE_ISSUE_RESULT_HEADER]: encodeQuoteIssueResult(outcome.result),
    },
  });
}
