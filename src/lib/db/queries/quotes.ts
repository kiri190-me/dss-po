import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { attachments, quoteItems, quotes, repairCases } from "@dss/core/schema";
import { db } from "@/lib/db";
import {
  buildQuoteSummaryLine,
  isQuoteAmountItemLine,
  quoteSupplyAmountOf,
  type QuoteAmountLine,
} from "@/lib/domain/quote-list";

/**
 * ============================================================================
 * 견적서 — 읽는 쪽. 🔴 **지금은 목록 · 휴지통 · 드롭다운 셋뿐이다**
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(888줄)은 견적서 화면 **전체**의 읽기 쪽이다 —
 * 목록·상세(`getQuoteForEdit`)·인수번호 찾기(`lookupIntakeForQuote`)·부품 줄·
 * 결재 이력까지. 그 나머지는 **그것을 쓰는 화면이 오는 조각에서 함께 온다**
 * (설계서 G절: 3b 편집 폼 · 3e 결재 …). 지금 통째로 베껴 오면 아무도 부르지 않는
 * 조회가 600줄 남고, 그 조각이 올 때 죽은 코드와 새로 옮겨 온 코드 중 어느 것이
 * 참인지 답할 수 없게 된다.
 *
 * 🔴 **`listQuotesForRepairCase` 도 아직 없다.** 저쪽에서 그것은 수리 건 상세의
 * [견적서] 탭이 쓰는 조회이고, 그 탭은 A/S 의 화면이다(설계서 F절 5번 — 화면은
 * 한 벌을 나눠 쓰되 탭 자체는 저쪽에 남는다). 조각 4 에서 저쪽이 이쪽 화면을 쓰게
 * 될 때 `selectQuoteList` 의 몸통을 나눠 쓰면 된다 — **그때 두 벌로 적지 말 것.**
 * 같은 select·join·정렬·매핑이 두 벌이 되면, 사람은 PO/내자 목록과 그 탭에서
 * **같은 견적서의 다른 금액**을 보게 된다.
 *
 * ── 조인이 거의 없다 ────────────────────────────────────────────────────
 * 내자 정리 목록은 고객사·제품·수리 건을 전부 조인해서 "이 행의 값이 먼저,
 * 없으면 수리 건의 값" 규칙을 편다. 견적서는 그럴 것이 없다 — 발행 시점에
 * 값이 통째로 복사돼 들어오는 **스냅샷**이기 때문이다(schema/quotes.ts 의
 * '이 표의 값은 스냅샷이다'). 목록 여섯 칸이 전부 quotes 한 표에 있다.
 *
 * repair_cases 를 왼쪽 조인하는 것은 **인수번호 하나** 때문이다. 그 값은
 * 스냅샷이 아니라 "지금 이 견적서가 어느 접수 건에 걸려 있는가"라는 현재의
 * 연결이라, 화면에서 눌러 접수 건으로 건너가는 링크가 된다(🔴 그 링크가 가는
 * 화면은 A/S 에 있다 — 이 사이트의 목록은 글자만 보인다). 연결이 없거나 접수
 * 건이 영구 삭제된 장은 quotes.intake_number_text 에 남은 글자를 쓴다.
 *
 * ── 🔴 줄의 모양은 서브모듈이 갖는다 ────────────────────────────────────
 * `QuoteListItem` · `DeletedQuoteRow` 는 목록 화면(한 벌 — vendor/dss-core)과 짝이라
 * 그 곁에 있다. 여기서 다시 적지 않고 **재수출한다** — 부르는 쪽(page.tsx)이 지금까지
 * 하던 대로 이 파일에서 타입을 가져올 수 있게, 그리고 이 사이트 안에서 정의가 두 벌이
 * 되지 않게.
 * ============================================================================
 */

export type { DeletedQuoteRow, QuoteListItem } from "@dss/core/ui/quotes/quote-list-rows";

import type { DeletedQuoteRow, QuoteListItem } from "@dss/core/ui/quotes/quote-list-rows";

