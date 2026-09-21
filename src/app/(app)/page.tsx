import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/guards";
import { listAccessibleAreaKeys } from "@/lib/auth/permission-resolver";
import { RETURN_TO_HEADER } from "@/lib/auth/proxy-rules";
import { filterNavItemsForAccess, landingHref, navItems } from "@/lib/navigation";

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 첫 화면 — 들어오면 **내자 정리**가 떠 있다
 * ============================================================================
 * 사용자 결정(2026-09-21): "PO/내자에 들어오면 내자정리가 띄워져 있도록 해줘".
 * 전에는 여기에 "위 메뉴에서 화면을 고르세요"라는 빈 안내판이 있었다 — 날마다
 * 여는 화면이 정해져 있는데 들어올 때마다 한 번씩 더 누르게 했다.
 *
 * ── 🔴 왜 되돌기(redirect)인가 — 루트에 그대로 그리지 않는 까닭 ──────────
 * 「/ 에서 내자 정리 화면을 그냥 그린다」도 길이지만, 셋 다 걸린다:
 *
 *  1. 🔴 **저장이 화면에 안 비친다.** 내자 정리의 서버 액션은 저장한 뒤
 *     `revalidatePath("/domestic-orders")` 하나만 부른다
 *     (lib/server/actions/domestic-orders.ts). 같은 화면이 `/` 에도 그려져
 *     있으면 그 사본은 무효가 되지 않아, 루트로 들어온 사람은 **방금 제가 고친
 *     값이 안 바뀐 채로** 보게 된다. 경로 둘을 다 부르게 고치는 길도 있지만,
 *     그건 화면을 하나 더할 때마다 잊으면 조용히 깨지는 규칙이 하나 느는 일이다.
 *  2. 주소가 둘이 된다. `/domestic-orders` 는 A/S 와 **같은 값으로 못 박아 둔**
 *     주소이고(그쪽 화면 머리말), 메뉴 항목의 href 도 그 값이다. 같은 화면이 두
 *     주소에 있으면 북마크·링크·「지금 여기」 표시가 서로 다른 말을 한다.
 *  3. 가드와 여섯 갈래 조회를 그대로 한 벌 더 적게 된다 — 한쪽만 고쳐지는 날이 온다.
 *
 * 되돌기의 값은 요청 한 번이 더 도는 것뿐이고, 그 대신 **화면이 사는 곳은 언제나
 * 한 군데**로 남는다.
 *
 * ── 🔴 무한 되돌기가 나지 않는 까닭 ─────────────────────────────────────
 * 이 저장소에서 가장 흔한 사고가 그것이라 길을 하나씩 짚어 둔다:
 *
 *   로그아웃 상태로 `/` 를 연다
 *     → proxy(src/proxy.ts)가 세션 쿠키가 없는 것을 보고 `/api/auth/sso/start`
 *       로 보낸다. 🔴 가려던 주소가 "/" 면 returnTo 를 아예 붙이지 않는다
 *       (auth/proxy-rules.ts 의 loginStartTarget — "/" 는 되돌아갈 기본값이라
 *       실을 것이 없다).
 *     → 포털에서 로그인하고 콜백이 "/" 로 돌려보낸다.
 *     → 그때는 쿠키가 있으므로 proxy 가 통과시키고, 이 화면이 `/domestic-orders`
 *       로 한 번 더 보낸다.
 *     → `/domestic-orders` 는 **누구에게도 `/` 로 되돌리지 않는다.** 여기서 길이
 *       끝난다.
 *
 * 권한이 모자란 사람도 고리에 들어가지 않는다. 그런 사람은 애초에
 * `/domestic-orders` 로 보내지지 않는다 — 아래 landingHref 가 **들어갈 수 있는
 * 항목만** 받아서 고르기 때문이다. 하나도 없으면 null 이고, 그때는 되돌리지
 * 않고 이 자리에서 사정을 적는다.
 *
 * ── 세션 ────────────────────────────────────────────────────────────────
 * 상위 레이아웃((app)/layout.tsx)도 requireSession 을 부르지만, 여기서도 부른다 —
 * 이 화면은 **그 사람의 권한을 읽어** 갈 곳을 정하므로 제 손에 사람이 있어야
 * 한다. 가려던 주소를 proxy 머리말에서 받아 넘기는 것은 레이아웃·가드와 같은
 * 방식이고, 받은 값은 requireSession 이 반드시 safeReturnTo 에 통과시킨다.
 * ============================================================================
 */
export default async function HomePage() {
  const requestedAddress = (await headers()).get(RETURN_TO_HEADER) ?? undefined;
  const user = await requireSession(requestedAddress);

  // 🔴 메뉴·안내 화면과 **같은 창구**로 거른다(lib/navigation.ts). 거르는 규칙이
  // 여러 곳에 있으면 한쪽만 고쳐지는 날 「메뉴에는 없는데 첫 화면은 거기로
  // 간다」가 된다.
  const accessibleItems = filterNavItemsForAccess(navItems, await listAccessibleAreaKeys(user));
  const target = landingHref(accessibleItems);

  // 🔴 redirect() 는 예외를 던져 흐름을 끊는다 — try/catch 안에 넣지 않는다.
  if (target) redirect(target);

  // 여기까지 온 사람은 이 사이트의 어느 화면도 열려 있지 않은 계정이다. 빈 화면을
  // 보여 주면 고장으로 읽히므로, 막힌 사정과 누구에게 무엇을 요청해야 하는지를
  // 적어 준다(/no-access 와 같은 말투 — 그 화면은 「어느 메뉴가 막혔는지」를
  // 말하는 자리라 여기서 부를 수 없다. 막힌 것이 특정 메뉴 하나가 아니다).
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900">PO / 내자</h1>
      <p className="text-sm text-slate-600">
        지금 계정에 열려 있는 화면이 없습니다.
      </p>
      <p className="text-sm text-slate-600">
        관리자에게 <strong>A/S 관리 시스템 &gt; 사용자 관리 &gt; 역할별 접근 권한</strong>
        에서 화면을 열어 달라고 요청해 주세요. 두 시스템이 같은 설정을 봅니다.
      </p>
    </div>
  );
}
