"use client";

import { useState, useSyncExternalStore } from "react";

import {
  isWindowsDesktopClient,
  readQuoteFolderClientPlatform,
  runQuoteFolderHelperInstallCommandCopy,
} from "@/components/quotes/quote-folder-open";
import type { QuoteIssueNoticeLine, QuoteIssueNoticeTone } from "@/components/quotes/quote-issue-messages";
import { runContactFolderFileOpen, type ContactFolderFileOpenOutcome } from "./contact-folder-file-open";

/**
 * ============================================================================
 * 공유폴더 목록 한 줄의 [열기] 단추 (조각 PO 4h)
 * ============================================================================
 * 누르면 그 파일이 이 PC 의 연결 프로그램으로 열린다. 누른 뒤의 흐름은
 * runContactFolderFileOpen(contact-folder-file-open.ts)이 전부 한다 — 이 파일은 단추와 결과
 * 줄만 그린다.
 *
 * ── 🔴 **흐름은 이미 이 사이트에 있었다** ───────────────────────────────
 * 조각 PO 4b(2026-10-07)가 [Excel 보기]를 세우면서 `contact-folder-file-open.ts` 를 통째로
 * 가져왔다 — 그러나 **단추는 가져오지 않았다**(그때는 줄마다 [열기]를 그리는 화면이 없었다).
 * 이 조각이 그 단추를 세운다. 🔴 **흐름을 베끼지 않았다** — 이미 있는 그 모듈을 그대로 부른다.
 *
 * ── 🔴 A/S 의 같은 이름 파일과 **다른 자리 하나** ───────────────────────
 * 저쪽(`RF_Service_System/.../ContactFolderEntryOpenButton.tsx`)에는 [그만 보기] 단추가
 * 하나 더 있다. 그것은 저쪽 흐름이 **도우미 세대별 표시**를 들고 있어서 가능한 것이고
 * (`CONTACT_FOLDER_FILE_HELPER_DISMISS_TEXT` · `contactFolderFileOutcomeWithoutHelperOffer` ·
 * `rememberContactFolderFileHelper`), 🔴 **이 사이트의 흐름 모듈에는 그 셋이 없다**(여기 것은
 * 그 기능이 생기기 전 판이다). 없는 것을 부르지 않으려고 그 단추를 빼고, 대신 저쪽이 오래
 * 쓰던 모양 — **열렸든 아니든 늘 [설치 명령 복사]로 이끄는 줄** — 그대로 둔다. 이쪽 흐름이
 * 실제로 그렇게 답한다(`offerHelperInstall` 이 한 번이라도 열어 본 결과에는 늘 참이다).
 * 🔴 흐름 모듈을 이 조각에서 **올리지 않는다** — 그것은 [Excel 보기]도 쓰는 모듈이라 별도
 * 조각의 일이다.
 *
 * ── 🔴 누를 수 있는 줄에만 그린다 ───────────────────────────────────────
 * 허용 목록 밖 확장자 · 확장자 없는 이름 · **폴더 줄**에는 이 단추가 **아예 그려지지 않는다.**
 * 그 판단은 부르는 쪽(QuoteArchiveFolderSection)이 순수 함수 하나로 한다
 * (domain/quote-folder-file-link.ts 의 isOpenableQuoteFolderFileName). 눌러서 거절당하는 것보다
 * 누를 단추가 없는 것이 낫다 — `.exe` 가 목록에 섞여 있어도 손이 갈 곳이 없다.
 *
 * ── 🔴 Windows 가 아니면 단추가 없다 ────────────────────────────────────
 * 도우미는 Windows PC 에만 설치된다. 렌더 중에 navigator 를 만지면 서버 렌더와 첫 렌더가
 * 어긋나므로(hydration) useSyncExternalStore 에 서버용 스냅샷(「아니다」)을 따로 준다 —
 * 편집 화면 머리의 [폴더 열기] · 목록 줄의 [Excel 보기]와 **같은 방법**이다.
 *
 * ── 🔴 인쇄에 안 찍힌다 ─────────────────────────────────────────────────
 * 종이에 남을 이유가 없는 조작 단추라 바깥 틀에 `print:hidden` 을 건다.
 *
 * ── 🔴 복사 갈래는 **가져다 쓴다** ──────────────────────────────────────
 * [설치 명령 복사]는 견적서 쪽 공용 모듈 하나를 그대로 부른다
 * (quote-folder-open.ts 의 runQuoteFolderHelperInstallCommandCopy) — 설치되는 도우미가
 * **PC 당 한 벌**이라 복사 갈래도 한 벌이어야 한다.
 *
 * 🔴 **`dark:` 스타일을 지우지 않는다.** 이 사이트에 다크 모드가 없어 아무것도 안 켜지지만,
 * 지우면 A/S 와 같은 모양이 깨진다(2026-09-28 사용자 결정).
 *
 * 서버 액션을 부르지 않는다 — `server-only` 사슬 없이 그려 볼 수 있다.
 * ============================================================================
 */

const subscribeToNothing = () => () => {};
const isWindowsDesktopNow = () =>
  typeof navigator !== "undefined" && isWindowsDesktopClient(readQuoteFolderClientPlatform(navigator));
