/**
 * ============================================================================
 * 🔴 여기 있는 것은 **날짜 형식 검사 하나**뿐이다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(238줄)은 접수 건 mock 모드의 검증 묶음이다 —
 * 상태·우선순위·워크플로 코드와 `mock-data.ts` 의 가짜 고객사·사용자까지 끌고
 * 온다. 이 사이트에는 mock 모드가 없고(사람은 언제나 통합로그인을 거쳐 오고
 * users 표에서 읽힌다) 접수 건 화면도 없다.
 *
 * 내자 정리가 저 파일에서 실제로 쓰는 것은 `isValidDateString` 하나다
 * (validation/domestic-order-input.ts 의 납품일·납기요청일 검사).
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 옮겨 온
 * `validation/domestic-order-input.ts` 452줄의 import 줄을 한 글자도 고치지 않아도
 * 되고, 조각 4 에서 저쪽을 걷어낼 때 두 벌을 글자로 대조할 수 있다.
 *
 * 🔴 아래 함수를 A/S 와 다르게 고치지 마라 — 같은 dss_as 에 값을 쓰는 두 벌의
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
