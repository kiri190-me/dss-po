"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { QuoteAttachmentSlotCategory } from "@/lib/domain/attachment-category";
import type { QuoteAttachmentSlots } from "@/lib/db/queries/attachments";
import { softDeleteAttachmentAction } from "@/lib/server/actions/attachments";
import {
  checkQuoteAttachmentFile,
  excelOnlyMissingExcelNotice,
  isQuoteExcelAttachedOrQueued,
  pendingQuoteAttachmentQueue,
  quoteAttachmentDeletedText,
  quoteAttachmentUploadedText,
  resolveQuoteSlots,
  withPendingQuoteAttachment,
  type PendingQuoteAttachments,
  type QuoteSlotLocalChanges,
  type ResolvedQuoteSlots,
} from "./quote-attachment-files";
import {
  uploadQuoteAttachment,
  uploadQueuedQuoteAttachments,
  type QueuedQuoteAttachmentsOutcome,
} from "./quote-attachment-upload";
import { QuoteAttachmentDeleteDialog, QuoteAttachmentSlotsView } from "./QuoteAttachmentParts";

/**
 * ============================================================================
 * 견적서 파일(결재 PDF 1 · 수기 엑셀 1) — 상태와 서버 부르기 (조각 3d-4)
 * ============================================================================
 * 🔴 **이 파일만 서버 액션(softDeleteAttachmentAction)을 부른다.** 그리기는
 * QuoteAttachmentParts.tsx, 문구 · 판정은 quote-attachment-files.ts, 올리기 fetch 는
 * quote-attachment-upload.ts 에 있다 — 그 셋은 `server-only` 없이 시험된다.
 *
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/QuoteAttachmentsSection.tsx`, 368줄 —
 * 2026-09-28 실측)이다. 🔴 **파일 이름 · 조각 이름 · 파일 안의 차례를 저쪽과 똑같이
 * 둔다** — 조각 4 에서 두 벌을 글자로 대조한다.
 *
 * 🔴 **지우기 · 되살리기 서버 액션이 여기서 처음 쓰인다.** 조각 3d-3c 가 통로를 열며
 * 「아직 이 두 액션을 부르는 화면이 하나도 없는 것이 정상이다 — 지우기 단추와
 * 되살리기 단추는 조각 3d-3d 이후에 온다」고 적어 두었던 그 자리다
 * (server/actions/attachments.ts 머리말). 🔴 지금 쓰는 것은 **지우기 하나**다:
 * `restoreAttachmentAction`(되살리기)을 부르는 화면은 아직 없다 — 첨부 휴지통 화면이
 * 이 사이트에 오지 않았고, 저쪽의 이 구역도 되살리기 단추를 그리지 않는다.
 *
 * ── 🔴 상태는 훅(useQuoteAttachments)으로 **폼이** 들고 있는다 ─────────────
 * 저쪽 QuoteEditForm 의 [미리보기 · PDF] 는 폼을 통째로 미리보기로 갈아 그린다(그
 * 자리에서 return). 이 구역이 상태를 제 안에 두면 미리보기를 여는 순간 사라진다 —
 * 골라 둔 파일이 말없이 없어진다. 그래서 상태는 폼 컴포넌트가 부르는 훅에 두고, 이
 * 구역은 그 훅이 돌려준 것을 그리기만 한다. 🔴 **이 사이트에 미리보기는 아직
 * 없지만**(조각 3f) 자리를 저쪽과 같게 둔다 — 3f 가 올 때 폼을 다시 뜯지 않는다.
 *
 * ── 두 모드 ────────────────────────────────────────────────────────────
 *  · 저장된 견적서 — 올리기 · 바꾸기 · 지우기가 [저장]과 따로 **곧바로** 반영된다.
 *    파일은 견적서 칸이 아니고, 올려도 견적서의 version 이 오르지 않는다
 *    (mutations/attachments.ts 는 견적서 행을 잠글 뿐 고치지 않는다) — 파일을 만진 뒤
 *    [저장]해도 충돌하지 않는다.
 *  · 새 견적서(quoteId 없음) — 고른 파일을 들고 있다가 폼의 [저장]이 견적서를 만든
 *    **직후** uploadQueuedAfterCreate 로 차례로 올린다.
 *    🔴 **이 사이트에서는 그 모드가 아직 화면에 서지 않는다** — 아래 「배선이 어디까지
 *    왔나」를 볼 것.
 *
 * ── 🔴 배선이 어디까지 왔나 (조각 3d-4) ────────────────────────────────
 * QuoteEditForm 은 **`attachmentSlots` 가 온 경우에만** 이 구역을 그린다. 그 값을
 * 넘기는 곳은 견적서 **수정 화면**(`app/(app)/quotes/[id]/page.tsx`) 하나다 —
 * 새 견적서 화면(`/quotes/new`)은 넘기지 않으므로 그 화면에는 구역이 서지 않는다.
 *
 * 🔴 **일부러 그렇게 두었다.** 새 견적서에서 파일을 고를 수 있게 하려면 폼의
 * handleSubmit 이 「만든 직후 올리기」를 해야 하고(그 자리의 주석 참조 —
 * `createdQuote` 를 먼저 세우고, 하나라도 못 올리면 목록으로 넘기지 않는다), 그것
 * 없이 칸만 세우면 **고른 파일이 [저장] 때 말없이 사라진다.** 거짓말하는 화면을
 * 만들지 않는 것이 이 조각의 기준이다.
 *
 * 그래서 아래 `uploadQueuedAfterCreate` 와 `pending` 갈래는 **와 있지만 아직 아무도
 * 부르지 않는다** — 이 저장소가 여러 번 쓴 방식이다(문지기 · 저장소 쓰기 쪽 ·
 * `listQuoteAttachmentSlots`). 저쪽과 글자를 맞춰 두면 새 견적서 배선이 오는 날 이
 * 파일은 손대지 않아도 된다.
 *
 * ── 🔴 저쪽에서 안 가져온 것 넷 ────────────────────────────────────────
 *  · `archiveNotice`(결재 PDF 의 공유폴더 사본 결과 줄) — 공유폴더 복사는 **발행
 *    (조각 3c-3)** 의 몫이라 이 사이트의 올리기 통로는 `archive` 에 언제나 null 을
 *    싣고, 그 결과로 문장을 짓는 `quoteUploadArchiveNoticeLines` 도 아직 없다
 *    (quote-attachment-upload.ts 머리말).
 *  · `signedPdfForPreview` — **조각 3f(미리보기)** 의 것이다. 그 함수 자체가 아직
 *    이 사이트에 없다(quote-attachment-files.test.ts 머리말의 「뺀 것 셋」).
 *  · `onExcelPicked`(수기 엑셀로 칸 채우기, 견적서 ①b) — 그 묶음
 *    (quote-excel-parse · quote-excel-autofill)이 아직 없다. 그래서 `excelSlotDetails`
 *    프롭도 받기만 하고 아무도 넘기지 않는다.
 *  · `reloadAfterIssue` — 폼의 [견적서 받기]가 「수기 견적서 엑셀」 칸을 바꿨을 때
 *    서버 칸을 다시 그려 오는 자리다. 그 머리 단추는 **조각 3c-3** 의 것이라 이
 *    사이트의 폼에 없다.
 *
 * ⚠️ 위 넷은 **조각 3d-4 때의 기록**이다. 그 가운데 「아직 없다」던 파일 셋이 그 뒤에
 *    들어왔다 — `quote-excel-parse.ts` · `quote-excel-autofill.ts` ·
 *    `quote-issue-messages.ts`(그래서 `quoteUploadArchiveNoticeLines` 도 있다). 모두
 *    **조각 3e-2** 가 들여온 순수 모듈이다.
 *    🔴 **그래도 여기서 안 가져온 것 넷은 그대로 넷이다** — 이 파일에는 여전히
 *    `onExcelPicked` 도 `archiveNotice` 도 없고, `excelSlotDetails` 는 받기만 하고
 *    아무도 넘기지 않는다. 배선은 다음 조각([새 견적서] 팝업)의 몫이다.
 * ============================================================================
 */

