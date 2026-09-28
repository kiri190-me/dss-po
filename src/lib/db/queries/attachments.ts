import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { attachments, quotes, users } from "@dss/core/schema";
import { db } from "@/lib/db";
import {
  QUOTE_ATTACHMENT_SLOT_CATEGORIES,
  liveQuoteAttachmentInSlot,
  type AttachmentCategory,
  type MalwareScanStatus,
  type QuoteAttachmentSlotCategory,
} from "@/lib/domain/attachment-category";

/**
 * ============================================================================
 * 🔴 첨부 조회 — **견적서 갈래만** (조각 3d-2 · 3d-3b)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(425줄)에서 견적서에 닿는 것만 가져왔다:
 *   · `UUID_PATTERN`            — 형식이 틀린 글자로 DB 를 때리지 않는다
 *   · `LiveQuoteAttachment`     — 받기 통로가 보는 한 행의 모양
 *   · `listLiveQuoteAttachments` — 그 견적서에 지금 붙어 있는 파일 전부
 *   · 🔴 3d-3b 가 둘을 더했다 — `getQuoteAttachmentUploadTarget`(올리기가 본문을 받기
 *     전에 보는 대상 조회) · `listQuoteAttachmentSlots`(칸마다 파일 하나).
 *
 * ── 🔴 무엇을 뺐고 왜 뺐나 ──────────────────────────────────────────────
 * 나머지는 **접수 건의 첨부 목록 · 제품 모델의 첨부 목록 · 휴지통 목록 · 내려받기 한 행
 * 조회**다. 앞의 셋은 이 사이트에 영영 오지 않는 화면(접수 건 · 제품 모델)의 것이고,
 * 내려받기 한 행 조회는 형제 파일(`queries/attachment-download.ts`)에 따로 와 있다.
 *
 * 🔴 **잃은 규칙은 없다.** 견적서가 쓰는 길 셋이 통째로 여기 있다.
 *
 * ── 🔴 `listQuoteAttachmentSlots` 는 **아직 아무도 부르지 않는다** (3d-3b) ──
 * 화면(견적서 수정 화면의 첨부 칸)에 잇는 것은 **조각 3d-4** 의 몫이다. 지금 이으면
 * 목록 화면의 울타리(components/quotes/quote-list-screen-source.test.ts 의 「첨부 사슬을
 * 끌고 오지 않는다」)에 걸린다. 그동안 이 함수가 썩지 않게 **DB 시험이 덮는다**
 * (mutations/attachments.integration.test.ts).
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
 * 올리기가 향할 견적서 — 올리기 통로가 **본문을 받기 전에** 부른다. 빠른 거절용일 뿐이다:
 * 확정 판정은 행을 넣는 mutation(createAttachmentRecord)이 견적서 행을 잠근 트랜잭션에서
 * 다시 한다(20MB 를 받는 동안 견적서가 휴지통으로 갈 수 있다).
 *
 * 휴지통의 견적서도 **찾는다**(isDeleted 를 값으로 준다) — 통로가 「없음」(404)과
 * 「휴지통이라 못 붙임」(409)을 갈라 답하게 하려는 것이다. 개선 요청과 달리 견적서는
 * 휴지통이 있는 표다.
 */
export type QuoteAttachmentUploadTarget = {
  id: string;
  isDeleted: boolean;
};

export async function getQuoteAttachmentUploadTarget(quoteId: string): Promise<QuoteAttachmentUploadTarget | null> {
  if (!UUID_PATTERN.test(quoteId)) return null;

  const [row] = await db
    .select({ id: quotes.id, isDeleted: quotes.isDeleted })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  return row ?? null;
}

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

/** 견적서 수정 화면의 한 칸에 보일 파일. 내부 경로는 싣지 않는다. */
export type QuoteAttachmentSlotFile = {
  id: string;
  originalFileName: string;
  fileSize: number;
  /** 직렬화해서 클라이언트 컴포넌트로 넘기기 위해 ISO 문자열로 내린다. */
  uploadedAt: string;
  uploadedByName: string;
};

/** 칸마다 지금 붙어 있는 파일 — 비어 있으면 null. 키가 곧 칸이다(QUOTE_ATTACHMENT_SLOT_CATEGORIES). */
export type QuoteAttachmentSlots = Record<QuoteAttachmentSlotCategory, QuoteAttachmentSlotFile | null>;

/**
 * 견적서 수정 화면의 첨부 칸 — 칸마다 파일 하나(id · 원래 이름 · 크기 · 올린 때 · 올린
 * 사람). 칸마다 하나라는 규칙은 올리기가 지키고, 규칙을 거치지 않은 행이 겹쳐 있으면
 * 가장 나중에 올린 것을 보인다(liveQuoteAttachmentInSlot — 받기 통로와 같은 고르기).
 *
 * 🔴 **`storedPath` 를 싣지 않는다.** 위 조회는 저장 경로까지 들고 오지만 이 함수는 그
 * 칸을 옮겨 담지 않는다 — 이 결과가 화면으로 그대로 넘어가는 자리이기 때문이다(파일
 * 머리말의 '이 결과를 화면으로 그대로 넘기지 않는다').
 */
export async function listQuoteAttachmentSlots(quoteId: string): Promise<QuoteAttachmentSlots> {
  const live = await listLiveQuoteAttachments(quoteId);
  const slots = {} as QuoteAttachmentSlots;
  for (const slot of QUOTE_ATTACHMENT_SLOT_CATEGORIES) {
    const picked = liveQuoteAttachmentInSlot(live, slot);
    slots[slot] = picked
      ? {
          id: picked.id,
          originalFileName: picked.originalFileName,
          fileSize: picked.fileSize,
          uploadedAt: picked.uploadedAt.toISOString(),
          uploadedByName: picked.uploadedByName,
        }
      : null;
  }
  return slots;
}
