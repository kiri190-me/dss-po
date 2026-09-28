import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QuotePrintView from "@/components/quotes/QuotePrintView";
import { requireAreaAccessForCurrentUser } from "@/lib/auth/area-guard";
import { hasPermission } from "@/lib/auth/permission-resolver";
import { getQuoteForEdit } from "@/lib/db/queries/quotes";
import { listQuoteAttachmentSlots } from "@/lib/db/queries/attachments";
import { excelOnlyPrintAttachments } from "@/components/quotes/quote-attachment-files";
import { isValidQuoteId } from "@/lib/validation/quote-input";
import { readAllQuoteTemplateHeaders, readQuoteWorkSections } from "@/lib/storage/quote-template";
import {
  QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE,
  canRenderQuoteDocument,
} from "@/lib/domain/quote-document-support";
import { quoteTemplateKey } from "@/lib/domain/quote-template-variant";
import { isRepairSectionDropped } from "@/lib/domain/quote-work-scope-suppression";

export const metadata: Metadata = {
  title: "견적서 미리보기 | DSS PO / 내자",
};

export const dynamic = "force-dynamic";

/**
 * ============================================================================
 * 견적서 미리보기 · PDF.
 * ============================================================================
 * 🔴 조각 3f 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/app/(app)/quotes/[id]/print/page.tsx` — 2026-09-28 실측
 * 157줄)에서 가져왔다. 다른 것은 아래 셋뿐이다.
 *
 * ── 🔴 다른 것 ① 문지기 — 네 걸음이 두 걸음이다 ─────────────────────────
 * 저쪽은 `requireAreaAccessForCurrentUser` → `getAuthSource()`(mock 저장 모드) →
 * `readSession()` → `resolveActingUserForSession()` 이다. 이 사이트는
 * `requireAreaAccessForCurrentUser("quotes")` 가 **사람까지 돌려주고**, mock 저장
 * 모드가 없다. 그래서 그 하나로 접고 `canIssue` 는 그 사람으로 바로 잰다 — 목록
 * 화면(`quotes/page.tsx`)의 `canEdit` 과 **같은 모양**이다.
 *
 * ── 🔴 다른 것 ② `PlaceholderPage` 를 안 가져왔다 ───────────────────────
 * 저쪽의 `components/layout/PlaceholderPage.tsx`(20줄)는 이 사이트에 없다. 그것이
 * 쓰이던 두 자리 중 **mock 저장 모드 갈래는 ① 때문에 사라졌고**, 남은 한 자리(앱
 * 양식이 없는 종류)는 같은 마크업을 이 파일 안에 그대로 적었다(아래
 * `UnsupportedPrintPage`). 파일 하나를 더 옮기지 않으려고 **문장도 클래스도 저쪽과
 * 같게** 두었다.
 *
 * ── 🔴 다른 것 ③ 돌아갈 곳은 **언제나 그 견적서**다 ──────────────────────
 * 저쪽은 `returnHrefForQuotePrint(searchParams, quote)` 로 「수리 건에서 왔으면
 * 그리로」를 가른다. 🔴 **그 함수는 이 사이트에 없다** — 조각 3e-3 이 「수리 건
 * 오가기」(quote-new-link.ts 의 Ⓐ 몫)를 일부러 빼 두었고, 이 사이트에는
 * `/repair-cases/{id}/quotes` 라는 화면 자체가 없다(2026-09-28 원칙 — 「돌아가기는
 * 시스템을 건너가지 않는다」). 없는 화면으로 가는 주소를 지어내면 사람이 404 로
 * 떨어진다. 그래서 `backHref` 는 `/quotes/{id}` 하나다.
 * 🔴 **그 탓에 `searchParams` 를 아예 받지 않는다** — 읽어서 안 쓰면 다음 사람이
 * 「왜 안 쓰나」를 다시 판단해야 한다. `quote-list-screen-source.test.ts` 의
 * 「수리 건 이름이 이 저장소 어디에도 없다」 울타리가 이 사실을 지킨다.
 *
 * ── 읽기 권한이면 된다 ──────────────────────────────────────────────────
 * 아무것도 바꾸지 않고 이미 저장된 값을 보여 줄 뿐이라, 목록에서 그 견적서를 볼
 * 수 있는 사람이면 미리보기도 열 수 있는 것이 맞다 — xlsx 라우트와 같은 판단이다.
 * 수정 화면(`/quotes/{id}`)이 쓰기 권한을 요구하는 것과 여기가 갈리는 이유이기도
 * 하다: 그쪽은 저장할 수 없는 폼을 그려 주지 않으려는 것이고, 이쪽은 볼 수 있는
 * 것을 보여 주는 일이다.
 *
 * 단 [받기] 단추만은 권한으로 갈린다(2026-09-15 견적서 B1c) — 수정 권한자의 받기는 공유폴더에
 * 저장하고 엑셀 칸을 바꾸는 부작용이 있어 발행 통로(POST)이고, 보기 권한자는 지금까지의
 * 링크다(아래 canIssue).
 *
 * 지워진 장은 없는 것이다(getQuoteForEdit 이 is_deleted 로 좁힌다) — 휴지통에
 * 넣은 견적서를 주소만으로 계속 뽑을 수 있으면 휴지통이 뜻을 잃는다.
 *
 * ── 🔴 접수 건의 「견적서」 탭은 이 사이트에 없다 ─────────────────────────
 * 저쪽은 여기에 「주소에 그 건의 id 가 실려 오면 돌아가기가 그 건으로 간다」를
 * 적어 두었다. 이 사이트에는 그 탭도 그 화면도 없다 — 위 ③ 을 볼 것.
 */

