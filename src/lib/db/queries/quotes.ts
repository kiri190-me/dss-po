import "server-only";

import { desc, eq } from "drizzle-orm";

import { quotes } from "@dss/core/schema";
import { db } from "@/lib/db";
import { buildQuoteSummaryLine } from "@/lib/domain/quote-list";

/**
 * ============================================================================
 * 🔴 여기 있는 것은 **내자 정리 폼이 쓰는 드롭다운 하나**뿐이다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(888줄)은 견적서 화면 전체의 읽기 쪽이다 —
 * 목록·상세·휴지통·부품 줄·결재 이력까지. **견적서 화면은 조각 3 에서 온다**
 * (설계서 G절). 지금 통째로 베껴 오면 아무도 부르지 않는 조회가 800줄 남고,
 * 조각 3 이 올 때 그 죽은 코드와 새로 옮겨 온 코드 중 어느 것이 참인지
 * 답할 수 없게 된다.
 *
 * 내자 정리가 저 파일에서 실제로 쓰는 것은 `listQuoteOptions` 하나다 — 줄 수정
 * 폼의 [견적서] 드롭다운을 채운다. 그 함수만 **글자 그대로** 가져왔다.
 *
 * 🔴 **조각 3 이 오면 이 파일은 저쪽 888줄로 덮인다.** 그때 이 함수가 두 벌이
 * 되지 않게, 파일 이름과 함수 이름을 A/S 와 똑같이 두었다.
 * ============================================================================
 */

/**
 * 내자 정리 폼의 견적서 드롭다운. 살아 있는 견적서만, 최근 발행순으로.
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
