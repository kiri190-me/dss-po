"use client";

import { useState, useSyncExternalStore } from "react";

import {
  isWindowsDesktopClient,
  readQuoteFolderClientPlatform,
  runQuoteFolderHelperInstallCommandCopy,
  type QuoteFolderOpenOutcome,
} from "@/components/quotes/quote-folder-open";
import type { QuoteIssueNoticeLine, QuoteIssueNoticeTone } from "@/components/quotes/quote-issue-messages";
import { runContactFolderPlaceOpen } from "./contact-folder-place-open";

/**
 * ============================================================================
 * 공유폴더 구역의 [폴더 열기] 단추 (조각 PO 4h)
 * ============================================================================
 * 🔴 **A/S 에서 가져왔다** — 원본은 저쪽의 같은 이름 파일(연락서 조각 10). 누른 뒤의 흐름은
 * runContactFolderPlaceOpen(contact-folder-place-open.ts)이 전부 한다 — 이 파일은 단추와
 * 결과 줄만 그린다.
 *
 * ── 🔴 결과 줄을 저쪽처럼 **빌려 쓰지 못했다** ──────────────────────────
 * 저쪽은 결과 줄 · [설치 명령 복사]를 연락서 조각 2 의 `ContactFolderOpenNotice` 한 벌로
 * 그린다. 🔴 **이 사이트에는 그 조각이 없다**(연락서 화면 자체가 없다). 가장 가까운 것은
 * 편집 화면 머리의 [폴더 열기] 결과 줄인데, 그것을 가져오면 저장소의 울타리 시험
 * (components/quotes/quote-folder-open-screens.test.ts — 그 단추를 부르는 원본을 **셋으로**
 * 못 박는다)이 깨진다. 그래서 **결과 줄만 여기에 적었다.** 🔴 그 대신 복사 갈래는
 * 공용 모듈 하나를 그대로 부른다(runQuoteFolderHelperInstallCommandCopy) — 설치되는 도우미가
 * **PC 당 한 벌**이라 복사 갈래도 한 벌이어야 한다.
 *
 * ── 🔴 Windows 가 아니면 단추가 없다 · 인쇄에 안 찍힌다 ───────────────────
 * 도우미는 Windows PC 에만 설치된다. 서버 렌더 · 첫 렌더는 감춘 채 그린다
 * (useSyncExternalStore — 이 저장소의 다른 단추들과 **같은 방법**).
 *
 * 🔴 **`dark:` 스타일을 지우지 않는다**(2026-09-28 사용자 결정).
 *
 * 서버 액션을 부르지 않는다 — `server-only` 사슬 없이 그려 볼 수 있다.
 * ============================================================================
 */

const subscribeToNothing = () => () => {};
const isWindowsDesktopNow = () =>
  typeof navigator !== "undefined" && isWindowsDesktopClient(readQuoteFolderClientPlatform(navigator));
const hiddenOnServer = () => false;

export const CONTACT_FOLDER_PLACE_OPEN_BUTTON_TEXT = "폴더 열기";

export const CONTACT_FOLDER_PLACE_OPEN_BUTTON_TITLE =
  "이 견적서의 공유폴더를 탐색기로 엽니다 — 이 PC 에 폴더 열기 도우미가 없으면 설치 방법을 알려 드립니다";

/** 🔴 `print:hidden` — 인쇄물에는 조작 단추가 남지 않는다. */
const BUTTON_CLASS =
  "print:hidden rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

const NOTICE_ACTION_CLASS =
  "underline underline-offset-2 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200";

const LINE_TONE_CLASS: Record<QuoteIssueNoticeTone, string> = {
  normal: "text-zinc-700 dark:text-zinc-300",
  muted: "text-zinc-400 dark:text-zinc-500",
  warning: "font-medium text-amber-700 dark:text-amber-400",
};

function NoticeLines({ lines }: { lines: readonly QuoteIssueNoticeLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line, index) => (
        <p key={`${index}-${line.text}`} className={`break-all text-xs ${LINE_TONE_CLASS[line.tone]}`}>
          {line.text}
        </p>
      ))}
    </>
  );
}

/**
 * 결과 줄 · [설치 명령 복사] — **상태를 받아 그리기만 한다**(값을 넣어 그려 볼 수 있게 따로).
 * 🔴 [위치 복사]는 내밀지 않는다 — 이 흐름은 서버에 묻지 않아 전체 주소를 모른다.
 */
export function ContactFolderPlaceOpenNotice({
  outcome,
  copyLines,
  copyBusy,
  onCopy,
}: {
  outcome: QuoteFolderOpenOutcome;
  copyLines: readonly QuoteIssueNoticeLine[];
  copyBusy: boolean;
  onCopy: () => void;
}) {
  return (
    <div role="status" className="flex min-w-0 flex-col items-start gap-0.5">
      <NoticeLines lines={outcome.lines} />
      {/* 🔴 주소를 아예 만들지 못한 결과에서는 설치를 권하지 않는다 — 다시 깔아도 안 열린다. */}
      {outcome.offerHelperInstall && (
        <button
          type="button"
          onClick={onCopy}
          disabled={copyBusy}
          aria-busy={copyBusy}
          data-contact-folder-place-helper-install-command=""
          className={`${NOTICE_ACTION_CLASS} text-xs text-zinc-500 dark:text-zinc-400`}
        >
          {copyBusy ? "복사하는 중…" : "설치 명령 복사"}
        </button>
      )}
      <NoticeLines lines={copyLines} />
    </div>
  );
}

type ContactFolderPlaceOpenButtonProps = {
  /**
   * 🔴 공유폴더 루트 아래의 상대 경로 — `연도 폴더/견적서 폴더`. 통로가 준 값을 부르는
   * 쪽이 그대로 넘긴다(QuoteArchiveFolderSection).
   */
  relativePath: string;
};

/** 단추와 결과 줄 — Windows 판단 없이. 화면에는 기본 내보내기를 쓴다. */
export function ContactFolderPlaceOpenControl({ relativePath }: ContactFolderPlaceOpenButtonProps) {
  const [busy, setBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [outcome, setOutcome] = useState<QuoteFolderOpenOutcome | null>(null);
  const [copyLines, setCopyLines] = useState<QuoteIssueNoticeLine[]>([]);

  async function handleOpen() {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    setCopyLines([]);
    try {
      setOutcome(await runContactFolderPlaceOpen({ relativePath }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      setCopyLines(await runQuoteFolderHelperInstallCommandCopy());
    } finally {
      setCopyBusy(false);
    }
  }

  return (
    <div className="print:hidden flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={busy}
        aria-busy={busy}
        title={CONTACT_FOLDER_PLACE_OPEN_BUTTON_TITLE}
        data-contact-folder-place-open=""
        className={BUTTON_CLASS}
      >
        {busy ? "여는 중…" : CONTACT_FOLDER_PLACE_OPEN_BUTTON_TEXT}
      </button>
      {outcome && (
        <ContactFolderPlaceOpenNotice
          outcome={outcome}
          copyLines={copyLines}
          copyBusy={copyBusy}
          onCopy={() => void handleCopy()}
        />
      )}
    </div>
  );
}

/** 🔴 Windows PC 에서만 그린다 — 서버 렌더 · 첫 렌더는 감춘 채. */
export default function ContactFolderPlaceOpenButton(props: ContactFolderPlaceOpenButtonProps) {
  const isWindows = useSyncExternalStore(subscribeToNothing, isWindowsDesktopNow, hiddenOnServer);
  if (!isWindows) return null;
  return <ContactFolderPlaceOpenControl {...props} />;
}
