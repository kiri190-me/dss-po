"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isNavItemActive } from "@/lib/navigation";

/**
 * 머리말에 늘어서는 화면 이동 단추 하나 — **알약 모양**이고, 지금 보고 있는
 * 화면이면 짙게 칠한다.
 *
 * 본보기는 휴가 관리(dss-leave)의 같은 이름 파일이다(사용자 지정 2026-09-21 —
 * "휴가관리에서 메뉴바 안에 버튼들이 있었던 것 처럼 만들어줘").
 *
 * ── 🔴 왜 "use client" 인가 ─────────────────────────────────────────────
 * `usePathname()` 때문이다. 지금 주소는 **브라우저만 안다** — 서버 컴포넌트는
 * 알 방법이 없다(머리말이 proxy 가 실어 준 머리말 값을 받아 쓰는 것과 같은
 * 사정: (app)/layout.tsx 주석). 🔴 그렇다고 이 조각을 쓰는 AppHeader 나
 * AppNav 에 `"use client"` 를 붙이지 않는다 — 경계는 **이 파일 하나**다.
 * 저쪽으로 번지면 로그아웃 `<form>` 과 머리말 전체가 자바스크립트 없이는
 * 안 되는 것이 된다(AppHeader.tsx 머리말의 같은 판단).
 *
 * ── 🔴 색만으로 말하지 않는다 ───────────────────────────────────────────
 * `aria-current="page"` 를 함께 붙인다. 짙은 칠은 눈으로 보는 사람에게만 닿고,
 * 화면 낭독기·고대비 모드에서는 세 단추가 똑같이 읽힌다.
 *
 * ── 🔴 색은 이 저장소의 것을 쓴다 ───────────────────────────────────────
 * 휴가 관리는 `bg-slate-900` 이지만 여기서는 **`bg-primary-900`** 이다. 이
 * 사이트에는 사내 강조색 램프가 globals.css 에 따로 실려 있고(A/S 와 값이 글자
 * 하나까지 같다), 옮겨 온 화면들의 저장 단추가 전부 `bg-primary-900
 * hover:bg-primary-800 text-white` 다(DomesticOrderListScreen · RepairLaborScreen).
 * 여기만 slate 로 두면 같은 화면 안에서 짙은 단추 색이 두 가지가 된다.
 * (지금 두 값은 #18181b 와 #0f172a 로 눈에는 거의 같지만, 강조색을 바꾸는 날
 *  한쪽만 따라 움직이게 된다.)
 *
 * 꺼진 단추의 회색은 slate 그대로다 — 머리말·메뉴의 나머지 회색이 전부 slate 라
 * (border-slate-200 · text-slate-700 · hover:bg-slate-100) 여기만 zinc 계열로
 * 두면 같은 줄에서 회색이 갈린다.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  // 판정은 순수 함수가 갖는다(lib/navigation.ts) — 이 조각은 브라우저 훅을
  // 끌고 와서 시험이 닿을 수 없다. 앞부분 일치로 켜는 까닭도 거기 적혀 있다.
  const active = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-md bg-primary-900 px-3 py-1.5 text-sm font-medium text-white"
          : "rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }
    >
      {children}
    </Link>
  );
}
