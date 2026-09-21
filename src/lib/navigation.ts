import { PERMISSION_AREAS } from "./auth/permission-areas";

/**
 * ============================================================================
 * 이 사이트의 메뉴
 * ============================================================================
 * A/S 관리 시스템에서는 「PO / 내자」가 사이드바의 **그룹 하나**였다(저쪽
 * `lib/navigation.ts`). 이 사이트는 그 그룹이 통째로 전부이므로 그룹을 두지 않고
 * 머리말 아래 한 줄로 편다 — 항목이 셋뿐이라 접었다 폈다 할 것이 없다.
 *
 * 🔴 **`key` 는 권한 영역 키와 같은 값이다.** 그래야 「메뉴에 보이는 것」과
 * 「들어갈 수 있는 것」이 한 값으로 정해진다. 둘을 따로 두면 언젠가 보이는데 막히는
 * 항목이 생기고, 그때 사용자는 고장으로 여긴다. 아래 시험 성격의 검사가 그 짝을
 * 확인한다(navigation.test.ts).
 *
 * 🔴 지금은 셋이다 — 조각 1 이 「작업 비용」을, 조각 2 가 「내자 정리」를, 조각
 * 3a 가 「견적서」를 옮겨 왔다. 항목은 그 화면이 오는 조각에서 **그 화면·그 권한
 * 영역과 함께** 더한다. 미리 적어 두면 없는 화면으로 가는 링크가 메뉴에 선다.
 *
 * 🔴 **차례는 A/S 사이드바의 차례 그대로다** — 내자 정리 · 견적서 · 작업 비용
 * (저쪽 `lib/navigation.ts` 의 「PO / 내자」 그룹). 사람이 눈으로 외운 순서라,
 * 옮겨 왔다고 흔들면 매번 찾아야 한다.
 * ============================================================================
 */
export type NavItem = {
  /** 🔴 권한 영역 키(auth/permission-areas.ts)와 같은 값. */
  key: string;
  href: string;
  label: string;
};

export const navItems: readonly NavItem[] = [
  // 🔴 주소(`/domestic-orders`)도 A/S 와 같게 둔다 — 아래 작업 비용과 같은 이유다.
  { key: "domesticOrders", href: "/domestic-orders", label: "내자 정리" },
  // 🔴 주소(`/quotes`)도 A/S 와 같게 둔다 — 아래 작업 비용과 같은 이유다. 게다가
  // 견적서는 저쪽에서 **알림 종의 링크**가 가리키는 주소이기도 하다(설계서 F절 2번:
  // 결재 알림은 A/S 종에 계속 뜨고 링크 주소만 이쪽으로 바뀐다).
  { key: "quotes", href: "/quotes", label: "견적서" },
  // 🔴 주소(`/repair-labor`)도 A/S 와 같게 둔다. 사람이 저쪽 주소를 기억하고
  // 있고, 조각 4 에서 A/S 가 이쪽으로 링크를 보낼 때 경로가 같으면 그 링크가
  // 도메인만 바꾸면 된다.
  { key: "repairLabor", href: "/repair-labor", label: "작업 비용" },
];

/**
 * 들어갈 수 있는 항목만 남긴다. 메뉴와 가드가 **같은 창구**를 보게 하려는 것이다 —
 * 거르는 규칙이 두 곳에 있으면 한쪽만 고쳐지는 날 「보이는데 막힌다」가 된다.
 */
export function filterNavItemsForAccess(
  items: readonly NavItem[],
  accessibleAreaKeys: readonly string[]
): NavItem[] {
  const allowed = new Set(accessibleAreaKeys);
  return items.filter((item) => allowed.has(item.key));
}

/** 메뉴 항목의 이름표 — 안내 화면이 「무엇이 막혔는지」를 말할 때 쓴다. */
export function permissionAreaLabel(areaKey: string): string | null {
  return PERMISSION_AREAS.find((area) => area.key === areaKey)?.label ?? null;
}
