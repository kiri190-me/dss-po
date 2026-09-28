import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { isTrustedOrigin } from "@/lib/auth/request-guards";
import { getSessionUser } from "@/lib/auth/session";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/domain/attachment-allowlist";
import {
  readHandwrittenQuoteWorkbook,
  type HandwrittenQuoteReadFailureCode,
  type HandwrittenQuoteReadResult,
} from "@/lib/xlsx/handwritten-quote-reader";

/**
 * ============================================================================
 * POST /api/quotes/parse-excel — 수기 견적서 엑셀에서 견적서 칸의 값을 읽어 돌려준다 (견적서 ①a)
 * ============================================================================
 * 🔴 조각 3e-1 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/parse-excel/route.ts`)에서 가져왔다. 검사의
 * **순서와 내용은 한 걸음도 줄이지 않았고**, 다른 것은 아래 ① 하나뿐이다.
 *
 * ── 🔴 다른 것 ① 문지기 — 다섯 걸음이 두 걸음이다 ────────────────────────
 * 저쪽은 `isTrustedOrigin` → `getAuthSource()`(mock 저장 모드) → `readSession()` →
 * `resolveActingUserForSession()` → `approvalStatus` 확인의 다섯 걸음이다. 이 사이트는
 *   · `isTrustedOrigin(request)` — **그대로 쓴다.** 라우트 핸들러는 Next 가 CSRF 를
 *     막아 주지 않는다(서버 액션과 다른 점 — auth/request-guards.ts 머리말).
 *   · `getSessionUser()` — 한 걸음이 나머지 넷을 대신한다. mock 저장 모드가 없고,
 *     매 요청 users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은
 *     세션을 전부 거른다(auth/session.ts — `approval_status = 'APPROVED'` 가 그 조회의
 *     WHERE 에 들어 있다). 그래서 `DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`
 *     두 코드가 이 통로에 없다. 앞선 통로들이 이미 그렇게 옮겨져 있다
 *     (api/quotes/[id]/xlsx/route.ts · api/quotes/[id]/attachments/route.ts 머리말).
 *
 * ── 🔴 아직 부르는 화면이 없다 ──────────────────────────────────────────
 * 이 통로를 부르는 것은 A/S 에서 [새 견적서] 팝업과 견적서 편집 폼인데, 그 사슬
 * (`quote-excel-parse.ts` · `quote-excel-autofill.ts` · `NewQuoteDialog.tsx`)은 아직
 * 이 저장소에 없다. 이 조각은 읽개와 이 통로까지만 세운다 — **뒤 조각(팝업)이 잇는다.**
 *
 * 본문은 .xlsx 파일 바이트 그대로다(multipart 를 쓰지 않는 까닭은 첨부 통로들과 같다 —
 * api/quotes/[id]/attachments/route.ts 머리말). 읽는 일은 전부
 * xlsx/handwritten-quote-reader.ts 가 하고, 이 파일은 문지기와 응답 모양만 맡는다.
 *
 * ── 🔴 읽기 전용이다 ────────────────────────────────────────────────────
 * 파일을 **어디에도 두지 않는다** — 첨부 저장소 · 임시 폴더 · 공유폴더 · DB 어느 곳에도
 * 쓰지 않고, 메모리에서 읽고 버린다. **감사를 남기지 않는다** — 사람이 이미 손에 가진
 * 파일을 읽어 폼에 옮겨 줄 뿐이라, 기록할 변경이 없다. 폼이 그 값으로 견적서를 저장하면
 * 그때 저장 통로가 제 감사를 남긴다.
 *
 * ── 왜 견적서 id 가 없는 통로인가 ─────────────────────────────────────────
 * 폼이 파일을 **저장 전에** 들고 있다. 새 견적서는 아직 id 가 없고, 수기 엑셀 칸도 저장할
 * 때 올라간다 — 그 전에 값을 채워 보여 주려면 id 없이 바이트만 받아야 한다. 그래서
 * api/quotes/[id]/… 아래가 아니라 여기다(정적 이름이라 [id] 와 부딪히지 않는다).
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 요청 출처 → 2) 세션(= 살아 있는 계정 · 승인) → 3) 권한(quotes WRITE)
 *  → 4) 본문 바이트(상한 MAX_ATTACHMENT_SIZE_BYTES — 선언 길이로 먼저 자르고, 읽으면서
 *  다시 센다) → 5) 읽개 → 6) JSON
 *
 * 권한이 WRITE 인 까닭: 이 값은 견적서 편집 폼에 채우는 것이고, 폼을 저장할 수 있는
 * 사람만 부를 이유가 있다. 서버에서 믿을 수 없는 파일을 푸는 일이라 문턱을 낮추지 않는다.
 *
 * ── 🔴 파일 종류는 **내용 앞머리로만** 가른다 ────────────────────────────
 * 첨부 올리기 통로(`[id]/attachments/route.ts`)는 확장자와 내용 앞머리 둘 다로 보지만,
 * 이 통로에는 **파일 이름이 아예 없다** — 본문이 바이트 그대로고 `?fileName=` 을 받지
 * 않는다(저장하지 않으니 표시용 이름이 쓰일 자리가 없다). 그래서 판정은 읽개가 내용
 * 앞머리로 한다: 옛 .xls(`D0 CF 11 E0`)면 XLS_LEGACY, zip(`PK`)이 아니면 NOT_XLSX 다.
 * 🔴 브라우저가 보낸 Content-Type 은 보지 않는다 — 저쪽도 그렇다.
 *
 * ── 어느 시트를 읽나 — `?sheet=` ────────────────────────────────────────
 * 한 통합문서에 내자 · OH 두 견적서가 든 파일이 있다. 그래서 200 응답이 **알아본 시트
 * 전부**(`sheets` — 탭 차례 · 이름 · 양식 · 작성된 것으로 보이나)를 함께 내주고, 폼이
 * 사람이 고른 탭 차례를 `?sheet=1` 로 돌려주면 그 시트를 읽는다. 값은 읽개에 그대로
 * 넘긴다 — 숫자가 아니거나 그 자리에 견적서 시트가 없으면 422 SHEET_NOT_FOUND 다.
 * 🔴 여기서 조용히 딴 시트로 바꾸지 않는다.
 *
 * ── 응답 ────────────────────────────────────────────────────────────────
 *  · 200 `{ sheet, sheetIndex, sheetName, sheets, fields, warnings }` — 칸이 비거나 이상해도
 *    200 이다(그 칸만 null, 까닭은 warnings). 모양은 handwritten-quote-reader.ts 의
 *    HandwrittenQuoteFields · HandwrittenQuoteSheetInfo.
 *  · 실패 `{ error, code }` — 415 옛 .xls · xlsx 아님 / 422 알아볼 시트 없음 · 고른 시트
 *    없음 / 413 너무 큼(본문 또는 풀어 본 내용). 실패 응답과 로그에 파일의 값을 싣지 않는다.
 *  · 🔴 어느 응답에도 **내부 경로 · 저장 루트를 싣지 않는다** — 애초에 이 통로는 디스크에
 *    닿지 않는다(위 '읽기 전용').
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode =
  | "UNTRUSTED_ORIGIN"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EMPTY_BODY"
  | "FILE_TOO_LARGE"
  | "BODY_READ_FAILED"
  | "PARSE_FAILED"
  | HandwrittenQuoteReadFailureCode;

/** 읽개의 실패 → 응답 코드. 코드가 하나 늘면 컴파일러가 여기를 채우라고 짚는다. */
const STATUS_BY_READ_FAILURE: Record<HandwrittenQuoteReadFailureCode, number> = {
  XLS_LEGACY: 415,
  NOT_XLSX: 415,
  NO_QUOTE_SHEET: 422,
  CONTENT_TOO_LARGE: 413,
  SHEET_NOT_FOUND: 422,
};