/**
 * 앱 양식이 없는 종류를 만났을 때의 한 장. 🔴 저쪽 `PlaceholderPage` 의 마크업
 * **그대로**다(위 ②) — 그 파일을 옮기지 않으려고 여기 적었을 뿐이고, 글자도
 * 클래스도 바꾸지 않았다.
 */
function UnsupportedPrintPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 🔴 구역 문을 지나면서 **사람까지 받는다**(위 ①) — 아래 canIssue 가 이 사람으로 갈린다.
  const user = await requireAreaAccessForCurrentUser("quotes");

  const { id } = await params;
  if (!isValidQuoteId(id)) notFound();

  const quote = await getQuoteForEdit(id);
  if (!quote) notFound();

  /**
   * 🔴 **앱 양식이 아직 없는 종류는 그리지 않는다** (2026-09-16 케이블 ③).
   *
   * 이 화면은 내자 · OH 양식의 모양을 그린다. 케이블 견적서를 그대로 그리면 **다른 종류의
   * 문서**가 화면에 뜨고, 그대로 인쇄 · PDF 로 나간다 — 편집 화면에서 단추를 감춰도 이 주소를
   * 직접 여는 길이 남아 여기서 막는다(받기 통로 둘과 **같은 판정**,
   * domain/quote-document-support.ts).
   *
   * 🔴 `notFound()` 로 보내지 않는다 — 그 장은 목록에 멀쩡히 있고 수정 화면도 열린다.
   * 「없다」고 하면 사람은 자기가 지운 줄 안다. 까닭과 다음 차례를 글자로 말한다.
   * (엑셀 전용 장은 앱 양식 대신 결재 PDF 를 보이므로 종류와 무관하게 지나간다.)
   */
  if (!canRenderQuoteDocument(quote)) {
    return <UnsupportedPrintPage title="견적서 미리보기" description={QUOTE_DOCUMENT_UNSUPPORTED_MESSAGE} />;
  }

  /**
   * [견적서 받기]는 두 갈래다(2026-09-15 견적서 B1c). 🔴 이 화면은 보기 권한만 있어도 열리므로
   * 여기서 가른다 — 수정 권한자(quotes WRITE)에게만 발행 단추(POST /api/quotes/{id}/issue:
   * 공유폴더 저장 · 엑셀 칸 교체)를 주고, 나머지는 지금까지의 링크(GET …/xlsx)다. 목록
   * 화면(quotes/page.tsx)의 canEdit 과 같은 계산이다. 화면을 그리기 위한 값일 뿐 관문이
   * 아니다 — 발행 통로가 세션 · 권한을 스스로 다시 본다.
   */
  const canIssue = await hasPermission(user, "quotes", "WRITE");

  // 회사 정보·기본 문구·계좌는 **양식에서** 읽는다(코드에 두지 않는다).
  // 양식을 못 읽어도 미리보기는 떠야 한다 — 값만 빈 채로 그린다. 정본이
  // 필요하면 Excel 을 받으면 되고, 그쪽은 자기 오류를 따로 알려 준다.
  //
  // 🔴 **이 견적서에 맞는 양식**의 문구를 쓴다(장비 종류 × 견적서 종류).
  // 넷의 기본 문구가 다르고, 특히 납기가 전부 갈린다
  // (domain/quote-template-variant.ts).
  const templateKey = quoteTemplateKey(quote.laborEquipmentKind, quote.kind);

  /**
   * 작업 내역 세 묶음. **빈 묶음은 양식의 기본 목록으로 그린다** — 파일도 정확히
   * 그 규칙으로 나간다(xlsx/quote-sheet-layout.ts 의 '빈 묶음은 양식 그대로
   * 둔다'). 이 기능이 생기기 전에 저장된 견적서는 작업 내역이 전부 비어 있어서,
   * 규칙을 안 맞추면 화면에는 아무것도 없고 파일에는 표준 7줄이 적힌 서로 다른
   * 문서가 된다.
   */
  const [headers, workSections, excelOnlySlots] = await Promise.all([
    readAllQuoteTemplateHeaders(),
    readQuoteWorkSections(templateKey, quote.workScopeLines),
    // 엑셀 전용 장만 파일 칸을 읽는다 — 앱 양식 대신 결재 PDF 를 보이기 때문이다
    // (QuotePrintView 의 엑셀 전용 갈래). 일반 견적서는 조회 하나 늘지 않고 지금 그대로다.
    quote.isExcelOnly ? listQuoteAttachmentSlots(quote.id) : Promise.resolve(null),
  ]);
  const header = headers[templateKey];
  const excelOnly = excelOnlySlots ? excelOnlyPrintAttachments(excelOnlySlots) : null;

  // 🔴 돌아갈 곳은 **언제나 그 견적서**다(위 ③). 저쪽은 여기서
  // `returnHrefForQuotePrint(searchParams, quote)` 로 수리 건을 가르는데, 이 사이트에는
  // 그 함수도 그 화면도 없다 — 사이트를 건너가는 주소를 한 줄도 짓지 않는다.
  const backHref = `/quotes/${quote.id}`;

  // 제너레이터에서 수리 작업을 하나도 고르지 않았으면 「② 수리 작업」을 그리지
  // 않는다 — xlsx 라우트가 같은 함수로 그 구역을 지운다(둘이 같은 종이여야 한다).
  const repairSectionDropped = isRepairSectionDropped({
    equipmentKind: quote.laborEquipmentKind,
    chosenRepairTaskCount: quote.repairTasks.length,
  });

  /**
   * 🔴 `...quote` 가 **종류 · 특이사항 · 품목 표 전체(itemLines)** 까지 함께 싣는다 —
   * 케이블 견적서를 케이블 양식의 모양으로 그리는 데 쓰이는 셋이다(QuotePrintData 의 그
   * 항목, 2026-09-17 케이블 ④). 넘기는 값을 손으로 골라 적기 시작하면 그날 그 셋이 빠진다.
   */
  return (
    <QuotePrintView
      quote={{ ...quote, repairSectionDropped }}
      header={header}
      workSections={workSections}
      quoteId={quote.id}
      backHref={backHref}
      signedPdf={excelOnly?.signedPdf ?? null}
      hasExcel={excelOnly?.hasExcel}
      canIssue={canIssue}
    />
  );
}
