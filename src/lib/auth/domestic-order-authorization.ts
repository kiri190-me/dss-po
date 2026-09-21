/**
 * 내자 정리(PO) 화면의 역할 정책.
 *
 * 🔴 A/S 관리 시스템의 `lib/auth/domestic-order-authorization.ts` 에서 **지금 쓰이는
 * 함수만** 가져왔다. 글자를 바꾸지 않는다 — 같은 `role_permissions` 표를 읽는 두
 * 사이트가 같은 사람에게 다른 대답을 하면 안 된다.
 *
 * 🔴 조각 2 에서 셋이 되었다. 조각 1 때는 `canViewDomesticOrders` 하나였다 —
 * 작업 비용의 기본값을 셈하느라 불려 왔을 뿐, 내자 화면이 여기 없었기 때문이다.
 * 이제 화면이 왔으므로 A/S 의 **나머지 둘도 글자 그대로** 가져왔다.
 *
 * ── 이 함수가 하는 일은 「기본값」뿐이다 ────────────────────────────────
 * 최종 판정은 관리자가 저장한 수준(role_permissions)이다. 이 함수는 **아무도
 * 설정을 만지지 않았을 때의 값**을 정한다(permission-baseline.ts). 설정이 있으면
 * 그쪽이 이긴다 — 그래야 권한 화면이 "넓히면 실제로 열립니다"라고 말할 수 있다.
 *
 * ── 왜 이 세 역할인가 ───────────────────────────────────────────────────
 * 내자 정리 표에는 **금액(VAT 별도)과 입금완료 여부**가 있다. A/S 엔지니어와
 * 자재 담당은 그 축으로 일하지 않는다.
 */
import type { Role } from "./session";

export function canViewDomesticOrders(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SALES";
}

/**
 * 행을 추가하거나 고칠 수 있는가. 조회와 같은 집합이라 canViewDomesticOrders 를
 * 그대로 부른다 — 같은 목록을 두 번 적어 두면 한쪽만 고쳐지는 날이 오고, 그때
 * "보이는데 저장은 안 되는" 또는 그 반대의 어긋남이 생긴다.
 *
 * 보기보다 좁히지 않은 이유는 이 표가 무엇인지에 있다. 내자 정리는 영업이
 * 고객사에 보내는 진행 상황표이고, 발주서번호·견적서번호·납품일·입금 여부를
 * 실제로 아는 사람이 영업이다. 볼 수만 있고 못 고치면 그 사람은 다시 Excel 에
 * 적게 되고, 그러면 표와 시트가 서로 다른 값을 갖는 원래 상태로 돌아간다.
 */
export function canEditDomesticOrders(role: Role): boolean {
  return canViewDomesticOrders(role);
}

/**
 * 줄을 휴지통으로 보내고, 되살리고, 휴지통에서 바로 완전 삭제할 수 있는가.
 * 셋이 한 함수다 — 나누면 "지울 수는 있는데 되살릴 수는 없는" 역할이 만들어진다.
 *
 * ── 보기·고치기보다 좁다 ────────────────────────────────────────────────
 * 이 표에는 **세금계산서 발행일과 입금 사실**이 들어 있다. 휴지통에 있는 동안은
 * 되살릴 수 있지만, 15일이 지나면 정리 스크립트가 영구히 지운다 — 그 판단을
 * 영업 담당자 각자에게 맡기지 않는다. 견적서(canDeleteQuotes)의 삭제가 같은
 * 이유로 관리자 이상인 것과 같은 자리다.
 *
 * ── 견적서와 같은 집합이지만 불러 쓰지 않는다 ───────────────────────────
 * quote-authorization.ts 가 이미 이 파일을 import 한다(canViewQuotes 가
 * canViewDomesticOrders 를 부른다). 여기서 canDeleteQuotes 를 부르면 두 파일이
 * 서로를 import 하게 된다. 두 집합이 같다는 사실은 시험이 역할마다 대조해
 * 지킨다(domestic-order-permission.test.ts).
 */
export function canDeleteDomesticOrders(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}
