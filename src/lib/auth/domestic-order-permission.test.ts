import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { roleEnum } from "@dss/core/schema";

import {
  canDeleteDomesticOrders,
  canEditDomesticOrders,
  canViewDomesticOrders,
} from "./domestic-order-authorization";
import { canDeleteQuotes } from "./quote-authorization";
import { baselinePermissionLevel } from "./permission-baseline";
import { PERMISSION_AREAS, type PermissionLevel } from "./permission-areas";
import type { Role } from "./session";

/**
 * ============================================================================
 * 🔴 내자 정리 — A/S 와 **같은 대답**을 하는가
 * ============================================================================
 * 이 사이트와 A/S 관리 시스템은 **같은 `role_permissions` 표**를 읽고, 조각 4
 * 전까지는 **같은 화면이 양쪽에 있다**(설계서 B-2 · D · G절). 두 사이트가 같은
 * 사람에게 다른 대답을 하면 둘 중 하나가 일어난다:
 *
 *   · 저쪽에서 열린 화면이 여기서 막힌다 — 사람이 고장으로 여긴다
 *   · 🔴 저쪽에서 막힌 조작이 여기서 열린다 — **같은 dss_as 의 실제 줄이
 *     지워지거나 금액·입금 여부가 바뀐다**
 *
 * 그래서 「아무도 설정을 만지지 않았을 때」의 값을 다섯 역할 전부로 못 박는다.
 * 아래 표는 A/S 의 `lib/auth/permission-baseline.ts` 가 내는 값이다:
 *
 *     domesticOrders = ladder({
 *       manage: canDeleteDomesticOrders(role),
 *       write:  canEditDomesticOrders(role),
 *       read:   canViewDomesticOrders(role),
 *     })
 *     canDeleteDomesticOrders = 최고관리자 · 관리자
 *     canEditDomesticOrders   = canViewDomesticOrders
 *                             = 최고관리자 · 관리자 · 영업 · A/S 엔지니어
 *
 * 이 값이 달라졌다면 **A/S 쪽 정책이 바뀐 것**이고, 그때 이 시험이 먼저 깨져야
 * 한다 — 조용히 갈라지는 것보다 여기서 멈추는 편이 낫다.
 *
 * 🔴 **2026-09-29 — 사용자가 A/S 엔지니어를 열었다.** 원문: 「엔지니어도 PO/내자에
 * 모두 읽기/쓰기 할 수 있어야 해.」 금액(VAT 별도)과 입금완료 여부가 엔지니어에게
 * 보이고 엔지니어가 고칠 수 있게 된다는 것을 확인받고 내린 결정이다. 아래 표의
 * AS_ENGINEER 줄이 NONE 에서 WRITE 로 **뒤집혔다** — 없어진 것이 아니다.
 * 되돌리려면 사용자에게 다시 물어야 한다.
 * ============================================================================
 */

/** 🔴 A/S 의 기본 정책 그대로. 고칠 때는 저쪽을 먼저 확인할 것. */
const EXPECTED_DOMESTIC_ORDERS: Record<Role, PermissionLevel> = {
  // 휴지통(보내기·복원·완전 삭제)까지 되는 사람.
  SUPER_ADMIN: "MANAGE",
  ADMIN: "MANAGE",
  // 행을 더하고 고칠 수 있다. 지우지는 못한다 — 세금계산서 발행일과 입금 사실이
  // 들어 있는 줄이라, 15일 뒤 영구 삭제되는 판단을 각자에게 맡기지 않는다.
  SALES: "WRITE",
  // 🔴 2026-09-29 사용자 결정으로 NONE → WRITE. 영업과 같은 자리다 — 보고
  // 고치지만 지우지는 못한다.
  AS_ENGINEER: "WRITE",
  // 🔴 금액(VAT 별도)과 입금완료 여부가 이유로 빠진다. 화면이 아예 안 열린다.
  // 이번 결정에 없는 역할이라 **한 글자도 바뀌지 않았다.**
  INVENTORY_MANAGER: "NONE",
};

describe("내자 정리 기본 권한 — A/S 와 같은 답", () => {
  test("🔴 다섯 역할의 값이 A/S 와 같다", () => {
    for (const [role, expected] of Object.entries(EXPECTED_DOMESTIC_ORDERS)) {
      assert.equal(
        baselinePermissionLevel("domesticOrders", role as Role),
        expected,
        `${role} 의 내자 정리 기본 권한이 A/S 와 다르다`
      );
    }
  });

  test("🔴 역할을 하나도 빠뜨리지 않았다 — 목록은 vendor/dss-core 의 이넘이 정한다", () => {
    assert.deepEqual(
      [...roleEnum.enumValues].sort(),
      Object.keys(EXPECTED_DOMESTIC_ORDERS).sort()
    );
  });
});

