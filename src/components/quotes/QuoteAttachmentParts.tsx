"use client";

import { useEffect, useRef } from "react";

import type { QuoteAttachmentSlotCategory } from "@/lib/domain/attachment-category";
import {
  describeQuoteLineCounts,
  quoteAttachmentDeleteText,
  quoteListFileBadges,
  type QuoteAttachmentSlotFileView,
  type QuoteLineCounts,
  type QuoteListFileBadge,
} from "./quote-attachment-files";

/**
 * ============================================================================
 * 견적서 파일 · 엑셀 전용 — 그리기 조각 (3b-1 · 3c-2 · 3d-0 · 3d-3f)
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
 *   · `QuoteAttachmentDeleteDialog` — 한 칸의 파일 지우기 확인 창 (3d-3f)
 *   · `ExcelOnlySwitch`             — 「엑셀 전용 견적서」 체크 상자 (3b-1)
 *   · `ExcelOnlyClearLinesDialog`   — 줄이 있는 채로 켜려 할 때 묻는 창 (3b-1)
 *   · `QuoteFileBadges`             — 목록 한 줄의 딱지 셋 (3c-2 · 3d-0)
 *
 * 앞의 넷은 아직 **아무 화면도 부르지 않는다**(편집 폼에 잇는 배선은 조각 3d-4 의
 * 몫이다). 딱지만 지금 쓰인다 — 견적서 목록이 줄마다 「엑셀 전용」 · 「결재 PDF」 ·
 * 「엑셀 없음」을 왼쪽 칸에 붙인다(QuoteListSlots.tsx 의 `renderFileBadges` 슬롯).
 *
 * ── 🔴 멈춘 자리 — 칸 둘(`QuoteAttachmentSlotCard` · `QuoteAttachmentSlotsView`)
 * 조각 3d-3f 가 저쪽 `:117-391` 의 그 둘을 가져오려다 **멈췄다.** 까닭은 이 저장소가
 * 스스로 세운 울타리다:
 *
 *   `quote-attachment-files.ts` 의 주소 짓는 함수 둘(보기 · 내려받기)이 가리키는
 *   라우트 `/api/attachments/[id]/download` 가 **이 사이트에 아직 없다**(조각 3d-4 가
 *   가져온다). 그래서 조각 3d-3d 가 「이 저장소의 어느 파일도 그 주소를 부르지
 *   않는다」를 `src/` 전체를 훑어 못 박아 두었다
 *   (quote-attachment-files.test.ts 의 같은 이름 시험).
 *
 * 🔴 `QuoteAttachmentSlotCard` 는 저장된 견적서 칸에 [보기] · [내려받기]를 세우면서
 * 그 함수 둘을 **곧바로 부른다.** 지금 가져오면 그 울타리가 걸린다 — 그리고 걸리는
 * 것이 맞다: 라우트가 없으므로 그 단추는 **누르면 404 가 뜨는 링크**다. 울타리의
 * 곁말이 「걸리는 날 사람이 **라우트가 함께 왔는지**를 보게 된다」고 적어 둔 그 자리다.
 *
 * 🔴 **울타리를 풀지 않았다.** 푸는 길은 둘뿐이고 둘 다 이 조각의 몫이 아니다 —
 * 라우트를 함께 가져오거나(조각 3d-4), 칸에서 그 두 단추를 빼거나(A/S 와 글자가
 * 갈린다). 사용자에게 보고하고 멈춘다.
 *
 * ── 🔴 안 가져온 것 ─────────────────────────────────────────────────────
 *   · `QuoteExcelAutofillNotice`(저쪽 `:544-629`) — 수기 엑셀로 칸 채우기. 별 조각이다.
 *   · `QuoteAttachmentsSection.tsx`(저쪽 368줄) — `useRouter` + 서버 액션 직접 호출.
 *     조각 3d-4(배선)의 몫이다.
 *
 * ── 확인창은 native `<dialog>` + `showModal()` ─────────────────────────
 * 이 앱의 관례다(common/NoticePopup.tsx 도 같은 방식). 열려 있는 동안만 그린다.
 * ============================================================================
 */

const SMALL_BUTTON_CLASS =
  "inline-block rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300";
const DIALOG_CLASS =
  "w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";
const DIALOG_CANCEL_CLASS =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

/*
 * 🔴 `SMALL_DANGER_BUTTON_CLASS`(저쪽 `:56-57`)는 함께 오지 않았다 — 저쪽에서 그것을
 * 쓰는 곳은 칸의 [지우기] 단추 하나뿐이고, 그 칸이 위 「멈춘 자리」에서 막혔다.
 * 쓰는 데 없이 두면 lint 가 잡는다. 칸이 오는 날 함께 온다.
 */

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

/**
 * 🔴 칸을 그리는 조각(`QuoteAttachmentSlotCard`)은 위 「멈춘 자리」에서 막혔다. 받는
 * 타입 둘은 그 칸과 두 칸 구역이 함께 쓰는 것이라 **먼저 와 있다** — A/S 와 같은
 * 이름 · 같은 자리다(저쪽 `:112-114`).
 */
export type PendingFileLike = { name: string; size: number };

export type QuoteAttachmentSlotsMode = "saved" | "pending";

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
