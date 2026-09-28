import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import {
  QUOTE_FOLDER_HELPER_INSTALLER_FILE_NAME,
  buildQuoteFolderHelperInstaller,
  resolveQuoteFolderHelperRoot,
} from "@/lib/server/quote-folder-helper";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **문지기 한 자리뿐**이다 (조각 PO 3g, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quote-folder-helper/installer/route.ts` —
 * 2026-09-28 실측 95줄). 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른
 * 것은 하나다 — 저쪽의 네 걸음(`getAuthSource` · `readSession` ·
 * `resolveActingUserForSession` · `approvalStatus`)이 이 사이트에서는
 * `getSessionUser()` **한 걸음**이다. mock 저장 모드가 없고, 그 한 걸음이 매 요청
 * users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은 세션을
 * 전부 거른다(auth/session.ts). 그래서 `DATABASE_MODE_REQUIRED` ·
 * `ACCOUNT_NOT_APPROVED` 두 코드가 이 통로에 없다. 나머지 넷
 * (`FORBIDDEN` · `HELPER_ROOT_NOT_CONFIGURED` · `HELPER_ROOT_INVALID` · 409 문장)은
 * 저쪽과 글자까지 같다 — 곁 통로(install-command)와 갈라지지 않게 그 시험이 둘을
 * 맞대어 본다.
 *
 * 🔴 **이 통로는 아무것도 설치하지 않는다.** 설치 파일의 **본문을 만들어 내려줄
 * 뿐**이고, 실제 설치는 사람이 내려받은 파일을 제 PC 에서 한 번 실행할 때 일어난다.
 * 서버에서 도는 것은 문자열 만들기뿐이고, 곁 시험이 이 파일에 프로세스 실행 · 파일
 * 쓰기 · 레지스트리 · DB 가 **하나도 없음**을 글자로 못 박는다.
 * ============================================================================
 */

/**
 * ============================================================================
 * GET /api/quote-folder-helper/installer — 「견적서 폴더 열기」 도우미 설치 파일 (견적서 ④a)
 * ============================================================================
 * PC 마다 한 번, 현재 사용자에게만(HKCU · 관리자 권한 없음) 도우미를 설치하는
 * install-dss-folder-helper.cmd 를 내려준다. 사람이 내려받은 파일을 한 번 더블클릭한다 —
 * 브라우저는 설치를 스스로 하지 못한다. 무엇을 설치하는지 · 왜 그렇게 옮기는지는
 * server/quote-folder-helper.ts 머리말.
 *
 * ── 🔴 본문은 요청마다 만든다 ─────────────────────────────────────────────
 * 설치 파일에는 사람이 탐색기에서 보는 공유폴더 루트(UNC — QUOTE_ARCHIVE_UNC_ROOT)가 들어간다.
 * 파일로 만들어 두면 그 값이 저장소 · 이미지에 남는다. 그래서 부를 때마다 환경변수로 만든다.
 * 값은 로그 · 오류 응답에 싣지 않는다(설정이 비었거나 틀렸다는 사실만 알린다).
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 세션(= 살아 있는 계정 · 승인) → 2) 권한(quotes READ)
 *  → 3) UNC 루트(비었거나 틀리면 409) → 4) 설치 파일(첨부)
 *
 * 권한이 READ 인 까닭: 도우미는 견적서 폴더를 **여는** 도구이고, 견적서를 볼 수 있는 사람이
 * [폴더 열기]를 누른다. 아무것도 바꾸지 않으므로 감사를 남기지 않는다.
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

  // ── 3) UNC 루트 — 값은 설치 파일 본문에만 들어간다 ─────────────────────
  const helperRoot = resolveQuoteFolderHelperRoot();
  if (helperRoot.status === "unset") {
    return fail(409, "HELPER_ROOT_NOT_CONFIGURED", "관리자가 공유폴더 주소를 설정해야 합니다.");
  }
  if (helperRoot.status === "invalid") {
    return fail(409, "HELPER_ROOT_INVALID", "공유폴더 주소 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.");
  }

  // ── 4) 설치 파일 — ASCII 본문, 첨부로 ──────────────────────────────────
  const body = new TextEncoder().encode(buildQuoteFolderHelperInstaller({ uncRoot: helperRoot.root, uncRootAlt: helperRoot.alt }));
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${QUOTE_FOLDER_HELPER_INSTALLER_FILE_NAME}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