type SlotMessages = Partial<Record<QuoteAttachmentSlotCategory, string>>;

export type QuoteAttachmentsController = {
  /** 저장된 견적서의 id — 새 견적서(아직 저장 전)면 null. */
  quoteId: string | null;
  slots: ResolvedQuoteSlots;
  pending: PendingQuoteAttachments<File>;
  errors: SlotMessages;
  busyCategory: QuoteAttachmentSlotCategory | null;
  statusText: string | null;
  deleteTarget: QuoteAttachmentSlotCategory | null;
  deleteError: string | null;
  isDeleting: boolean;
  /** 엑셀 칸이 차 있거나 새 견적서가 들고 있다 — 엑셀 전용 안내를 끈다. */
  excelAttachedOrQueued: boolean;
  pickFile: (category: QuoteAttachmentSlotCategory, file: File) => void;
  retry: (category: QuoteAttachmentSlotCategory) => void;
  clearPending: (category: QuoteAttachmentSlotCategory) => void;
  requestDelete: (category: QuoteAttachmentSlotCategory) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  /**
   * 새 견적서를 만든 직후 들고 있던 파일을 올린다. 던지지 않는다. 올린 것은 칸에 그리고,
   * 못 올린 것은 까닭과 함께 들고 있는다([다시 올리기]).
   *
   * 🔴 **아직 부르는 쪽이 없다**(파일 머리말의 「배선이 어디까지 왔나」).
   */
  uploadQueuedAfterCreate: (
    quoteId: string,
    onProgress: (current: number, total: number) => void
  ) => Promise<QueuedQuoteAttachmentsOutcome>;
};

