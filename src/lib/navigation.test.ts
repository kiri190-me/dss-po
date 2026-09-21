import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isPermissionLeafKey, PERMISSION_AREAS } from "./auth/permission-areas";
import {
  filterNavItemsForAccess,
  isNavItemActive,
  landingHref,
  LANDING_NAV_KEY,
  navItems,
  permissionAreaLabel,
} from "./navigation";

/**
 * 메뉴와 권한이 **한 값**으로 묶여 있는가.
 *
 * 🔴 이 저장소가 막으려는 것은 「보이는데 막힌다」와 그 반대다. 메뉴 항목의 키가
 * 권한 영역 키와 다르면 둘이 조용히 갈라진다 — 메뉴는 그대로 서 있는데 누르면
 * 안내 화면으로 튕기고, 사용자는 고장으로 여긴다.
 */
describe("메뉴", () => {
  test("🔴 모든 항목의 키가 권한 영역 키다", () => {
    for (const item of navItems) {
      assert.ok(
        isPermissionLeafKey(item.key),
        `${item.key} — 권한 영역에 없는 키다. 화면을 더할 때 permission-areas.ts 도 함께 적는다`
      );
    }
  });

  test("주소가 겹치지 않고 사이트 안을 가리킨다", () => {
    const seen = new Set<string>();
    for (const item of navItems) {
      assert.ok(item.href.startsWith("/"), `${item.href} — 사이트 안의 경로여야 한다`);
      assert.ok(!item.href.startsWith("//"), `${item.href} — 바깥으로 나가는 주소다`);
      assert.ok(!seen.has(item.href), `${item.href} 가 두 번 있다`);
      seen.add(item.href);
    }
  });

  test("이름표가 권한 영역의 이름표와 같다 — 안내 화면이 같은 말을 해야 한다", () => {
    for (const item of navItems) {
      assert.equal(permissionAreaLabel(item.key), item.label);
    }
  });

  test("조각 3a 까지는 내자 정리 · 견적서 · 작업 비용 셋이다", () => {
    // 🔴 항목은 **그 화면이 오는 조각** 에서 더한다. 미리 적으면 없는 화면으로
    // 가는 링크가 메뉴에 선다(견적서는 조각 3a 에서 목록·휴지통과 함께 왔다).
    //
    // 🔴 차례도 함께 못 박는다 — A/S 사이드바의 「PO / 내자」 그룹과 같은
    // 순서여야 한다(navigation.ts 머리말). 견적서는 **내자 정리와 작업 비용
    // 사이**다.
    assert.deepEqual(
      navItems.map((item) => item.href),
      ["/domestic-orders", "/quotes", "/repair-labor"]
    );
  });
});

describe("들어갈 수 있는 것만 거른다", () => {
  test("권한이 없으면 항목이 사라진다", () => {
    assert.deepEqual(filterNavItemsForAccess(navItems, []), []);
  });

  test("권한이 있으면 그대로 남는다", () => {
    assert.deepEqual(
      filterNavItemsForAccess(navItems, PERMISSION_AREAS.map((area) => area.key)),
      [...navItems]
    );
  });

  test("모르는 키를 줘도 없는 항목이 생기지 않는다", () => {
    // 🔴 같은 `role_permissions` 표에 A/S 의 영역 열넷이 함께 들어 있다 — 이
    // 사이트에 없는 화면의 키가 그대로 넘어와도 메뉴가 생기면 안 된다.
    // (`quotes` 는 조각 3a 에서 **아는 키가 되어** 이 목록에서 빠졌다.)
    assert.deepEqual(filterNavItemsForAccess(navItems, ["inventory", "repairCases"]), []);
  });
});

/**
 * 들어오면 어느 화면이 뜨는가.
 *
 * 🔴 여기서 막으려는 것은 **첫 화면이 곧바로 오류로 보이는 일**이다. 권한이
 * 없는 사람을 내자 정리로 보내면 들어오자마자 /no-access 안내판이 뜨고, 그
 * 사람에게 이 사이트는 「들어가면 권한 없다고 뜨는 곳」이 된다.
 */