/** `?sheet=1` — 읽을 시트의 탭 차례. 없으면 undefined(읽개가 혼자 고른다). */
const SHEET_QUERY = "sheet";

const FILE_TOO_LARGE_MESSAGE = "파일이 20MB를 넘습니다.";

function fail(status: number, code: FailureCode, message: string): NextResponse {
  // 무엇이 왜 막혔는지 사람이 읽을 수 있게 돌려준다. 저장 루트나 내부 경로는 싣지 않는다.
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1) 요청 출처 — 다른 사이트가 사용자 몰래 파일을 밀어 넣는 요청을 막는다 ──
  if (!isTrustedOrigin(request)) {
    return fail(403, "UNTRUSTED_ORIGIN", "요청 출처를 확인할 수 없습니다.");
  }

  // ── 2) 세션 — 살아 있는 계정을 매 요청 다시 읽는다 ─────────────────────
  // 저쪽의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
  // approvalStatus)이 이 한 줄이다(파일 머리말 ①). 세션에 박힌 값이 아니라 살아 있는
  // 계정을 다시 보므로, 토큰이 발급된 뒤 계정이 정지 · 삭제 · 강등 · 승인 취소됐으면
  // 여기서 걸린다.
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  // ── 3) 권한 — 견적서를 고칠 수 있는 사람만. 본문을 받기 전이다 ─────────────
  if (!(await hasPermission(actingUser, "quotes", "WRITE"))) {
    return fail(403, "FORBIDDEN", "견적서를 고칠 권한이 없습니다.");
  }

  // ── 4) 본문 — 선언 길이로 먼저 자르고, 읽으면서 다시 센다 ────────────────
  // 선언 길이는 믿을 수 없지만(진짜 판정은 아래에서 센 바이트로 한다) 맞을 때는 20MB 를
  // 받아 놓고 버리는 일을 통째로 아낀다.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_SIZE_BYTES) {
    return fail(413, "FILE_TOO_LARGE", FILE_TOO_LARGE_MESSAGE);
  }

  const body = request.body;
  if (!body) {
    return fail(400, "EMPTY_BODY", "읽을 파일이 없습니다.");
  }

  let received: { ok: true; bytes: Buffer } | { ok: false };
  try {
    received = await readBodyWithinLimit(body, MAX_ATTACHMENT_SIZE_BYTES);
  } catch {
    return fail(400, "BODY_READ_FAILED", "파일을 받는 중에 연결이 끊겼습니다. 다시 올려 주세요.");
  }
  if (!received.ok) {
    return fail(413, "FILE_TOO_LARGE", FILE_TOO_LARGE_MESSAGE);
  }
  if (received.bytes.length === 0) {
    return fail(400, "EMPTY_BODY", "빈 파일은 읽을 수 없습니다.");
  }

  // ── 5) 읽개 — 메모리에서만 읽는다(머리말 '읽기 전용') ──────────────────
  // `?sheet=` 를 준 값 그대로 읽개에 넘긴다. 숫자가 아니거나 그 자리에 견적서 시트가
  // 없으면 읽개가 SHEET_NOT_FOUND 로 돌려준다 — 여기서 조용히 딴 시트로 바꾸지 않는다.
  const sheetParam = request.nextUrl.searchParams.get(SHEET_QUERY);
  let result: HandwrittenQuoteReadResult;
  try {
    result = readHandwrittenQuoteWorkbook(received.bytes, {
      sheetIndex: sheetParam === null ? undefined : sheetIndexOf(sheetParam),
    });
  } catch (error) {
    // 읽개는 내용 때문에 던지지 않는다. 여기로 오면 결함이다 — 오류 이름만 남긴다.
    console.error("[quote-parse-excel] 엑셀을 읽다 멈췄다", { error: errorNameOf(error) });
    return fail(500, "PARSE_FAILED", "엑셀을 읽는 중 문제가 발생했습니다.");
  }
  if (!result.ok) {
    return fail(STATUS_BY_READ_FAILURE[result.code], result.code, result.message);
  }

  // ── 6) JSON ─────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      sheet: result.sheet,
      sheetIndex: result.sheetIndex,
      sheetName: result.sheetName,
      sheets: result.sheets,
      fields: result.fields,
      warnings: result.warnings,
    },
    {
      status: 200,
      // 고객 정보가 담긴 응답이다. 중간 캐시에 남지 않게 한다.
      headers: { "Cache-Control": "no-store" },
    }
  );
}

/** 본문을 끝까지 읽되 상한을 넘는 순간 멈춘다. 첨부 상한(20MB)이 있어 메모리에 담아도 된다. */
async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }
  return { ok: true, bytes: Buffer.concat(chunks, total) };
}

/**
 * `?sheet=` 의 값 → 탭 차례. 숫자가 아니거나 비었으면 NaN 을 그대로 넘긴다 — 읽개가
 * SHEET_NOT_FOUND 로 거절한다. 여기서 undefined 로 바꾸면 사람이 고른 것과 상관없는
 * 시트를 조용히 읽게 된다.
 */
function sheetIndexOf(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

/** 로그에 남길 짧은 표지 — 오류 이름만. message 에는 파일의 값이 섞일 수 있다. */
function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
