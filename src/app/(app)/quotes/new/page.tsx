import type { Metadata } from "next";
import { redirect } from "next/navigation";

import QuoteEditForm from "@/components/quotes/QuoteEditForm";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";
import { CABLE_QUOTE_MAX_LINES } from "@/lib/domain/cable-quote-lines";
import { toKstDateOnly } from "@/lib/domain/date-only";

export const metadata: Metadata = {
  title: "새 견적서 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 견적서 한 장 — 새로 만들기 (조각 3b-2)
 * ============================================================================
 * 목록 머리의 [새 견적서] 를 누르면 여기로 온다(`/quotes` 의 newQuoteControl).
 * 빈 폼이 열리고, 채워서 저장하면 새 견적서가 생긴다.
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
 *   · **[새 견적서] 팝업**(`NewQuoteDialog` · `parseNewQuoteStart` 로 실려 오는
 *     `initialKind` · `initialExcelOnly`) — 🔴 **이번에 만들지 않는다**
 *     (2026-09-22 사용자 결정). 그 팝업은 「견적서 종류 · 엑셀 전용」을 먼저
 *     고르게 하는데, 엑셀 전용 스위치가 **엑셀 읽기(3c)와 첨부(3d)** 사슬을
 *     통째로 끌고 온다. 팝업이 없으므로 폼은 지금까지의 기본값(내자 · 엑셀 전용
 *     아님)으로 열리고, 종류는 폼 안에서 고른다.
 *   · **수리 건에서 건너오는 길**(`parseNewQuoteLink` · `returnHrefForNewQuote` —
 *     인수번호와 돌아갈 곳) → **조각 4·5**. 건너올 A/S 의 수리 건 상세가 그때
 *     정해진다. 그래서 `searchParams` 를 아예 받지 않는다 — 읽지 않을 값을
 *     받아 두면 「실려 오는 줄 알았는데 안 쓰던」 자리가 된다.
 *   · **양식 머리말 · 작업 내역 기본값**(`readAllQuoteTemplateHeaders` ·
 *     `readAllQuoteWorkSectionDefaults`) → **조각 3c**. 엑셀 사슬을 끌고 온다.
 *     🔴 그래서 아래에서 `workScopeDefaults={{}}` 를 넘긴다 — 수정 화면과 같다.
 *   · **첨부 칸**(`listQuoteAttachmentSlots`) → **조각 3d**.
 *   · **부품 고르개 목록 둘**(`getPartPickerList` · `getPartPickerUnitPrices`) →
 *     **조각 3b-3**(설계서 F-3).
 *   · **mock 모드 갈래**(`getAuthSource` → `PlaceholderPage`) — 이 사이트에는
 *     mock 모드가 없다.
 *   · **세션 두 걸음**(`readSession` + `resolveActingUserForSession`) —
 *     `requireAreaAccessForCurrentUser` 가 한 걸음으로 한다(조각 1·2 의 판단).
 * ============================================================================
 */
export default async function NewQuotePage() {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · quotes 읽기 권한. 돌려받은 사람으로 곧이어 쓰기 권한을 묻는다 —
  // 세션을 여러 번 읽으면 그 사이에 값이 갈릴 자리가 생긴다.
  const user = await requireAreaAccessForCurrentUser("quotes");

  // 목록 화면과 **같은 관문**이다(permission-resolver.ts) — 거기서 [새 견적서]가
  // 보이는 사람과 여기 들어오는 사람이 어긋나지 않는다.
  if (!(await hasPermission(user, "quotes", "WRITE"))) redirect("/quotes");

  // 장비 종류별 수리 작업 목록과 단가 — 견적서의 작업비가 여기서 나온다.
  const repairLabor = await listRepairLabor();

  return (
    <QuoteEditForm
      /* 🔴 null 이 「새로 만들기」다 — 폼이 저장 때 createQuoteAction 으로 간다. */
      quote={null}
      /* 발행일자의 기본값이 되는 "오늘". 🔴 **서버가 정한다** — 클라이언트에서
         만들면 서버가 그린 것과 달라져 hydration 이 어긋나고, 한국 표준시 대신
         브라우저 시간대로 날짜가 정해진다(자정 전후 하루가 실제로 다르게 나온다). */
      defaultQuoteDate={toKstDateOnly(new Date())}
      repairLabor={repairLabor}
      /* 케이블 견적서의 줄 수 상한. 🔴 임시 상수다 — 조각 3c 가 오면 채우개의
         CABLE_QUOTE_MAX_LINES 로 바꾼다(domain/cable-quote-lines.ts 머리말). */
      cableMaxLines={CABLE_QUOTE_MAX_LINES}
      /* 🔴 **비어 있다** — 위 머리말의 「양식 머리말 · 작업 내역 기본값」 항목.
         종류를 바꿔도 조사 · 통전 칸이 채워지지 않고, 폼이 그 사실을 한 줄로
         알린다(QuoteEditForm 의 WORK_SCOPE_DEFAULTS_MISSING_NOTICE). */
      workScopeDefaults={{}}
    />
  );
}
