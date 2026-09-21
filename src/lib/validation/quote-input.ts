/**
 * ============================================================================
 * 견적서 입력 검증 — 🔴 지금 여기 있는 것은 **목록·휴지통이 쓰는 것뿐**이다
 * ============================================================================
 * domestic-order-input.ts 와 같은 자리, 같은 규칙이다. **DB도 세션도 여기서
 * 만지지 않는다** — 순수 함수만 두어야 단위 시험이 붙고, 그래야 "어떤 값을
 * 받아들이는가"가 실제로 검증된다. 존재 여부(그 견적서가 있는가)와 동시 수정
 * (version), 번호 중복은 자료의 문제라 mutation 이, 누가 고칠 수 있는가는
 * 정책이라 서버 액션이 맡는다.
 *
 * ── 🔴 A/S 의 같은 이름 파일은 783줄이다. 여기는 그 일부다 ─────────────
 * 저쪽 파일의 대부분(`validateQuoteFields` · 부품 줄 · 작업 내역 · 수리 작업 ·
 * 금액 정규화 — 약 700줄)은 **편집 폼이 저장할 때** 쓰는 것이고, 편집 폼은
 * 조각 3b 에서 온다(설계서 G절). 지금 통째로 베껴 오면 아무도 부르지 않는 검증이
 * 700줄 남고, 조각 3b 가 올 때 그 죽은 코드와 새로 옮겨 온 코드 중 어느 것이
 * 참인지 답할 수 없게 된다 — 조각 2 가 queries/quotes.ts 에서 겪은 그 자리다.
 *
 * 목록·휴지통이 실제로 쓰는 것은 셋이다:
 *   · `isValidQuoteId` · `isValidExpectedVersion` — 휴지통 서버 액션의 입력 검증
 *   · 견적서 종류 이름표 — 목록 화면의 종류 딱지
 *
 * 🔴 **조각 3b 가 오면 저쪽 700줄이 이 파일에 더해진다.** 그때 이 셋을 두 벌로
 * 만들지 않게, 파일 이름과 함수 이름을 A/S 와 똑같이 두었다.
 *
 * ── 종류는 서브모듈이 갖는다 — 여기서 다시 적지 않는다 ──────────────────
 * `STORED_QUOTE_KINDS` · `quoteKindLabels` 는 목록 화면(한 벌 — vendor/dss-core)이
 * 쓰는 값이라 **그 화면 곁에 있다.** 여기서는 그것을 그대로 재수출한다 — 이 사이트
 * 안에서 정의가 두 벌이 되지 않게. 아래 시험이 그 값이 `quotes.kind` 이넘과
 * 어긋나지 않는지 본다(quote-kind.test.ts).
 * ============================================================================
 */

export {
  STORED_QUOTE_KINDS,
  quoteKindLabels,
  type StoredQuoteKind,
} from "@dss/core/ui/quotes/quote-list-rows";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidQuoteId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** 낙관적 잠금 토큰. version 은 1부터 시작하는 정수라 0 이하는 존재할 수 없다. */
export function isValidExpectedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
