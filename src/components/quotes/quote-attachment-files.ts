/**
 * ============================================================================
 * 🔴 여기 있는 것은 **엑셀 전용 스위치가 쓰는 것뿐**이다 (조각 3b-1)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(485줄)은 **견적서 파일(결재 PDF · 수기 엑셀)**
 * 화면의 순수 도우미 전부다 — 확장자 허용 목록 · 크기 상한 · 칸 정의 · 파일 이름
 * 다듬기 · 내려받기 주소 · 목록의 파일 딱지 · 미리보기용 PDF 고르기까지. 그것들은
 * **첨부 구역(조각 3d)** 과 **발행(조각 3c)** 의 것이고, 이 저장소에는 아직
 * `queries/attachments.ts` 도 `domain/attachment-allowlist.ts` 도 없다.
 *
 * 편집 폼이 저쪽 파일에서 실제로 쓰는 것은 **엑셀 전용 스위치** 하나다:
 *   · `countQuoteLinesForExcelOnly` · `QuoteLineCounts` — 켜기 전에 셀 줄 수
 *   · `hasQuoteLines` · `describeQuoteLineCounts` — 물어볼지와 물어보는 말
 *   · `planExcelOnlyToggle` · `ExcelOnlyTogglePlan` — 켜고 끌 때 할 일
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 조각 3c·3d 가 올 때 저쪽
 * 나머지를 이 파일에 더하기만 하면 되고, 조각 4 에서 두 벌을 글자로 대조할 수 있다
 * (domain/local/validation.ts 와 같은 판단).
 *
 * 🔴 **아래 함수들을 A/S 와 다르게 고치지 마라** — 엑셀 전용 장의 규칙은 서버가
 * 최종 판정하고(validation/quote-input.ts 의 quoteExcelOnlyFieldErrors, mutation 의
 * 마지막 방어선), 여기 셈이 저쪽과 갈리면 「묻지도 않고 저장이 거절되는」 장이 생긴다.
 * ============================================================================
 */

// ────────────────────────────────────────────────── 엑셀 전용

/**
 * 엑셀 전용 견적서에 **있으면 안 되는 줄**의 수 — 서버 규칙(validation/quote-input.ts 의
 * quoteExcelOnlyFieldErrors)이 세는 그대로다. 줄이 하나라도 있으면 저장이 거절된다.
 *
 * 세는 법은 저장이 거르는 법과 같다: 부품 줄은 품명이나 단가가 적힌 줄(collectFields 가
 * 통째로 빈 줄을 보내지 않는다), 작업 내역은 글자가 있는 줄(검증이 빈 줄을 버린다), 수리
 * 작업은 저장될 그 목록의 줄 수.
 */
export type QuoteLineCounts = { items: number; workScopeLines: number; repairTasks: number };

export function countQuoteLinesForExcelOnly(input: {
  items: readonly { partNameText: string; unitPrice: string }[];
  workScopeTexts: readonly string[];
  repairTaskCount: number;
}): QuoteLineCounts {
  return {
    items: input.items.filter((row) => row.partNameText.trim() !== "" || row.unitPrice.trim() !== "").length,
    workScopeLines: input.workScopeTexts.filter((text) => text.trim() !== "").length,
    repairTasks: input.repairTaskCount,
  };
}

export function hasQuoteLines(counts: QuoteLineCounts): boolean {
  return counts.items + counts.workScopeLines + counts.repairTasks > 0;
}

/** 「부품 2줄 · 작업 내역 5줄 · 수리 작업 1건」 — 0 인 것은 뺀다. */
export function describeQuoteLineCounts(counts: QuoteLineCounts): string {
  const parts: string[] = [];
  if (counts.items > 0) parts.push(`부품 ${counts.items}줄`);
  if (counts.workScopeLines > 0) parts.push(`작업 내역 ${counts.workScopeLines}줄`);
  if (counts.repairTasks > 0) parts.push(`수리 작업 ${counts.repairTasks}건`);
  return parts.join(" · ");
}

/**
 * 엑셀 전용 스위치를 눌렀을 때 할 일 — `T` 는 화면이 들고 있는 줄 묶음(부품 · 작업 내역 ·
 * 손댐 표시 · 고른 수리 작업)이다.
 *
 *  · **켜는데 줄이 있고 아직 묻지 않았다** → 묻는다. 서버는 줄이 있는 엑셀 전용 장을
 *    거절하므로(조용히 지우지 않는다) 켜려면 비워야 한다 — 그 사실을 켜는 순간에 알린다.
 *  · **켠다** → 지금 줄을 `stash` 에 넣고 빈 묶음(`cleared`)으로 바꾼다. 줄이 없어도
 *    넣는다 — 빈 묶음은 「손댄 것」으로 표시돼 양식 기본값이 몰래 다시 채우지 않는다.
 *  · **끈다** → 넣어 둔 줄을 그대로 돌려놓는다(저장 전까지 되돌릴 수 있다). 넣어 둔 것이
 *    없으면(처음부터 엑셀 전용이던 장) 줄은 그대로다.
 */
export type ExcelOnlyTogglePlan<T> =
  | { kind: "ASK_TO_CLEAR"; counts: QuoteLineCounts }
  | { kind: "APPLY"; isExcelOnly: boolean; /** 바꿔 넣을 줄 — null 이면 그대로 둔다. */ lines: T | null; stash: T | null };

export function planExcelOnlyToggle<T>(params: {
  turnOn: boolean;
  counts: QuoteLineCounts;
  confirmedClear: boolean;
  current: T;
  cleared: T;
  stash: T | null;
}): ExcelOnlyTogglePlan<T> {
  if (params.turnOn) {
    if (hasQuoteLines(params.counts) && !params.confirmedClear) {
      return { kind: "ASK_TO_CLEAR", counts: params.counts };
    }
    return { kind: "APPLY", isExcelOnly: true, lines: params.cleared, stash: params.current };
  }
  return { kind: "APPLY", isExcelOnly: false, lines: params.stash, stash: null };
}
