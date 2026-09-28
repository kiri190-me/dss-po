"use client";

import { useEffect, useRef } from "react";

import { FileDropZone } from "@/components/common/FileDropZone";
import type { QuoteAttachmentSlotCategory } from "@/lib/domain/attachment-category";
import {
  QUOTE_ATTACHMENT_PENDING_NOTE,
  QUOTE_ATTACHMENT_SAVED_NOTE,
  QUOTE_ATTACHMENT_SLOTS,
  describeQuoteAttachmentFile,
  describeQuoteLineCounts,
  formatPendingFileSize,
  quoteAttachmentDeleteText,
  quoteAttachmentDownloadUrl,
  quoteAttachmentViewUrl,
  quoteListFileBadges,
  type QuoteAttachmentSlotDefinition,
  type QuoteAttachmentSlotFileView,
  type QuoteLineCounts,
  type QuoteListFileBadge,
  type ResolvedQuoteSlots,
} from "./quote-attachment-files";
import {
  QUOTE_EXCEL_CONFLICTS_TITLE,
  QUOTE_EXCEL_READING_TEXT,
  quoteExcelConflictText,
  type QuoteExcelFieldChange,
} from "./quote-excel-autofill";
import type { QuoteIssueNoticeLine } from "./quote-issue-messages";
import { QuoteIssueNoticeLines } from "./QuoteIssueButton";

