/**
 * ============================================================================
 * 역할별 접근 권한 — 영역과 수준
 * ============================================================================
 * 🔴 **A/S 관리 시스템과 같은 어휘, 같은 표(`role_permissions`)다.** 관리자가 저 쪽
 * [사용자 관리 → 역할별 접근 권한] 화면에서 정한 값을 이 사이트가 **그대로 읽는다.**
 * 설정 화면은 A/S 에 그대로 두고 여기서는 읽기만 한다(설계서 F절 1번과 같은 판단 —
 * 관리자만 쓰는 화면이라 건너가는 불편이 작고, 두 곳에서 고칠 수 있게 두면
 * 어느 쪽이 참인지 답할 수 없다).
 *
 * ── 🔴 왜 A/S 의 파일을 통째로 베끼지 않았나 ────────────────────────────
 * 저쪽 `lib/auth/permission-areas.ts` 는 메뉴 14개를 담고, 그 각각이
 * `*-authorization.ts` 함수 예순 몇 개를 부른다. 이 사이트에 없는 화면의 상한까지
 * 끌고 오면 **여기서 아무도 묻지 않는 값**이 코드에 남고, 그것이 저쪽에서 바뀌어도
 * 여기서는 알 길이 없다. 그래서 **이 사이트가 실제로 판정하는 영역만** 담는다.
 *
 * 🔴 담은 영역의 값은 저쪽과 **글자 하나까지 같아야 한다.** 같은 표를 읽는 두
 * 사이트가 같은 사람에게 다른 대답을 하면 안 된다 — 그 대조를
 * `repair-labor-permission.test.ts` 가 다섯 역할 전부로 못 박는다.
 *
 * ── 수준은 넷이다 ───────────────────────────────────────────────────────
 * NONE · READ · WRITE · MANAGE. 화면에서 체크 해제 = NONE, 체크 = 읽기 이상이다.
 * ============================================================================
 */

