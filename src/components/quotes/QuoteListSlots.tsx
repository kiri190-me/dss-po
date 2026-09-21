"use client";

import type { ComponentProps } from "react";

import QuoteListScreen from "@dss/core/ui/quotes/QuoteListScreen";

/**
 * ============================================================================
 * 🔴 목록 화면의 **함수 슬롯**은 여기서 건다 — 서버에서는 못 건넨다
 * ============================================================================
 * 조각 3b-1 에서 `rowHref`(줄을 눌러 여는 곳)를 채우려고 `page.tsx` 에서 곧바로
 * 넘겼더니 화면이 이 오류로 통째로 죽었다(2026-09-21 눈 확인에서 잡았다):
 *
 *     Functions cannot be passed directly to Client Components unless you
 *     explicitly expose it by marking it with "use server".
 *
 * `page.tsx` 는 **서버 컴포넌트**이고 목록 화면은 `"use client"` 다. 그 경계를
 * 넘는 값은 직렬화되어야 하는데 **평범한 함수는 직렬화되지 않는다.** 휴지통
 * 액션 셋이 그대로 넘어가는 것은 그것이 **서버 액션**(`"use server"`)이라서다 —
 * 같은 「함수」처럼 보이지만 전혀 다른 물건이다.
 *
 * 🔴 **`tsc` 도 `lint` 도 이것을 잡지 못한다.** 타입으로는 맞고, 브라우저에서
 * 화면을 열어야 드러난다. 그래서 이 파일이 있다.
 *
 * ── 🔴 뒤 조각들도 여기로 온다 ──────────────────────────────────────────
 * 화면의 슬롯 일곱 중 **함수 넷**이 전부 이 경계에 걸린다:
 *
 *     rowHref           줄을 눌러 여는 곳            ← 조각 3b-1 (아래, 채웠다)
 *     intakeHref        인수번호를 눌러 가는 곳       ← 조각 4·5
 *     renderFileBadges  줄의 파일 딱지               ← 조각 3d
 *     renderRowActions  줄의 [미리보기]·[받기]        ← 조각 3c·3f
 *
 * 🔴 **그 셋도 `page.tsx` 가 아니라 여기에 건다.** 저기서 넘기면 화면이 똑같이
 * 죽는다. 남은 셋(`newQuoteControl` · `notice` 는 ReactNode, `emptyMessage` 는
 * 글자)은 서버에서 넘겨도 된다 — 지금처럼 `page.tsx` 에 둔다.
 *
 * ── 🔴 이 조각은 자료를 모른다 ──────────────────────────────────────────
 * 받은 프롭을 그대로 흘려보내고 **함수 슬롯만 얹는다.** 조회도 권한 판정도
 * `page.tsx` 가 하고(서버), 저장은 서버 액션이 세션부터 다시 본다. 여기서 보는
 * `canEdit` 은 **링크를 걸지 말지**를 정할 뿐이다 — 관문이 아니다.
 *
 * 🔴 **서브모듈(vendor/dss-core)은 손대지 않는다.** 그 화면은 A/S 의 수리 건
 * 상세 [견적서] 탭도 쓰게 될 한 벌이고, 사이트마다 다른 주소를 그 안에 적으면
 * 「한 벌」이 깨진다(설계서 F절 5번 · 그쪽 README 4절).
 * ============================================================================
 */

/** 화면이 받는 프롭에서 **이 조각이 채우는 함수 슬롯**만 뺀 나머지. */
type PassThroughProps = Omit<
  ComponentProps<typeof QuoteListScreen>,
  "rowHref" | "intakeHref" | "renderFileBadges" | "renderRowActions"
>;

export default function QuoteListSlots(props: PassThroughProps) {
  return (
    <QuoteListScreen
      {...props}
      /**
       * 🔴 조각 3b-1 — **줄을 누르면 편집 폼이 열린다.**
       *
       * 고칠 수 없는 사람에게는 링크를 걸지 않는다(null → 화면이 글자로 그린다).
       * 그 주소(`/quotes/[id]`)가 쓰기 권한자만 들여보내고 목록으로 되돌리므로,
       * 눌러서 되돌려지는 링크를 내미는 것은 「왜 안 되지」가 되기 때문이다.
       *
       * 🔴 **그것은 관문이 아니다.** 실제 저장은 `updateQuoteAction` 이 세션부터
       * 다시 확인한다 — 링크를 감추는 것으로 막았다고 여기면, 주소를 직접 여는
       * 요청 앞에서 아무것도 막지 못한다.
       */
      rowHref={(row) => (props.canEdit ? `/quotes/${row.id}` : null)}
    />
  );
}
