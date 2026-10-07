import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/auth/permission-resolver";
import { getSessionUser } from "@/lib/auth/session";
import { listQuotes } from "@/lib/db/queries/quotes";
import { suggestNextQuoteNumber } from "@/lib/storage/quote-number-suggestion";
import { resolveQuoteArchiveRoot } from "@/lib/storage/quote-archive";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **문지기 한 자리뿐**이다 (2026-10-07)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/api/quotes/next-number/route.ts` — 2026-10-07 실측
 * 162줄). 검사의 **순서와 내용은 한 걸음도 줄이지 않았고**, 다른 것은 아래 ① 하나다.
 *
 * ── 🔴 다른 것 ① 문지기 — 네 걸음이 한 걸음이다 ──────────────────────────
 * 저쪽은 `getAuthSource()`(mock 저장 모드) → `readSession()` →
 * `resolveActingUserForSession()` → `approvalStatus` 확인의 네 걸음이다.
 * 🔴 **이 사이트에는 `auth/acting-user.ts` 도 `config/auth-source.ts` 도 아예 없다.**
 * 이 사이트는
 *   · `getSessionUser()` — 한 걸음이 그 넷을 대신한다. mock 저장 모드가 없고, 매
 *     요청 users 한 행을 다시 읽어 정지 · 삭제 · 잠김 · **승인 대기** · 포털이 끊은
 *     세션을 전부 거른다(auth/session.ts — `approval_status = 'APPROVED'` 가 그 조회의
 *     WHERE 에 들어 있다). 그래서 `DATABASE_MODE_REQUIRED` · `ACCOUNT_NOT_APPROVED`
 *     두 코드가 이 통로에 없다.
 *   · 🔴 **이웃 통로(`[id]/archive-folder/entries/route.ts` — 그 견적서 폴더 안에
 *     무엇이 있는가)와 글자 그대로 같은 문지기**다. 저쪽에서도 이 통로가 그 이웃을
 *     글자 그대로 본떴고, 이쪽에서도 같다. 그 사실을
 *     api/quotes/next-number/route-source.test.ts 가 두 원본을 **글자로 견주어**
 *     못 박는다.
 * 🔴 **문턱(권한)은 저쪽과 같은 글자다** — 아래 머리말의 `quotes` WRITE. 걸음 수만
 * 줄었고 새 권한 영역을 만들지도, 넓히지도 않았다.
 * ============================================================================
 */

/**
 * ============================================================================
 * GET /api/quotes/next-number — 다음 견적서 번호 **제안**
 * ============================================================================
 * [새 견적서] 를 눌렀을 때 번호 칸에 **미리 적어 둘 값**을 알려 준다. 문지기는 이웃 통로
 * (api/quotes/[id]/archive-folder/entries — 그 견적서 폴더 안에 무엇이 있는가)를 **글자
 * 그대로** 본떴다. 다른 것은 권한 한 낱말과 그 뒤다.
 *
 * ── 🔴 제안이지 채번이 아니다 ──────────────────────────────────────────────
 * 견적서 번호는 **사람이 손으로 적는 자유 텍스트**다(승인된 결정 —
 * vendor/dss-core/src/schema/quotes.ts 의 quoteNumber 주석). 이 통로가 내는 값은 폼의
 * **초기값**으로만 쓴다 — 칸을 읽기 전용으로 만들거나, 저장할 때 이 값으로 덮어쓰거나,
 * 사람이 적은 번호를 이 값과 견주어 거절하면 그 결정이 코드로 뒤집힌다. 규칙과 까닭은
 * storage/quote-number-suggestion.ts 머리말에 있다.
 *
 * ── 🔴 권한은 `quotes` WRITE 다 — 새 영역을 만들지도 넓히지도 않았다 ────────
 * 이 값을 쓸 사람은 **견적서를 만들 수 있는 사람**뿐이다. 목록 화면과 새 견적서 화면이
 * [새 견적서] 를 보여 줄 때 쓰는 그 열쇠 그대로다(`app/(app)/quotes/page.tsx` ·
 * `app/(app)/quotes/new/page.tsx` 의 `hasPermission(user, "quotes", "WRITE")`).
 * 🔴 이웃 통로가 READ 인 것과 다른 까닭은 **나가는 것이 다르기** 때문이다 — 저쪽은 이미 있는
 * 견적서의 자료이고, 여기는 **다음에 쓸 번호**라 만들 수 없는 사람에게는 쓸 데가 없다.
 *
 * ── 왜 견적서 id 가 없는 통로인가 ─────────────────────────────────────────
 * 아직 만들어지지 않은 장의 번호다 — 부를 때 id 가 없다. 그래서 api/quotes/[id]/… 아래가
 * 아니라 여기다(정적 이름이라 [id] 와 부딪히지 않는다 — 이웃 parse-excel 과 같은 자리다).
 *
 * ── 🔴 아무것도 만들지 않는다 ──────────────────────────────────────────────
 * 폴더도 파일도 만들지 않고, DB 에 한 줄도 쓰지 않는다(번호를 **잡아 두지** 않는다 — 잡아
 * 두는 순간 그것이 채번이다). 쓰기 메서드(POST · PUT)도 없고 감사도 남기지 않는다 —
 * 기록할 변경이 없다. 그 사실을 route-source.test.ts 가 원본을 글자로 읽어 못 박는다.
 *
 * ── 🔴 절대 경로를 싣지 않는다 ─────────────────────────────────────────────
 * 응답 타입에 컨테이너 안 경로(루트)를 담는 칸이 아예 없다. 나가는 것은 제안 번호와 **근거
 * 숫자 넷**(훑은 폴더 수 · 번호를 읽은 폴더 수 · 공유폴더에서 본 가장 큰 번호 · 이미 쓰인
 * 번호에서 본 가장 큰 번호)뿐이고, 폴더 이름조차 나가지 않는다. 실패 사유도 경로 없는 짧은
 * 문장이다.
 *
 * ── 🔴 DB 의 번호도 함께 본다 ──────────────────────────────────────────────
 * 공유폴더에만 있고 DB 에 없는 번호도, 그 반대도 있을 수 있다. 저장을 **거절하는** 쪽은
 * DB 의 부분 unique 인덱스(`quotes_quote_number_not_deleted_unique`)이므로, 폴더만 보면
 * DB 에만 있는 더 큰 번호와 부딪혀 사람이 폼을 다 채운 뒤에 거절당한다. 그래서 **이미 있는
 * 읽기 전용 목록 조회**(listQuotes — `is_deleted = false`, 그 인덱스의 조건과 **같은
 * 조건**이다)로 지금 살아 있는 번호를 읽어 함께 넘기고, 모듈이 **더 큰 쪽 다음**을 고른다.
 *
 * ── 🔴 이 사이트와 A/S 가 같은 번호를 제안할 수 있다 ───────────────────────
 * 두 사이트가 **같은 공유폴더와 같은 DB(dss_as)** 를 본다. 두 사람이 거의 같은 순간에
 * [새 견적서] 를 열면 같은 번호를 제안받는다. 🔴 그래도 번호를 **잡아 두지 않는다**
 * (예약 · 채번 표를 만들지 않는다) — 그 순간 이것이 채번기가 된다. 먼저 저장하는 쪽만
 * 들어가고 뒤에 저장하는 쪽은 위의 **부분 unique 인덱스**에 막히며, 그 뒤 사람이 번호를
 * 고쳐 적는다. 그것이 마지막 방어선이다(storage/quote-number-suggestion.ts 머리말과
 * **같은 말**이다 — 두 자리가 다른 말을 하지 않게).
 *
 * ── 순서 ────────────────────────────────────────────────────────────────
 *  1) 세션(= 살아 있는 계정 · 승인) → 2) 권한(quotes WRITE)
 *  → 3) 공유폴더 루트(꺼져 있으면 disabled) → 4) 이미 쓰인 번호 → 5) 제안 → 6) JSON
 *
 * 연도는 받지 않는다 — **한국 표준시 올해**를 모듈이 정한다(폼의 발행일자 기본값과 같은 자다).
 * 받지 않는 칸은 검사할 일도 없다.
 *
 * ── 응답 ────────────────────────────────────────────────────────────────
 *  · 200 `{ status: "ready", quoteNumber, year, sequence, folderCount, numberedFolderCount,
 *    highestFolderSequence, highestKnownSequence }`
 *  · 200 `{ status: "disabled" }` · `{ status: "failed", reason }`
 *  · 실패 `{ error, code }` — 401 · 403. 모두 `Cache-Control: no-store`(JSON 성공 응답).
 * ============================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureCode = "UNAUTHENTICATED" | "FORBIDDEN";

/** 응답 본문. 🔴 컨테이너 안 경로 · 폴더 이름을 담는 칸이 없다. */
type NextQuoteNumberResponse =
  | {
      status: "ready";
      /** 🔴 **제안**이다 — 폼은 이것을 초기값으로만 쓰고, 사람이 고칠 수 있어야 한다. */
      quoteNumber: string;
      year: number;
      /** 번호의 일련번호. 🔴 장비의 S/N 과 아무 관계가 없다. */
      sequence: number;
      /** 근거 — 그 해 연도 폴더에서 훑은 폴더 수. */
      folderCount: number;
      /** 근거 — 그 가운데 번호를 읽은 폴더 수. */
      numberedFolderCount: number;
      /** 근거 — 공유폴더에서 본 가장 큰 일련번호(없으면 null). */
      highestFolderSequence: number | null;
      /** 근거 — 이미 쓰인 번호에서 본 가장 큰 일련번호(없으면 null). */
      highestKnownSequence: number | null;
    }
  | { status: "disabled" }
  | { status: "failed"; reason: string };

function fail(status: number, code: FailureCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

function respond(body: NextQuoteNumberResponse): NextResponse {
  return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(): Promise<NextResponse> {
  // ── 1) 세션 — 살아 있는 계정을 매 요청 다시 읽는다 ─────────────────────
  // 저쪽의 네 걸음(getAuthSource · readSession · resolveActingUserForSession ·
  // approvalStatus)이 이 한 줄이다(파일 머리말 ①). 세션에 박힌 값이 아니라 살아 있는
  // 계정을 다시 보므로, 토큰이 발급된 뒤 계정이 정지 · 삭제 · 강등 · 승인 취소됐으면
  // 여기서 걸린다.
  const actingUser = await getSessionUser();
  if (!actingUser) {
    return fail(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  // ── 2) 권한 — 조회보다 앞이다. 🔴 [새 견적서] 와 **같은 글자**다 ─────────
  if (!(await hasPermission(actingUser, "quotes", "WRITE"))) {
    return fail(403, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }

  // ── 3) 공유폴더 루트 — 이 값은 읽기에만 쓰고 응답에 싣지 않는다 ──────────
  const archiveRoot = resolveQuoteArchiveRoot();
  if (archiveRoot === null) {
    return respond({ status: "disabled" });
  }

  // ── 4) 이미 쓰인 번호 — 저장을 거절하는 쪽은 DB 다(머리말) ───────────────
  const quotes = await listQuotes();

  // ── 5) 제안 — 🔴 공유폴더와 DB 가운데 **더 큰 쪽 다음**을 고른다 ──────────
  const suggested = await suggestNextQuoteNumber({
    root: archiveRoot,
    knownQuoteNumbers: quotes.map((quote) => quote.quoteNumber),
  });

  // ── 6) JSON — 제안 번호와 근거 숫자, 짧은 사유만 ────────────────────────
  if (suggested.status === "ready") {
    return respond({
      status: "ready",
      quoteNumber: suggested.quoteNumber,
      year: suggested.year,
      sequence: suggested.sequence,
      folderCount: suggested.folderCount,
      numberedFolderCount: suggested.numberedFolderCount,
      highestFolderSequence: suggested.highestFolderSequence,
      highestKnownSequence: suggested.highestKnownSequence,
    });
  }
  if (suggested.status === "disabled") {
    // 루트를 먼저 보았으므로 여기에 닿지 않지만, 상태가 하나 늘면 컴파일러가 짚게 둔다.
    return respond({ status: "disabled" });
  }
  return respond({ status: "failed", reason: suggested.reason });
}