export const PERMISSION_LEVELS = ["NONE", "READ", "WRITE", "MANAGE"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

const LEVEL_RANK: Record<PermissionLevel, number> = { NONE: 0, READ: 1, WRITE: 2, MANAGE: 3 };

export function permissionLevelRank(level: PermissionLevel): number {
  return LEVEL_RANK[level];
}

/** 둘 중 낮은 수준. 영역의 「의미 있는 최고 수준」으로 기본 정책을 자를 때 쓴다. */
export function lowerPermissionLevel(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

/**
 * 둘 중 높은 수준. 개발자 승격이 **더하기**라서 필요하다 — 진짜 역할의 수준과
 * 최고관리자의 수준 중 높은 쪽이 답이다(developer-promotion.ts).
 */
export function higherPermissionLevel(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/** actual 이 required 이상인가. NONE 은 어떤 요구도 만족하지 못한다. */
export function meetsPermissionLevel(actual: PermissionLevel, required: PermissionLevel): boolean {
  if (required === "NONE") return true;
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

export type PermissionArea = {
  /**
   * 🔴 `role_permissions.area_key` 에 저장된 글자 그대로다. A/S 가 그 값으로 이미
   * 저장해 둔 행이 있으므로 **한 글자도 바꿀 수 없다** — 바꾸면 관리자가 정해 둔
   * 값이 통째로 무시되고 기본 정책으로 돌아간다.
   */
  key: string;
  label: string;
  description: string;
  /**
   * 이 영역에서 의미가 있는 가장 높은 수준. 기본 정책을 이 값으로 한 번 더 자른다.
   */
  maxMeaningfulLevel: PermissionLevel;
};

/**
 * 이 사이트가 판정하는 영역.
 *
 * 🔴 지금은 둘이다 — 조각 1 이 「작업 비용」을, 조각 2 가 「내자 정리」를 옮겨
 * 왔다. 견적서(`quotes`)는 그 화면이 오는 조각 3 에서 **그 화면과 함께** 더한다.
 * 미리 적어 두면 아무도 못 들어가는 메뉴가 생기거나, 더 나쁘게는 화면이 없는데
 * 권한만 열린 상태가 된다.
 *
 * 🔴 세 영역 모두 A/S 에서 **하위 기능이 없는 잎(leaf)** 이다(저쪽
 * `permission-features.ts` 의 PERMISSION_LEAF_KEYS 에 점 없는 키로 들어 있다).
 * 그래서 이 사이트에는 하위 기능 트리가 없고, **영역 키가 곧 저장되는 키**다.
 * 하위 기능이 있는 영역(전체 A/S 현황 · 고객사 …)은 이쪽으로 올 일이 없다.
 */
export const PERMISSION_AREAS: readonly PermissionArea[] = [
  {
    key: "domesticOrders",
    // 🔴 열쇠(`domesticOrders`)·이름표·설명 모두 A/S 와 **글자 하나까지 같다**
    // (저쪽 permission-areas.ts). 설명이 갈리면 저쪽 [역할별 접근 권한] 화면이
    // 말하는 「관리」와 여기서 실제로 열리는 것이 어긋나 보인다.
    label: "내자 정리",
    // 추가·수정은 영업까지고(WRITE), 휴지통으로 보내기·복원·완전 삭제는 관리자
    // 이상이다(MANAGE — domestic-order-authorization.ts 의
    // canDeleteDomesticOrders). 쓰기와 갈리는 조작이 실제로 있으므로 상한이
    // 관리다. 🔴 여기를 쓰기로 내리면 휴지통이 누구에게도 열리지 않는다 —
    // A/S 가 실제로 한 번 그 상태였다.
    description:
      "국내 수주 진행 상황표(발주·견적·납품·입금). 금액과 입금 정보가 있습니다. 관리는 휴지통(삭제·복원·완전 삭제)",
    maxMeaningfulLevel: "MANAGE",
  },
  {
    key: "repairLabor",
    // 🔴 열쇠(`repairLabor`)는 A/S 와 같은 값이다(2026-09-04 에 이름표만 넓혔다).
    // 열쇠를 바꾸면 관리자가 역할마다 저장해 둔 접근 수준이 통째로 초기화된다.
    label: "작업 비용",
    // 🔴 **쓰기 수준이 뜻을 갖지 않는다.** 이 화면에는 "내 것 하나를 고친다"가
    // 없다 — 시간당 단가나 공수시간을 바꾸면 앞으로 나갈 **모든 견적서의 금액이**
    // 바뀐다. 그래서 보는 것과 고치는 것 사이에 중간 단계를 두지 않고, 고치는
    // 것은 관리로만 연다(server/actions/repair-labor.ts 의 같은 판단).
    description:
      "수리 작업별 공수시간·통전작업 공수시간과 시간당·기본 작업비. 관리는 값 수정(모든 견적 금액에 영향)",
    maxMeaningfulLevel: "MANAGE",
  },
];

/**
 * 실제로 저장·판정되는 키.
 *
 * A/S 에서는 하위 기능이 있는 영역 때문에 이 목록이 따로 있지만, 이 사이트의
 * 영역은 전부 잎이라 **영역 목록과 같다**(위 PERMISSION_AREAS 주석).
 */
export const PERMISSION_LEAF_KEYS: readonly string[] = PERMISSION_AREAS.map((area) => area.key);

/**
 * 지금 이 사이트가 아는 키인가.
 *
 * 🔴 모르는 키의 저장된 행은 **무시한다.** 같은 표를 A/S 가 함께 쓰므로 이 사이트가
 * 판정하지 않는 영역의 행이 잔뜩 들어 있다 — 그것을 판정에 섞으면 여기 없는 화면의
 * 설정이 조용히 여기에 관여하게 된다.
 */
export function isPermissionLeafKey(key: string): boolean {
  return PERMISSION_LEAF_KEYS.includes(key);
}
