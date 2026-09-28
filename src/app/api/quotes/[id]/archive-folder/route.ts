import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { isQuoteFolderRelativePath } from "@/lib/domain/quote-folder-link";
import { resolveQuoteFolderHelperUncPath } from "@/lib/server/quote-folder-helper";
import { findQuoteArchiveFolder, resolveQuoteArchiveRoot } from "@/lib/storage/quote-archive";
import { isValidQuoteId } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **문지기 한 자리뿐**이다 (조각 PO 3g, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/[id]/archive-folder/route.ts` —
 * 2026-09-28 실측 153줄). 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른
 * 것은 아래 ① 하나다.
 *
 * ── 🔴 다른 것 ① 문지기 — 다섯 걸음이 한 걸음이다 ────────────────────────
 * 저쪽은 `getAuthSource()`(mock 저장 모드) → `readSession()` →
 * `resolveActingUserForSession()` → `approvalStatus` 확인의 네 걸음이다. 이 사이트는
 *   · `getSessionUser()` — 한 걸음이 그 넷을 대신한다. mock 저장 모드가 없고, 매
 *     요청 users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은
 *     세션을 전부 거른다(auth/session.ts — `approval_status = 'APPROVED'` 가 그 조회의
 *     WHERE 에 들어 있다). 그래서 `DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`
 *     두 코드가 이 통로에 없다. 앞선 통로들이 이미 그렇게 옮겨져 있다
 *     (api/quotes/[id]/xlsx/route.ts · api/quotes/[id]/issue/route.ts 머리말).
 *   · `isTrustedOrigin` 은 **없다** — 저쪽에도 없다. 이것은 아무것도 바꾸지 않는
 *     읽기 전용 GET 이다(아래 「아무것도 만들지 않는다」). 출처 검사를 두는 것은
 *     쓰기 통로의 몫이다(api/quotes/[id]/issue/route.ts).
 *
 * ── 🔴 결재는 보지 않는다 (2026-09-18 사용자 결정) ───────────────────────
 * 이 파일은 결재 표를 **한 번도 읽지 않는다.** 결재는 기록이고 폴더 열기를 막지
 * 않는다 — `domain/quote-approval-rules.test.ts` 의 ISSUE_PATH_SOURCES 가 이 파일을
 * 글자로 읽어 지킨다. 막아야 할 필요가 생기면 코드를 고치기 전에 먼저 물을 것.
 * ============================================================================
 */

/**
 * ============================================================================
 * GET /api/quotes/{id}/archive-folder — 그 견적서의 공유폴더 폴더가 어디인가 (견적서 ④a)
 * ============================================================================
 * 견적서 화면의 [폴더 열기]가 부른다. 공유폴더(QUOTE_ARCHIVE_DIR)에서 저장과 **같은 찾기
 * 규칙**으로 연도 폴더 › 견적서 폴더를 찾아, 루트 기준 상대 경로만 돌려준다. 화면은 그 경로로
 * `dss-folder://open/?p=…` 주소를 만들고(domain/quote-folder-link.ts), PC 의 도우미가 자기 루트
 * (UNC)에 붙여 탐색기로 연다(server/quote-folder-helper.ts).
 *
 * ── 🔴 컨테이너 안 경로는 싣지 않는다 ─────────────────────────────────────
 * 공유폴더가 서버 안에 마운트된 경로(QUOTE_ARCHIVE_DIR)는 서버 구조를 알려 준다 — 이 통로가
 * 알릴 까닭이 없다. 응답에 나가는 것은 상대 경로와, 사람이 탐색기에 붙여넣을 전체 주소뿐이고,
 * 실패 사유도 경로 없는 짧은 문장이다(storage/quote-archive.ts 머리말).
 *
 * ── 전체 주소(uncPath) ────────────────────────────────────────────────────
 * 도우미 설치가 막힌 PC 를 위한 우회로다 — 사람이 `\\서버\공유\…` 를 탐색기 주소창에 붙여넣으면
 * 도우미 없이도 폴더가 열린다. 사람이 보는 루트(QUOTE_ARCHIVE_UNC_ROOT)에 상대 경로를 이어
 * server/quote-folder-helper.ts 가 만든다. 그 견적서를 볼 수 있는 사람에게 그 폴더의 주소만 간다.
 * 🔴 설정이 비었거나 틀리면 **이 칸만 빠진다** — 폴더 열기(상대 경로 · 도우미 주소)는 그대로 돈다.
 *
 * ── 🔴 아무것도 만들지 않는다 ──────────────────────────────────────────────
 * 폴더가 없으면 `not-found` 로 끝난다(폴더는 [견적서 받기] · 결재 PDF 저장이 만든다). mkdir ·
 * 파일 쓰기 · DB 쓰기가 없고, 감사도 남기지 않는다 — 기록할 변경이 없다.
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 세션(= 살아 있는 계정 · 승인) → 2) 권한(quotes READ) → 3) id 형식
 *  → 4) 견적서(휴지통이면 없는 것) → 5) 공유폴더 루트(꺼져 있으면 disabled) → 6) 찾기 → 7) JSON
 *
 * 권한이 READ 인 까닭: 그 견적서를 볼 수 있는 사람이면 그 서류가 꽂힌 자리도 볼 수 있다. 권한이
 * 조회보다 앞이다 — 권한이 없는 사람에게는 그 id 의 견적서가 있다는 사실도 알려 주지 않는다.
 *
 * ── 응답 ────────────────────────────────────────────────────────────────
 *  · 200 `{ status: "found", relativePath, multipleFolderMatches, uncPath? }` — 경로는 `연도 폴더/견적서
 *    폴더`, 디스크의 실제 이름. 도우미가 받지 않을 이름(규칙 밖)이면 대신 `failed` 다.
 *  · 200 `{ status: "not-found" }` · `{ status: "disabled" }` · `{ status: "failed", reason }`
 *  · 실패 `{ error, code }` — 401 · 403 · 404. 모두 `Cache-Control: no-store`(JSON 성공 응답).
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

