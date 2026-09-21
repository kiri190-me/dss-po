import Link from "next/link";

import type { NavItem } from "@/lib/navigation";

/**
 * 이 사이트의 화면 메뉴 — 머리말 **아래** 한 줄.
 *
 * A/S 관리 시스템은 왼쪽 사이드바에 메뉴 열넷을 세운다. 여기는 세 화면이 전부라
 * (내자 정리 · 견적서 · 작업 비용) 접었다 폈다 할 것이 없고, 가로 한 줄이 폰에서도
 * 그대로 들어간다. 사이드바를 그대로 베끼면 화면 폭의 1/5 을 늘 비워 두게 된다.
 *
 * 🔴 머리말 **안**이 아니라 **아래**다. 머리말 한 줄에는 이미 넷이 앉아 있어
 * (시스템 이름 · 오가기 메뉴바 · 사용자명 · 나가는 단추 둘) 폰에서 자리가 없다 —
 * 그 셈이 AppHeader.tsx 머리말에 적혀 있다.
 *
 * 🔴 들어갈 수 있는 항목만 받는다. 거르는 일은 부르는 쪽(layout)이 권한 창구로
 * 한다 — 이 조각이 권한을 알면 「보이는데 막힌다」를 만들 자리가 하나 더 생긴다.
 *
 * 항목이 하나도 없으면 아무것도 그리지 않는다(줄 하나도 남기지 않는다).
 * 권한이 전혀 없는 사람에게 빈 띠만 보이면 고장으로 읽힌다.
 */
export function AppNav({ items }: { items: readonly NavItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="화면 메뉴"
      className="border-b border-slate-200 bg-white"
    >
      <ul className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-1 px-4 py-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
