import "server-only";

import { cache } from "react";

import { loadStoredRolePermissions } from "@/lib/db/queries/role-permissions";
import { DEVELOPER_PROMOTED_ROLE } from "./developer-promotion";
import { baselinePermissionLevel } from "./permission-baseline";
import {
  PERMISSION_AREAS,
  higherPermissionLevel,
  meetsPermissionLevel,
  type PermissionLevel,
} from "./permission-areas";
import type { Role } from "./session";

/**
 * ============================================================================
 * 실효 권한 — 이 사이트에서 "무엇을 할 수 있는가"를 답하는 유일한 지점
 * ============================================================================
 *
 *     실효 권한 = 관리자가 설정한 수준 (없으면 기본 정책)
 *
 * 🔴 **A/S 관리 시스템의 `lib/auth/permission-resolver.ts` 와 같은 식(式)이다.**
 * 같은 `role_permissions` 표를 읽으므로 셈도 같아야 한다 — 두 사이트가 같은 사람에게
 * 다른 대답을 하면, 저쪽에서 열린 화면이 여기서 막히거나 그 반대가 된다.
 * 다섯 역할 전부에 대한 대조는 repair-labor-permission.test.ts 가 못 박는다.
 *
 * 설정이 없으면(표에 행이 없으면) 기본 정책이 그대로 실효 권한이 된다 — 즉 아무도
 * 설정을 만지지 않은 상태에서는 A/S 의 오늘 동작과 완전히 같다.
 *
 * ── 왜 min() 이 아닌가 ──────────────────────────────────────────────────
 * 설정으로 **넓힐 수도** 있어야 하기 때문이다. min(기존 정책, 설정값)이면 화면에서
 * 수준을 올려도 아무 일이 일어나지 않고, 권한 화면이 "넓히면 열립니다"라고 말할 수
 * 없게 된다. 대신 기본 정책보다 높은 값은 최고관리자만 저장할 수 있다 —
 * 🔴 그 저장은 **A/S 에서만 일어난다**(이 저장소에는 그 mutation 이 없다).
 *
 * ── 요청 한 번에 조회 한 번 ─────────────────────────────────────────────
 * React 의 cache() 로 감쌌다. 한 화면을 그리는 동안 레이아웃·페이지·서버 액션이
 * 각각 물어봐도 DB 는 한 번만 읽는다. 요청이 끝나면 캐시도 사라지므로 A/S 에서
 * 설정을 바꾼 직후 **다음 요청부터 바로** 반영된다 — 프로세스 수명 동안 남는
 * 캐시를 두면 "저쪽에서 고쳤는데 이쪽은 안 바뀐다"가 되고, 그건 권한에서 가장
 * 나쁜 종류의 버그다.
 *
 * ── 개발자 표시 ─────────────────────────────────────────────────────────
 * 창구가 역할이 아니라 **사람**(PermissionActor)을 받는다. `users.is_developer` 가
 * 켜진 계정은 최고관리자의 권한을 **더해서** 해석된다 — 갈아치우지 않는다
 * (developer-promotion.ts).
 * ============================================================================
 */

/**
 * 권한을 묻는 주체.
 *
 * 🔴 `getSessionUser()` 가 돌려주는 `PoUser` 가 그대로 들어맞는다(구조적 타입) —
 * 그 함수는 **매 요청 users 한 행을 다시 읽으므로**, 강등되거나 개발자 표시를 끈
 * 계정이 토큰 만료 전까지 예전 권한으로 다니는 구멍이 없다.
 */
export type PermissionActor = {
  role: Role;
  isDeveloper: boolean;
};

/**
 * 이 사람의 권한을 구할 때 **함께** 읽을 역할들. 개발자면 진짜 역할에
 * 최고관리자를 더한다 — 갈아치우지 않는다(developer-promotion.ts).
 */
function permissionRoles(actor: PermissionActor): readonly Role[] {
  if (!actor.isDeveloper || actor.role === DEVELOPER_PROMOTED_ROLE) return [actor.role];
  return [actor.role, DEVELOPER_PROMOTED_ROLE];
}

/**
 * 저장된 설정 전부. 요청 한 번에 한 번만 실제로 읽는다.
 *
 * 🔴 A/S 에는 "표가 없으면(마이그레이션 0042 전) 기본 정책으로" 라는 갈래가 있다.
 * 여기서는 두지 않았다 — 이 사이트는 **이미 그 표가 있는 DB** 를 보는 것이 전제이고
 * (같은 dss_as), 표가 없다는 것은 접속 대상이 잘못됐다는 뜻이라 조용히 넘기면 안
 * 된다. 오류는 그대로 올라가 화면이 「불러오지 못했습니다」로 막힌다.
 */
const loadOnce = cache(loadStoredRolePermissions);

export type EffectivePermissions = {
  /**
   * 실제로 표를 읽은 역할들. 개발자면 [진짜 역할, "SUPER_ADMIN"] 둘이다 —
   * **그 사람의 진짜 역할 하나가 아니다.** 화면에 이름표로 쓰지 말 것.
   */
  roles: readonly Role[];
  /** 영역 키 → 실효 수준. PERMISSION_AREAS 의 모든 영역이 반드시 들어 있다. */
  levels: Record<string, PermissionLevel>;
};

export async function resolveEffectivePermissions(
  actor: PermissionActor
): Promise<EffectivePermissions> {
  const roles = permissionRoles(actor);
  const stored = await loadOnce();

  // 저장된 값이 있으면 그것이 답이다. 기본 정책으로 깎지 않는다 — 설정이 최종
  // 권위라는 것이 넓히기를 가능하게 하는 유일한 방법이다(위 머리말).
  //
  // 역할이 둘일 때(= 개발자)는 **각 역할의 답을 따로 구해 높은 쪽을 쓴다.**
  // 두 표를 먼저 합치는 방식은 안 된다 — 한쪽에만 저장된 값이 있으면 다른
  // 역할의 기본 정책과 짝이 맞지 않게 섞인다.
  const levels: Record<string, PermissionLevel> = {};
  for (const area of PERMISSION_AREAS) {
    let level: PermissionLevel = "NONE";
    for (const role of roles) {
      const configured = stored[role] ?? {};
      level = higherPermissionLevel(
        level,
        configured[area.key] ?? baselinePermissionLevel(area.key, role)
      );
    }
    levels[area.key] = level;
  }

  return { roles, levels };
}

export async function getPermissionLevel(
  actor: PermissionActor,
  areaKey: string
): Promise<PermissionLevel> {
  const resolved = await resolveEffectivePermissions(actor);
  return resolved.levels[areaKey] ?? "NONE";
}

/** 이 사람이 그 영역에서 required 이상인가. 서버 액션·페이지 가드가 부른다. */
export async function hasPermission(
  actor: PermissionActor,
  areaKey: string,
  required: PermissionLevel
): Promise<boolean> {
  return meetsPermissionLevel(await getPermissionLevel(actor, areaKey), required);
}

/** 메뉴에 들어갈 수 있는 영역 키. 메뉴가 이 목록으로 항목을 거른다. */
export async function listAccessibleAreaKeys(actor: PermissionActor): Promise<string[]> {
  const resolved = await resolveEffectivePermissions(actor);
  return PERMISSION_AREAS.filter((area) => resolved.levels[area.key] !== "NONE").map(
    (area) => area.key
  );
}
