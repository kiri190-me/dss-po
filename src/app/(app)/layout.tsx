import { headers } from "next/headers";
import type { ReactNode } from "react";

import { ServiceMenuBar } from "@dss/ui";

import { AppHeader } from "@/components/AppHeader";
import { AppNav } from "@/components/AppNav";
import SavePopupHost from "@/components/common/SavePopup";
import { requireSession } from "@/lib/auth/guards";
import { portalAppsUrl, thisServiceId } from "@/lib/auth/oidc";
import { listAccessibleAreaKeys } from "@/lib/auth/permission-resolver";
import { RETURN_TO_HEADER } from "@/lib/auth/proxy-rules";
import { readServiceMenu } from "@/lib/auth/service-menu-cookie";
import { filterNavItemsForAccess, navItems } from "@/lib/navigation";

/**
 * 사내 구간. 여기 아래는 전부 세션이 있어야 볼 수 있다.
 *
 * 세션 검증을 이 한 곳에서 하고 각 화면에서 또 하지 않는다 — 화면을 더할
 * 때마다 손으로 적게 하면 언젠가 한 장을 빠뜨린다. 그 대신 **데이터를 바꾸는
 * 서버 액션·API 는 반드시 따로 다시 검증한다.** 레이아웃은 화면을 그릴 때만
 * 돌지, 액션이 불릴 때 도는 것이 아니다.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // 🔴 서버 레이아웃은 **지금 주소가 무엇인지 알 방법이 없다.** 그래서 proxy
  // (src/proxy.ts)가 요청 머리말에 실어 준 것을 받아 넘긴다. 이것이 없으면
  // 쿠키는 있으나 만료·위조된 세션으로 들어온 사람이 — proxy 가 통과시키고
  // 여기서 걸리는 그 경우가 — 가려던 주소를 잃고 첫 화면으로 떨어진다.
  //
  // 🔴 이 값을 믿지 않는다. proxy 가 잡지 않는 주소에서는 브라우저가 보낸 같은
  // 이름의 머리말이 그대로 닿을 수 있다. requireSession 이 받은 값을 반드시
  // safeReturnTo 에 통과시키므로(auth/guards.ts), 밖을 가리키는 주소는
  // 여기까지 와도 첫 화면으로 떨어진다. 이미 있는 함수를 한 번 더 부르는 값은
  // 공짜고, 「우리가 넣었으니 믿는다」는 나중에 깨진다.
  const requestedAddress = (await headers()).get(RETURN_TO_HEADER) ?? undefined;
  const user = await requireSession(requestedAddress);

  // 머리말 **안**에 앉는 서비스 오가기 목록. 포털이 로그인 ID 토큰에 실어 보낸
  // 것을 콜백이 별도 서명 쿠키에 구워 두었다(auth/service-menu-cookie.ts).
  //
  // 쿠키가 없거나 못 믿을 것이면 빈 배열이고, 그때 ServiceMenuBar 는 아무것도
  // 그리지 않는다 — 빈 자리도 남기지 않으므로 머리말이 한 줄 그대로다.
  // 🔴 이 시스템이 포털에 등록되기 전(조각 0c 전)에는 늘 이 상태다. 그래도
  // 로그인은 되어야 한다 — 메뉴바는 곁다리다.
  const services = await readServiceMenu();
  // 「지금 여기」로 눌러 그릴 칸을 고르는 열쇠 — 이 시스템의 client_id 다.
  // 목록이 있을 때만 읽는다(없으면 그릴 칸 자체가 없어 물어볼 것도 없다).
  const currentServiceId = services.length > 0 ? thisServiceId() : null;

  // 화면 메뉴. 🔴 **들어갈 수 있는 것만** 세운다 — 권한 판정은 화면마다의 가드
  // (auth/area-guard.ts)가 따로 하고, 여기서는 같은 창구로 보이는 것을 맞춘다.
  // 둘이 갈리면 「메뉴에 있는데 누르면 막힌다」가 되고, 사용자는 고장으로 여긴다.
  const accessibleNavItems = filterNavItemsForAccess(
    navItems,
    await listAccessibleAreaKeys(user)
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        user={user}
        portalUrl={portalAppsUrl()}
        serviceMenu={
          /*
            사내 시스템 오가기 목록(@dss/ui). 머리말 **위**가 아니라 **안**에
            앉는다(variant="inline") — 위에 회색 띠로 따로 두면 화면 맨 위가 두
            층이 되어 답답하고 본문이 한 줄만큼 줄어든다는 사용자 지적
            (2026-09-18, A/S 와 개선요청이 먼저 같은 결정을 했다) 때문이다.

            그 모습은 **드롭다운 단추 하나**다(@dss/ui — 가로로 늘어놓으니
            폰에서 폭이 모자랐고, 서비스가 늘수록 나빠지는 구조였다). 단추에는
            지금 있는 서비스가 서고(폰은 아이콘만), 누르면 목록이 단추 아래로
            **떠서** 펼쳐진다. 펼치고 접는 것은 `<details>` 라 **자바스크립트
            없이** 된다 — 로그아웃을 평범한 `<form>` 으로 둔 것과 같은 판단이다.
            바깥을 눌러 접기와 Esc 만 묶음 안의 작은 조각(`DropdownDismiss`,
            그것만 `"use client"`)이 **얹는다**.
            🔴 그렇다고 이 파일이나 AppHeader 에 `"use client"` 를 붙이지
            않는다. 딸려 오는 조각은 묶음 안에 있고 이 파일과 무관하다.

            🔴 `className="shrink-0"` 은 **넘기지 않는다**. 이 조각의 className 은
            `<nav>` 에 붙는데, 머리말의 flex 항목은 그 바깥의 래퍼 `<div>` 다 —
            여기에 걸어도 아무 일도 하지 않으면서 읽는 사람만 헷갈리게 한다.
            폭을 정하는 장치는 머리말 쪽의 `shrink-0 mr-auto` 한 겹이다
            (AppHeader.tsx 의 폭 셈).

            🔴 colorScheme 은 넘기지 않는다. 이 사이트는 globals.css 에서
            color-scheme: light 로 고정이고, 기본값 "host" 는 조상에 .dark 가
            있을 때만 어두워지므로 그대로 두는 것이 옳다(@dss/ui README 4절).
          */
          <ServiceMenuBar
            services={services}
            currentServiceId={currentServiceId}
            variant="inline"
          />
        }
      />
      <AppNav items={accessibleNavItems} />
      {/*
        본문. 🔴 **폭 제한이 없다** — 창이 넓으면 넓은 만큼 다 쓴다.

        한때 `mx-auto max-w-[1100px]` 이었다. 글 읽는 화면에는 맞는 값이지만 이
        사이트의 주된 화면은 **아주 넓은 표**다(내자 정리는 한 줄이 51칸) —
        1100px 밖은 늘 흰 여백인 채로 표만 가로로 밀어 보게 되어, 1920px 짜리
        모니터에서 화면의 절반을 버리고 있었다(사용자 지적 2026-09-21).

        🔴 A/S 의 같은 자리(AppShell.tsx 의 <main>)를 **글자로 베끼지 않았다.**
        저쪽은 왼쪽에 사이드바가 있고 <main> 이 그 옆 칸에서 남는 폭을 먹는
        구조라 `min-h-0 flex-1 overflow-y-auto` 가 한 덩이로 뜻을 갖는다(본문만
        따로 스크롤된다). 여기는 사이드바가 없고 메뉴가 머리말 **아래** 가로
        한 줄이라(AppNav.tsx), 스크롤은 예나 지금이나 페이지 전체가 한다 —
        저쪽 클래스를 옮겨 오면 높이 계산이 통째로 달라진다. 이번에 고친 것은
        **폭 제한 한 가지**다.

        🔴 머리말(AppHeader)·메뉴(AppNav)의 같은 못도 함께 뺐다. 셋 중 본문
        하나만 풀면 넓은 화면에서 시스템 이름·메뉴는 가운데 1100px 띠에 남고
        표만 창 끝까지 뻗어 **왼쪽 끝이 서로 어긋난다.** 바깥 틀 셋은 같은
        폭·같은 좌우 여백이라야 한 장으로 보인다.

        여백은 `px-4 py-6 md:px-6` 이다 — 폰은 16px 그대로(머리말의 360px 폭
        셈이 px-4 를 전제로 하고, 좁은 화면에서는 한 칸이라도 본문에 주는 편이
        낫다), 768px 이상에서만 24px 로 벌린다(A/S 의 `p-6` 과 같은 값). 셋 다
        같은 값이라 어느 폭에서도 왼쪽 끝이 맞는다.
      */}
      <main className="w-full flex-1 px-4 py-6 md:px-6">{children}</main>
      {/*
        저장이 끝났다고 알리는 팝업이 서는 자리. 🔴 **여기 한 번만** 붙인다 —
        레이아웃은 화면을 옮겨도 다시 만들어지지 않으므로, 저장한 폼이 사라져도
        팝업은 다음 화면이 그려질 때까지 남는다(lib/domain/save-popup.ts 머리말).
        폼 쪽에 두면 폼이 사라지는 순간 팝업도 함께 사라진다.
      */}
      <SavePopupHost />
    </div>
  );
}
