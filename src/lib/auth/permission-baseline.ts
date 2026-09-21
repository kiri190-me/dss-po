/**
 * ============================================================================
 * 기본 정책 — 아무도 설정을 만지지 않았을 때의 권한
 * ============================================================================
 * `role_permissions` 표는 **비어 있는 것이 정상 초기 상태**다. 행이 없는
 * (역할, 영역)은 이 파일이 정하는 값을 그대로 따른다(vendor/dss-core 의
 * role-permissions.ts 머리말).
 *
 * 🔴 **A/S 관리 시스템의 `lib/auth/permission-baseline.ts` 와 같은 답을 내야 한다.**
 * 같은 표를 읽는 두 사이트가 같은 사람에게 다른 대답을 하면, 저쪽에서 열린 화면이
 * 여기서 막히거나 — 더 나쁘게는 — 저쪽에서 막힌 조작이 여기서 열린다.
 *
 * ── 🔴 역할 목록을 여기 옮겨 적지 않는다 ────────────────────────────────
 * A/S 와 같은 방식이다: `*-authorization.ts` 를 **호출해서** 구한다. 「영업까지」
 * 같은 목록을 두 벌 적어 두면 한쪽만 고쳐지는 날이 오고, 그때 어느 쪽이 옳은지
 * 답할 방법이 없다.
 *
 * ── 이 사이트에는 하위 기능 트리가 없다 ─────────────────────────────────
 * A/S 에는 `baselineLeafLevel`(잎)과 `baselinePermissionLevel`(메뉴)이 따로 있다.
 * 이 사이트의 영역은 전부 **하위 기능이 없는 잎**이라(permission-areas.ts) 저쪽의
 * `baselineLeafLevel` 이 곧바로 `baselinePermissionLevel` 로 떨어지는 갈래 하나만
 * 남는다 — 그래서 함수도 하나다.
 * ============================================================================
 */
import {
  PERMISSION_AREAS,
  lowerPermissionLevel,
  type PermissionLevel,
} from "./permission-areas";
import {
  canDeleteDomesticOrders,
  canEditDomesticOrders,
  canViewDomesticOrders,
} from "./domestic-order-authorization";
import { canDeleteQuotes, canEditQuotes, canViewQuotes } from "./quote-authorization";
import type { Role } from "./session";

/**
 * 참/거짓 사다리를 수준으로 접는다. 위에서부터 처음 참인 칸이 상한이다 —
 * "관리는 되는데 읽기는 안 된다" 같은 조합은 존재하지 않으므로 순서대로 본다.
 */
function ladder(params: { manage?: boolean; write?: boolean; read: boolean }): PermissionLevel {
  if (params.manage) return "MANAGE";
  if (params.write) return "WRITE";
  if (params.read) return "READ";
  return "NONE";
}

function rawBaseline(areaKey: string, role: Role): PermissionLevel {
  switch (areaKey) {
    case "domesticOrders":
      // 🔴 A/S 의 같은 case 와 **같은 세 줄**이다. 여기서도 역할 목록을 옮겨
      // 적지 않고 *-authorization.ts 를 **호출해서** 구한다(이 파일 맨 위 주석).
      //
      // ⚠️ 이 값은 permission-areas.ts 의 domesticOrders.maxMeaningfulLevel 로
      // **한 번 더 잘린다**(아래 baselinePermissionLevel). 둘 중 하나만 관리로
      // 올리면 상한은 쓰기에 머물고, 휴지통은 누구에게도 열리지 않는다 —
      // A/S 가 실제로 한 번 그 상태였다.
      return ladder({
        manage: canDeleteDomesticOrders(role),
        write: canEditDomesticOrders(role),
        read: canViewDomesticOrders(role),
      });

    case "quotes":
      // 🔴 A/S 의 같은 case 와 **같은 한 줄**이다. 내자 정리와 같은 모양이다 —
      // 만들기·고치기는 영업까지고, 지우고 되살리는 것은 관리자 이상이다. 여기서도
      // 역할 목록을 옮겨 적지 않고 *-authorization.ts 를 **호출해서** 구한다.
      return ladder({ manage: canDeleteQuotes(role), write: canEditQuotes(role), read: canViewQuotes(role) });

    case "repairLabor":
      // 보는 것은 견적서와 같다 — 견적을 내려면 어떤 작업이 얼마인지 알아야 하고,
      // 못 보게 하면 사람은 다시 Excel 을 연다.
      //
      // 고치는 것은 **견적서를 지울 수 있는 사람과 같은 집합**이다. 여기 값을
      // 바꾸면 앞으로의 모든 견적 금액이 바뀌므로 개별 견적서를 고치는 것과
      // 무게가 다르다. write 를 따로 두지 않는 이유는 그 중간이 뜻을 갖지 않기
      // 때문이다(permission-areas.ts 의 같은 항목).
      return ladder({ manage: canDeleteQuotes(role), read: canViewQuotes(role) });

    default:
      // 🔴 모르는 영역은 **닫는다.** A/S 가 이 자리에서 겪은 함정은 그 반대였다 —
      // 영역 하나를 빠뜨려 default 로 떨어지면 최고관리자까지 화면에서 튕긴다.
      // 그래도 닫는 쪽을 고른다: 여는 쪽으로 실패하면 아무도 알아채지 못한다.
      // 영역을 더할 때는 위에 `case` 를 반드시 함께 적는다.
      return "NONE";
  }
}

/**
 * 이 역할이 이 영역에서 가질 수 있는 가장 높은 기본 수준.
 * 영역이 정한 「의미 있는 최고 수준」으로도 한 번 더 자른다.
 */
export function baselinePermissionLevel(areaKey: string, role: Role): PermissionLevel {
  const area = PERMISSION_AREAS.find((candidate) => candidate.key === areaKey);
  if (!area) return "NONE";
  return lowerPermissionLevel(rawBaseline(areaKey, role), area.maxMeaningfulLevel);
}
