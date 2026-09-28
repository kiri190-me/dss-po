import type { Metadata } from "next";
import { redirect } from "next/navigation";

import QuoteEditForm from "@/components/quotes/QuoteEditForm";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { getPartPickerList, getPartPickerUnitPrices } from "@/lib/db/queries/inventory";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";
import { toKstDateOnly } from "@/lib/domain/date-only";
import { parseNewQuoteStart, type SearchParamsInput } from "@/lib/domain/quote-new-link";
import { readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template";
import { CABLE_QUOTE_MAX_LINES } from "@/lib/xlsx/cable-quote-template";

export const metadata: Metadata = {
  title: "새 견적서 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 견적서 한 장 — 새로 만들기 (조각 3b-2 · 3e-3)
 * ============================================================================
 * 목록 머리의 [새 견적서] 를 누르면 **팝업**이 뜨고, 거기서 [만들기]를 누르면 여기로
 * 온다(`/quotes` 의 newQuoteControl → QuoteListSlots 의 `NewQuoteControl`).
 * 팝업에서 고른 **견적서 종류 · 엑셀 전용 여부**가 주소에 덧붙어 오고, 폼은 그 값으로
 * 채워진 채 열린다. 아무것도 실려 오지 않으면 지금까지의 빈 폼 그대로다.
 *
 * 🔴 **폼도 저장도 이미 있던 것이다.** 만들기와 고치기는 **같은 컴포넌트**이고
 * (`QuoteEditForm` — `quote={null}` 이면 만들기다), 저장은 `createQuoteAction` 이
 * 3b-1 부터 들어와 있었다. 이 파일이 하는 일은 **그 둘 사이의 라우트 하나**다.
 *
 * ── 화면이 감춘 것은 경계가 아니다 ──────────────────────────────────────
 * 목록은 고칠 수 없는 사람에게 [새 견적서] 를 그리지 않지만, 그것은 막은 것이
 * 아니다 — 주소를 직접 입력하면 그대로 들어와진다. 그래서 여기서 영역 가드에
 * 더해 쓰기 권한까지 확인하고, 없으면 목록으로 돌려보낸다(수정 화면과 **같은
 * 두 줄**이다). 실제 저장은 `createQuoteAction` 이 세션부터 다시 확인한다 —
 * 관문이 셋이라는 뜻이 아니라, 화면이 감춘 것은 애초에 관문이 아니라는 뜻이다.
 *
 * ── 🔴 A/S 의 같은 라우트에서 잘라 온 것 ────────────────────────────────
 * 저쪽은 123줄이고 Promise.all 에 조회 다섯이 걸려 있다. 여기서 뺀 것:
 *
 *   · ⚠️ **[새 견적서] 팝업**(`NewQuoteDialog` · `parseNewQuoteStart` 로 실려 오는
 *     `initialKind` · `initialExcelOnly`) — 그때(2026-09-22)의 기록이다. 미룬
 *     까닭은 엑셀 전용 스위치가 **엑셀 읽기(3c)와 첨부(3d)** 사슬을 통째로 끌고
 *     오기 때문이었고, 🔴 **그 사슬이 조각 3e-1·3e-2 로 다 왔다.** 그래서
 *     **조각 3e-3 이 팝업을 들여왔다** — 이제 목록의 [새 견적서]는 팝업을 띄우고,
 *     이 화면은 그 두 값을 `parseNewQuoteStart` 로 읽어 폼에 넘긴다(아래).
 *   · **수리 건에서 건너오는 길**(`parseNewQuoteLink` · `returnHrefForNewQuote` —
 *     인수번호와 돌아갈 곳) → **조각 4·5**. 건너올 A/S 의 수리 건 상세가 그때
 *     정해진다. 🔴 **그 함수들은 이 저장소에 아예 없다**(quote-new-link.ts 머리말의
 *     「안 가져온 것」) — 그것들이 짓는 주소 `/repair-cases/{id}/quotes` 가 이
 *     사이트에 없는 화면이기 때문이다.
 *     🔴 그래서 `searchParams` 로 읽는 것은 **팝업의 두 값뿐**이고, 저장 뒤에
 *     나가는 곳도 늘 **이 사이트의 견적서 목록**이다(`returnHref` 를 넘기지
 *     않는다 → 폼의 `returnHref ?? "/quotes"`). 2026-09-28 사용자 원칙 —
 *     「PO 에서 저장을 누르면 PO 시스템의 견적서 탭으로 나온다」.
 *   · **양식 머리말**(`readAllQuoteTemplateHeaders`) → **조각 3f(미리보기)**.
 *     🔴 저쪽에서 그 값을 쓰는 곳은 **미리보기 한 줄**(`printHeaders`)뿐이고 이
 *     사이트의 폼에는 그 프롭이 아예 없다. 그래서 읽지 않는다 — 양식 다섯을 더
 *     여는 값을 아무도 안 보는 채로 실어 보내지 않는다.
 *     (**작업 내역 기본값**은 3c-1 이 배선했다 — 아래 `workScopeDefaults`.)
 *   · **첨부 칸**(`listQuoteAttachmentSlots`) → **조각 3d**.
 *   · **mock 모드 갈래**(`getAuthSource` → `PlaceholderPage`) — 이 사이트에는
 *     mock 모드가 없다.
 *   · **세션 두 걸음**(`readSession` + `resolveActingUserForSession`) —
 *     `requireAreaAccessForCurrentUser` 가 한 걸음으로 한다(조각 1·2 의 판단).
 * ============================================================================
 */
export default async function NewQuotePage({
  searchParams,
}: {
  /** 팝업이 덧붙인 두 값만 읽는다(parseNewQuoteStart). 없으면 지금까지의 빈 폼이다. */
  searchParams?: Promise<SearchParamsInput>;
}) {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · quotes 읽기 권한. 돌려받은 사람으로 곧이어 쓰기 권한을 묻는다 —
  // 세션을 여러 번 읽으면 그 사이에 값이 갈릴 자리가 생긴다.
  const user = await requireAreaAccessForCurrentUser("quotes");

  // 목록 화면과 **같은 관문**이다(permission-resolver.ts) — 거기서 [새 견적서]가
  // 보이는 사람과 여기 들어오는 사람이 어긋나지 않는다.
  if (!(await hasPermission(user, "quotes", "WRITE"))) redirect("/quotes");

  // 🔴 넷을 **함께** 기다린다 — 서로를 쓰지 않으므로 줄줄이 기다릴 까닭이 없다.
  //  · 장비 종류별 수리 작업 목록과 단가 — 견적서의 작업비가 여기서 나온다.
  //  · 양식 다섯의 작업 내역 기본값(조각 3c-1) — 종류를 바꿀 때 조사 · 통전 칸에
  //    들어가는 목록이다. 🔴 **DB 가 아니라 양식 `.xlsx` 파일을 읽는다**
  //    (storage/quote-template.ts). 못 읽어도 던지지 않고 빈 목록이다.
  //  · 부품 고르개의 두 목록(조각 3b-3 뒤쪽 절반) — 품명 칸에서 고를 부품과 그 단가.
  //    🔴 **재고 · 소유구분 · 내부 비고가 없는 가벼운 조회 둘**이다
  //    (queries/inventory.ts 머리말 — 무거운 형제 getPartList 는 옮겨 오지 않았다).
  const [repairLabor, workScopeDefaults, partOptions, partPrices] = await Promise.all([
    listRepairLabor(),
    readAllQuoteWorkSectionDefaults(),
    getPartPickerList(),
    getPartPickerUnitPrices(),
  ]);

  /*
   * [새 견적서] 팝업이 고른 두 값(조각 3e-3). 🔴 **정해진 글자만 받는다** — 그 밖은
   * 없는 것으로 치고 폼은 지금까지처럼 내자 · 엑셀 전용 아님으로 연다(오류가 아니다).
   * 🔴 조회 뒤에 읽는다 — 관문이 먼저이고, 이 값은 아무 문도 열지 않는다.
   */
  const start = parseNewQuoteStart(searchParams ? await searchParams : undefined);

  return (
    <QuoteEditForm
      /* 🔴 null 이 「새로 만들기」다 — 폼이 저장 때 createQuoteAction 으로 간다. */
      quote={null}
      /* 발행일자의 기본값이 되는 "오늘". 🔴 **서버가 정한다** — 클라이언트에서
         만들면 서버가 그린 것과 달라져 hydration 이 어긋나고, 한국 표준시 대신
         브라우저 시간대로 날짜가 정해진다(자정 전후 하루가 실제로 다르게 나온다). */
      defaultQuoteDate={toKstDateOnly(new Date())}
      repairLabor={repairLabor}
      /* 품명 칸에서 찾아 고를 부품과 그 단가(조각 3b-3 뒤쪽 절반). 고르개 자체는
         공용 묶음에 한 벌로 있고(@dss/core/ui/inventory/part-picker), 값을 실어
         보내는 일만 이 사이트가 한다 — 그 묶음은 DB 에 접속하지 않는다. */
      partOptions={partOptions}
      partPrices={partPrices}
      /* 케이블 견적서의 줄 수 상한 — **채우개의 상수를 그대로 내려보낸다**(조각 3c-1).
         그 파일은 `node:fs` · `node:zlib` 를 끌고 와 클라이언트 묶음에 들어갈 수 없어서,
         서버 컴포넌트인 이 페이지가 읽어 넘긴다(폼의 cableMaxLines 항목). 숫자를 화면에
         다시 적으면 양식이 바뀌는 날 한쪽만 고쳐진다. */
      cableMaxLines={CABLE_QUOTE_MAX_LINES}
      /* 양식의 작업 내역 기본값(조각 3c-1). 종류 · 장비 종류를 바꾸면 폼이 여기서
         그 양식 몫을 꺼내 조사 · 통전 칸을 채운다(quote-new-start.ts 의
         scopeLinesFilledFromTemplate — 손댄 묶음은 건드리지 않는다). */
      workScopeDefaults={workScopeDefaults}
      /* 🔴 팝업에서 고른 두 값(조각 3e-3). **처음 값만 바꾸지 않는다** — 폼은 빈 폼에서
         사람이 ① 종류 select 를 고르고 ② 엑셀 전용 스위치를 켠 것과 **같은 상태**로 연다
         (quote-new-start.ts 의 startNewQuoteLines). 폼에서 그대로 바꿀 수 있다. */
      initialKind={start.kind}
      initialExcelOnly={start.excelOnly}
    />
  );
}
