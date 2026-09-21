/**
 * 내자 정리(PO) 화면의 역할 정책.
 *
 * 🔴 A/S 관리 시스템의 `lib/auth/domestic-order-authorization.ts` 에서 **지금 쓰이는
 * 함수만** 가져왔다. 글자를 바꾸지 않는다 — 같은 `role_permissions` 표를 읽는 두
 * 사이트가 같은 사람에게 다른 대답을 하면 안 된다.
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
