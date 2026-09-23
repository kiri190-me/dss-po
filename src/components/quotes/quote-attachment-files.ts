/**
 * ============================================================================
 * 🔴 여기 있는 것은 **엑셀 전용 스위치가 쓰는 것과 목록의 배지 셋**이다 (3b-1 · 3c-2 · 3d-0)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(485줄)은 **견적서 파일(결재 PDF · 수기 엑셀)**
 * 화면의 순수 도우미 전부다 — 확장자 허용 목록 · 크기 상한 · 칸 정의 · 파일 이름
 * 다듬기 · 내려받기 주소 · 목록의 파일 딱지 · 미리보기용 PDF 고르기까지. 그것들은
 * **첨부 구역(조각 3d)** 과 **발행(조각 3c-3)** 의 것이다 — 그 가운데
 * `domain/attachment-allowlist.ts`(3d-1b) · `db/queries/attachments.ts`(3d-2, 조회
 * 하나만)는 이미 왔고, **붙이는 칸과 그 화면 도우미**는 3d-3 · 3d-4 것으로 남아 있다.
 *
 * 🔴 **목록의 파일 딱지는 셋 다 와 있다** — 「엑셀 전용」이 2026-09-22(조각 3c-2)에,
 * 「결재 PDF」 · 「엑셀 없음」이 2026-09-23(조각 3d-0)에 왔다. 아래
 * `quoteListFileBadges` 가 그 자리다.
 *
 * 🔴 **나머지 둘도 이 사이트에서 참이다** — 이 사이트와 A/S 는 **같은 `attachments`
 * 표**를 본다(같은 DB). 그래서 PO 에 파일을 붙이는 칸이 오기 전에도 **A/S 에서 붙인
 * 파일이 이 목록에 정확히 잡힌다.** 실측(2026-09-23)으로 견적서 13장 가운데 결재 PDF
 * 가 붙은 것 1장 · 엑셀 전용인데 엑셀이 없는 것 5장이 확인됐다. 아직 오지 않은 것은
 * **붙이는 칸**(조각 3d-3 · 3d-4)이지 **세는 값**이 아니다(값은 목록 조회가 이미
 * 싣는다 — db/queries/quotes.ts 의 `loadAttachmentFlagsByQuoteId`).
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

// ────────────────────────────────────────────────── 목록 표시

/**
 * 목록 한 줄에 붙는 파일 딱지. 🔴 **모양(키 · 이름 · 색조)은 A/S 의 같은 타입 그대로**다
 * (저쪽 `QuoteListFileBadge`) — 두 사이트의 같은 줄이 다른 딱지를 달면 사람이 같은
 * 견적서를 다른 것으로 본다.
 */
export type QuoteListFileBadge = {
  key: "EXCEL_ONLY" | "SIGNED_PDF" | "EXCEL_MISSING";
  label: string;
  /** 마우스를 올리면 뜨는 설명. */
  title: string;
  tone: "info" | "neutral" | "warning";
};

/**
 * ============================================================================
 * 목록 한 줄에 붙이는 표시 — **엑셀 전용 · 결재 PDF · 엑셀 없음** (3c-2 · 3d-0)
 * ============================================================================
 * 붙일 것이 없으면 **빈 배열**이다. 🔴 **일반 견적서 줄에도 「결재 PDF」가 붙는다** —
 * 그래서 「엑셀 전용이 아니면 일찍 돌아가는」 줄이 없다.
 *
 * ── 🔴 나머지 둘이 왜 이 사이트에서도 참인가 ─────────────────────────────
 * 이 사이트와 A/S 는 **같은 `attachments` 표**를 본다(같은 DB). 「결재 PDF」는 그 칸에
 * 파일이 붙어 있는지, 「엑셀 없음」은 엑셀 칸이 비었는지를 실제로 세는데, 그 값은
 * 목록 조회가 이미 싣는다(db/queries/quotes.ts 의 `loadAttachmentFlagsByQuoteId`).
 * 그래서 PO 에 붙이는 칸이 오기 전에도 **A/S 에서 붙인 파일이 그대로 잡힌다** —
 * 실측(2026-09-23)으로 13장 가운데 결재 PDF 1장 · 엑셀 전용인데 엑셀 없음 5장.
 *
 * ── 🔴 이름과 색조는 A/S 와 같고, 이제 곁말 **하나만** 다르다 (3d-2) ─────
 * 딱지 이름 셋과 색조(`info` · `neutral` · `warning`)는 저쪽 그대로다 — 두 사이트의
 * 같은 줄이 다른 딱지를 달면 사람이 같은 견적서를 다른 것으로 본다.
 *
 *  · **「엑셀 전용」** — 🔴 **저쪽 문장으로 돌아왔다**(조각 3d-2). 그 문장이 말하는
 *    「[견적서 받기]가 붙인 엑셀을 내려줍니다」가 이제 **이 사이트에서도 참**이다 —
 *    받기 통로가 갈라져 붙어 있는 엑셀을 그대로 흘려보낸다
 *    (api/quotes/[id]/xlsx/route.ts 의 6번 갈래). 3c-2 가 쓰던 「이 사이트에서는 받을
 *    수 없다」 문장과 그 상수 파일(domain/quote-excel-only-download.ts)은 사라졌다.
 *  · **「엑셀 없음」** — 🔴 **아직 이 사이트의 사실을 말한다.** 저쪽 문장은 「견적서
 *    **수정 화면에서 붙여 주세요**」로 끝나는데, 이 사이트에는 **붙이는 칸이 아직
 *    없다**(조각 3d-3 · 3d-4). 저쪽 문장으로 되돌리면 화면이 거짓말을 한다 — 사람은
 *    없는 칸을 찾아 헤맨다. 그래서 붙일 수 있는 곳(A/S)을 가리킨다.
 *    🔴 **3d-3 · 3d-4 가 그 칸을 가져오는 날 이 곁말도 저쪽 문장으로 돌아간다.**
 *
 * 「결재 PDF」 곁말은 사실을 말할 뿐이라 처음부터 저쪽 그대로다.
 * ============================================================================
 */
export function quoteListFileBadges(row: {
  isExcelOnly: boolean;
  hasSignedPdf: boolean;
  hasExcel: boolean;
}): QuoteListFileBadge[] {
  const badges: QuoteListFileBadge[] = [];
  if (row.isExcelOnly) {
    badges.push({
      key: "EXCEL_ONLY",
      label: "엑셀 전용",
      title: "품목 없이 손으로 만든 엑셀이 곧 보낸 견적서입니다 — [견적서 받기]가 붙인 엑셀을 내려줍니다.",
      tone: "info",
    });
  }
  if (row.hasSignedPdf) {
    badges.push({ key: "SIGNED_PDF", label: "결재 PDF", title: "결재 견적서 PDF 가 붙어 있습니다.", tone: "neutral" });
  }
  if (row.isExcelOnly && !row.hasExcel) {
    badges.push({
      key: "EXCEL_MISSING",
      label: "엑셀 없음",
      title:
        "엑셀 전용인데 수기 견적서 엑셀이 붙지 않아 [견적서 받기]가 내줄 파일이 없습니다. 이 사이트에는 아직 파일을 붙이는 칸이 없어, A/S 관리 시스템에서 붙여 주세요.",
      tone: "warning",
    });
  }
  return badges;
}
