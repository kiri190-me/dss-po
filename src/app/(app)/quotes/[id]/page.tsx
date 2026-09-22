import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import QuoteEditForm from "@/components/quotes/QuoteEditForm";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { getPartPickerList, getPartPickerUnitPrices } from "@/lib/db/queries/inventory";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";
import { toKstDateOnly } from "@/lib/domain/date-only";
import { readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template";
import { isValidQuoteId } from "@/lib/validation/quote-input";
import { CABLE_QUOTE_MAX_LINES } from "@/lib/xlsx/cable-quote-template";

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
 *   · **양식 머리말**(`readAllQuoteTemplateHeaders`) → **조각 3f(미리보기)**.
 *     🔴 저쪽에서 그 값을 쓰는 곳은 **미리보기 한 줄**(`printHeaders`)뿐이고 이
 *     사이트의 폼에는 그 프롭이 아예 없다. 그래서 읽지 않는다.
 *     (**작업 내역 기본값**은 3c-1 이 배선했다 — 아래 `workScopeDefaults`.)
 *   · **첨부 칸**(`listQuoteAttachmentSlots`) → **조각 3d**.
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

  // 🔴 넷을 **함께** 기다린다 — 서로를 쓰지 않으므로 줄줄이 기다릴 까닭이 없다.
  //  · 장비 종류별 수리 작업 목록과 단가 — 견적서의 작업비가 여기서 나온다.
  //  · 양식 다섯의 작업 내역 기본값(조각 3c-1) — 종류를 바꿀 때 조사 · 통전 칸에
  //    들어가는 목록이고, **빈 묶음을 그릴 때도 이 값이 기준**이다. 🔴 DB 가 아니라
  //    양식 `.xlsx` 파일을 읽는다(storage/quote-template.ts). 못 읽어도 빈 목록이다.
  //  · 부품 고르개의 두 목록(조각 3b-3 뒤쪽 절반) — 품명 칸에서 고를 부품과 그 단가.
  //    🔴 **재고 · 소유구분 · 내부 비고가 없는 가벼운 조회 둘**이다
  //    (queries/inventory.ts 머리말 — 무거운 형제 getPartList 는 옮겨 오지 않았다).
  const [repairLabor, workScopeDefaults, partOptions, partPrices] = await Promise.all([
    listRepairLabor(),
    readAllQuoteWorkSectionDefaults(),
    getPartPickerList(),
    getPartPickerUnitPrices(),
  ]);

  return (
    <QuoteEditForm
      quote={quote}
      defaultQuoteDate={toKstDateOnly(new Date())}
      repairLabor={repairLabor}
      /* 품명 칸에서 찾아 고를 부품과 그 단가(조각 3b-3 뒤쪽 절반). 고르개 자체는
         공용 묶음에 한 벌로 있고(@dss/core/ui/inventory/part-picker), 값을 실어
         보내는 일만 이 사이트가 한다 — 그 묶음은 DB 에 접속하지 않는다. */
      partOptions={partOptions}
      partPrices={partPrices}
      /* 케이블 견적서의 줄 수 상한 — **채우개의 상수를 그대로 내려보낸다**(조각 3c-1).
         그 파일은 `node:fs` · `node:zlib` 를 끌고 와 클라이언트 묶음에 들어갈 수 없어서,
         서버 컴포넌트인 이 페이지가 읽어 넘긴다(폼의 cableMaxLines 항목). */
      cableMaxLines={CABLE_QUOTE_MAX_LINES}
      /* 양식의 작업 내역 기본값(조각 3c-1) — 새 견적서 화면과 **같은 값**이다. */
      workScopeDefaults={workScopeDefaults}
    />
  );
}
