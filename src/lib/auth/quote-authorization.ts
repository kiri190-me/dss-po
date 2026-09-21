/**
 * 견적서 화면의 역할 정책.
 *
 * 🔴 A/S 관리 시스템의 `lib/auth/quote-authorization.ts` 에서 가져왔다. 글자를
 * 바꾸지 않는다 — 같은 `role_permissions` 표를 읽는 두 사이트가 같은 사람에게 다른
 * 대답을 하면 안 된다.
 *
 * 처음에는(조각 1) 두 함수만 있었다. 견적서 **화면**이 없는데도 이 파일이 필요했던
 * 까닭은, 작업 비용의 기본 권한이 **견적서의 권한으로 정의돼 있기** 때문이다 —
 * 「보는 것은 견적서를 보는 사람과 같고, 고치는 것은 견적서를 지울 수 있는 사람과
 * 같다」(permission-baseline.ts 의 repairLabor).
 *
 * 🔴 조각 3a(목록·휴지통)에서 `canEditQuotes` 가 더해졌다 — 견적서 영역의 기본
 * 권한 사다리가 **세 칸**(보기 · 쓰기 · 관리)이고, 그 가운데 칸이 이 함수다.
 * 빠뜨리면 아무도 「쓰기」를 갖지 못해, 조각 3b 의 편집 폼이 오는 날 단추가
 * 누구에게도 보이지 않는다.
 *
 * ── 내자 정리와 같은 세 역할이다. 그것도 베끼지 않고 불러서 쓴다 ────────
 * 견적서에는 **우리가 부른 값**이 통째로 들어 있다 — 부품 단가, 작업비, 합계.
 * 금액이 이유가 되어 AS_ENGINEER 와 INVENTORY_MANAGER 가 빠지는 것은 내자 정리와
 * 정확히 같은 판단이라, 역할 목록을 여기 다시 적지 않고 canViewDomesticOrders 를
 * **호출한다.** 같은 목록을 두 벌 적어 두면 한쪽만 고쳐지는 날이 온다.
 *
 * ── 삭제는 관리자 이상이다 ────────────────────────────────────────────
 * 보기보다 좁다. 견적서는 **고객사에 실제로 나간 문서**라, 지우면 "무엇을 얼마에
 * 불렀는가"의 기록이 목록에서 사라진다.
 */
import { canViewDomesticOrders } from "./domestic-order-authorization";
import type { Role } from "./session";

export function canViewQuotes(role: Role): boolean {
  return canViewDomesticOrders(role);
}

/**
 * 견적서를 만들거나 고칠 수 있는가. 조회와 같은 집합이다 — 견적을 내는 일은
 * 영업의 일이고, 볼 수만 있고 못 고치면 그 사람은 다시 Excel 을 열게 된다.
 * 그러면 시스템의 견적서와 실제로 보낸 견적서가 서로 다른 상태로 돌아간다.
 *
 * 이 함수만으로 막지는 않는다. 서버 액션은 관리자가 설정한 수준(role_permissions)을
 * 본다 — 이 함수는 그 **기본값**을 만드는 자리다(permission-baseline.ts).
 */
export function canEditQuotes(role: Role): boolean {
  return canViewQuotes(role);
}

export function canDeleteQuotes(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}
