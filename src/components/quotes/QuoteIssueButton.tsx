"use client";

import { useState } from "react";
import { runQuoteIssue, type QuoteIssueRunOutcome } from "./quote-issue-download";
import type { QuoteIssueNoticeLine, QuoteIssueNoticeTone } from "./quote-issue-messages";

/**
 * ============================================================================
 * 🔴 단추 본체가 왔다 — 이제 **A/S 와 머리말 아래 바이트 동일**이다 (조각 3c-3)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/QuoteIssueButton.tsx` — 2026-09-28 실측
 * 128줄).
 *
 * ── 이 파일의 내력 ──────────────────────────────────────────────────────
 * 조각 3e-3(2026-09-28)이 **결과 줄 조각 하나**(`QuoteIssueNoticeLines`)만 먼저
 * 가져왔다 — 「수기 견적서 엑셀로 칸 채우기」의 알림이 그 조각을 쓰는데 단추 본체는
 * 발행(공유폴더 · 첨부 칸)과 한 벌이라 함께 올 수 없었다. 🔴 **조각 3c-3 이 그
 * 나머지를 더했다**: `QUOTE_ISSUE_BUTTON_TITLE` 과 기본 내보내기
 * `QuoteIssueButton`, 그리고 그것이 무는 `quote-issue-download.ts`. 3e-3 이 가져온
 * 조각은 **한 글자도 고치지 않았다.**
 *
 * 🔴 아래 머리말의 「세 화면」 가운데 이 사이트에 선 것은 **견적서 수정 화면
 * 하나**다 — 목록은 지금까지처럼 링크(GET …/xlsx)로 받고(QuoteListSlots.tsx),
 * 인쇄 미리보기 화면은 아직 없다(조각 3f). 그래서 `onPaper` 를 참으로 넘기는 곳도
 * 아직 없다 — 프롭은 원본대로 두었다(3f 가 그대로 쓴다).
 *
 * ⚠️ 위 문단은 **그때의 기록**이다. 🔴 **조각 3f 가 왔다**(2026-09-28) — 인쇄
 * 미리보기 화면(`quotes/[id]/print`)과 편집 폼의 겹쳐 뜬 미리보기 둘 다 선다.
 * 🔴 **`onPaper` 를 참으로 넘기는 곳이 생겼다** — `QuotePrintView.tsx` 383줄.
 * 프롭을 원본대로 남겨 둔 것이 값을 했다: 저 화면은 다크 모드에서도 **흰 종이**라
 * (`.qp-root`) 다크 모드 색을 쓰면 종이 위의 글자가 안 보인다. 그 사실을 재는 시험도
 * 이제 이 사이트에 있다(`QuoteIssueButton.test.tsx` 의 「흰 종이 위(onPaper)에서는
 * 다크 모드 색을 쓰지 않는다」). 🔴 **이 사이트에 선 화면은 이제 셋이다.**
 *
 * ⚠️ 위 문단들은 **그때의 기록**이다 — 🔴 **지금 이 단추를 그리는 화면이 하나도 없다**
 * (2026-10-07, 아래 머리말).
 * ============================================================================
 */

/**
 * ============================================================================
 * 발행 단추 · 결과 줄 (견적서 B1c)
 * ============================================================================
 * 🔴 **이 단추를 그리는 화면이 지금은 없다**(2026-10-07). 세 화면(목록, 편집 화면, 인쇄
 * 미리보기)이 쓰던 수정 권한자의 [견적서 받기]를 없앴다 — 공유폴더 저장과 엑셀 칸 넣기는
 * [저장]이 하고(server/actions/quotes.ts), 받는 길은 **사내 공유폴더 하나**다(목록 줄의
 * [Excel 보기] · 수정 화면 머리의 [폴더 열기]가 그 폴더를 연다). 발행 통로와 서비스는
 * 살아 있어 이 조각도 그대로 둔다 — 정리할지는 사람이 따로 정한다.
 *
 * 🔴 **아래 QuoteIssueNoticeLines 는 지금도 쓰인다** — 결재 PDF 올리기(QuoteAttachmentsSection ·
 * QuoteAttachmentParts)와 [폴더 열기]가 같은 모양의 결과 줄을 그린다.
 *
 * 단추를 누르면 runQuoteIssue(quote-issue-download.ts)가 발행 통로를 부르고, 파일을 저장하고,
 * 무엇이 됐는지 줄로 돌려준다. 서버 통로도 quotes WRITE 를 스스로 다시 본다.
 *
 * 결과 줄은 단추 아래에 그리거나(showNotice 기본), 부르는 쪽이 onOutcome 으로 받아 제자리에
 * 그린다.
 *
 * 앱 양식 미리보기는 다크 모드에서도 흰 종이다(QuotePrintView 의 .qp-root) — `onPaper` 면
 * dark: 색을 쓰지 않는다. 안 그러면 흰 바탕에 밝은 회색 글자가 된다.
 *
 * 서버 액션을 부르지 않는다 — `server-only` 사슬 없이 그려 볼 수 있다(QuoteIssueButton.test.tsx).
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

/** 단추에 마우스를 올리면 보이는 설명 — 링크(보기 권한자)와 하는 일이 다르다는 것. */
export const QUOTE_ISSUE_BUTTON_TITLE = "내려받으면서 사내 공유폴더에 저장하고, 수기 견적서 엑셀 칸에도 넣습니다";

export default function QuoteIssueButton({
  quoteId,
  label,
  className,
  title = QUOTE_ISSUE_BUTTON_TITLE,
  hasUnsavedChanges = false,
  disabled = false,
  showNotice = true,
  onPaper = false,
  onOutcome,
}: {
  quoteId: string;
  label: string;
  className: string;
  title?: string;
  /** 🔴 편집 화면 — 마지막 저장값과 지금 폼 값이 다르다. 참이면 통로를 부르지 않는다. */
  hasUnsavedChanges?: boolean;
  disabled?: boolean;
  /** 결과 줄을 단추 아래에 그린다. 부르는 쪽이 제자리에 그리면 거짓. */
  showNotice?: boolean;
  onPaper?: boolean;
  onOutcome?: (outcome: QuoteIssueRunOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<QuoteIssueNoticeLine[]>([]);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setLines([]);
    try {
      // 저장하지 않은 변경이 있으면 runQuoteIssue 가 통로를 부르지 않고 「먼저 [저장]」을 돌려준다.
      const outcome = await runQuoteIssue({ quoteId, hasUnsavedChanges });
      setLines(outcome.lines);
      onOutcome?.(outcome);
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      aria-busy={busy}
      title={title}
      data-quote-issue=""
      className={className}
    >
      {busy ? "받는 중…" : label}
    </button>
  );

  if (!showNotice) return button;
  return (
    <div className="inline-flex max-w-[22rem] flex-col items-end gap-1">
      {button}
      <QuoteIssueNoticeLines lines={lines} onPaper={onPaper} className="text-right" />
    </div>
  );
}