/**
 * 목록. **부품 줄을 N+1 로 읽지 않는다** — 견적서 하나마다 한 번씩 읽으면 스무
 * 장짜리 목록에 스물한 번의 왕복이 생기고, 그 값은 장수만큼 그대로 늘어난다.
 * 내자 정리의 납기 요청일이 같은 이유로 같은 방식을 쓴다.
 *
 * 정렬은 **발행일자 내림차순 → 만든 시각 내림차순**이다. 최근에 낸 견적서를
 * 먼저 보는 것이 이 화면을 여는 목적이고, 같은 날 여러 장을 낸 경우가 실제로
 * 있어서(재견적) 그때 순서가 매번 달라지지 않도록 두 번째 기준을 둔다.
 * 견적서번호로 정렬하지 않는 것은 그것이 사람이 손으로 적는 값이라
 * 문자열 정렬이 발행 순서와 어긋날 수 있기 때문이다.
 */
export async function listQuotes(): Promise<QuoteListItem[]> {
  const rows = await db
    .select({
      id: quotes.id,
      version: quotes.version,
      quoteNumber: quotes.quoteNumber,
      kind: quotes.kind,
      quoteDate: quotes.quoteDate,
      customerNameText: quotes.customerNameText,
      modelNameText: quotes.modelNameText,
      lotNumberText: quotes.lotNumberText,
      serialNumberText: quotes.serialNumberText,
      faultDescriptionText: quotes.faultDescriptionText,
      subject: quotes.subject,
      workCost: quotes.workCost,
      // 엑셀 전용 견적서의 금액은 품목이 아니라 손으로 적은 공급가액이다(2026-09-15 Q2).
      isExcelOnly: quotes.isExcelOnly,
      manualSupplyAmount: quotes.manualSupplyAmount,
      repairCaseId: quotes.repairCaseId,
      // 연결이 살아 있으면 진짜 인수번호, 아니면 이 표에 남은 글자.
      linkedIntakeNumber: repairCases.intakeNumber,
      intakeNumberText: quotes.intakeNumberText,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .leftJoin(repairCases, eq(repairCases.id, quotes.repairCaseId))
    .where(eq(quotes.isDeleted, false))
    .orderBy(desc(quotes.quoteDate), desc(quotes.createdAt));

  const quoteIds = rows.map((row) => row.id);
  const itemsByQuoteId = await loadItemsByQuoteId(quoteIds);
  // 결재 PDF · 엑셀이 붙어 있는가 — 부품 줄과 같이 **질의 한 번으로**(N+1 없음).
  const attachmentFlagsByQuoteId = await loadAttachmentFlagsByQuoteId(quoteIds);

  return rows.map((row) => {
    const items = itemsByQuoteId.get(row.id) ?? [];
    const attachmentFlags = attachmentFlagsByQuoteId.get(row.id);
    return {
      isExcelOnly: row.isExcelOnly,
      hasSignedPdf: attachmentFlags?.hasSignedPdf ?? false,
      hasExcel: attachmentFlags?.hasExcel ?? false,
      id: row.id,
      kind: row.kind,
      version: row.version,
      quoteNumber: row.quoteNumber,
      quoteDate: row.quoteDate,
      customerName: row.customerNameText,
      modelName: row.modelNameText,
      lotNumber: row.lotNumberText,
      serialNumber: row.serialNumberText,
      faultDescription: row.faultDescriptionText,
      subject: row.subject,
      repairCaseId: row.repairCaseId,
      intakeNumber: row.linkedIntakeNumber ?? row.intakeNumberText,
      summaryLine: buildQuoteSummaryLine({
        quoteNumber: row.quoteNumber,
        customerName: row.customerNameText,
        modelName: row.modelNameText,
        lotNumber: row.lotNumberText,
        serialNumber: row.serialNumberText,
        faultDescription: row.faultDescriptionText,
      }),
      // 서버가 금액을 셈하는 단 한 곳(domain/quote-list.ts) — 엑셀 전용 장은 손으로 적은
      // 공급가액이고, 그 값이 비어 있으면 null(화면이 「—」로 그린다).
      supplyAmount: quoteSupplyAmountOf({
        isExcelOnly: row.isExcelOnly,
        manualSupplyAmount: row.manualSupplyAmount,
        items,
        workCost: row.workCost,
      }),
      // 화면이 「n품목」으로 그리는 값이라 **품목 줄만 센다** — 설명 줄은 품목이
      // 아니다. 합계와 같은 잣대를 쓴다(domain/quote-list.ts 의 isQuoteAmountItemLine).
      itemCount: items.filter(isQuoteAmountItemLine).length,
    };
  });
}

type QuoteAttachmentFlags = { hasSignedPdf: boolean; hasExcel: boolean };

/**
 * 여러 장의 결재 PDF · 엑셀 칸이 차 있는가를 **질의 한 번으로** 걷어 온다(2026-09-15 Q2).
 * 부품 줄(loadItemsByQuoteId)과 같은 까닭이다 — 장마다 한 번씩 물으면 목록 장수만큼
 * 왕복이 는다.
 *
 * 🔴 **첨부 화면은 아직 이 사이트에 없다**(조각 3d). 그래도 이 두 값을 읽는 것은,
 * 목록의 파일 딱지가 **그 조각이 오면 곧바로 붙을 자리**이고 값이 비면 그날 조회부터
 * 다시 고쳐야 하기 때문이다. 지금은 화면이 딱지 슬롯을 넘기지 않아 그려지지 않는다.
 *
 * 휴지통의 첨부는 세지 않는다(`is_deleted = false` — 부분 인덱스
 * attachments_quote_id_not_deleted_idx 를 타는 모양). 칸 교체로 밀려난 옛 파일은 휴지통에
 * 있으므로 여기서 빠진다.
 */
async function loadAttachmentFlagsByQuoteId(quoteIds: string[]): Promise<Map<string, QuoteAttachmentFlags>> {
  const flags = new Map<string, QuoteAttachmentFlags>();
  if (quoteIds.length === 0) return flags;

  const rows = await db
    .select({ quoteId: attachments.quoteId, category: attachments.category })
    .from(attachments)
    .where(and(inArray(attachments.quoteId, quoteIds), eq(attachments.isDeleted, false)));

  for (const row of rows) {
    if (row.quoteId === null) continue;
    const current = flags.get(row.quoteId) ?? { hasSignedPdf: false, hasExcel: false };
    if (row.category === "SIGNED_QUOTE_PDF") current.hasSignedPdf = true;
    if (row.category === "QUOTE_EXCEL") current.hasExcel = true;
    flags.set(row.quoteId, current);
  }
  return flags;
}

/**
 * 휴지통. 지운 시각 내림차순 — 방금 지운 것을 되살리려고 여는 화면이다.
 *
 * 부품 줄은 읽지 않는다. 휴지통은 "무엇을 지웠는가"를 알아보고 되살리는 자리라
 * 금액까지 필요하지 않고, 목록 한 줄이면 어느 견적서인지 가려진다.
 */
export async function listDeletedQuotes(): Promise<DeletedQuoteRow[]> {
  const rows = await db
    .select({
      id: quotes.id,
      version: quotes.version,
      quoteNumber: quotes.quoteNumber,
      quoteDate: quotes.quoteDate,
      customerNameText: quotes.customerNameText,
      modelNameText: quotes.modelNameText,
      lotNumberText: quotes.lotNumberText,
      serialNumberText: quotes.serialNumberText,
      faultDescriptionText: quotes.faultDescriptionText,
      subject: quotes.subject,
      deletedAt: quotes.deletedAt,
      deleteReason: quotes.deleteReason,
    })
    .from(quotes)
    .where(eq(quotes.isDeleted, true))
    .orderBy(desc(quotes.deletedAt));

  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    quoteNumber: row.quoteNumber,
    quoteDate: row.quoteDate,
    subject: row.subject,
    summaryLine: buildQuoteSummaryLine({
      quoteNumber: row.quoteNumber,
      customerName: row.customerNameText,
      modelName: row.modelNameText,
      lotNumber: row.lotNumberText,
      serialNumber: row.serialNumberText,
      faultDescription: row.faultDescriptionText,
    }),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deleteReason: row.deleteReason,
  }));
}