/**
 * ============================================================================
 * 견적서 파일 · 엑셀 전용 — 그리기 조각 (3b-1 · 3c-2 · 3d-0 · 3d-3f · 3d-4)
 * ============================================================================
 * 서버 액션을 부르지 않는다 — 올리기 · 지우기는 부르는 쪽이 넘긴 콜백이 한다. 그래서
 * 이 파일은 `server-only` 사슬 없이 그려 볼 수 있다(QuoteAttachmentParts.test.tsx,
 * 목록 `components`). 상태는 부르는 쪽이, 문구와 판정은 quote-attachment-files.ts 가
 * 갖는다(조각 3d-3d 에 왔다).
 *
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/components/quotes/QuoteAttachmentParts.tsx`, 646줄 —
 * 2026-09-28 실측)이다. 🔴 **파일 이름 · 조각 이름 · 파일 안의 차례를 저쪽과 똑같이
 * 둔다** — 조각 4 에서 두 벌을 글자로 대조한다.
 *
 * 🔴 아래 조각들의 글자(안내 문장 · 단추 이름)를 A/S 와 다르게 고치지 마라 — 같은
 * 일을 하는 화면이 두 저장소에 있는 동안(조각 4 전까지) 한쪽만 바뀌면 사람은 두
 * 사이트에서 다른 말을 듣는다.
 *
 * ── 지금 여기 있는 것 ───────────────────────────────────────────────────
 *   · `QuoteAttachmentFilePicker`   — 숨긴 파일 칸을 여는 단추 (3d-3f)
 *   · `QuoteAttachmentSlotCard`     — 칸 하나 (3d-4)
 *   · `QuoteAttachmentSlotsView`    — 「견적서 파일」 구역(안내 · 두 칸 · 한 줄) (3d-4)
 *   · `QuoteAttachmentDeleteDialog` — 한 칸의 파일 지우기 확인 창 (3d-3f)
 *   · `ExcelOnlySwitch`             — 「엑셀 전용 견적서」 체크 상자 (3b-1)
 *   · `ExcelOnlyClearLinesDialog`   — 줄이 있는 채로 켜려 할 때 묻는 창 (3b-1)
 *   · `QuoteExcelAutofillNotice`    — 수기 엑셀로 칸 채우기 알림 (3e-3)
 *   · `QuoteFileBadges`             — 목록 한 줄의 딱지 셋 (3c-2 · 3d-0)
 *
 * 🔴 **이제 화면에 선다 (조각 3d-4, 2026-09-28).** 견적서 **수정 화면**
 * (`/quotes/{id}`)이 `QuoteAttachmentsSection` 을 거쳐 이 조각들을 그린다 —
 * QuoteEditForm 의 상단 정보 바로 아래다. 딱지는 그 전부터 쓰였다 — 견적서 목록이
 * 줄마다 「엑셀 전용」 · 「결재 PDF」 · 「엑셀 없음」을 왼쪽 칸에 붙인다
 * (QuoteListSlots.tsx 의 `renderFileBadges` 슬롯).
 *
 * ── 🔴 멈춰 있던 자리가 풀렸다 — 칸 둘 ──────────────────────────────────
 * 조각 3d-3f 는 `QuoteAttachmentSlotCard` · `QuoteAttachmentSlotsView` 앞에서
 * **멈췄었다.** 까닭은 이 저장소가 스스로 세운 울타리였다: 칸이 저장된 파일에
 * [보기] · [내려받기]를 세우면서 `quoteAttachmentViewUrl` ·
 * `quoteAttachmentDownloadUrl` 을 부르는데, 그 주소가 가리키는 라우트
 * `/api/attachments/[id]/download` 가 이 사이트에 **없었다** — 가져왔으면 누르면
 * 404 가 뜨는 링크가 섰다. 울타리는 의도대로 작동했다.
 *
 * 🔴 **3d-4 가 라우트를 함께 가져오면서 그 전제가 사라졌다**
 * (`src/app/api/attachments/[id]/download/route.ts`). 울타리는 지우지 않고 **뜻을
 * 바꿨다** — 이제 「그 주소를 부르는 곳은 이 파일뿐이고, 라우트가 실재한다」를 잰다
 * (quote-attachment-files.test.ts).
 *
 * ── 🔴 안 가져온 것 ─────────────────────────────────────────────────────
 *   · ⚠️ `QuoteExcelAutofillNotice`(저쪽 `:544-613`) — 수기 엑셀로 칸 채우기. 그때의
 *     기록이다. 🔴 **조각 3e-3 에 왔다**(2026-09-28, 아래 「수기 엑셀로 칸 채우기」).
 *     그래서 `QuoteAttachmentSlotCard` 의 `details` · `QuoteAttachmentSlotsView` 의
 *     `slotDetails` 도 이제 **실제로 채워진다** — 편집 폼이 이 알림을 그려
 *     `excelSlotDetails` 로 넘기고, 그 값이 「수기 견적서 엑셀」 칸 하나에만 붙는다
 *     (QuoteEditForm 의 `excelAutofillPanel` · QuoteAttachmentsSection 의 그 프롭).
 *     🔴 곁딸린 `QuoteIssueNoticeLines`(결과 줄 그리기)도 함께 왔다 — 저쪽과 같은
 *     자리(QuoteIssueButton.tsx)에 **그 조각 하나만** 두었고, [견적서 받기] 단추
 *     자체는 여전히 없다(그 파일 머리말).
 *   · ⚠️ `QuoteAttachmentSlotsView` 의 `statusDetails` 는 그대로 비어 있다 — 저쪽은 결재 PDF 의
 *     공유폴더 결과 줄을 여기 끼우는데, 공유폴더 복사는 **발행(조각 3c-3)** 의 몫이라
 *     이 사이트의 올리기 통로는 `archive` 에 언제나 null 을 싣는다.
 *     🔴 **그때의 기록이다 — 조각 3c-3b 가 채웠다**(2026-09-28). 올리기 통로가 결재 PDF 를
 *     사내 공유폴더에 복사하기 시작했고, `QuoteAttachmentsSection` 이 그 결과 줄
 *     (`archiveNotice`)을 저쪽과 같은 자리에 넘긴다. 이 프롭은 그대로 두었다 — 받는 쪽은
 *     처음부터 저쪽 글자였다.
 *
 * ── 확인창은 native `<dialog>` + `showModal()` ─────────────────────────
 * 이 앱의 관례다(common/NoticePopup.tsx 도 같은 방식). 열려 있는 동안만 그린다.
 * ============================================================================
 */

const SMALL_BUTTON_CLASS =
  "inline-block rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300";
