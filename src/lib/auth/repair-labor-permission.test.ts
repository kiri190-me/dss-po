import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { roleEnum } from "@dss/core/schema";

import { DEVELOPER_PROMOTED_ROLE } from "./developer-promotion";
import { baselinePermissionLevel } from "./permission-baseline";
import {
  PERMISSION_AREAS,
  PERMISSION_LEAF_KEYS,
  higherPermissionLevel,
  isPermissionLeafKey,
  lowerPermissionLevel,
  meetsPermissionLevel,
  type PermissionLevel,
} from "./permission-areas";
import type { Role } from "./session";

/**
 * ============================================================================
 * 🔴 A/S 와 **같은 대답**을 하는가
 * ============================================================================
 * 이 사이트와 A/S 관리 시스템은 **같은 `role_permissions` 표**를 읽는다(설계서
 * B-2 · D절). 두 사이트가 같은 사람에게 다른 대답을 하면 둘 중 하나가 일어난다:
 *
 *   · 저쪽에서 열린 화면이 여기서 막힌다 — 사람이 고장으로 여긴다
 *   · 🔴 저쪽에서 막힌 조작이 여기서 열린다 — **실제 견적 금액이 바뀐다**
 *
 * 그래서 「아무도 설정을 만지지 않았을 때」의 값을 다섯 역할 전부로 못 박는다.
 * 아래 표는 A/S 의 `lib/auth/permission-baseline.ts` 가 내는 값이다:
 *
 *     repairLabor = ladder({ manage: canDeleteQuotes(role), read: canViewQuotes(role) })
 *     canDeleteQuotes = 최고관리자 · 관리자
 *     canViewQuotes   = canViewDomesticOrders = 최고관리자 · 관리자 · 영업
 *
 * 이 값이 달라졌다면 **A/S 쪽 정책이 바뀐 것**이고, 그때 이 시험이 먼저 깨져야
 * 한다 — 조용히 갈라지는 것보다 여기서 멈추는 편이 낫다.
 * ============================================================================
 */

/** 🔴 A/S 의 기본 정책 그대로. 고칠 때는 저쪽을 먼저 확인할 것. */
const EXPECTED_REPAIR_LABOR: Record<Role, PermissionLevel> = {
  // 견적서를 지울 수 있는 사람 = 값을 고칠 수 있는 사람.
  SUPER_ADMIN: "MANAGE",
  ADMIN: "MANAGE",
  // 견적서를 보는 사람 = 값을 보는 사람. 고치지는 못한다.
  SALES: "READ",
  // 🔴 금액이 이유로 빠진다(domestic-order-authorization.ts). 화면이 아예 안 열린다.
  AS_ENGINEER: "NONE",
  INVENTORY_MANAGER: "NONE",
};

describe("작업 비용 기본 권한 — A/S 와 같은 답", () => {
  test("🔴 다섯 역할의 값이 A/S 와 같다", () => {
    for (const [role, expected] of Object.entries(EXPECTED_REPAIR_LABOR)) {
      assert.equal(
        baselinePermissionLevel("repairLabor", role as Role),
        expected,
        `${role} 의 작업 비용 기본 권한이 A/S 와 다르다`
      );
    }
  });

  test("🔴 역할을 하나도 빠뜨리지 않았다 — 목록은 vendor/dss-core 의 이넘이 정한다", () => {
    // 역할이 늘거나 이름이 바뀌면 여기서 먼저 멈춘다. 빠진 역할은 위 표에 없어
    // 기본값 NONE 으로 떨어지는데, 그것이 옳은지 아무도 확인하지 않게 된다.
    assert.deepEqual(
      [...roleEnum.enumValues].sort(),
      Object.keys(EXPECTED_REPAIR_LABOR).sort()
    );
  });

  test("모르는 영역은 닫는다 — 여는 쪽으로 실패하지 않는다", () => {
    // 🔴 `domesticOrders` 는 조각 2 에서 **아는 영역이 되었다** — 그 대조는
    // domestic-order-permission.test.ts 가 한다. 여기 남은 것은 아직 오지 않은
    // 화면(견적서)과 이쪽으로 올 일이 없는 영역이다.
    assert.equal(baselinePermissionLevel("quotes", "SUPER_ADMIN"), "NONE");
    assert.equal(baselinePermissionLevel("users", "SUPER_ADMIN"), "NONE");
  });
});

