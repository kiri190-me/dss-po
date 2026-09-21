import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import type { PoUser } from "@/lib/auth/session";

/**
 * 머리말.
 *
 * 서버 컴포넌트다 — "use client" 를 붙이지 않는다. 로그아웃은 서버 액션을
 * 부르는 평범한 <form> 이라 자바스크립트 없이도 동작한다. 사내망에서
 * 스크립트가 늦게 붙는 동안 눌러도 제대로 나가진다.
 *
 * 「통합 로그인으로」 버튼은 포털 앱 런처로 간다. 로그아웃과 다르다 —
 * 세션을 끊지 않으므로 돌아오면 그대로 들어와 있다.
 *
 * ── 🔴 이 한 줄에 무엇이 들어가나 ───────────────────────────────────────
 * 이 줄은 넷을 담는다:
 *
 *   시스템 이름 · 오가기 메뉴바 · 사용자명 · 나가는 단추 둘
 *
 * 🔴 폰(360px)에서 그 넷이 다 들어가지 않는다. 실제 폭(글자 14px, 한글은
 * 한 자가 1em):
 *
 *   바깥 여백 px-4 를 뺀 속폭                                    328px
 *   ─────────────────────────────────────────────────────────────────
 *   시스템 이름 "DSS PO / 내자" (16px)                         ~104px
 *   사용자명 3글자                                               ~42px
 *   「통합 로그인으로」  글자 102 + px-3 24 + 테두리 2          ~128px
 *   「로그아웃」          글자  56 + px-3 24 + 테두리 2          ~82px
 *   메뉴 단추(아이콘만)                                          ~59px
 *   사이 여백 gap-4 두 번 + gap-3 한 번                          ~44px
 *   ─────────────────────────────────────────────────────────────────
 *   합                                                          ~459px
 *
 * 131px 넘친다. 이 머리말에는 `flex-wrap` 이 없으므로(한 줄짜리
 * `justify-between` 이다) 넘치면 줄이 바뀌는 것이 아니라 flex 가 칸을
 * min-content 까지 눌러 **단추 안에서 글자를 접는다** — "통합 / 로그인으로".
 *
 * 그래서 폰에서는 **글자만 알려 주는 두 덩이**를 눈에서 감춘다 — 시스템
 * 이름과 사용자명이다. 둘 다 눌러서 갈 곳이 없는 정보고, 감추면 ~104 + 42 +
 * 여백 = ~174px 이 돌아와 단추 59 + gap 16 + 나가는 단추 둘 222 = 297 ≤ 328
 * 으로 들어간다. (개선요청 dss-improvements 가 같은 셈으로 같은 답을 냈다.
 *  계측기 njlee 는 원래 `flex-wrap` 이고 폰에서 이미 두 줄이라 그쪽은 이름을
 *  되돌렸다 — 저장소마다 답이 다른 이유가 이것이다.)
 *
 * 🔴 「통합 로그인으로」와 「로그아웃」은 감추지 않는다 — 그 둘 말고 이
 * 사이트를 떠날 길이 없다. 폰에서 가장 넓은 자리를 먹는 것이 그 둘이지만,
 * 나가는 길을 화면 밖으로 밀어내서는 안 된다.
 *
 * 🔴 감추는 방식은 `sr-only` 이지 `hidden` 이 **아니다** — 마크업에 그대로
 * 남아 화면 낭독기는 여전히 "DSS PO / 내자" 와 사용자명을 읽는다. 게다가
 * sr-only 는 position:absolute 라 flex 항목에서 통째로 빠진다 — 폭뿐 아니라
 * 앞뒤 여백까지 함께 메뉴바로 간다.
 *
 * 🔴 기준점은 `md:`(=768px) 하나다 — @dss/ui 가 **단추**에서 이름을 감추는
 * 기준과 같은 값이라야 그 사이 폭에서 「이름은 없는데 단추는 글자」인 어정쩡한
 * 상태가 생기지 않는다(service-menu.css 의 `not all and (min-width: 768px)`).
 *
 * 🔴 펼친 목록은 단추 아래로 **떠서**(position: absolute, z-index 50) 그려져
 * 이 머리말 밖으로 나온다. 그래서 이 <header> 와 그 조상(= (app)/layout.tsx 의
 * div, body, html)에 `overflow: hidden` 을 걸면 **목록이 잘려 아무것도 고를 수
 * 없게 된다.** 지금은 한 곳도 없고, 쌓임 맥락을 새로 만드는 것(z-index·
 * transform·filter·isolation)도 없다 — 그대로 두어야 한다.
 *
 * 🔴 역할 뱃지를 달지 않는다. 이 시스템의 역할은 A/S 와 같은 5역할이고, 거기에
 * 무엇을 할 수 있는지는 role_permissions 표가 정한다 — 역할 이름 하나를 머리말에
 * 띄우면 그것이 곧 권한인 것처럼 읽힌다. 기능별 판정은 화면을 옮겨 오는 조각에서
 * 그 화면과 함께 가져온다(lib/auth/guards.ts 머리말).
 */