describe("역할 정책 자체", () => {
  test("🔴 2026-09-29: 엔지니어는 내자 정리를 보고 고친다 — 사용자 결정", () => {
    assert.equal(canViewDomesticOrders("AS_ENGINEER"), true, "엔지니어가 내자 정리를 못 본다");
    assert.equal(canEditDomesticOrders("AS_ENGINEER"), true, "엔지니어가 내자 정리를 못 고친다");
  });

  test("🔴 2026-09-29: 엔지니어에게 삭제·휴지통은 열리지 않았다 — 이 조각의 안전선", () => {
    // 사용자가 정한 것은 「읽기/쓰기」까지다. 보기·고치기가 열렸다는 이유로
    // 삭제까지 따라가면 엔지니어가 세금계산서 발행일·입금 사실이 든 줄을
    // 지울 수 있게 된다 — **같은 dss_as 의 실제 줄이다.**
    assert.equal(canDeleteDomesticOrders("AS_ENGINEER"), false, "엔지니어에게 삭제가 열렸다");
    assert.notEqual(
      baselinePermissionLevel("domesticOrders", "AS_ENGINEER"),
      "MANAGE",
      "엔지니어의 기본 상한이 관리다 — 휴지통이 열렸다"
    );
  });

  test("🔴 2026-09-29: 재고 담당자는 한 글자도 바뀌지 않았다 — 이번 결정에 없다", () => {
    assert.equal(canViewDomesticOrders("INVENTORY_MANAGER"), false);
    assert.equal(canEditDomesticOrders("INVENTORY_MANAGER"), false);
    assert.equal(canDeleteDomesticOrders("INVENTORY_MANAGER"), false);
    assert.equal(baselinePermissionLevel("domesticOrders", "INVENTORY_MANAGER"), "NONE");
  });

  test("지우는 것은 최고관리자·관리자뿐이다", () => {
    assert.equal(canDeleteDomesticOrders("SUPER_ADMIN"), true);
    assert.equal(canDeleteDomesticOrders("ADMIN"), true);
    for (const role of ["SALES", "AS_ENGINEER", "INVENTORY_MANAGER"] as const) {
      assert.equal(
        canDeleteDomesticOrders(role),
        false,
        `${role} 이(가) 내자 정리 줄을 지울 수 있게 됐다`
      );
    }
  });

  test("지우는 역할은 견적서를 지우는 역할과 같은 집합이다 — 불러 쓰지 않으므로 여기서 대조한다", () => {
    // domestic-order-authorization.ts 가 canDeleteQuotes 를 부르지 않는 이유는 그
    // 파일의 주석(순환 import). 대신 두 목록이 갈라지면 여기서 드러난다.
    for (const role of roleEnum.enumValues) {
      assert.equal(canDeleteDomesticOrders(role), canDeleteQuotes(role), role);
    }
  });

  test("지울 수 있으면 고칠 수도 있고 볼 수도 있다", () => {
    for (const role of roleEnum.enumValues) {
      if (!canDeleteDomesticOrders(role)) continue;
      assert.equal(canEditDomesticOrders(role), true, `${role}: 지우기는 되는데 고치기는 안 된다`);
      assert.equal(canViewDomesticOrders(role), true, `${role}: 지우기는 되는데 보기는 안 된다`);
    }
  });

  test("지울 수 없는 역할의 기본 상한은 관리가 아니다 — 설정 없이는 휴지통이 열리지 않는다", () => {
    for (const role of roleEnum.enumValues) {
      if (canDeleteDomesticOrders(role)) continue;
      assert.notEqual(
        baselinePermissionLevel("domesticOrders", role),
        "MANAGE",
        `${role}: 지울 수 없는 역할의 상한이 관리다`
      );
    }
  });
});

describe("영역 등록", () => {
  test("🔴 상한이 관리다 — 쓰기에 머물면 휴지통이 누구에게도 열리지 않는다", () => {
    const area = PERMISSION_AREAS.find((candidate) => candidate.key === "domesticOrders");
    assert.ok(area, "내자 정리 영역이 없다");
    assert.equal(area.maxMeaningfulLevel, "MANAGE");
    // A/S 가 실제로 한 번 겪은 함정이다 — 상한과 기본값 중 하나만 관리로 올리면
    // baselinePermissionLevel 이 쓰기로 잘라 버린다.
    assert.equal(baselinePermissionLevel("domesticOrders", "SUPER_ADMIN"), "MANAGE");
  });

  test("설명이 관리가 무엇인지 말한다 — A/S 설정 화면과 같은 문구다", () => {
    const area = PERMISSION_AREAS.find((candidate) => candidate.key === "domesticOrders");
    assert.ok(area);
    assert.equal(area.label, "내자 정리");
    assert.ok(
      area.description.includes("관리는 휴지통"),
      `설명이 관리 수준을 말하지 않는다: ${area.description}`
    );
  });
});
