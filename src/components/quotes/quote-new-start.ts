import type { QuoteWorkScopeSection } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 여기 있는 것은 **양식 기본값으로 채우는 함수 하나**뿐이다 (조각 3b-1)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일은 **[새 견적서] 팝업이 건네준 처음 값**으로 빈
 * 폼을 여는 일(`startNewQuoteLines` · `BLANK_NEW_QUOTE_KIND` · `NewQuoteStartState`)이
 * 본체이고, 그것은 `domain/quote-new-link.ts`(팝업의 주소 읽기)와
 * `quote-attachment-files.ts` 의 엑셀 전용 계획을 함께 끌고 온다. **새 견적서는
 * 조각 3b-2** 다 — 이 사이트에는 아직 `/quotes/new` 라우트도 팝업도 없다.
 *
 * 편집 폼이 저쪽 파일에서 실제로 쓰는 것은 하나다:
 *   · `scopeLinesFilledFromTemplate` — 종류 · 장비 종류 select 의 onChange 가
 *     조사 · 통전 칸을 그 양식의 기본 목록으로 채울 때(QuoteEditForm 의
 *     fillScopeFromTemplate).
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 조각 3b-2 가 올 때 저쪽
 * 나머지를 이 파일에 더하기만 하면 되고, 조각 4 에서 두 벌을 글자로 대조할 수 있다
 * (domain/local/validation.ts · useSectionEditSubmit.ts 와 같은 판단).
 *
 * 🔴 **아래 함수를 A/S 와 다르게 고치지 마라** — 같은 양식 기본값으로 채우는 두
 * 벌이 갈리면, 같은 견적서가 두 화면에서 다른 작업 내역을 들고 열린다.
 *
 * ── 🔴 지금 이 함수는 늘 빈 목록을 채운다 ──────────────────────────────
 * 기본값(`workScopeDefaults`)을 읽어 오는 곳은 `lib/storage/quote-template.ts` 인데
 * 그 하나가 엑셀 사슬 7,800여 줄을 끌고 온다 — **조각 3c** 다. 그때까지 편집 폼은
 * 빈 `{}` 를 받고, 아래 `defaults[section]?.items ?? []` 가 빈 목록으로 곱게
 * 무너진다(QuoteEditForm 머리말의 같은 항목).
 * ============================================================================
 */

/** 양식 하나의 작업 내역 기본값에서 여기서 쓰는 것만(A/S storage/quote-template.ts 의 QuoteWorkScopeSectionView). */
export type QuoteTemplateScopeDefaults = Partial<Record<QuoteWorkScopeSection, { items: readonly string[] }>>;

/**
 * 종류 · 장비 종류를 고를 때 **양식의 기본 목록**으로 채우는 묶음. 「2) 수리 작업」은 양식이
 * 아니라 **고른 수리 작업**이 채운다(QuoteEditForm 의 fillRepairScopeFrom).
 */
export const TEMPLATE_FILLED_SCOPE_SECTIONS: readonly QuoteWorkScopeSection[] = ["INVESTIGATION", "POWER_TEST"];

/**
 * 조사 · 통전 칸을 그 양식의 기본 목록으로 채운 줄 묶음. 🔴 **손댄 묶음은 건드리지 않는다** —
 * 종류를 바꿀 때마다 덮으면 적어 둔 문장이 소리 없이 사라진다(QuoteEditForm 의 scopeTouched).
 */
export function scopeLinesFilledFromTemplate<Row>(
  prev: Record<QuoteWorkScopeSection, Row[]>,
  touched: Record<QuoteWorkScopeSection, boolean>,
  defaults: QuoteTemplateScopeDefaults,
  toRows: (texts: readonly string[]) => Row[]
): Record<QuoteWorkScopeSection, Row[]> {
  const next = { ...prev };
  for (const section of TEMPLATE_FILLED_SCOPE_SECTIONS) {
    if (touched[section]) continue;
    next[section] = toRows(defaults[section]?.items ?? []);
  }
  return next;
}