export function AppHeader({
  user,
  portalUrl,
  serviceMenu = null,
}: {
  user: PoUser;
  portalUrl: string;
  /**
   * 사내 시스템 오가기 목록(@dss/ui 의 ServiceMenuBar). (app)/layout.tsx 가
   * 서버에서 만들어 내려보내고, 이 머리말이 **이름과 사용자명 사이**에 그린다.
   *
   * 조각이 아니라 **다 그려진 노드**를 받는 이유: 이 파일이 @dss/ui 도, 목록을
   * 어디서 구하는지도 몰라야 한다. 그리는 자리만 여기가 정한다(아래
   * `shrink-0 mr-auto` 한 겹 — 그것이 이 줄의 선을 지키는 장치다).
   * 목록이 비면 그 조각이 스스로 null 이라 빈 칸만 남고 아무것도 안 보인다.
   */
  serviceMenu?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3">
        {/*
          시스템 이름. 폰(<768px)에서는 **눈에서만** 감춘다 — 왜인지는 이 파일
          머리말의 폭 계산에 있다. 낭독기에는 그대로 남고, 본문 맨 위에는 화면
          이름이 큰 글씨로 따로 있다.
        */}
        <h1 className="sr-only text-base font-semibold text-slate-900 md:not-sr-only">
          DSS PO / 내자
        </h1>

        {/*
          사내 시스템 오가기 목록. 이름 다음, 사용자명 앞 — 넓은 화면에서
          통째로 비어 있던 가운데 자리다.

          🔴 `shrink-0 mr-auto` 다. `shrink-0` 은 기준 폭을 **제 내용 폭**으로
          둔다 — 폰 59px(아이콘만), 768px 이상 113px 남짓(아이콘 + 이름).
          그리는 것은 `white-space: nowrap` 인 **단추 하나**라 줄어들지 못하므로,
          기준 폭 0 인 칸(`min-w-0 flex-1`)에 넣어 두면 자리가 모자랄 때 단추가
          제 칸 밖으로 삐져나와 사용자명·나가는 단추와 겹친다.

          🔴 `mr-auto` 가 짝이다. 이 줄은 `justify-between` 인데, 항목이 셋이고
          가운데 것이 남는 자리를 먹지 않게 되면 justify-between 이 그 단추를
          **줄 한가운데로 밀어 버린다.** 자동 여백은 justify-content 보다 먼저
          남는 자리를 가져가므로, `mr-auto` 한 낱말이 단추를 이름 바로 옆에
          붙들어 둔다.
        */}
        <div className="shrink-0 mr-auto">{serviceMenu}</div>

        <div className="flex items-center gap-3 text-sm">
          {/*
            누구로 들어와 있는지. 폰에서는 **눈에서만** 감춘다(위와 같은 이유) —
            눌러서 갈 곳이 없는 정보라 좁은 화면에서 가장 먼저 내줄 자리다.
            낭독기는 그대로 읽으므로 「내가 누구로 들어와 있나」를 확인할 길은
            남는다.
          */}
          <span className="sr-only text-slate-600 md:not-sr-only">{user.name}</span>

          {/* 🔴 아래 둘은 폰에서도 감추지 않는다 — 이 사이트를 떠나는 유일한 길이다. */}
          <a
            href={portalUrl}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            통합 로그인으로
          </a>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
