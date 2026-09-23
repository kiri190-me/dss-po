"use client";

import { useEffect, useId, useRef } from "react";

/**
 * ============================================================================
 * 알림 팝업 — **할 수 없는 일의 까닭**을 한 장으로 말하고, 사람이 닫는다
 * ============================================================================
 * 2026-09-23 사용자 요청: 견적서 목록에서 받을 수 없는 줄의 [견적서 받기]를 눌렀더니
 * 브라우저 창에 거절 JSON 이 날것으로 떴다 — 「우리가 항상 쓰는 팝업 스타일로 알림을
 * 띄워줘」.
 *
 * ── 🔴 왜 SavePopup 을 쓰지 않는가 ──────────────────────────────────────
 * common/SavePopup.tsx 는 **성공 전용**이다. 초록 ✓ 가 박혀 있고
 * (domain/save-popup.ts 의 `SAVE_POPUP_VISIBLE_MS`) **0.5초 뒤 저절로 닫힌다** —
 * 사용자가 「0.5초쯤」으로 정한 값이고, 저장이 끝났다는 신호에는 그 길이가 맞다.
 * 까닭을 말하는 문장은 그 시간에 읽히지 않는다. 그래서 **닫히는 방식이 다른** 팝업을
 * 따로 둔다: 저절로 닫히지 않고, [확인] 이나 Esc 로 사람이 닫는다.
 *
 * ── 모양은 이 저장소의 팝업 그대로다 ────────────────────────────────────
 * 네이티브 `<dialog>` + `showModal()` — 확인 창들(quotes/QuoteAttachmentParts.tsx 의
 * `ExcelOnlyClearLinesDialog`, 서브모듈의 휴지통 창 셋)과 같은 상자(`w-full max-w-md
 * rounded-lg … backdrop:bg-black/40`)에, SavePopup 이 쓰는 **동그란 아이콘**을 색만
 * 바꿔 얹었다(초록 ✓ → 호박색 !). 가운데 세우는 일은 globals.css 의 `dialog { margin:
 * auto }` 가 한다 — 그 줄이 없으면 팝업 전부가 왼쪽 위 구석에 붙는다.
 *
 * ── 🔴 저절로 닫히는 길을 두지 않는다 ───────────────────────────────────
 * 이 저장소는 「팝업이 즉시 닫힘」으로 한 번 고생했다. 그래서 여기에는 **타이머도,
 * 덮개를 눌러 닫는 길도, `<dialog onClose>` 도 없다.** 닫히는 길은 둘뿐이다:
 *   · [확인] 단추 → `onClose()`
 *   · Esc → `onCancel` 에서 기본 동작을 막고 같은 `onClose()` 를 부른다
 * 둘 다 **부르는 쪽의 상태**를 끄고, 그 결과로 이 조각이 사라지면서 창이 닫힌다
 * (아래 정리 함수). 창이 제 마음대로 닫히고 부모는 아직 열려 있다고 믿는 어긋남이
 * 생기지 않는다.
 *
 * ── 🔴 A/S 에도 같은 구멍이 있다 ────────────────────────────────────────
 * A/S 관리 시스템에도 **오류를 알리는 공용 팝업 조각이 없고**(실측 2026-09-23 — 그쪽
 * SavePopup 은 이 파일과 바이트 동일한 성공 전용이고, `domain/notification-toast.ts`
 * 는 브라우저 OS 알림이라 다른 물건이다), 보기 권한자가 같은 줄의 [견적서 받기]를
 * 누르면 **똑같이 날 JSON 이 뜬다**. 그래서 이 조각은 견적서를 하나도 모르게 두었다 —
 * 제목과 문장을 받기만 한다. 저쪽으로 **파일째 옮겨** 그쪽 `DownloadLink` 에 걸 수
 * 있도록 이름과 자리(`src/components/common/NoticePopup.tsx`)를 맞췄다.
 * ============================================================================
 */

/** 확인 창들과 같은 상자 — 이 저장소의 팝업은 폭도 모서리도 덮개도 이 값이다. */
const NOTICE_POPUP_CLASS =
  "w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

/** 닫는 단추 — 확인 창의 주 단추와 같은 값(quotes/QuoteAttachmentParts.tsx). */
const NOTICE_POPUP_CONFIRM_CLASS =
  "rounded-md bg-primary-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-100 dark:text-zinc-900 dark:hover:bg-primary-300";

/**
 * 알림 한 장.
 *
 * 🔴 **제 상태를 갖지 않는다** — 떠 있는지 아닌지는 부르는 쪽이 들고, 이 조각은
 * 그려지는 동안만 떠 있다(휴지통 창 셋과 같은 원칙). 그래서 `isOpen` 프롭이 없다:
 * 띄울 때 그리고, 닫을 때 지운다.
 *
 * @param title   한 줄 제목 — 무엇이 안 되었는지.
 * @param message 까닭과 지금 할 수 있는 일.
 * @param onClose [확인] 이나 Esc 로 사람이 닫았다.
 */
export function NoticePopup({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 이 조각이 사라질 때 창도 함께 닫는다 — 열린 채로 DOM 에서 떨어지면 최상위
    // 층에 껍데기가 남아 그 뒤의 화면이 눌리지 않는다.
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc 로 닫는 것도 부르는 쪽을 거치게 한다 — 창만 닫히고 부모는 아직 열려
        // 있다고 믿으면, 같은 줄을 다시 눌러도 아무 일도 일어나지 않는다.
        event.preventDefault();
        onClose();
      }}
      className={NOTICE_POPUP_CLASS}
    >
      <div role="alert" className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-200"
        >
          !
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" autoFocus onClick={onClose} className={NOTICE_POPUP_CONFIRM_CLASS}>
          확인
        </button>
      </div>
    </dialog>
  );
}
