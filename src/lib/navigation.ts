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

/**
 * 지금 보고 있는 화면인가 — 머리말의 단추를 짙게 칠할지 정한다.
 *
 * 🔴 **앞부분이 같으면 켠다**(`/quotes` 와 `/quotes/3`). 아직 상세 화면은 없지만
 * 조각 3b(견적서 편집 폼)가 오면 곧바로 생긴다 — 그때 「정확히 같을 때만」이면
 * 상세로 들어가는 순간 단추 불이 **전부 꺼져** 사람은 제가 어디 있는지 알 수
 * 없게 된다.
 *
 * 🔴 토막 경계(`/`)까지 함께 본다. `startsWith(href)` 만 보면 `/quotes` 가
 * `/quotes-archive` 까지 켠다 — proxy 의 isGuardedPath 가 같은 이유로 같은
 * 모양을 쓴다(auth/proxy-rules.ts).
 *
 * 🔴 휴가 관리(dss-leave)의 같은 조각에는 `exact` 프롭이 있지만 **가져오지
 * 않았다.** 저쪽에는 `/` 를 가리키는 항목(달력)이 있어서 필요했다 — `/` 는 모든
 * 주소의 앞부분이라 그것 하나는 정확히 같을 때만 켜야 한다. 이 사이트의 메뉴에는
 * 루트가 없고 세 주소가 서로의 앞부분도 아니다. 영원히 false 인 갈래를 베껴 두면
 * 읽는 사람이 「어디선가 쓰겠거니」 하고 남겨 두게 된다(이 저장소가 mock 모드
 * 갈래를 안 베낀 것과 같은 판단 — domestic-orders/page.tsx 머리말).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 이 사이트에 들어왔을 때(루트 `/`) 띄울 화면.
 *
 * 🔴 **내자 정리다**(사용자 결정 2026-09-21 — "PO/내자에 들어오면 내자정리가
 * 띄워져 있도록 해줘"). 세 화면 가운데 날마다 열어 보는 것이 그것이고, 지금까지
 * 루트에는 "위 메뉴에서 화면을 고르세요"라는 빈 안내판만 있어서 들어올 때마다
 * 한 번씩 더 눌러야 했다.
 *
 * 🔴 **받는 것은 「들어갈 수 있는 항목」이다** — 권한으로 이미 걸러진 목록을
 * 받는다(filterNavItemsForAccess). 내자 정리를 볼 수 없는 사람을 그리로 보내면
 * 첫 화면이 곧바로 /no-access 안내판이 되고, 그 사람에게 이 사이트는 「들어가면
 * 권한 없다고 뜨는 곳」이 된다. 그래서 못 가면 **그 사람이 갈 수 있는 첫
 * 화면**으로 대신 보낸다(차례는 A/S 사이드바의 차례 그대로 — 위 navItems).
 *
 * 하나도 없으면 null 이다. 그때 루트는 되돌리지 않고 **제자리에서** 사정을
 * 적어 준다 — 갈 곳이 없는데 어디론가 보내면 그것이 곧 무한 되돌기다.
 *
 * 🔴 이 판정을 순수 함수로 떼어 둔 것은 시험 때문이다. 루트 화면 안에 두면
 * 세션·DB 없이는 확인할 길이 없고, 이 저장소의 unit 목록은 DB 에 닿을 수 없다
 * (scripts/test-lists/unit.txt).
 */
export const LANDING_NAV_KEY = "domesticOrders";

export function landingHref(accessibleItems: readonly NavItem[]): string | null {
  const preferred = accessibleItems.find((item) => item.key === LANDING_NAV_KEY);
  return (preferred ?? accessibleItems[0])?.href ?? null;
}
