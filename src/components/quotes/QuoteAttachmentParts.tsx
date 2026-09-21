"use client";

import { useEffect, useRef } from "react";

import { describeQuoteLineCounts, type QuoteLineCounts } from "./quote-attachment-files";

/**
 * ============================================================================
 * 🔴 여기 있는 것은 **엑셀 전용 스위치와 그 확인 창**뿐이다 (조각 3b-1)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(700여 줄)은 **견적서 파일 칸**의 조각 전부다 —
 * 파일 끌어놓기(FileDropZone) · 칸마다의 미리보기 · 지우기 확인 창 · 「수기 견적서
 * 엑셀로 칸 채우기」 알림까지. 그것들은 **첨부 구역(조각 3d)** 과 함께 온다.
 *
 * 편집 폼이 저쪽 파일에서 실제로 쓰는 것은 둘이다:
 *   · `ExcelOnlySwitch`          — 「엑셀 전용 견적서」 체크 상자
 *   · `ExcelOnlyClearLinesDialog` — 줄이 있는 채로 켜려 할 때 묻는 창
 *
 * 그 둘은 파일을 만지지 않는다 — **켜고 끄는 판정은 부르는 쪽**(QuoteEditForm 의
 * toggleExcelOnly → quote-attachment-files.ts 의 planExcelOnlyToggle)이 한다.
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 조각 3d 가 올 때 저쪽 나머지를 이
 * 파일에 더하기만 하면 되고, 조각 4 에서 두 벌을 글자로 대조할 수 있다.
 *
 * 🔴 아래 두 조각의 글자(안내 문장 · 단추 이름)를 A/S 와 다르게 고치지 마라 —
 * 같은 일을 하는 화면이 두 저장소에 있는 동안(조각 4 전까지) 한쪽만 바뀌면 사람은
 * 두 사이트에서 다른 말을 듣는다.
 *
 * 🔴 스위치의 곁말에 **[견적서 받기]** 가 나온다. 그 단추는 이 사이트에 아직 없다
 * (조각 3c) — 그래도 **문장을 고치지 않았다**: 저쪽에서 켠 장을 이쪽에서 열 수도
 * 있고, 엑셀 전용의 뜻(「손으로 만든 엑셀이 곧 보낼 문서다」)은 그 문장이 가장 정확히
 * 말한다. 3c 가 오면 그 단추가 그대로 생긴다.
 * ============================================================================
 */

const DIALOG_CLASS =
  "w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";
const DIALOG_CANCEL_CLASS =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

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

// ────────────────────────────────────────────────── 엑셀 전용

/**
 * 엑셀 전용 스위치. 켜고 끄는 판정(줄이 있으면 먼저 묻는다)은 부르는 쪽이 한다 — 여기서는
 * 사람이 누른 방향만 넘긴다. 체크 상태는 부르는 쪽의 값이라, 묻는 동안에는 꺼진 채다.
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