/*
 * 🔴 **조각 3d-4 에 왔다.** 이 자리에 「저쪽에서 이것을 쓰는 곳은 칸의 [지우기] 단추
 * 하나뿐이고 그 칸이 막혀 있어 함께 오지 않았다 — 쓰는 데 없이 두면 lint 가 잡는다」고
 * 적혀 있었다. 칸이 왔고, 그 단추가 이 값을 쓴다(저쪽 `:56-57` 과 한 글자도 같다).
 */
const SMALL_DANGER_BUTTON_CLASS =
  "rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:border-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400";
const DIALOG_CLASS =
  "w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";
const DIALOG_CANCEL_CLASS =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

// ────────────────────────────────────────────────── 파일 고르기 단추

/**
 * 숨긴 파일 칸을 여는 단추. 고른 뒤 칸을 비워 같은 파일을 다시 고를 수 있게 한다(그러지
 * 않으면 같은 파일을 두 번째 고를 때 change 가 오지 않는다). 칸마다 파일은 하나라 한 개만.
 */
export function QuoteAttachmentFilePicker({
  accept,
  label,
  ariaLabel,
  disabled,
  onFile,
}: {
  accept: string;
  label: string;
  ariaLabel: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={ariaLabel}
        className={SMALL_BUTTON_CLASS}
      >
        {label}
      </button>
    </>
  );
}

// ────────────────────────────────────────────────── 칸 하나

export type PendingFileLike = { name: string; size: number };

export type QuoteAttachmentSlotsMode = "saved" | "pending";