describe("영역 목록", () => {
  test("🔴 저장 열쇠가 A/S 가 쓰는 글자 그대로다", () => {
    // 열쇠를 바꾸면 A/S 에서 저장해 둔 행이 이 사이트에서 무시되고, 관리자가
    // 정해 둔 값이 조용히 기본 정책으로 되돌아간다.
    assert.deepEqual([...PERMISSION_LEAF_KEYS], ["domesticOrders", "repairLabor"]);
  });

  test("영역 키와 잎 키가 같다 — 이 사이트에는 하위 기능 트리가 없다", () => {
    assert.deepEqual(
      PERMISSION_AREAS.map((area) => area.key),
      [...PERMISSION_LEAF_KEYS]
    );
    for (const key of PERMISSION_LEAF_KEYS) {
      assert.ok(!key.includes("."), `${key} — 점이 있으면 하위 기능이고, 그런 영역은 오지 않는다`);
    }
  });

  test("🔴 모르는 키는 걸러진다 — 같은 표에 A/S 의 영역 열넷이 함께 들어 있다", () => {
    assert.equal(isPermissionLeafKey("repairLabor"), true);
    assert.equal(isPermissionLeafKey("domesticOrders"), true);
    assert.equal(isPermissionLeafKey("quotes"), false);
    assert.equal(isPermissionLeafKey("repairCases.files"), false);
    assert.equal(isPermissionLeafKey("inventory"), false);
    assert.equal(isPermissionLeafKey(""), false);
  });

  test("작업 비용에는 '쓰기'가 없다 — 중간 단계가 뜻을 갖지 않는다", () => {
    const area = PERMISSION_AREAS.find((candidate) => candidate.key === "repairLabor");
    assert.ok(area);
    assert.equal(area.maxMeaningfulLevel, "MANAGE");
    // 사다리가 manage 와 read 만 쓰므로 WRITE 가 나오는 역할이 하나도 없다.
    for (const role of roleEnum.enumValues) {
      assert.notEqual(baselinePermissionLevel("repairLabor", role), "WRITE");
    }
  });
});

describe("수준 셈", () => {
  test("NONE 은 어떤 요구도 만족하지 못한다", () => {
    assert.equal(meetsPermissionLevel("NONE", "READ"), false);
    assert.equal(meetsPermissionLevel("READ", "MANAGE"), false);
    assert.equal(meetsPermissionLevel("MANAGE", "READ"), true);
    // required 가 NONE 이면 무엇이든 통과다(A/S 와 같은 규칙).
    assert.equal(meetsPermissionLevel("NONE", "NONE"), true);
  });

  test("🔴 개발자 승격은 **더하기**다 — 높은 쪽을 쓴다", () => {
    assert.equal(DEVELOPER_PROMOTED_ROLE, "SUPER_ADMIN");
    // 최고관리자 쪽이 낮게 저장돼 있어도 진짜 역할의 값을 잃지 않는다.
    assert.equal(higherPermissionLevel("READ", "NONE"), "READ");
    assert.equal(higherPermissionLevel("NONE", "MANAGE"), "MANAGE");
  });

  test("영역의 '의미 있는 최고 수준'은 낮은 쪽으로만 자른다", () => {
    assert.equal(lowerPermissionLevel("MANAGE", "READ"), "READ");
    assert.equal(lowerPermissionLevel("READ", "MANAGE"), "READ");
  });
});
