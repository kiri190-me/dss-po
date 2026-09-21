import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireSession } from "./guards";
import { getPermissionLevel, type PermissionActor } from "./permission-resolver";
import { meetsPermissionLevel, type PermissionLevel } from "./permission-areas";
import { RETURN_TO_HEADER } from "./proxy-rules";
import type { PoUser } from "./session";

/**
 * ============================================================================
 * 메뉴 진입 가드
 * ============================================================================
 * 메뉴에서 항목을 감추는 것은 막은 것이 아니다 — 주소를 직접 입력하거나 예전
 * 링크를 누르면 그대로 들어와진다. 그래서 권한이 걸린 화면마다 이 함수를 한 줄
 * 부른다. grep 한 번으로 "어느 화면이 무엇을 요구하는지"가 다 보인다.
 *
 * 🔴 A/S 관리 시스템의 `lib/auth/area-guard.ts` 와 같은 자리다. 다른 점은 둘이다:
 *
 *  1. **로그인 판정을 제 손으로 하지 않는다.** 이 사이트에는 이미 그 자리가 있다 —
 *     `auth/guards.ts` 의 requireSession 이 매 요청 users 한 행을 다시 읽고
 *     (정지·삭제·잠김·포털이 끊은 세션까지 본다), 없으면 통합로그인으로 보낸다.
 *     여기서 흉내 내면 두 판정이 갈리는 날이 온다.
 *
 *  2. 🔴 **가려던 주소를 지킨다.** proxy(src/proxy.ts)가 요청 머리말에 실어 준
 *     주소를 그대로 requireSession 에 넘긴다. 이것이 없으면 「로그인 안 된 채로
 *     작업 비용 주소를 열면 로그인 뒤 그 화면에 도착한다」가 깨진다 — 화면 틀
 *     ((app)/layout.tsx)과 이 가드가 **같은 요청에서 나란히** 돌 수 있어서,
 *     둘 중 어느 쪽이 먼저 걸려도 같은 주소를 실어야 한다.
 *     받은 값은 requireSession 이 반드시 safeReturnTo 에 통과시킨다.
 *
 * 막힐 때 첫 화면으로 조용히 보내지 않고 안내 화면(/no-access)으로 보낸다.
 * 이유를 모른 채 튕기면 사용자는 고장으로 여기고, 관리자는 무엇을 풀어 줘야
 * 하는지 알 수 없다.
 * ============================================================================
 */

/** 리다이렉트 없이 가부만 묻는다 — 한 화면 안에서 일부만 감출 때 쓴다. */
export async function hasAreaAccess(
  areaKey: string,
  actor: PermissionActor,
  required: PermissionLevel = "READ"
): Promise<boolean> {
  return meetsPermissionLevel(await getPermissionLevel(actor, areaKey), required);
}

/**
 * 화면 한 줄짜리 가드. 세션이 없으면 통합로그인으로(가려던 주소를 싣고),
 * 권한이 모자라면 안내 화면으로 보낸다.
 *
 * 통과하면 **그 사람**을 돌려준다 — 화면이 곧이어 `hasPermission` 으로 「고칠 수
 * 있는가」를 한 번 더 묻기 때문이다. 여기서 돌려주지 않으면 화면이 세션을 다시
 * 읽게 되고, 그 사이에 두 번 읽은 값이 갈릴 자리가 생긴다.
 */
export async function requireAreaAccessForCurrentUser(
  areaKey: string,
  required: PermissionLevel = "READ"
): Promise<PoUser> {
  const requestedAddress = (await headers()).get(RETURN_TO_HEADER) ?? undefined;
  const user = await requireSession(requestedAddress);

  const level = await getPermissionLevel(user, areaKey);
  if (!meetsPermissionLevel(level, required)) {
    redirect(`/no-access?area=${encodeURIComponent(areaKey)}`);
  }
  return user;
}