describe("들어오면 뜨는 화면", () => {
  /** 권한 전부를 가진 사람이 보는 메뉴. */
  const all = filterNavItemsForAccess(
    navItems,
    PERMISSION_AREAS.map((area) => area.key)
  );

  test("🔴 다 열려 있으면 내자 정리다 — 사용자가 정한 첫 화면", () => {
    assert.equal(landingHref(all), "/domestic-orders");
  });

  test("열쇠가 권한 영역 키이고 메뉴에 실제로 있는 항목이다", () => {
    // 오타 하나로 「늘 첫 항목」이 되어 버리는 것을 막는다 — 그래도 화면은
    // 그럴듯하게 뜨므로 눈으로는 잡히지 않는다.
    assert.ok(isPermissionLeafKey(LANDING_NAV_KEY));
    assert.ok(navItems.some((item) => item.key === LANDING_NAV_KEY));
  });

  test("🔴 내자 정리를 못 보는 사람은 제가 볼 수 있는 첫 화면으로 간다", () => {
    const withoutDomestic = filterNavItemsForAccess(navItems, ["quotes", "repairLabor"]);
    assert.equal(landingHref(withoutDomestic), "/quotes");

    const onlyLabor = filterNavItemsForAccess(navItems, ["repairLabor"]);
    assert.equal(landingHref(onlyLabor), "/repair-labor");
  });

  test("🔴 내자 정리만 열려 있어도 그리로 간다 — 차례가 아니라 열쇠로 고른다", () => {
    const onlyDomestic = filterNavItemsForAccess(navItems, ["domesticOrders"]);
    assert.equal(landingHref(onlyDomestic), "/domestic-orders");
  });

  test("🔴 갈 곳이 하나도 없으면 null 이다 — 그때 되돌리면 그것이 무한 되돌기다", () => {
    assert.equal(landingHref([]), null);
  });

  test("돌려주는 주소는 언제나 메뉴에 있는 주소다 — 없는 화면으로 보내지 않는다", () => {
    const hrefs = new Set(navItems.map((item) => item.href));
    for (const keys of [
      ["domesticOrders"],
      ["quotes"],
      ["repairLabor"],
      ["quotes", "repairLabor"],
      PERMISSION_AREAS.map((area) => area.key),
    ]) {
      const href = landingHref(filterNavItemsForAccess(navItems, keys));
      assert.ok(href !== null && hrefs.has(href), `${keys.join(",")} → ${href}`);
    }
  });

  test("🔴 루트(/)로 되돌아오지 않는다 — 그 한 줄이 무한 되돌기다", () => {
    assert.notEqual(landingHref(all), "/");
  });
});

/**
 * 머리말의 단추 가운데 어느 것이 짙게 칠해지는가(components/NavLink.tsx).
 *
 * 🔴 여기서 막으려는 것은 **둘이 한꺼번에 켜지는 일**과 **상세 화면에서 전부
 * 꺼지는 일**이다. 둘 다 「지금 내가 어디 있나」를 사람에게서 빼앗는다.
 */
describe("지금 보고 있는 화면", () => {
  test("주소가 정확히 같으면 켠다", () => {
    for (const item of navItems) {
      assert.equal(isNavItemActive(item.href, item.href), true, item.href);
    }
  });

  test("🔴 하위 주소에서도 켜져 있다 — 조각 3b 의 견적서 편집 폼이 그 경우다", () => {
    assert.equal(isNavItemActive("/quotes/3", "/quotes"), true);
    assert.equal(isNavItemActive("/domestic-orders/12/edit", "/domestic-orders"), true);
  });

  test("🔴 토막 경계까지 본다 — /quotes 가 /quotes-archive 를 켜지 않는다", () => {
    assert.equal(isNavItemActive("/quotes-archive", "/quotes"), false);
    assert.equal(isNavItemActive("/repair-labor-history", "/repair-labor"), false);
  });

  test("다른 화면에서는 꺼져 있다", () => {
    assert.equal(isNavItemActive("/quotes", "/domestic-orders"), false);
    assert.equal(isNavItemActive("/no-access", "/quotes"), false);
  });

  test("🔴 어느 주소에서도 두 단추가 함께 켜지지 않는다", () => {
    // 세 주소는 서로의 앞부분이 아니다 — 그 성질이 깨지는 항목이 더해지면
    // (예: `/quotes` 와 `/quotes/drafts`) 여기서 걸린다.
    const places = [
      ...navItems.map((item) => item.href),
      ...navItems.map((item) => `${item.href}/7`),
      "/",
      "/no-access",
    ];
    for (const pathname of places) {
      const lit = navItems.filter((item) => isNavItemActive(pathname, item.href));
      assert.ok(lit.length <= 1, `${pathname} 에서 ${lit.length} 개가 켜졌다`);
    }
  });

  test("🔴 루트(/)에서는 아무것도 켜지지 않는다 — 메뉴에 루트 항목이 없다", () => {
    // 루트는 곧바로 내자 정리로 되돌리므로 사람이 머무는 주소가 아니다
    // ((app)/page.tsx). 그래도 한순간 그려질 수 있어 확인해 둔다 — 여기서
    // 켜진다면 그것은 href 가 "/" 인 항목이 생겼다는 뜻이고, 그때는 NavLink 에
    // 「정확히 같을 때만」 갈래가 필요해진다(navigation.ts 의 isNavItemActive).
    for (const item of navItems) {
      assert.equal(isNavItemActive("/", item.href), false, item.href);
    }
  });
});
