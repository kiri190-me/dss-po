import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import QuoteApprovalPanel from "@/components/quotes/QuoteApprovalPanel";
import QuoteEditForm from "@/components/quotes/QuoteEditForm";
import QuoteEditTabs from "@/components/quotes/QuoteEditTabs";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { listQuoteAttachmentSlots } from "@/lib/db/queries/attachments";
import { getPartPickerList, getPartPickerUnitPrices } from "@/lib/db/queries/inventory";
import {
  getQuoteApprovalHistory,
  getQuoteApprovalProgress,
} from "@/lib/db/queries/quote-approvals";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { listRepairLabor } from "@/lib/db/queries/repair-labor";
import {
  getCurrentShipmentApprovalRoute,
  listShipmentApprovalRouteSteps,
} from "@/lib/db/queries/shipment-approval-routes";
import { toKstDateOnly } from "@/lib/domain/date-only";
import {
  QUOTE_APPROVAL_ROUTE_SCOPE,
  isQuoteApprovalRouteInForce,
} from "@/lib/domain/quote-approval-rules";
import { readAllQuoteTemplateHeaders, readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template";
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
 * ── 탭이 둘이다 ────────────────────────────────────────────────────────
 * [견적서 수정] · [견적서 결재](조각 PO 결재-C, 2026-09-28). 이 페이지는 서버
 * 컴포넌트라 탭 상태를 쥘 수 없으므로, 두 화면을 **여기서 그려** 클라이언트
 * 껍데기(QuoteEditTabs)에 넘긴다. 껍데기가 둘을 함께 그리고 안 보이는 쪽만
 * 감춘다 — 🔴 탭을 바꿨다고 편집 폼을 떼어내면 적던 품목·금액이 통째로
 * 사라진다(그 파일의 머리말).
 *
 * 🔴 **결재는 아무 문도 잠그지 않는다**(2026-09-18 사용자 결정 — 설계서 H절).
 * 아래에서 읽는 결재 값은 전부 **표시용**이고, 폼의 저장 길에도 목록의
 * [견적서 받기](api/quotes/[id]/xlsx)에도 닿지 않는다 — 그것은 빠뜨린 것이
 * 아니라 정해진 것이다. 저쪽은 같은 사실을 「발행이 막히지 않는다」로 적는데,
 * 발행은 이 사이트에 아직 없다(조각 3c-3).
 *
 * 🔴 **새 견적서(`/quotes/new`)에는 결재 탭이 없다.** 그 페이지는 이 껍데기를
 * 쓰지 않고 편집 폼을 그대로 그린다 — 아직 저장되지 않아 결재를 걸 대상이 없다.
 *
 * 🔴 **결재선을 만드는 자리는 이 사이트에 없다** — A/S 에서만 한다(2026-09-28
 * 사용자 결정). 여기서는 A/S 가 저장해 둔 판을 **읽기만** 한다.
 *
 * ── 🔴 A/S 의 같은 라우트에서 잘라 온 것 ────────────────────────────────
 * 저쪽은 209줄이다. 여기서 뺀 것:
 *
 *   · **양식 머리말**(`readAllQuoteTemplateHeaders`) → **조각 3f(미리보기)**.
 *     🔴 저쪽에서 그 값을 쓰는 곳은 **미리보기 한 줄**(`printHeaders`)뿐이고 이
 *     사이트의 폼에는 그 프롭이 아예 없다. 그래서 읽지 않는다.
 *     (**작업 내역 기본값**은 3c-1 이 배선했다 — 아래 `workScopeDefaults`.)
 *     ⚠️ 그때의 기록이다 — 🔴 **조각 3f 가 왔다**(2026-09-28). 폼에 `printHeaders`
 *     프롭이 생겼고 [미리보기 · PDF] 가 그 값을 쓴다. 그래서 이제 **읽어서 넘긴다**
 *     (아래 `readAllQuoteTemplateHeaders()`) — 새 견적서 화면과 **같은 값**이다.
 *   · **첨부 칸**(`listQuoteAttachmentSlots`) → 🔴 **조각 3d-4 에 들어왔다**
 *     (2026-09-28 — 아래 `attachmentSlots`). 🔴 **이 화면에만** 있다: 새 견적서
 *     화면(`/quotes/new`)은 그 값을 넘기지 않아 거기에는 첨부 구역이 서지 않는다
 *     (QuoteAttachmentsSection.tsx 머리말의 「배선이 어디까지 왔나」).
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

  // 🔴 여덟을 **함께** 기다린다 — 서로를 쓰지 않으므로 줄줄이 기다릴 까닭이 없다.
  //  · 장비 종류별 수리 작업 목록과 단가 — 견적서의 작업비가 여기서 나온다.
  //  · 양식 다섯의 작업 내역 기본값(조각 3c-1) — 종류를 바꿀 때 조사 · 통전 칸에
  //    들어가는 목록이고, **빈 묶음을 그릴 때도 이 값이 기준**이다. 🔴 DB 가 아니라
  //    양식 `.xlsx` 파일을 읽는다(storage/quote-template.ts). 못 읽어도 빈 목록이다.
  //  · 🔴 **결재 PDF · 수기 엑셀 두 칸**(조각 3d-4) — 칸마다 지금 붙어 있는 파일
  //    (휴지통 것은 빼고). **내부 경로(storedPath)를 싣지 않는 조회**다
  //    (queries/attachments.ts 의 listQuoteAttachmentSlots) — 이 값이 그대로 화면으로
  //    넘어가므로 그 규율이 여기서 값을 한다. 이 값이 폼에 오는 것이 곧
  //    「첨부 구역을 그린다」는 뜻이다(QuoteEditForm 의 attachmentSlots 프롭).
  //  · 부품 고르개의 두 목록(조각 3b-3 뒤쪽 절반) — 품명 칸에서 고를 부품과 그 단가.
  //    🔴 **재고 · 소유구분 · 내부 비고가 없는 가벼운 조회 둘**이다
  //    (queries/inventory.ts 머리말 — 무거운 형제 getPartList 는 옮겨 오지 않았다).
  //  · 🔴 **결재 탭이 그릴 것 셋**(조각 PO 결재-C) — 지금 상태(+ 그 근거인 판 번호
  //    비교), 이력, 그리고 지금 쓰이는 「견적서 승인」 결재선. 🔴 **상태 판정은
  //    여기서 하지 않는다.** getQuoteApprovalProgress 가 도메인 함수 하나
  //    (resolveQuoteApprovalState)로 정해 주고, 화면은 그 답을 그대로 그린다 — 두
  //    곳에서 계산하면 화면은 「승인 완료」라는데 기록은 「낡았다」고 답하는 날이 온다.
  const [
    repairLabor,
    workScopeDefaults,
    printHeaders,
    attachmentSlots,
    partOptions,
    partPrices,
    approvalProgress,
    approvalHistory,
    currentApprovalRoute,
  ] = await Promise.all([
    listRepairLabor(),
    readAllQuoteWorkSectionDefaults(),
    // 🔴 양식 넷의 회사 정보 · 기본 문구 · 계좌 (조각 3f, 2026-09-28) — 쓰는 곳은 폼의
    //    [미리보기 · PDF] 한 줄(activePrintHeader)이다. 🔴 **DB 가 아니라 양식 `.xlsx`
    //    파일을 읽고**, 못 읽어도 던지지 않고 칸이 전부 null 인 머리말이 온다.
    readAllQuoteTemplateHeaders(),
    listQuoteAttachmentSlots(quote.id),
    getPartPickerList(),
    getPartPickerUnitPrices(),
    getQuoteApprovalProgress(quote.id),
    getQuoteApprovalHistory(quote.id),
    getCurrentShipmentApprovalRoute(QUOTE_APPROVAL_ROUTE_SCOPE),
  ]);

  // 🔴 이력의 줄들이 가리키는 **판들**을 한 번에 읽는다. 「n/m단계」의 m 은 그
  // 줄에 적힌 판으로 세야 한다 — 관리자가 A/S 에서 절차를 바꾸면 새 판이 얹히고
  // 진행 중이던 건은 옛 판을 끝까지 따라가므로, 현재 판으로 세면 다 끝난 옛 줄이
  // 아직 사람이 더 남은 것처럼 보인다(listShipmentApprovalRouteSteps 머리말).
  // 가장 최근 줄은 이력의 첫 줄이므로 따로 더할 것이 없다.
  const approvalRouteSteps = await listShipmentApprovalRouteSteps(
    approvalHistory.flatMap((row) => (row.routeId ? [row.routeId] : []))
  );

  return (
    <QuoteEditTabs
      /* 🔴 지금까지의 편집 폼 그대로다 — 탭이 생겼다고 이 조각이 달라지지 않는다.
         탭을 바꿔도 이 폼은 떼어지지 않는다(QuoteEditTabs 머리말). */
      editForm={
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
          /* 양식 넷의 머리말(조각 3f) — [미리보기 · PDF] 가 종류를 바꾸는 순간 그에 맞는
             것으로 갈아 끼운다. 새 견적서 화면과 **같은 값**이다. */
          printHeaders={printHeaders}
          /* 🔴 결재 PDF · 수기 엑셀 두 칸(조각 3d-4). **새 견적서 화면은 이것을 넘기지
             않는다** — 그래서 거기에는 첨부 구역이 서지 않는다(폼의 그 프롭 항목). */
          attachmentSlots={attachmentSlots}
        />
      }
      approvalPanel={
        <QuoteApprovalPanel
          quoteId={quote.id}
          /* 견적서를 이미 읽어 왔으므로 progress 가 null 일 수 없다(그 조회는
             없는 장·휴지통에만 null 이다). 그래도 상태 하나를 기본값으로 둔다 —
             경계를 넘는 값에 `!` 를 붙이지 않는 것이 이 저장소의 관례다. */
          state={approvalProgress?.state ?? "NOT_REQUESTED"}
          latest={approvalProgress?.latest ?? null}
          history={approvalHistory}
          routeSteps={approvalRouteSteps}
          /* 🔴 판이 없거나 단계가 0개면 서버가 요청을 ROUTE_NOT_CONFIGURED 로
             거절한다. 판정을 여기 새로 적지 않고 도메인 함수를 그대로 부른다. */
          isRouteConfigured={isQuoteApprovalRouteInForce(currentApprovalRoute)}
          /* 그릴 것만 골라 넘긴다 — A/S 의 결재선 편집 화면이 쓰는 계정 상태(잠김
             시각 같은)는 이 화면이 보여 줄 것이 아니다. */
          currentRouteSteps={(currentApprovalRoute?.steps ?? []).map((step) => ({
            stepOrder: step.stepOrder,
            approverName: step.approverName,
          }))}
          /* 지정 관문을 판정하는 데 필요한 만큼만. 위 관문 둘을 지나온 사람이다. */
          actingUser={{
            id: user.id,
            role: user.role,
            isDeveloper: user.isDeveloper,
          }}
        />
      }
    />
  );
}
