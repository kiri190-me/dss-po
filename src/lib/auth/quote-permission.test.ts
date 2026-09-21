import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { roleEnum } from "@dss/core/schema";

import { canDeleteQuotes, canEditQuotes, canViewQuotes } from "./quote-authorization";
import { canViewDomesticOrders } from "./domestic-order-authorization";
import { baselinePermissionLevel } from "./permission-baseline";
import { PERMISSION_AREAS, type PermissionLevel } from "./permission-areas";
import type { Role } from "./session";

/**
 * ============================================================================
 * 🔴 견적서 — A/S 와 **같은 대답**을 하는가
 * ============================================================================
 * 이 사이트와 A/S 관리 시스템은 **같은 `role_permissions` 표**를 읽고, 조각 4
 * 전까지는 **같은 화면이 양쪽에 있다**(설계서 B-2 · D · G절). 두 사이트가 같은
 * 사람에게 다른 대답을 하면 둘 중 하나가 일어난다:
 *
 *   · 저쪽에서 열린 화면이 여기서 막힌다 — 사람이 고장으로 여긴다
 *   · 🔴 저쪽에서 막힌 조작이 여기서 열린다 — **같은 dss_as 의 견적서가 휴지통으로
 *     가거나 완전히 지워진다.** 고객사에 실제로 나간 문서의 기록이다.
 *
 * 그래서 「아무도 설정을 만지지 않았을 때」의 값을 다섯 역할 전부로 못 박는다.
 * 아래 표는 A/S 의 `lib/auth/permission-baseline.ts` 가 내는 값이다:
 *
 *     quotes = ladder({
 *       manage: canDeleteQuotes(role),
 *       write:  canEditQuotes(role),
 *       read:   canViewQuotes(role),
 *     })
 *     canDeleteQuotes = 최고관리자 · 관리자
 *     canEditQuotes   = canViewQuotes = canViewDomesticOrders
 *                     = 최고관리자 · 관리자 · 영업
 *
 * 이 값이 달라졌다면 **A/S 쪽 정책이 바뀐 것**이고, 그때 이 시험이 먼저 깨져야
 * 한다 — 조용히 갈라지는 것보다 여기서 멈추는 편이 낫다.
 * ============================================================================
 */

/** 🔴 A/S 의 기본 정책 그대로. 고칠 때는 저쪽을 먼저 확인할 것. */
const EXPECTED_QUOTES: Record<Role, PermissionLevel> = {
  // 휴지통(보내기·복원·완전 삭제)까지 되는 사람.
  SUPER_ADMIN: "MANAGE",
  ADMIN: "MANAGE",
  // 만들고 고칠 수 있다. 지우지는 못한다 — 고객사에 나간 문서라, 「무엇을 얼마에
  // 불렀는가」를 목록에서 없애는 판단을 담당자 각자에게 맡기지 않는다.
  SALES: "WRITE",
  // 🔴 금액(부품 단가·작업비·합계)이 이유로 빠진다. 화면이 아예 안 열린다.
  AS_ENGINEER: "NONE",
  INVENTORY_MANAGER: "NONE",
};

describe("견적서 기본 권한 — A/S 와 같은 답", () => {
  test("🔴 다섯 역할의 값이 A/S 와 같다", () => {
    for (const [role, expected] of Object.entries(EXPECTED_QUOTES)) {
      assert.equal(
        baselinePermissionLevel("quotes", role as Role),
        expected,
        `${role} 의 견적서 기본 권한이 A/S 와 다르다`
      );
    }
  });

  test("🔴 역할을 하나도 빠뜨리지 않았다 — 목록은 vendor/dss-core 의 이넘이 정한다", () => {
    // 역할이 늘거나 이름이 바뀌면 여기서 먼저 멈춘다. 빠진 역할은 위 표에 없어
    // 기본값 NONE 으로 떨어지는데, 그것이 옳은지 아무도 확인하지 않게 된다.
    assert.deepEqual([...roleEnum.enumValues].sort(), Object.keys(EXPECTED_QUOTES).sort());
  });

  test("🔴 보기·고치기는 내자 정리와 같은 집합이다 — 목록을 두 벌 적지 않았다", () => {
    // 견적을 내는 사람과 내자 진행 상황을 적는 사람이 같다(quote-authorization.ts).
    // 여기가 깨지면 두 화면 중 어느 쪽이 옳은지 답할 방법이 없어진다.
    for (const role of roleEnum.enumValues) {
      assert.equal(canViewQuotes(role), canViewDomesticOrders(role), `${role} — 보기 집합이 갈렸다`);
      assert.equal(canEditQuotes(role), canViewQuotes(role), `${role} — 고치기가 보기와 갈렸다`);
    }
  });

  test("🔴 삭제는 관리자 이상이다 — 보기·고치기보다 좁다", () => {
    for (const role of roleEnum.enumValues) {
      if (!canDeleteQuotes(role)) continue;
      assert.ok(canEditQuotes(role), `${role} — 고치지 못하는 사람이 지울 수 있다`);
    }
    assert.equal(canDeleteQuotes("SALES"), false, "영업이 견적서를 지울 수 있다");
  });
});

describe("견적서 영역", () => {
  test("🔴 저장 열쇠·이름표·설명이 A/S 가 쓰는 글자 그대로다", () => {
    // 열쇠를 바꾸면 A/S 에서 저장해 둔 행이 이 사이트에서 무시되고, 관리자가
    // 정해 둔 값이 조용히 기본 정책으로 되돌아간다. 설명이 갈리면 저쪽 [역할별
    // 접근 권한] 화면이 말하는 「관리」와 여기서 열리는 것이 어긋나 보인다.
    const area = PERMISSION_AREAS.find((candidate) => candidate.key === "quotes");
    assert.ok(area, "견적서 영역이 없다");
    assert.equal(area.label, "견적서");
    assert.equal(area.description, "고객사에 보내는 견적서(부품비·작업비·합계). 관리는 삭제·복원");
  });

  test("🔴 상한이 '관리'다 — 여기를 쓰기로 내리면 휴지통이 누구에게도 안 열린다", () => {
    const area = PERMISSION_AREAS.find((candidate) => candidate.key === "quotes");
    assert.ok(area);
    assert.equal(area.maxMeaningfulLevel, "MANAGE");
    // 상한으로 잘린 뒤에도 최고관리자·관리자가 실제로 관리까지 간다.
    assert.equal(baselinePermissionLevel("quotes", "SUPER_ADMIN"), "MANAGE");
  });
});
