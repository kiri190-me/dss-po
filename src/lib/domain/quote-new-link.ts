import { isQuoteKind, type QuoteKind } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 여기 있는 것은 **[새 견적서] 팝업이 고른 두 값을 나르는 몫**뿐이다 (조각 3e-3)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/domain/quote-new-link.ts`, 271줄 — 2026-09-28 실측)이고,
 * 그 파일은 **두 가지 일**을 한다. 여기 온 것은 **뒤엣것 하나**다.
 *
 * ── 🔴 안 가져온 것 — 수리 건 ↔ 견적서 오가기 ──────────────────────────
 *   `QUOTE_NEW_INTAKE_NUMBER_PARAM` · `QUOTE_NEW_REPAIR_CASE_PARAM` ·
 *   `NewQuoteLink` · `newQuoteHrefForRepairCase` · `parseNewQuoteLink` ·
 *   `returnHrefForNewQuote` · `quoteEditHref` · `trustedLinkedRepairCaseId` ·
 *   `returnHrefForEditQuote` · `quotePrintHref` · `returnHrefForQuotePrint`
 *
 * 까닭 셋:
 *  · 🔴 그것들이 만드는 주소는 `/repair-cases/{id}/quotes` 인데 **이 사이트에는
 *    `/repair-cases` 경로가 없다**(`src/app/(app)/` 아래는 `domestic-orders` ·
 *    `quotes` · `repair-labor` · `no-access` 넷뿐 — 2026-09-28 실측). 그대로
 *    베끼면 **눌러도 아무 데도 없는 링크**를 만드는 코드가 된다.
 *  · 🔴 **PO 의 저장은 PO 의 견적서 목록으로 나간다**(2026-09-28 사용자 원칙).
 *    A/S 상세페이지에서 만든 견적서는 그 건의 「견적서」 탭으로, PO 에서 만든
 *    견적서는 PO 의 목록으로 — **「돌아가기」는 시스템을 건너가지 않는다.**
 *    그래서 이 사이트의 새 견적서 화면에는 수리 건으로 돌아갈 일이 없다.
 *  · 그 몫의 무대(A/S 정리 · 배포)는 **조각 4·5** 에서 정해진다.
 *
 * 🔴 그래서 저쪽이 그 몫 때문에 들여오던 `./repair-case-detail-tabs` 도 따라오지
 * 않는다 — 이 사이트에 없는 파일이다.
 *
 * 🔴 **아래 코드는 A/S 와 바이트 동일하다**(머리말과, 저쪽에만 있는 이름을 가리키던
 * 곁말 한 곳만 이 사이트의 사실로 고쳤다 — `exactValue` 의 「위 firstValue 와 달리」).
 * 조각 4 에서 두 벌을 글자로 대조한다.
 *
 * ============================================================================
 * [새 견적서] 팝업 → 새 견적서. 주소에 덧붙는 두 값 (견적서 ⑤)
 * ============================================================================
 * 목록의 [새 견적서]는 곧바로 작성 화면으로 가지 않고 팝업을 띄운다
 * (components/quotes/NewQuoteDialog.tsx). 거기서 사람이 **견적서 종류**(내자 · OH ·
 * 케이블)와 **엑셀 전용 여부**를 먼저 고르면, [만들기]가 그 두 값을 주소에 덧붙여 작성
 * 화면을 연다 — 폼이 그 값으로 **처음부터** 채워진다.
 *
 * ── 왜 「고른 값」만 싣는가 ─────────────────────────────────────────────
 * 🔴 주소에 싣지 않는 것은 **다른 곳에서 불러와 채울 값**(고객사 · 모델명 · 금액 근거)이다.
 * 그런 값을 링크가 나르기 시작하면 폼을 채우는 길이 둘이 되고, 두 입구가 서로 다른 값을
 * 채우게 되며, 그 차이는 한참 뒤에 **금액으로** 드러난다. 이 두 값은 그런 값이 아니라
 * **사람이 팝업에서 고른 선택**이고, 폼에서도 사람이 고르는 칸 그대로다. 폼은 그 값을
 * 「빈 폼에서 사람이 손으로 고른 것」과 똑같이 받는다(components/quotes/quote-new-start.ts)
 * — 채우는 두 번째 길이 생기지 않는다.
 *
 * ── 정해진 값만 받는다 ──────────────────────────────────────────────────
 * 종류는 `DOMESTIC` · `OVERHAUL` · `CABLE`, 엑셀 전용은 `1` 하나다. 그 밖(소문자 · 앞뒤
 * 공백 · 빈 값 · 같은 이름 두 번)은 **없는 것으로 친다** — 오류가 아니다. 팝업이 만든
 * 주소는 늘 정확한 글자라서, 그 밖의 글자는 사람이 손으로 고친 주소다. 그때 폼은 두 값
 * 없이 `/quotes/new` 로 들어온 것과 똑같이(내자 · 엑셀 전용 아님) 열린다.
 *
 * ── 기존 값은 그대로 둔다 ───────────────────────────────────────────────
 * 덧붙이기는 `baseHref` 에 이미 실려 있는 이름들을 **건드리지 않고** 두 값만 더한다.
 * 🔴 이 사이트의 `baseHref` 는 맨 `/quotes/new` 하나지만 규칙을 그대로 둔다 — 저쪽과
 * 같은 함수라야 조각 4 에서 두 벌을 글자로 대조할 수 있다.
 * ============================================================================
 */

/** Next 의 searchParams 모양. 같은 이름이 두 번 오면 배열이 된다. */
export type SearchParamsInput = Record<string, string | string[] | undefined>;

export const QUOTE_NEW_KIND_PARAM = "kind";
export const QUOTE_NEW_EXCEL_ONLY_PARAM = "excelOnly";
/** 엑셀 전용을 뜻하는 단 하나의 글자. 아니면 이름 자체를 싣지 않는다. */
const QUOTE_NEW_EXCEL_ONLY_ON = "1";

/** 팝업에서 고른 두 값 — [만들기]가 주소에 덧붙인다. 팝업에서는 종류가 늘 하나 골라져 있다. */
export type NewQuoteStartChoice = { kind: QuoteKind; excelOnly: boolean };

/**
 * 주소에서 되읽은 두 값. 종류가 없거나 정해진 값이 아니면 null 이다 — 폼은 그때 지금까지처럼
 * 내자로 연다. 엑셀 전용은 `1` 일 때만 참이다.
 */
export type NewQuoteStart = { kind: QuoteKind | null; excelOnly: boolean };

/**
 * `baseHref`(맨 `/quotes/new` 또는 수리 건 탭이 만든 주소)에 팝업의 두 값을 덧붙인다.
 *
 * 🔴 기존 이름들은 **그대로** 두고 두 이름만 정한다(set). 이미 실려 있으면 바꾼다 — 같은
 * 이름이 둘이 되면 되읽기가 없는 것으로 친다. 엑셀 전용이 아니면 그 이름을 싣지 않는다.
 */
export function newQuoteHrefWithStart(baseHref: string, choice: NewQuoteStartChoice): string {
  // 조각(#…)은 이 화면들이 쓰지 않지만, 있으면 맨 뒤에 그대로 둔다 — 쿼리가 조각 뒤로
  // 붙으면 주소가 아니라 조각의 글자가 된다.
  const hashAt = baseHref.indexOf("#");
  const hash = hashAt < 0 ? "" : baseHref.slice(hashAt);
  const withoutHash = hashAt < 0 ? baseHref : baseHref.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt < 0 ? withoutHash : withoutHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt < 0 ? "" : withoutHash.slice(queryAt + 1));
  params.set(QUOTE_NEW_KIND_PARAM, choice.kind);
  if (choice.excelOnly) params.set(QUOTE_NEW_EXCEL_ONLY_PARAM, QUOTE_NEW_EXCEL_ONLY_ON);
  else params.delete(QUOTE_NEW_EXCEL_ONLY_PARAM);
  return `${path}?${params.toString()}${hash}`;
}

/** 위 두 값을 되읽는다. 없거나 정해진 값이 아니면 「없음」이다 — 오류가 아니다. */
export function parseNewQuoteStart(searchParams: SearchParamsInput | undefined): NewQuoteStart {
  const kind = exactValue(searchParams?.[QUOTE_NEW_KIND_PARAM]);
  return {
    kind: isQuoteKind(kind) ? kind : null,
    excelOnly: exactValue(searchParams?.[QUOTE_NEW_EXCEL_ONLY_PARAM]) === QUOTE_NEW_EXCEL_ONLY_ON,
  };
}

/**
 * 글자 하나로 왔을 때만 그 글자. 배열(같은 이름 두 번)과 없음은 null 이다. 🔴 다듬지 않는다 —
 * 사람이 적는 값이 아니라 **정해진 글자**만 받는다(팝업의 두 값). 🔴 저쪽에는 이 곁에
 * 사람이 적는 값을 다듬어 읽는 형제(`firstValue`)가 있고 그 곁말이 둘을 견준다 — 그 형제는
 * 수리 건 몫(위 「안 가져온 것」)의 것이라 함께 오지 않았다.
 */
function exactValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}
