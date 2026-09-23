import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { attachments, users } from "@dss/core/schema";
import { db } from "@/lib/db";
import type { AttachmentCategory, MalwareScanStatus } from "@/lib/domain/attachment-category";

/**
 * ============================================================================
 * 🔴 첨부 조회 — **견적서에 붙은 파일 목록 하나뿐이다** (조각 3d-2)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(425줄)에서 **셋만** 가져왔다:
 *   · `UUID_PATTERN`            — 형식이 틀린 글자로 DB 를 때리지 않는다
 *   · `LiveQuoteAttachment`     — 받기 통로가 보는 한 행의 모양
 *   · `listLiveQuoteAttachments` — 그 견적서에 지금 붙어 있는 파일 전부
 *
 * ── 🔴 무엇을 뺐고 왜 뺐나 ──────────────────────────────────────────────
 * 나머지 약 380줄은 **접수 건의 첨부 목록 · 제품 모델의 첨부 목록 · 휴지통 목록 ·
 * 내려받기 한 행 조회 · 견적서 수정 화면의 칸 조회**다. 앞의 넷은 이 사이트에
 * 영영 오지 않는 화면(접수 건 · 제품 모델)의 것이고, 마지막 하나
 * (`listQuoteAttachmentSlots` · `QuoteAttachmentSlotFile` · `QuoteAttachmentSlots`)는
 * **붙이는 칸**(조각 3d-3 · 3d-4)이 오는 날 함께 온다 — 지금 가져와도 부를 화면이 없다.
 *
 * 🔴 **잃은 규칙은 없다.** 이 조각이 쓰는 길은 「견적서 id → 붙어 있는 파일들」 하나이고,
 * 그 조회가 통째로 여기 있다. 칸 조회는 이 함수를 감싸는 것이라(저쪽 `listQuoteAttachmentSlots`
 * 가 `listLiveQuoteAttachments` 를 부른다) 그날 그 함수만 더하면 된다.
 *
 * ── 🔴 스키마 경로가 다르다 ─────────────────────────────────────────────
 * 저쪽은 `../schema`(제 저장소의 표 정의)를 보지만, 이 사이트는 서브모듈 한 벌
 * `@dss/core/schema` 를 본다 — 두 사이트가 **같은 `dss_as` 표**를 보고, 칸을 고치는 일은
 * 언제나 A/S 에서 한다(db/index.ts 머리말 · 이웃 조회 queries/quotes.ts 와 같은 모양).
 *
 * ── 이 결과를 화면으로 그대로 넘기지 않는다 ─────────────────────────────
 * `storedPath` 는 저장 루트 아래의 내부 경로다. 화면에 그대로 내보이면 디스크 구조가
 * 드러난다 — 받기 통로만 쓰고, 그 통로도 경로를 응답이 아니라 서버 로그에만 남긴다.
 * ============================================================================
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 견적서에 지금 붙어 있는 파일 전부(휴지통 것은 빼고). 견적서 받기(엑셀 전용 견적서의
 * 붙인 엑셀)가 쓴다. 저장 경로 · 검사 상태까지 싣는다 — 받기 통로가 그 파일을 내보내며
 * 판정(decideAttachmentDownload)과 경로 검증을 다시 거친다.
 */
export type LiveQuoteAttachment = {
  id: string;
  category: AttachmentCategory;
  isDeleted: boolean;
  originalFileName: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  malwareScanStatus: MalwareScanStatus;
  uploadedAt: Date;
  uploadedByName: string;
};

export async function listLiveQuoteAttachments(quoteId: string): Promise<LiveQuoteAttachment[]> {
  if (!UUID_PATTERN.test(quoteId)) return [];

  return db
    .select({
      id: attachments.id,
      category: attachments.category,
      isDeleted: attachments.isDeleted,
      originalFileName: attachments.originalFileName,
      storedPath: attachments.storedPath,
      mimeType: attachments.mimeType,
      fileSize: attachments.fileSize,
      malwareScanStatus: attachments.malwareScanStatus,
      uploadedAt: attachments.uploadedAt,
      uploadedByName: users.name,
    })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.uploadedBy))
    .where(and(eq(attachments.quoteId, quoteId), eq(attachments.isDeleted, false)))
    .orderBy(desc(attachments.uploadedAt));
}