/**
 * 여러 장의 부품 줄을 **질의 한 번으로** 걷어 와 장마다 묶는다. 위 '목록' 주석 참조.
 *
 * 🔴 **`kind` 를 함께 싣는다**(2026-09-16). 설명 줄은 합계에 들어가지 않는데,
 * 그 판단을 여기서 하지 않는 것은 **품목 줄이 무엇인가를 한 곳에서만 정하기**
 * 위해서다(domain/quote-list.ts 의 isQuoteAmountItemLine). 여기서 미리 걸러 버리면
 * 같은 규칙이 두 벌이 되고, 한쪽만 고쳐지는 날 목록의 금액과 줄 수가 서로 다른
 * 기준을 말하게 된다.
 */
async function loadItemsByQuoteId(quoteIds: string[]): Promise<Map<string, QuoteAmountLine[]>> {
  const grouped = new Map<string, QuoteAmountLine[]>();
  // inArray 에 빈 배열을 넘기면 뜻 없는 SQL 이 만들어진다. 읽을 장이 없으면
  // 질의 자체를 하지 않는 것이 맞다.
  if (quoteIds.length === 0) return grouped;

  const rows = await db
    .select({
      quoteId: quoteItems.quoteId,
      kind: quoteItems.kind,
      quantity: quoteItems.quantity,
      unitPrice: quoteItems.unitPrice,
    })
    .from(quoteItems)
    .where(inArray(quoteItems.quoteId, quoteIds))
    .orderBy(asc(quoteItems.lineNo));

  for (const row of rows) {
    const bucket = grouped.get(row.quoteId);
    const item: QuoteAmountLine = {
      kind: row.kind,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
    };
    if (bucket) bucket.push(item);
    else grouped.set(row.quoteId, [item]);
  }
  return grouped;
}