/** 칸 하나. 이름이 길어도 줄바꿈한다(break-all) — 폭 400px 에서 가로로 넘치지 않는다. */
export function QuoteAttachmentSlotCard({
  definition,
  mode,
  file,
  pending,
  error,
  busy,
  disabled,
  onPickFile,
  onRetry,
  onClearPending,
  onRequestDelete,
  details = null,
}: {
  definition: QuoteAttachmentSlotDefinition;
  mode: QuoteAttachmentSlotsMode;
  /** 지금 칸에 붙어 있는 파일(수정 화면). 새 견적서에서는 방금 올린 것만 온다. */
  file: QuoteAttachmentSlotFileView | null;
  /** 들고 있는 파일 — 새 견적서면 [저장] 뒤에 올릴 것, 수정 화면이면 올리지 못한 것. */
  pending: PendingFileLike | null;
  error: string | null;
  /** 이 칸을 올리는 중인가. */
  busy: boolean;
  disabled: boolean;
  onPickFile: (file: File) => void;
  onRetry: () => void;
  onClearPending: () => void;
  onRequestDelete: () => void;
  /**
   * 칸 맨 아래에 붙는 것 — 저쪽에서는 「수기 견적서 엑셀」 칸의 엑셀 읽기 알림
   * (견적서 ①b, QuoteExcelAutofillNotice)이 여기 들어간다. 🔴 **이 사이트에는 그
   * 조각이 아직 없어 아무도 넘기지 않는다**(파일 머리말의 「안 가져온 것」) — 저쪽과
   * 모양을 맞춰 두려고 받는 자리만 둔다. 안 주면 지금 그대로다.
   */
  details?: React.ReactNode;
}) {
  const { label, accept, viewableInBrowser } = definition;
  const failedHold = mode === "saved" && pending !== null;

  return (
    /*
      칸 위에 폴더에서 끌어다 놓아도 된다 — 떨군 파일은 고르기 단추와 **같은
      onPickFile** 을 타므로 판정(quote-attachment-files.ts 의 checkQuoteAttachmentFile)도
      같다. 칸마다 파일은 하나라 multiple 은 false 다 — 여럿을 놓으면 거절하고 알린다.
    */
    <FileDropZone
      name={`quote-attachment-${definition.category}`}
      multiple={false}
      disabled={disabled || busy}
      hint={`${label} 하나를 여기에 놓으세요`}
      onFiles={(files) => onPickFile(files[0])}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {definition.extensions.join(" · ")} · 20MB 까지
        </span>
      </div>

      {file ? (
        <div className="min-w-0">
          <p className="break-all text-sm text-zinc-800 dark:text-zinc-200">{file.originalFileName}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{describeQuoteAttachmentFile(file)}</p>
        </div>
      ) : mode === "pending" && pending ? (
        <div className="min-w-0">
          <p className="break-all text-sm text-zinc-800 dark:text-zinc-200">{pending.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {formatPendingFileSize(pending.size)} · [저장]하면 올라갑니다
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {mode === "pending" ? "아직 고른 파일이 없습니다." : "아직 붙인 파일이 없습니다."}
        </p>
      )}

      {busy ? (
        <p role="status" className="text-xs text-zinc-700 dark:text-zinc-300">
          올리는 중…
        </p>
      ) : null}

      {failedHold && pending ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="break-all">
            올리지 못한 파일: {pending.name}
            {error ? ` — ${error}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={onRetry} disabled={disabled} className={SMALL_BUTTON_CLASS}>
              다시 올리기
            </button>
            <button type="button" onClick={onClearPending} disabled={disabled} className={SMALL_BUTTON_CLASS}>
              빼기
            </button>
          </div>
        </div>
      ) : error ? (
        <p role="alert" className="break-all text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {file && mode === "saved" ? (
          <>
            {viewableInBrowser ? (
              // 새 탭에서 페이지 안으로 연다(받기 통로의 view=full → inline).
              //
              // 🔴 이 화면 안에 끼워(iframe) 보여 주지 않는다. 저쪽에서 적어 둔 까닭은
              // 「모든 주소에 걸린 frame-ancestors 'none'」인데, **이 사이트의
              // next.config.ts 에는 헤더 규칙이 한 줄도 없다**(2026-09-28 실측). 그래도
              // 새 탭으로 여는 것을 바꾸지 않는다 — 끼워서 보여 주면 PDF 가 이 페이지와
              // 같은 문서 안에서 열리고(세션 쿠키가 닿는 자리다), 저쪽과 화면도 갈린다.
              // 그 위험을 저울질한 내용은 받기 통로의 inline-view.ts 에 있다.
              <a
                href={quoteAttachmentViewUrl(file.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={SMALL_BUTTON_CLASS}
              >
                보기
              </a>
            ) : null}
            <a href={quoteAttachmentDownloadUrl(file.id)} className={SMALL_BUTTON_CLASS}>
              내려받기
            </a>
            <QuoteAttachmentFilePicker
              accept={accept}
              label="바꾸기"
              ariaLabel={`${label} 바꾸기`}
              disabled={disabled}
              onFile={onPickFile}
            />
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={disabled}
              aria-label={`${label} 지우기`}
              className={SMALL_DANGER_BUTTON_CLASS}
            >
              지우기
            </button>
          </>
        ) : mode === "pending" && pending ? (
          <>
            <QuoteAttachmentFilePicker
              accept={accept}
              label="다른 파일로"
              ariaLabel={`${label} 다른 파일로`}
              disabled={disabled}
              onFile={onPickFile}
            />
            <button type="button" onClick={onClearPending} disabled={disabled} className={SMALL_BUTTON_CLASS}>
              빼기
            </button>
          </>
        ) : file ? null : (
          <QuoteAttachmentFilePicker
            accept={accept}
            label="파일 올리기"
            ariaLabel={`${label} 파일 올리기`}
            disabled={disabled}
            onFile={onPickFile}
          />
        )}
      </div>

      {details}
    </FileDropZone>
  );
}

// ────────────────────────────────────────────────── 두 칸

/** 「견적서 파일」 구역 — 안내 · 두 칸 · 방금 한 일의 한 줄. */
export function QuoteAttachmentSlotsView({
  mode,
  slots,
  pending,
  errors,
  busyCategory,
  statusText,
  statusDetails = null,
  notice,
  disabled,
  onPickFile,
  onRetry,
  onClearPending,
  onRequestDelete,
  slotDetails = {},
}: {
  mode: QuoteAttachmentSlotsMode;
  slots: ResolvedQuoteSlots;
  pending: Partial<Record<QuoteAttachmentSlotCategory, PendingFileLike>>;
  errors: Partial<Record<QuoteAttachmentSlotCategory, string>>;
  busyCategory: QuoteAttachmentSlotCategory | null;
  statusText: string | null;
  /**
   * 방금 한 일의 한 줄 아래에 붙는 것 — 저쪽에서는 결재 PDF 의 공유폴더 결과 줄
   * (2026-09-15 B1c)이다. 🔴 **이 사이트에는 공유폴더 복사가 아직 없어 아무도
   * 넘기지 않는다**(발행 조각 3c-3 의 몫 — quote-attachment-upload.ts 머리말).
   * 안 주면 지금 그대로다.
   */
  statusDetails?: React.ReactNode;
  /** 엑셀 전용인데 엑셀이 없을 때의 안내(quote-attachment-files.ts 의 excelOnlyMissingExcelNotice). */
  notice: string | null;
  disabled: boolean;
  onPickFile: (category: QuoteAttachmentSlotCategory, file: File) => void;
  onRetry: (category: QuoteAttachmentSlotCategory) => void;
  onClearPending: (category: QuoteAttachmentSlotCategory) => void;
  onRequestDelete: (category: QuoteAttachmentSlotCategory) => void;
  /** 칸마다 맨 아래에 붙는 것(QuoteAttachmentSlotCard 의 details). 안 주면 지금 그대로다. */
  slotDetails?: Partial<Record<QuoteAttachmentSlotCategory, React.ReactNode>>;
}) {
  return (
    <section
      aria-label="견적서 파일"
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">견적서 파일</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">결재 PDF 1개 · 수기 엑셀 1개</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {mode === "saved" ? QUOTE_ATTACHMENT_SAVED_NOTE : QUOTE_ATTACHMENT_PENDING_NOTE}
      </p>

      {notice ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {QUOTE_ATTACHMENT_SLOTS.map((definition) => (
          <QuoteAttachmentSlotCard
            key={definition.category}
            definition={definition}
            mode={mode}
            file={slots[definition.category]}
            pending={pending[definition.category] ?? null}
            error={errors[definition.category] ?? null}
            busy={busyCategory === definition.category}
            disabled={disabled}
            onPickFile={(file) => onPickFile(definition.category, file)}
            onRetry={() => onRetry(definition.category)}
            onClearPending={() => onClearPending(definition.category)}
            onRequestDelete={() => onRequestDelete(definition.category)}
            details={slotDetails[definition.category] ?? null}
          />
        ))}
      </div>

      {statusText ? (
        <p role="status" className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          {statusText}
        </p>
      ) : null}
      {statusDetails}
    </section>
  );
}

// ────────────────────────────────────────────────── 확인창

/** 그려지는 순간 모달로 연다. 닫기는 부모 상태를 걷어 이 조각을 치우는 것이다. */
function useShowModalOnMount() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return dialogRef;
}

/** 한 칸의 파일 지우기 확인 — 첨부 휴지통으로 간다. */
export function QuoteAttachmentDeleteDialog({
  category,
  file,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: {
  category: QuoteAttachmentSlotCategory;
  file: QuoteAttachmentSlotFileView;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useShowModalOnMount();
  const text = quoteAttachmentDeleteText(category);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="quote-attachment-delete-title"
      onCancel={(event) => {
        event.preventDefault();
        if (isSubmitting) return;
        onCancel();
      }}
      className={DIALOG_CLASS}
    >
      <h2 id="quote-attachment-delete-title" className="text-sm font-semibold">
        {text.title}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{text.body}</p>
      <p className="mt-2 break-all text-xs text-zinc-700 dark:text-zinc-300">{file.originalFileName}</p>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className={DIALOG_CANCEL_CLASS}>
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "옮기는 중..." : "지우기"}
        </button>
      </div>
    </dialog>
  );
}

// ────────────────────────────────────────────────── 엑셀 전용

/**
 * 엑셀 전용 스위치. 켜고 끄는 판정(줄이 있으면 먼저 묻는다)은 부르는 쪽이 한다 — 여기서는
 * 사람이 누른 방향만 넘긴다. 체크 상태는 부르는 쪽의 값이라, 묻는 동안에는 꺼진 채다.
 *
 * 🔴 곁말에 **[견적서 받기]** 가 나온다. 그 단추는 조각 3c-2 에 와서 이제 목록 줄마다
 * 선다 — 문장이 가리키는 것이 이 사이트에도 실재한다.
 */
export function ExcelOnlySwitch({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">엑셀 전용 견적서</span>
        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
          손으로 만든 엑셀로 발행합니다 — 부품 · 수리 작업 · 작업 내역 · 작업비 구역을 쓰지 않고 공급가액을 직접
          적습니다. [견적서 받기]는 「수기 견적서 엑셀」 칸에 붙인 파일을 내려줍니다.
        </span>
      </span>
    </label>
  );
}

/**
 * 줄이 있는 견적서에서 엑셀 전용을 켜려 할 때. 서버는 줄이 있는 엑셀 전용 장을 **거절한다**
 * (조용히 지우지 않는다) — 그래서 켜는 순간 줄을 비울지 묻는다. 비운 줄은 저장 전에 끄면
 * 돌아온다.
 */
export function ExcelOnlyClearLinesDialog({
  counts,
  onConfirm,
  onCancel,
}: {
  counts: QuoteLineCounts;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useShowModalOnMount();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="quote-excel-only-clear-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className={DIALOG_CLASS}
    >
      <h2 id="quote-excel-only-clear-title" className="text-sm font-semibold">
        엑셀 전용으로 바꾸려면 적힌 줄을 비워야 합니다
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        엑셀 전용 견적서에는 부품 · 작업 내역 · 수리 작업 줄을 둘 수 없습니다 — 줄이 있으면 저장이 거절됩니다.
        지금 적힌 {describeQuoteLineCounts(counts)}을 화면에서 비우고 켤까요?
      </p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        저장하기 전에 엑셀 전용을 끄면 비운 줄이 그대로 돌아옵니다. 켠 채로 저장하면 줄 없이 저장됩니다.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={DIALOG_CANCEL_CLASS}>
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-primary-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-100 dark:text-zinc-900 dark:hover:bg-primary-300"
        >
          줄을 비우고 켜기
        </button>
      </div>
    </dialog>
  );
}

// ────────────────────────────────────────────────── 수기 엑셀로 칸 채우기 (조각 3e-3)

/**
 * 「수기 견적서 엑셀」 칸 곁의 엑셀 읽기 알림 — 읽는 중 · 결과 줄 · 「엑셀과 다른 칸」 목록과
 * [엑셀 값으로 바꾸기]. 문장은 quote-excel-autofill.ts 가 짓고, 바꾸는 일은 부르는 쪽(편집 폼)이
 * 넘긴 콜백이 한다 — 종류도 select 와 같은 함수를 탄다(QuoteEditForm 의 applyExcelValue).
 *
 * 칸마다 [엑셀 값으로 바꾸기]를 두고, 다른 칸이 둘 이상이면 [모두 엑셀 값으로 바꾸기]도 둔다. 바꾼
 * 칸은 부르는 쪽이 목록을 지금 값으로 다시 뽑아 빠진다. 폭 400px 에서도 넘치지 않게 줄바꿈한다.
 */
export function QuoteExcelAutofillNotice({
  reading,
  lines,
  conflicts,
  disabled,
  onReplace,
  onReplaceAll,
  onDismiss,
}: {
  /** 읽는 중이면 「엑셀을 읽는 중…」 한 줄만. */
  reading: boolean;
  /** 채운 칸 · 다른 칸 · 경고 · 실패 줄(quoteExcelAutofillNoticeLines). */
  lines: readonly QuoteIssueNoticeLine[];
  /** **지금** 엑셀과 다른 칸 — 부르는 쪽이 그릴 때마다 다시 뽑는다. */
  conflicts: readonly QuoteExcelFieldChange[];
  disabled: boolean;
  onReplace: (change: QuoteExcelFieldChange) => void;
  onReplaceAll: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="엑셀에서 칸 채우기"
      className="flex min-w-0 flex-col gap-2 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs dark:border-sky-900 dark:bg-sky-950/40"
    >
      {reading ? (
        <p role="status" className="text-zinc-700 dark:text-zinc-300">
          {QUOTE_EXCEL_READING_TEXT}
        </p>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <QuoteIssueNoticeLines lines={lines} className="min-w-0" />
          <button type="button" onClick={onDismiss} aria-label="엑셀 읽기 알림 닫기" className={SMALL_BUTTON_CLASS}>
            닫기
          </button>
        </div>
      )}

      {!reading && conflicts.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-sky-200 pt-2 dark:border-sky-900">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{QUOTE_EXCEL_CONFLICTS_TITLE}</p>
          <ul className="flex flex-col gap-1.5">
            {conflicts.map((change) => (
              <li key={change.field} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-all text-zinc-800 dark:text-zinc-200">{quoteExcelConflictText(change)}</span>
                <button
                  type="button"
                  onClick={() => onReplace(change)}
                  disabled={disabled}
                  aria-label={`${change.label} 엑셀 값으로 바꾸기`}
                  className={SMALL_BUTTON_CLASS}
                >
                  엑셀 값으로 바꾸기
                </button>
              </li>
            ))}
          </ul>
          {conflicts.length > 1 ? (
            <div>
              <button type="button" onClick={onReplaceAll} disabled={disabled} className={SMALL_BUTTON_CLASS}>
                {`모두 엑셀 값으로 바꾸기 (${conflicts.length}칸)`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────── 목록 표시

/**
 * 딱지의 색조. 🔴 **A/S 의 같은 이름 상수 그대로**다(저쪽 `BADGE_TONE_CLASS`) — 같은 줄이
 * 두 사이트에서 다른 색으로 보이면 사람이 같은 견적서를 다른 것으로 본다. 2026-09-23
 * (조각 3d-0)부터 **셋 다 쓰인다** — `info`(엑셀 전용) · `neutral`(결재 PDF) ·
 * `warning`(엑셀 없음).
 */
const BADGE_TONE_CLASS: Record<QuoteListFileBadge["tone"], string> = {
  info: "rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  neutral:
    "rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400",
  warning:
    "rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

/**
 * 목록 한 줄의 표시 — **엑셀 전용 · 결재 PDF · 엑셀 없음**(조각 3c-2 · 3d-0 · 규칙은
 * quote-attachment-files.ts 의 `quoteListFileBadges`). 부르는 쪽의 `flex-wrap` 줄 안에
 * 그대로 흘러 들어가도록 조각(fragment)으로 돌려준다 — 좁은 화면에서는 줄바꿈된다.
 * 붙일 것이 없으면 아무것도 그리지 않는다.
 *
 * 🔴 **A/S 의 같은 이름 조각과 모양이 같다**(저쪽 `QuoteFileBadges`) — 받는 줄도 이제
 * 저쪽과 같은 `{ isExcelOnly, hasSignedPdf, hasExcel }` 셋이다. 🔴 **그 셋은 목록 줄에
 * 이미 실려 온다**(vendor/dss-core 의 `QuoteListItem`) — 부르는 쪽
 * (QuoteListSlots.tsx 의 `renderFileBadges`)이 줄을 통째로 넘기므로 값이 그대로 들어온다.
 * 두 사이트가 **같은 `attachments` 표**를 보기 때문에, PO 에 파일을 붙이는 칸이 오기
 * 전에도 A/S 에서 붙인 파일이 여기 정확히 잡힌다.
 */
export function QuoteFileBadges({ row }: { row: { isExcelOnly: boolean; hasSignedPdf: boolean; hasExcel: boolean } }) {
  const badges = quoteListFileBadges(row);
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((badge) => (
        <span key={badge.key} title={badge.title} className={BADGE_TONE_CLASS[badge.tone]}>
          {badge.label}
        </span>
      ))}
    </>
  );
}
