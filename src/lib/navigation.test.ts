import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isPermissionLeafKey, PERMISSION_AREAS } from "./auth/permission-areas";
import { filterNavItemsForAccess, navItems, permissionAreaLabel } from "./navigation";

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

  test("조각 1 은 작업 비용 하나다", () => {
    // 🔴 내자 정리·견적서는 **그 화면이 오는 조각**에서 더한다. 미리 적으면
    // 없는 화면으로 가는 링크가 메뉴에 선다.
    assert.deepEqual(
      navItems.map((item) => item.href),
      ["/repair-labor"]
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
    assert.deepEqual(filterNavItemsForAccess(navItems, ["quotes", "inventory"]), []);
  });
});