/**
 * 내자 정리 폼의 견적서 드롭다운. 살아 있는 견적서만, 최근 발행순으로.
 *
 * (조각 2 가 A/S 에서 **글자 그대로** 가져온 함수다. 조각 3a 가 위 목록·휴지통을
 * 더할 때 이 파일을 덮어쓰지 않고 그대로 두었다 — 저쪽 파일에도 같은 이름 · 같은
 * 몸통으로 있다.)
 *
 * 목록 한 줄을 그대로 준다 — 사람이 고를 때 보는 것이 `DSS 2026-077 ICD
 * CFK300FH-IC2 …` 이고, 번호만 보여 주면 같은 모델의 여러 장 중 어느 것인지
 * 가릴 수 없다(domain/quote-list.ts).
 *
 * `repairCaseId` 는 글자로 그리는 값이 아니다 — 폼이 **지금 고른 수리 건의
 * 견적서만** 후보로 남기는 데 쓴다(domain/quote-link-options.ts). NULL 이면
 * 수리 건이 붙지 않은 견적서라 어느 건의 후보에도 뜨지 않는다.
 */
export async function listQuoteOptions(): Promise<
  { id: string; summaryLine: string; quoteDate: string; repairCaseId: string | null }[]
> {
  const rows = await db
    .select({
      id: quotes.id,
      repairCaseId: quotes.repairCaseId,
      quoteNumber: quotes.quoteNumber,
      quoteDate: quotes.quoteDate,
      customerNameText: quotes.customerNameText,
      modelNameText: quotes.modelNameText,
      lotNumberText: quotes.lotNumberText,
      serialNumberText: quotes.serialNumberText,
      faultDescriptionText: quotes.faultDescriptionText,
    })
    .from(quotes)
    .where(eq(quotes.isDeleted, false))
    .orderBy(desc(quotes.quoteDate), desc(quotes.createdAt));

  return rows.map((row) => ({
    id: row.id,
    quoteDate: row.quoteDate,
    repairCaseId: row.repairCaseId,
    summaryLine: buildQuoteSummaryLine({
      quoteNumber: row.quoteNumber,
      customerName: row.customerNameText,
      modelName: row.modelNameText,
      lotNumber: row.lotNumberText,
      serialNumber: row.serialNumberText,
      faultDescription: row.faultDescriptionText,
    }),
  }));
}