const hiddenOnServer = () => false;

/** 단추에 마우스를 올리면 보이는 설명. */
export const CONTACT_FOLDER_ENTRY_OPEN_BUTTON_TITLE =
  "이 파일을 이 PC 의 연결 프로그램으로 엽니다 — 열리지 않으면 폴더 열기 도우미를 다시 설치해 주세요";

const BUTTON_CLASS =
  "rounded border border-zinc-300 px-1.5 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

const NOTICE_ACTION_CLASS =
  "underline underline-offset-2 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200";

const LINE_TONE_CLASS: Record<QuoteIssueNoticeTone, string> = {
  normal: "text-zinc-700 dark:text-zinc-300",
  muted: "text-zinc-400 dark:text-zinc-500",
  warning: "font-medium text-amber-700 dark:text-amber-400",
};

/**
 * 결과 줄들. 🔴 `<span>` 으로 적는다 — 이 조각은 목록 한 줄 안(인라인 자리)에 들어간다.
 */
function NoticeLines({ lines }: { lines: readonly QuoteIssueNoticeLine[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line, index) => (
        <span key={`${index}-${line.text}`} className={`block break-all ${LINE_TONE_CLASS[line.tone]}`}>
          {line.text}
        </span>
      ))}
    </>
  );
}

/**
 * 결과 줄 · [설치 명령 복사] — **상태를 받아 그리기만 한다.**
 * 🔴 눌러 봐야 나오는 자리라 DOM 없이 재려면 결과를 넣어 그려 볼 수 있어야 한다 — 그래서
 * 따로 내보낸다.
 */
export function ContactFolderEntryOpenOutcomeNotice({
  outcome,
  copyLines,
  copyBusy,
  onCopy,
}: {
  outcome: ContactFolderFileOpenOutcome;
  copyLines: readonly QuoteIssueNoticeLine[];
  copyBusy: boolean;
  onCopy: () => void;
}) {
  return (
    <span role="status" className="flex min-w-0 flex-col items-end gap-0.5 text-xs">
      <NoticeLines lines={outcome.lines} />
      {/* 🔴 주소를 아예 만들지 못한 결과에서는 설치를 권하지 않는다 — 다시 깔아도 안 열린다. */}
      {outcome.offerHelperInstall && (
        <button
          type="button"
          onClick={onCopy}
          disabled={copyBusy}
          aria-busy={copyBusy}
          data-contact-folder-entry-helper-install-command=""
          className={`${NOTICE_ACTION_CLASS} text-xs text-zinc-500 dark:text-zinc-400`}
        >
          {copyBusy ? "복사하는 중…" : "설치 명령 복사"}
        </button>
      )}
      <NoticeLines lines={copyLines} />
    </span>
  );
}

/** 단추와 결과 줄 — Windows 판단 없이. 화면에는 기본 내보내기를 쓴다. */
export function ContactFolderEntryOpenControl({ folderName, fileName }: ContactFolderEntryOpenButtonProps) {
  const [busy, setBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [outcome, setOutcome] = useState<ContactFolderFileOpenOutcome | null>(null);
  const [copyLines, setCopyLines] = useState<QuoteIssueNoticeLine[]>([]);

  async function handleOpen() {
    // 🔴 여는 중에는 다시 눌리지 않는다 — 단추도 잠그지만 여기서도 한 번 더 막는다.
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    setCopyLines([]);
    try {
      setOutcome(await runContactFolderFileOpen({ folderName, fileName }));
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
    <span className="print:hidden flex min-w-0 flex-col items-end gap-0.5 text-right">
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={busy}
        aria-busy={busy}
        title={CONTACT_FOLDER_ENTRY_OPEN_BUTTON_TITLE}
        data-contact-folder-entry-open=""
        className={BUTTON_CLASS}
      >
        {busy ? "여는 중…" : "열기"}
      </button>
      {outcome && (
        <ContactFolderEntryOpenOutcomeNotice
          outcome={outcome}
          copyLines={copyLines}
          copyBusy={copyBusy}
          onCopy={() => void handleCopy()}
        />
      )}
    </span>
  );
}

type ContactFolderEntryOpenButtonProps = {
  /**
   * 공유폴더 루트 아래의 **폴더 경로** — 견적서 쪽에서는 `연도 폴더/견적서 폴더` 다.
   * 🔴 도우미는 전부터 여러 마디 경로를 받는다 — 주소 모양이 바뀌지 않는다.
   */
  folderName: string;
  /** 그 폴더 안에서의 파일 이름 — 🔴 **마디 하나**다(아래 흐름이 그것을 본다). */
  fileName: string;
};

/** 🔴 Windows PC 에서만 그린다 — 서버 렌더 · 첫 렌더는 감춘 채. */
export default function ContactFolderEntryOpenButton(props: ContactFolderEntryOpenButtonProps) {
  const isWindows = useSyncExternalStore(subscribeToNothing, isWindowsDesktopNow, hiddenOnServer);
  if (!isWindows) return null;
  return <ContactFolderEntryOpenControl {...props} />;
}