/** 응답 본문. 🔴 컨테이너 안 경로를 담는 칸이 없다. uncPath 는 설정이 있을 때만 붙는다. */
type ArchiveFolderResponse =
  | { status: "found"; relativePath: string; multipleFolderMatches: boolean; uncPath?: string }
  | { status: "not-found" }
  | { status: "disabled" }
  | { status: "failed"; reason: string };

const UNOPENABLE_FOLDER_REASON =
  "견적서 폴더 이름에 탐색기 도우미가 열 수 없는 글자가 있습니다. 공유폴더에서 직접 열어 주세요.";

function fail(status: number, code: FailureCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

function respond(body: ArchiveFolderResponse): NextResponse {
  return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // ── 1) 세션 — 살아 있는 계정을 매 요청 다시 읽는다 ─────────────────────
  // 저쪽의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
  // approvalStatus)이 이 한 줄이다(파일 머리말 ①). 세션에 박힌 값이 아니라 살아 있는
  // 계정을 다시 보므로, 토큰이 발급된 뒤 계정이 정지 · 삭제 · 강등 · 승인 취소됐으면
  // 여기서 걸린다.
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  // ── 2) 권한 — 조회보다 앞이다 ────────────────────────────────────────
  if (!(await hasPermission(actingUser, "quotes", "READ"))) {
    return fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }

  // ── 3~4) 견적서 ──────────────────────────────────────────────────────
  const { id } = await context.params;
  if (!isValidQuoteId(id)) {
    return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");
  }
  // 휴지통의 장은 없는 것이다(getQuoteForEdit 이 is_deleted 로 좁힌다).
  const quote = await getQuoteForEdit(id);
  if (!quote) {
    return fail(404, "NOT_FOUND", "해당 견적서를 찾을 수 없습니다.");
  }

  // ── 5) 공유폴더 루트 — 이 값은 찾기에만 쓰고 응답에 싣지 않는다 ─────────
  const archiveRoot = resolveQuoteArchiveRoot();
  if (archiveRoot === null) {
    return respond({ status: "disabled" });
  }

  // ── 6) 찾기 — 읽기만 한다 ────────────────────────────────────────────
  const result = await findQuoteArchiveFolder({
    root: archiveRoot,
    quoteDate: quote.quoteDate,
    naming: {
      quoteNumber: quote.quoteNumber,
      kind: quote.kind,
      customerName: quote.customerNameText,
      modelName: quote.modelNameText,
      lotNumber: quote.lotNumberText,
      serialNumber: quote.serialNumberText,
    },
  });

  // ── 7) JSON — 상대 경로 · 짧은 사유만 ────────────────────────────────
  if (result.status === "found") {
    // 도우미가 받지 않을 이름이면(사람이 NAS 에서 만든 이름 등) 주소를 만들 수 없다 — 미리 알린다.
    if (!isQuoteFolderRelativePath(result.relativePath)) {
      return respond({ status: "failed", reason: UNOPENABLE_FOLDER_REASON });
    }
    // 탐색기 주소창에 붙여넣을 전체 주소 — 설정이 비었거나 틀리면 null 이고, 그 칸만 빠진다.
    const uncPath = resolveQuoteFolderHelperUncPath(result.relativePath);
    return respond({
      status: "found",
      relativePath: result.relativePath,
      multipleFolderMatches: result.multipleFolderMatches,
      ...(uncPath === null ? {} : { uncPath }),
    });
  }
  if (result.status === "not-found") {
    return respond({ status: "not-found" });
  }
  return respond({ status: "failed", reason: result.reason });
}