const DELETE_FAILED_MESSAGE = "지우기 요청이 끝나지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function useQuoteAttachments({
  quoteId,
  serverSlots,
}: {
  quoteId: string | null;
  /** 수정 화면이 서버에서 읽은 칸(listQuoteAttachmentSlots). 새 견적서는 null. */
  serverSlots: QuoteAttachmentSlots | null;
}): QuoteAttachmentsController {
  const router = useRouter();
  const [pending, setPending] = useState<PendingQuoteAttachments<File>>({});
  const [errors, setErrors] = useState<SlotMessages>({});
  const [localChanges, setLocalChanges] = useState<QuoteSlotLocalChanges>({});
  const [busyCategory, setBusyCategory] = useState<QuoteAttachmentSlotCategory | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuoteAttachmentSlotCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const slots = resolveQuoteSlots(serverSlots, localChanges);
  const isNewQuote = quoteId === null;

  function setSlotError(category: QuoteAttachmentSlotCategory, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message === null) delete next[category];
      else next[category] = message;
      return next;
    });
  }

  /**
   * 수정 화면이면 서버 칸을 다시 그려 온다 — 올린 사람 이름이 채워진다. 폼에 적어 둔 값은
   * 그대로다(상태는 다시 만들어지지 않는다). 새 견적서 화면은 다시 그려도 칸이 오지
   * 않으므로 부르지 않는다.
   */
  function refreshServerSlots() {
    if (serverSlots !== null) router.refresh();
  }

  async function uploadNow(targetQuoteId: string, category: QuoteAttachmentSlotCategory, file: File) {
    setBusyCategory(category);
    setStatusText(null);
    setSlotError(category, null);
    try {
      const result = await uploadQuoteAttachment(targetQuoteId, category, file);
      if (!result.ok) {
        // 못 올린 파일은 들고 있는다 — [다시 올리기]로 같은 파일을 다시 보낸다.
        setPending((prev) => withPendingQuoteAttachment(prev, category, file));
        setSlotError(category, result.reason);
        return;
      }
      setPending((prev) => withPendingQuoteAttachment(prev, category, null));
      setLocalChanges((prev) => ({ ...prev, [category]: { kind: "uploaded", file: result.file } }));
      setStatusText(quoteAttachmentUploadedText(category, result.replaced));
      refreshServerSlots();
    } finally {
      setBusyCategory(null);
    }
  }

  function pickFile(category: QuoteAttachmentSlotCategory, file: File) {
    // 형식 · 20MB 는 보내기 전에 막는다(서버가 다시 본다).
    const rejection = checkQuoteAttachmentFile(file, category);
    if (rejection !== null) {
      if (quoteId !== null) setPending((prev) => withPendingQuoteAttachment(prev, category, null));
      setSlotError(category, `${file.name}: ${rejection}`);
      return;
    }
    if (quoteId === null) {
      // 새 견적서 — 들고만 있는다. [저장] 뒤에 올린다.
      setPending((prev) => withPendingQuoteAttachment(prev, category, file));
      setSlotError(category, null);
    } else {
      void uploadNow(quoteId, category, file);
    }
    /*
     * 🔴 저쪽은 여기서 폼에 알린다(`onExcelPicked`) — 엑셀 전용 장이면 방금 고른 엑셀을
     * 읽어 빈 칸을 채우는 길의 **유일한 입구**다(견적서 ①b). 이 사이트에는 그 묶음이
     * 아직 없어 부를 자리가 없다(파일 머리말의 「안 가져온 것 넷」).
     */
  }

  function retry(category: QuoteAttachmentSlotCategory) {
    const file = pending[category];
    if (file && quoteId !== null) void uploadNow(quoteId, category, file);
  }

  function clearPending(category: QuoteAttachmentSlotCategory) {
    setPending((prev) => withPendingQuoteAttachment(prev, category, null));
    setSlotError(category, null);
  }

  function requestDelete(category: QuoteAttachmentSlotCategory) {
    setDeleteTarget(category);
    setDeleteError(null);
  }

  function cancelDelete() {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function runDelete() {
    const category = deleteTarget;
    if (category === null || isDeleting) return;
    const file = slots[category];
    if (!file) {
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // 견적서 id 는 화면 갱신 경로만 정한다 — 권한은 액션이 첨부의 주인을 DB 에서 다시
      // 읽어 고른다(actions/attachments.ts 의 🔴). 성공하면 그 액션의 revalidatePath 가
      // 이 화면을 다시 그리므로 여기서 refresh 를 따로 부르지 않는다.
      const result = await softDeleteAttachmentAction({ attachmentId: file.id, quoteId: quoteId ?? undefined });
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      setLocalChanges((prev) => ({ ...prev, [category]: { kind: "deleted", attachmentId: file.id } }));
      setDeleteTarget(null);
      setStatusText(quoteAttachmentDeletedText(category));
    } catch {
      setDeleteError(DELETE_FAILED_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  }

  async function uploadQueuedAfterCreate(
    newQuoteId: string,
    onProgress: (current: number, total: number) => void
  ): Promise<QueuedQuoteAttachmentsOutcome> {
    const queue = pendingQuoteAttachmentQueue(pending);
    if (queue.length === 0) return { total: 0, uploaded: [], failures: [] };

    const outcome = await uploadQueuedQuoteAttachments(newQuoteId, queue, onProgress);
    setLocalChanges((prev) => {
      const next = { ...prev };
      for (const item of outcome.uploaded) next[item.category] = { kind: "uploaded", file: item.file };
      return next;
    });
    setPending((prev) => {
      let next = prev;
      for (const item of outcome.uploaded) next = withPendingQuoteAttachment(next, item.category, null);
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const failure of outcome.failures) next[failure.category] = failure.reason;
      return next;
    });
    return outcome;
  }

  return {
    quoteId,
    slots,
    pending,
    errors,
    busyCategory,
    statusText,
    deleteTarget,
    deleteError,
    isDeleting,
    excelAttachedOrQueued: isQuoteExcelAttachedOrQueued({
      isNewQuote,
      excelSlot: slots.QUOTE_EXCEL,
      hasPendingExcel: pending.QUOTE_EXCEL !== undefined,
    }),
    pickFile,
    retry,
    clearPending,
    requestDelete,
    cancelDelete,
    confirmDelete: () => void runDelete(),
    uploadQueuedAfterCreate,
  };
}

/**
 * 「견적서 파일」 구역 — 폼의 상단 정보 바로 아래에 선다. 훅이 돌려준 것을 그리기만 한다.
 * 엑셀 전용인데 엑셀이 없으면 구역 맨 위에 눈에 띄는 안내를 단다(저장은 막지 않는다).
 */
export default function QuoteAttachmentsSection({
  controller,
  isExcelOnly,
  disabled,
  excelSlotDetails = null,
}: {
  controller: QuoteAttachmentsController;
  isExcelOnly: boolean;
  disabled: boolean;
  /**
   * 「수기 견적서 엑셀」 칸 맨 아래에 붙일 것 — 저쪽에서는 폼이 그린 엑셀 읽기 알림
   * (견적서 ①b)이다. 🔴 이 사이트에는 그 묶음이 없어 아무도 넘기지 않는다.
   */
  excelSlotDetails?: React.ReactNode;
}) {
  const busy = controller.busyCategory !== null || controller.isDeleting;
  const deleteFile = controller.deleteTarget !== null ? controller.slots[controller.deleteTarget] : null;

  return (
    <>
      <QuoteAttachmentSlotsView
        mode={controller.quoteId === null ? "pending" : "saved"}
        slots={controller.slots}
        pending={controller.pending}
        errors={controller.errors}
        busyCategory={controller.busyCategory}
        statusText={controller.statusText}
        notice={excelOnlyMissingExcelNotice({
          isExcelOnly,
          excelAttachedOrQueued: controller.excelAttachedOrQueued,
        })}
        disabled={disabled || busy}
        onPickFile={controller.pickFile}
        onRetry={controller.retry}
        onClearPending={controller.clearPending}
        onRequestDelete={controller.requestDelete}
        slotDetails={{ QUOTE_EXCEL: excelSlotDetails }}
      />
      {controller.deleteTarget !== null && deleteFile ? (
        <QuoteAttachmentDeleteDialog
          category={controller.deleteTarget}
          file={deleteFile}
          isSubmitting={controller.isDeleting}
          error={controller.deleteError}
          onConfirm={controller.confirmDelete}
          onCancel={controller.cancelDelete}
        />
      ) : null}
    </>
  );
}
