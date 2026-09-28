"use client";

import type { QuoteIssueNoticeLine, QuoteIssueNoticeTone } from "./quote-issue-messages";

/**
 * ============================================================================
 * 🔴 여기 있는 것은 **결과 줄을 그리는 조각 하나**뿐이다 (조각 3e-3)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/QuoteIssueButton.tsx` — 2026-09-28 실측)이고,
 * 그 파일의 본체는 **수정 권한자의 [견적서 받기] 단추**(견적서 B1c)다. 🔴 **그 단추는
 * 오지 않았다** — 누르면 발행 통로를 부르고 사내 공유폴더에 저장하고 「수기 견적서 엑셀」
 * 칸을 바꾸는데, 그 셋이 **조각 3c-3**(발행)의 것이다. 그래서 `QuoteIssueButton`(기본
 * 내보내기) · `QUOTE_ISSUE_BUTTON_TITLE` · `quote-issue-download.ts` 는 이 사이트에 없다.
 *
 * 온 것은 **결과 줄들을 그리는 순수 조각 하나**다:
 *   · `QuoteIssueNoticeLines` — 줄 묶음을 `<ul role="status">` 로 그린다. 서버도 액션도
 *     부르지 않고, 받은 줄을 톤(보통 · 흐림 · 경고)에 맞춰 칠할 뿐이다.
 *
 * 🔴 **왜 지금 오는가** — 「수기 견적서 엑셀로 칸 채우기」의 알림
 * (`QuoteAttachmentParts.tsx` 의 `QuoteExcelAutofillNotice`)이 저쪽에서 이 조각을 쓴다.
 * 알림의 문장은 `quote-excel-autofill.ts` 가 짓고 그 줄의 모양이
 * `QuoteIssueNoticeLine` 이라(조각 3e-2 가 `quote-issue-messages.ts` 를 앞당겨 온 그
 * 까닭), 그리는 곳도 같은 조각이라야 **두 알림이 한 글자도 다르지 않게** 보인다.
 *
 * 🔴 **파일 이름 · 조각 이름 · 파일 안의 차례를 저쪽과 똑같이 둔다** — 조각 3c-3 이 올
 * 때 저쪽 나머지를 이 파일에 더하기만 하면 되고, 조각 4 에서 두 벌을 글자로 대조할 수
 * 있다(quote-new-start.ts · quote-issue-messages.ts 와 같은 판단).
 *
 * 🔴 아래 두 표와 조각은 **A/S 와 바이트 동일**하다 — 다른 것은 이 머리말뿐이다.
 * ============================================================================
 */

const LINE_TONE_CLASS: Record<QuoteIssueNoticeTone, string> = {
  normal: "text-zinc-700 dark:text-zinc-300",
  muted: "text-zinc-400 dark:text-zinc-500",
  warning: "font-medium text-amber-700 dark:text-amber-400",
};

const PAPER_LINE_TONE_CLASS: Record<QuoteIssueNoticeTone, string> = {
  normal: "text-zinc-700",
  muted: "text-zinc-400",
  warning: "font-medium text-amber-700",
};

/** 결과 줄들. 없으면 아무것도 그리지 않는다. 긴 경로도 줄바꿈한다(break-all). */
export function QuoteIssueNoticeLines({
  lines,
  onPaper = false,
  className = "",
}: {
  lines: readonly QuoteIssueNoticeLine[];
  onPaper?: boolean;
  className?: string;
}) {
  if (lines.length === 0) return null;
  const tones = onPaper ? PAPER_LINE_TONE_CLASS : LINE_TONE_CLASS;
  return (
    <ul role="status" className={`flex flex-col gap-0.5 text-xs ${className}`}>
      {lines.map((line, index) => (
        <li key={`${index}-${line.text}`} className={`break-all ${tones[line.tone]}`}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}
