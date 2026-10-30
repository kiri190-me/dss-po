/**
 * ============================================================================
 * 🔴 여기 있는 것은 **날짜 검사 둘**뿐이다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(238줄)은 접수 건 mock 모드의 검증 묶음이다 —
 * 상태·우선순위·워크플로 코드와 `mock-data.ts` 의 가짜 고객사·사용자까지 끌고
 * 온다. 이 사이트에는 mock 모드가 없고(사람은 언제나 통합로그인을 거쳐 오고
 * users 표에서 읽힌다) 접수 건 화면도 없다.
 *
 * 이 사이트가 저 파일에서 실제로 쓰는 것은 둘이다:
 *
 *   `isValidDateString`  — validation/domestic-order-input.ts 의 납품일·납기요청일 검사
 *   `isNotEarlierThan`   — 🔴 2026-10-30 **묶기**가 더했다. 내자 정리에서 고친
 *                          납기요청일을 수리 건의 고객 요청 납기일에 밀어 넣을 때,
 *                          **인수일보다 이른지**를 재는 잣대다
 *                          (domain/requested-due-date-link.ts 의 묶기 묶음).
 *
 * 🔴 그 잣대를 **베껴 적지 않고 저쪽이 부르는 함수를 그대로 떼어 온** 까닭: 수리 건
 * 저장(A/S 의 mutations/repair-cases.ts)이 날짜 넷에 거는 검증이 바로 이 함수이고,
 * 이 사이트가 그 칸에 값을 쓰기 시작했기 때문이다. 두 벌이 갈리면 **한쪽에서만
 * 받아 주는 날짜**가 생긴다 — 사람이 수리 건 상세에서는 적을 수 없는 날짜가 내자를
 * 거쳐 들어간다.
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 옮겨 온
 * `validation/domestic-order-input.ts` 452줄의 import 줄을 한 글자도 고치지 않아도
 * 되고, 조각 4 에서 저쪽을 걷어낼 때 두 벌을 글자로 대조할 수 있다. 같은 까닭으로
 * 함수 이름도 저쪽 그대로다 — `requested-due-date-link.ts` 가 저쪽과 **바이트 동일**
 * 이려면 그 파일의 import 줄도 저쪽과 같아야 한다.
 *
 * 🔴 아래 두 함수를 A/S 와 다르게 고치지 마라 — 같은 dss_as 에 값을 쓰는 두 벌의
 * 검증이 갈리면, 한쪽에서만 받아 주는 날짜가 생긴다.
 * ============================================================================
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" 형식이면서 실제 존재하는 달력 날짜인지까지 확인한다. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** a가 b보다 이전 날짜가 아니면(같거나 이후) true. 둘 다 유효한 날짜 문자열이어야 한다. */
export function isNotEarlierThan(a: string, b: string): boolean {
  return a >= b;
}
