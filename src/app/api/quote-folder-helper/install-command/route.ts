import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import {
  buildQuoteFolderHelperInlineInstallCommand,
  resolveQuoteFolderHelperRoot,
} from "@/lib/server/quote-folder-helper";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **문지기 한 자리뿐**이다 (조각 PO 3g, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quote-folder-helper/install-command/route.ts` —
 * 2026-09-28 실측 90줄). 다른 것은 곁 통로(installer)와 **똑같이 하나**다 — 저쪽의
 * 네 걸음이 `getSessionUser()` 한 걸음이고, 그래서 `DATABASE_MODE_REQUIRED` ·
 * `ACCOUNT_NOT_APPROVED` 두 코드가 없다(그 파일 머리말).
 *
 * 🔴 **두 통로의 문지기는 글자까지 같아야 한다** — 한쪽만 옮기다 갈라지면 파일로는
 * 막히는 사람이 명령으로는 통과하는(또는 그 반대의) 구멍이 생긴다. 이 파일의 곁
 * 시험(route-source.test.ts)이 두 통로의 `fail(...)` 호출을 **맞대어** 본다.
 *
 * 🔴 **이 통로도 아무것도 설치하지 않는다** — 사람이 PowerShell 창에 붙여넣을
 * **글자 한 줄을 만들어 줄 뿐**이다. 서버에서 실행되는 것은 없다.
 * ============================================================================
 */

/**
 * ============================================================================
 * GET /api/quote-folder-helper/install-command — 파일 없이 도는 도우미 설치 명령 (견적서 ④c)
 * ============================================================================
 * 사람이 PowerShell 창에 **붙여넣기만** 하면 도우미가 설치되는 한 줄을 내려준다. 내려받은 설치
 * 파일(.cmd)이 Windows 스마트 앱 컨트롤에 막히는 PC 를 위한 두 번째 길이다 — 왜 파일이 막히는지,
 * 왜 설치 절차가 한 벌인지는 server/quote-folder-helper.ts 의 「파일 없이 도는 설치 명령」 절.
 * 설치 파일 통로(installer)는 그대로 살아 있다(차단 해제로 쓰는 사람이 있다).
 *
 * ── 🔴 본문은 요청마다 만든다 ─────────────────────────────────────────────
 * 명령 안에는 사람이 탐색기에서 보는 공유폴더 루트(UNC — QUOTE_ARCHIVE_UNC_ROOT)가 base64 로
 * 싸여 들어간다. 파일로 만들어 두면 그 값이 저장소 · 이미지에 남는다. 그래서 부를 때마다
 * 환경변수로 만든다. 값은 로그 · 오류 응답에 싣지 않는다(설정이 비었거나 틀렸다는 사실만).
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 세션(= 살아 있는 계정 · 승인) → 2) 권한(quotes READ)
 *  → 3) UNC 루트(비었거나 틀리면 409) → 4) 명령 한 줄(JSON)
 *
 * 권한이 READ 인 까닭은 installer 라우트와 같다 — 도우미는 견적서 폴더를 **여는** 도구이고,
 * 견적서를 볼 수 있는 사람이 [폴더 열기]를 누른다. 아무것도 바꾸지 않으므로 감사를 남기지 않는다.
 *
 * ── 응답 ────────────────────────────────────────────────────────────────
 *  · 200 `{ command }` — 붙여넣는 한 줄. `Cache-Control: no-store`
 *  · 실패 `{ error, code }` — 401 · 403 · 409
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode = "UNAUTHENTICATED" | "FORBIDDEN" | "HELPER_ROOT_NOT_CONFIGURED" | "HELPER_ROOT_INVALID";

function fail(status: number, code: FailureCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(): Promise<NextResponse> {
  // ── 1) 세션 — 살아 있는 계정을 매 요청 다시 읽는다(파일 머리말) ─────────
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  // ── 2) 권한 ──────────────────────────────────────────────────────────
  if (!(await hasPermission(actingUser, "quotes", "READ"))) {
    return fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }

  // ── 3) UNC 루트 — 값은 설치 명령 본문에만 들어간다 ─────────────────────
  const helperRoot = resolveQuoteFolderHelperRoot();
  if (helperRoot.status === "unset") {
    return fail(409, "HELPER_ROOT_NOT_CONFIGURED", "관리자가 공유폴더 주소를 설정해야 합니다.");
  }
  if (helperRoot.status === "invalid") {
    return fail(409, "HELPER_ROOT_INVALID", "공유폴더 주소 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.");
  }

  // ── 4) 명령 한 줄 — 사람이 복사해 붙여넣는다 ───────────────────────────
  const command = buildQuoteFolderHelperInlineInstallCommand({ uncRoot: helperRoot.root, uncRootAlt: helperRoot.alt });
  return NextResponse.json({ command }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
