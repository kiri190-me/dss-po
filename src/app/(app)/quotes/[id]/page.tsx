import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import QuoteEditForm from "@/components/quotes/QuoteEditForm";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";
import { CABLE_QUOTE_MAX_LINES } from "@/lib/domain/cable-quote-lines";
import { toKstDateOnly } from "@/lib/domain/date-only";
import { isValidQuoteId } from "@/lib/validation/quote-input";

export const metadata: Metadata = {
  title: "견적서 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 견적서 한 장 — 수정 (조각 3b-1)
 * ============================================================================
 * 목록에서 줄을 누르면 여기로 온다(`/quotes` 의 rowHref).
 *
 * ── 못 찾는 것과 못 보는 것을 갈라 답하지 않는다 ────────────────────────
 * 지워진 장, 없는 id, 형식이 틀린 id 는 전부 404 다. "그 id 는 실재하지만
 * 지워졌다"처럼 갈라 답하면, 볼 자격이 없는 사람이 어떤 견적서가 존재하는지
 * 알아낼 수 있게 된다.
 *
 * 볼 수는 있지만 고칠 수 없는 사람은 목록으로 돌려보낸다. 목록은 조회 권한만으로
 * 열리므로 그 사람도 여기까지 올 수 있고, 읽기 전용 상세 화면은 없다 — 저장할 수
 * 없는 폼을 그려 주고 마지막에 거절하는 것보다 낫다.
 *
 * 🔴 **화면이 감춘 것은 경계가 아니다.** 아래 redirect 는 편의이고, 실제 저장은
 * `updateQuoteAction` 이 세션부터 다시 확인한다(그 파일 머리말).
 *
 * ── 🔴 A/S 의 같은 라우트에서 잘라 온 것 ────────────────────────────────
 * 저쪽은 209줄이고 탭이 둘이다([견적서 수정] · [견적서 결재]). 여기서 뺀 것:
 *
 *   · **결재 탭**(QuoteEditTabs · QuoteApprovalPanel · 결재 조회 넷) → **조각 3e**.
 *     🔴 그때 지킬 것: 탭을 바꿨다고 편집 폼을 **떼어내지 않는다** — 적던 품목 ·
 *     금액이 통째로 사라진다(A/S QuoteEditTabs.tsx 머리말). 그리고 🔴 **결재는
 *     발행을 막지 않는다**(2026-09-18 사용자 결정 — 설계서 H절).
 *   · **양식 머리말 · 작업 내역 기본값**(`readAllQuoteTemplateHeaders` ·
 *     `readAllQuoteWorkSectionDefaults`) → **조각 3c**. 엑셀 사슬을 끌고 온다.
 *     🔴 그래서 아래에서 `workScopeDefaults={{}}` 를 넘긴다 — 폼이 빈 목록으로
 *     곱게 무너지고, 화면이 그 사실을 한 줄로 알린다(QuoteEditForm 머리말 ④).
 *   · **첨부 칸**(`listQuoteAttachmentSlots`) → **조각 3d**.
 *   · **부품 고르개 목록 둘**(`getPartPickerList` · `getPartPickerUnitPrices`) →
 *     **조각 3b-3**(설계서 F-3 — 그 파일을 A/S 로 먼저 옮긴다).
 *   · **돌아갈 곳**(`returnHrefForEditQuote`) → **조각 3b-2 · 4**. 지금은 늘
 *     `/quotes` 다.
 *   · **mock 모드 갈래**(`getAuthSource`) — 이 사이트에는 mock 모드가 없다.
 *   · **세션 두 걸음**(`readSession` + `resolveActingUserForSession`) —
 *     `requireAreaAccessForCurrentUser` 가 한 걸음으로 한다(조각 1·2 의 판단).
 * ============================================================================
 */
export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // 🔴 이 한 줄이 셋을 한다: 통합로그인(가려던 주소를 실어서) · 살아 있는 계정
  // 다시 읽기 · quotes 읽기 권한. 돌려받은 사람으로 곧이어 쓰기 권한을 묻는다 —
  // 세션을 여러 번 읽으면 그 사이에 값이 갈릴 자리가 생긴다.
  const user = await requireAreaAccessForCurrentUser("quotes");

  const { id } = await params;
  // 형식이 틀린 id 로 DB 를 때리지 않는다 — uuid 가 아닌 값은 조회 자체가 오류다(22P02).
  if (!isValidQuoteId(id)) notFound();

  // 목록 화면과 **같은 관문**이다(permission-resolver.ts) — 거기서 [수정]이 보이는
  // 사람과 여기 들어오는 사람이 어긋나지 않는다.
  if (!(await hasPermission(user, "quotes", "WRITE"))) redirect("/quotes");

  const quote = await getQuoteForEdit(id);
  // 🔴 지워진 장 · 없는 장 · **아직 다루지 못하는 종류**가 전부 여기서 null 이다
  // (getQuoteForEdit 의 관문). 종류를 접어 열면 다른 종류의 양식으로 문서가 나간다.
  if (!quote) notFound();

  // 장비 종류별 수리 작업 목록과 단가 — 견적서의 작업비가 여기서 나온다.
  const repairLabor = await listRepairLabor();

  return (
    <QuoteEditForm
      quote={quote}
      defaultQuoteDate={toKstDateOnly(new Date())}
      repairLabor={repairLabor}
      /* 케이블 견적서의 줄 수 상한. 🔴 임시 상수다 — 조각 3c 가 오면 채우개의
         CABLE_QUOTE_MAX_LINES 로 바꾼다(domain/cable-quote-lines.ts 머리말). */
      cableMaxLines={CABLE_QUOTE_MAX_LINES}
      /* 🔴 **비어 있다** — 위 머리말의 「양식 머리말 · 작업 내역 기본값」 항목. */
      workScopeDefaults={{}}
    />
  );
}
