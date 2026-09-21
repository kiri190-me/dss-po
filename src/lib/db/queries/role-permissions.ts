import "server-only";

import { roleEnum, rolePermissions } from "@dss/core/schema";
import { db } from "@/lib/db";
import { isPermissionLeafKey, type PermissionLevel } from "@/lib/auth/permission-areas";
import type { Role } from "@/lib/auth/session";

/**
 * ============================================================================
 * 저장된 역할별 접근 권한 — **읽기만 한다**
 * ============================================================================
 * 🔴 이 표는 **A/S 관리 시스템이 소유한다.** 설정 화면은 저쪽 [사용자 관리] 안에
 * 있고, 이 사이트는 거기서 정해진 값을 읽을 뿐이다(설계서 F절 1번과 같은 판단).
 * 그래서 이 저장소에는 `mutations/role-permissions.ts` 가 **없다** — 두 곳에서
 * 고칠 수 있게 두면 어느 쪽이 참인지 답할 수 없다.
 *
 * 저장된 설정만 담는다 — 행이 없는 (역할, 영역)은 여기 나오지 않는다(= 기본 정책
 * 그대로, permission-baseline.ts).
 *
 * 🔴 **이 사이트가 모르는 키의 행은 걸러 낸다.** 같은 표에 A/S 의 영역 열넷이
 * 함께 들어 있으므로, 거르지 않으면 여기 없는 화면의 설정이 판정에 섞인다
 * (permission-areas.ts 의 isPermissionLeafKey).
 * ============================================================================
 */
export type StoredRolePermissions = Record<Role, Record<string, PermissionLevel>>;

/** 역할마다 빈 칸 하나씩. 역할 목록은 vendor/dss-core 의 이넘 하나가 정한다. */
function emptyByRole(): StoredRolePermissions {
  return Object.fromEntries(roleEnum.enumValues.map((role) => [role, {}])) as StoredRolePermissions;
}

export async function loadStoredRolePermissions(): Promise<StoredRolePermissions> {
  const rows = await db
    .select({
      role: rolePermissions.role,
      areaKey: rolePermissions.areaKey,
      level: rolePermissions.level,
    })
    .from(rolePermissions);

  const result = emptyByRole();
  for (const row of rows) {
    if (!isPermissionLeafKey(row.areaKey)) continue;
    result[row.role][row.areaKey] = row.level;
  }
  return result;
}
