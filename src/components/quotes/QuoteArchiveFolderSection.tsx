"use client";

import { useEffect, useState } from "react";

import ContactFolderEntryOpenButton from "@/components/repair-cases/files/ContactFolderEntryOpenButton";
import ContactFolderPlaceOpenButton from "@/components/repair-cases/files/ContactFolderPlaceOpenButton";
import { isOpenableQuoteFolderFileName } from "@/lib/domain/quote-folder-file-link";
import {
  SHARE_FOLDER_ENTRY_ACTIONS_CLASS,
  SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS,
  SHARE_FOLDER_ENTRY_META_SIZE_CLASS,
  SHARE_FOLDER_ENTRY_NAME_GROW_CLASS,
  SHARE_FOLDER_ENTRY_ROW_CLASS,
  shareFolderEntryMeta,
  type ShareFolderEntryMeta,
} from "@/lib/domain/share-folder-entry-meta";
import {
  QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT,
  QUOTE_ARCHIVE_FOLDER_SECTION_TITLE,
  loadQuoteArchiveFolderEntries,
  type QuoteArchiveFolderEntryView,
  type QuoteArchiveFolderSectionState,
} from "./quote-archive-folder-entries";
import { filterQuoteArchiveEntriesByQuoteNumber } from "./quote-archive-folder-number-filter";

/**
 * ============================================================================
 * **공유폴더 구역** — 그 견적서의 폴더 안에 무엇이 있는가 (조각 PO 4h)
 * ============================================================================
 * 견적서 하나당 사내 공유폴더에 폴더가 하나 있다(`연도 폴더/견적서 폴더`). 그 안에 무엇이
 * 들어 있는지 보려고 탐색기를 따로 열던 것을 그 자리에서 그대로 보여 준다.
 *
 * ── 🔴 **A/S 에서 가져온 나머지 반쪽이다** ──────────────────────────────
 * 저쪽은 이 모두를 한 파일(`RF_Service_System/src/components/quotes/
 * QuoteArchiveFolderSection.tsx`)에 담고 있고, 그 파일은 **두 가지**를 한 몸에 들고 있다:
 *   ㉠ 통로를 부르고 응답을 읽는 부분 — 순수하고, 화면이 없다
 *   ㉡ 받은 상태를 **구역으로 그리는** 부분
 * 🔴 **㉠ 은 2026-10-07 에 이미 왔다**(quote-archive-folder-entries.ts — [Excel 보기]가 쓴다).
 * 그 파일 머리말이 「구역을 세우고 싶어지는 날 저쪽의 ㉡ 을 그때 가져온다」고 적어 두었고,
 * **이 파일이 그날의 것**이다. 🔴 그래서 **㉠ 을 베끼지 않는다** — 통로 주소 · 응답 읽기 ·
 * 상태 타입 · 문장 여섯을 전부 그 모듈에서 가져다 쓴다. 두 벌이 되면 한쪽만 고쳐진다.
 *
 * ── 🔴 **서는 자리는 한 곳뿐이다** ───────────────────────────────────────
 * 견적서 상세(`/quotes/[id]`)의 **[견적서 결재] 탭, 「견적서 승인」 바로 위**. 결재하는 사람이
 * 승인을 누르기 전에 그 견적서 폴더를 열어 확인하는 자리다.
 * 🔴 **[견적서 수정] 탭에는 세우지 않는다**(사용자 결정 2026-10-06 — 「견적서 수정에서는
 * 공유폴더가 보이지 않아도 돼」). 편집 화면 **머리의 폴더 열기 단추는 그대로**이고, 그것은
 * **견적서 id** 로 서버에 폴더를 묻는 다른 물건이다 — 이 파일은 그 이름을 주석에도 적지
 * 않는다(그 단추를 부르는 원본을 셋으로 못 박는 울타리 시험이 글자로 훑는다).
 * 🔴 **구역을 한 화면에 여럿 세우는 길이 없다** — 저쪽에는 수리 건 「견적서」 탭이 있어
 * 본 번호마다 구역을 세우고 머리에 번호를 적는 칸(`label`)이 있지만, 🔴 **이 사이트에는
 * 수리 건이 없다.** 그 칸을 가져오지 않았다(쓰지 않는 칸은 아무도 안 고친다).
 *
 * ── 🔴 만들지도 올리지도 지우지도 않는다 — 읽고 여는 것뿐이다 ─────────────
 * 폴더를 만들지도, 파일을 올리지도, 지우지도 않는다. 🔴 **서버가 파일을 중계하는 길도
 * 없다** — 이 구역이 부르는 통로는 목록 하나뿐이다. 줄의 [열기]는 그 PC 의 도우미에게
 * 주소를 넘길 뿐이다.
 *  · 🔴 [열기]는 **허용 목록에 든 확장자의 파일 줄에만** 그린다 — 폴더 줄 · 확장자 없는
 *    이름 · 목록 밖 확장자(`.exe` 등)에는 **단추가 아예 없다**(isOpenableQuoteFolderFileName).
 *
 * ── 🔴 여는 장치는 **이미 있는 것을 그대로 쓴다** ───────────────────────
 * 줄의 [열기]와 그 뒤 흐름(숨은 iframe · 도우미 감지 · 설치로 이끌기)은
 * ContactFolderEntryOpenButton 을 그대로 쓰고, 그 단추가 부르는 흐름
 * (contact-folder-file-open.ts)은 [Excel 보기]가 쓰던 **그 한 벌**이다. 구역 맨 아래의
 * [폴더 열기]도 같은 결로 ContactFolderPlaceOpenButton 한 벌이다. 둘 다 받는 값은 통로가
 * 준 `연도 폴더/견적서 폴더` 그대로다(도우미는 전부터 여러 마디 경로를 받는다).
 * 베껴 두 벌을 만들면 반드시 한쪽만 고쳐진다 — 설치되는 도우미는 **PC 당 한 벌**이다.
 *
 * ── 🔴 하위 폴더로 들어가는 길이 **없다** ────────────────────────────────
 * 실측(2026-10-06)에서 견적서 폴더 안의 하위 폴더는 **0 개**였다 — 평평하다. 혹시 폴더가
 * 하나 있으면 **폴더 한 줄**로만 보이고, 그 아래는 맨 아래의 [폴더 열기]로 탐색기를 열어 본다.
 *
 * ── 🔴 서버 컴포넌트에서 읽지 않는다 ─────────────────────────────────────
 * 결재 화면이 뜰 때 공유폴더를 읽으면 **NAS 가 느리거나 꺼져 있는 날 결재 화면 자체가 안
 * 뜬다.** 화면이 뜬 뒤 여기서 따로 통로를 부른다 — 이 구역만 「불러오는 중…」 → 「읽지
 * 못했습니다」가 되고 결재는 멀쩡하다.
 *
 * ── 🔴 인쇄에 안 찍힌다 ─────────────────────────────────────────────────
 * 공유폴더는 그때그때 달라지는 바깥 사정이라 종이에 남길 것이 아니다 — 바깥 틀에
 * `print:hidden` 을 건다.
 *
 * ── 🔴 구역 맨 아래의 [폴더 열기] ───────────────────────────────────────
 * 목록만 보여서는 폴더 안의 다른 것을 손댈 수 없어 결국 탐색기를 따로 열게 된다.
 *  · 🔴 **`found` 이고 폴더 경로를 받았을 때만 그린다.** `not-found` · `multiple` ·
 *    `disabled` · `failed` · 불러오는 중에는 **열 자리가 없다** — 단추를 그리지 않는다.
 *    (`multiple` 은 더욱이 **어느 폴더인지 모른다** — 아무 폴더나 열어 주면 안 된다.)
 *  · 🔴 Windows 가 아니면 단추가 **스스로** 안 그려지고, 인쇄에도 안 찍힌다 — 가져다 쓰는
 *    단추가 이미 그렇게 한다. 이 파일이 그 판단을 다시 쓰지 않는다.
 *
 * ── 🔴 **그 견적서 번호의 파일만 보인다**(번호를 줬을 때) ─────────────────
 * 사용자 요구 2026-10-12. 폴더를 가르는 것은 **본 번호**라 `DSS 2026-089` 와
 * `DSS 2026-089-1` 이 한 폴더를 쓴다 — 거르지 않으면 결재하는 사람에게 **다른 장의 파일까지**
 * 보인다. `quoteNumber` 를 받으면 그 번호의 줄만 남긴다
 * (quote-archive-folder-number-filter.ts — 🔴 본 번호로 깎지 않고 **번호 전체**로 견준다).
 *  · 🔴 견주는 규칙은 **[Excel 보기]와 한 벌**이다(domain/quote-archive-file-number.ts 의
 *    번호 뽑기). 다른 규칙으로 거르면 그 단추가 찾아 여는 파일을 바로 옆 이 구역이 숨긴다 —
 *    실측에 `DSS-2026-099`(하이픈) · `dss 2026-001`(소문자) 같은 이름이 있다.
 *  · 🔴 **주지 않으면 전부 보인다** — 번호를 못 뽑는 발행번호(`Q-7` 처럼 개발 DB 에 있는
 *    것들)도 같은 길로 간다. 「맞는 것이 없다」로 보면 파일이 통째로 사라진다.
 *  · 🔴 **거르기는 화면에서만** 한다. 서버 통로는 한 줄도 바뀌지 않았다 — 그 통로는
 *    [Excel 보기]도 쓴다.
 *  · 🔴 숨긴 줄이 있으면 **그 개수를 한 줄로 알린다.** 사람이 손으로 넣은 파일
 *    (`참고자료.pdf`)도 숨겨지므로, 안내가 없으면 「파일이 없어졌다」고 여긴다.
 *    [전부 보기] 토글은 두지 않는다(사용자 결정) — 맨 아래 [폴더 열기]가 그 자리다.
 *
 * ── 상태별로 무엇을 보이는가 ─────────────────────────────────────────────
 *  · `disabled`  → 🔴 **구역 자체를 그리지 않는다**(설정이 없는 환경에서 빈 상자가 늘지 않게)
 *  · 불러오는 중 → 「불러오는 중…」
 *  · `not-found` → 「아직 이 견적서의 폴더가 없습니다」(muted)
 *  · `found` + 빈 폴더 → 「폴더가 비어 있습니다」
 *  · `found` + 거르고 나니 0 줄 → 🔴 「이 견적서 번호로 저장된 파일이 없습니다」 + 숨긴 개수.
 *                     **빈 폴더와 다른 상황**이다(폴더에 파일은 있다) — 글자로 갈라 적는다.
 *  · `found` + 목록 → 🔴 **표**다: `[이름] [수정날짜] [크기] [동작]` — 윈도우 탐색기와 같은
 *                     차례. 1fr 은 이름 하나뿐이고 나머지 세 칸은 고정 길이라 **단추가 있는
 *                     줄과 없는 줄의 날짜·크기가 같은 자리에 선다.** 수정날짜가 없는 줄도 ·
 *                     단추가 없는 줄도 **칸은 남는다.** 좁은 화면에서는 접힌다
 *                     (lib/domain/share-folder-entry-meta.ts).
 *  · `multiple`  → 🔴 「맞는 폴더가 여럿입니다」 — **목록을 내지 않는다**(어느 폴더인지
 *                   모르는데 내용을 보이면 남의 견적서 서류를 보일 수 있다)
 *  · `failed`    → 「공유폴더를 읽지 못했습니다」(warning) + 서버가 준 짧은 사유
 * 🔴 어느 문장에도 **경로를 적지 않는다** — 폴더 이름은 찾았을 때만, 머리 오른쪽에 보인다.
 *
 * 설정이 꺼진 환경에서는 처음 한 번 「불러오는 중…」이 스쳤다가 구역이 사라진다. 서버가
 * 미리 알려 주지 않는 한 피할 수 없고, 꺼진 환경은 개발 PC 뿐이라 그대로 둔다.
 *
 * 🔴 **`dark:` 스타일을 지우지 않는다**(2026-09-28 사용자 결정).
 *
 * ── 던지지 않는다 · 바꿔 끼울 수 있다 ──────────────────────────────────────
 * 통로를 부르는 일은 ㉠ 이 하고 **던지지 않는다**. 그려지는 것은 상태를 직접 넣어 본다
 * (QuoteArchiveFolderSection.test.tsx).
 * ============================================================================
 */

// ── 문장 ─────────────────────────────────────────────────────────────────

/** 폴더 한 줄에 붙는 표시 — 크기 자리를 대신한다. */
export const QUOTE_ARCHIVE_FOLDER_SECTION_FOLDER_LABEL = "폴더";

/** 🔴 잘렸을 때의 곁말. 「더 있습니다」가 반드시 들어간다. */
export function quoteArchiveFolderTruncatedText(shown: number, totalCount: number): string {
  return `앞의 ${shown}개만 보입니다 — 더 있습니다(전체 ${totalCount}개). 나머지는 [폴더 열기]로 보세요.`;
}

/**
 * 🔴 **번호로 거르느라 덜어낸 줄이 있다**는 알림(2026-10-12). 번호로 시작하지 않는 파일
 * (사람이 손으로 넣은 `참고자료.pdf` 같은 것)도 함께 숨겨지므로, 이 줄이 없으면 쓰는 분이
 * 「파일이 없어졌다」고 여긴다. 가리키는 단추는 **구역 맨 아래의 [폴더 열기]**다 — 거기서
 * 폴더 전체를 본다(그래서 [전부 보기] 토글을 따로 두지 않는다).
 */
export function quoteArchiveFolderHiddenByNumberText(hiddenCount: number): string {
  return `이 견적서 번호가 아닌 파일 ${hiddenCount}개는 숨겼습니다 — 폴더 전체는 [폴더 열기]로 보세요.`;
}

/**
 * 🔴 폴더에 파일은 있는데 **그 번호의 것이 하나도 없다.** 「폴더가 비어 있습니다」와는 다른
 * 상황이라 다른 글자로 적는다 — 같은 문장을 쓰면 폴더가 빈 줄 알고 공유폴더를 다시 열어 본다.
 * 바로 아래에 숨긴 개수 줄이 함께 선다.
 */
export const QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT = "이 견적서 번호로 저장된 파일이 없습니다";

// ── 그리기 ───────────────────────────────────────────────────────────────

/**
 * 한 줄의 곁말 **두 조각** — 폴더는 크기 대신 「폴더」, 파일은 크기. 수정시각은 **따로**다.
 * 🔴 날짜 모양도 칸 생김새도 **공용 한 벌**을 쓴다(lib/domain/share-folder-entry-meta.ts).
 * 여기 남는 것은 **이 구역의 「폴더」 글자**뿐이다.
 */
export function quoteArchiveFolderEntryMeta(entry: QuoteArchiveFolderEntryView): ShareFolderEntryMeta {
  return shareFolderEntryMeta(entry, QUOTE_ARCHIVE_FOLDER_SECTION_FOLDER_LABEL);
}

/**
 * 🔴 이 줄에 [열기]를 그릴 것인가 — **폴더는 아니고**, 이름이 허용 목록에 든 확장자인가.
 * 판단은 순수 함수 하나(domain/quote-folder-file-link.ts)에만 있다 — 화면이 확장자를 따로
 * 세지 않는다. `.exe` 가 목록에 섞여 있어도 누를 단추가 없어야 한다.
 */
export function canOpenQuoteArchiveFolderEntry(entry: QuoteArchiveFolderEntryView): boolean {
  return !entry.isDirectory && isOpenableQuoteFolderFileName(entry.name);
}

/**
 * 🔴 **열 수 있는 폴더 경로** — 찾았고 통로가 경로를 줬을 때만 글자가 있고, 아니면 빈 글자다.
 * 줄의 [열기]와 구역 맨 아래의 [폴더 열기]가 **이 하나**를 함께 본다 — 두 군데에서 따로
 * 판단하면 한쪽만 고쳐지는 날이 온다. 빈 글자면 **둘 다 그리지 않는다**: `not-found` ·
 * `multiple`(어느 폴더인지 모른다) · `disabled` · `failed` · 불러오는 중에는 열 자리가 없고,
 * 주소를 지어내서도 안 된다.
 */
export function quoteArchiveFolderOpenPath(state: QuoteArchiveFolderSectionState): string {
  return state.kind === "found" ? state.relativePath : "";
}

const ENTRY_NAME_CLASS = `min-w-0 ${SHARE_FOLDER_ENTRY_NAME_GROW_CLASS} break-all text-left text-sm text-zinc-700 dark:text-zinc-300`;
const MUTED_CLASS = "text-sm text-zinc-500 dark:text-zinc-400";
const WARNING_CLASS = "text-sm font-medium text-amber-700 dark:text-amber-400";
/** 목록 아래에 붙는 **차분한** 곁말 — 잘림 곁말(amber)과 달리 경고가 아니다. */
const NOTE_CLASS = "text-xs text-zinc-500 dark:text-zinc-400";

function EntryList({
  entries,
  relativePath,
}: {
  entries: readonly QuoteArchiveFolderEntryView[];
  /** 🔴 루트 아래의 폴더 경로. 비어 있으면 [열기]를 아무 줄에도 안 그린다(주소를 지어내지 않는다). */
  relativePath: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {entries.map((entry) => {
        const openable = relativePath !== "" && canOpenQuoteArchiveFolderEntry(entry);
        const meta = quoteArchiveFolderEntryMeta(entry);
        return (
          <li
            key={`${entry.isDirectory ? "d" : "f"}:${entry.name}`}
            data-quote-archive-folder-entry-openable={openable ? "" : undefined}
            className={SHARE_FOLDER_ENTRY_ROW_CLASS}
          >
            <span className={ENTRY_NAME_CLASS}>
              {entry.isDirectory ? "📁 " : ""}
              {entry.name}
            </span>
            {/* 🔴 수정시각이 없어도 **칸은 그대로** 그린다 — 빼면 그 줄만 열이 어긋난다. */}
            <span className={SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS}>{meta.modifiedText}</span>
            <span className={SHARE_FOLDER_ENTRY_META_SIZE_CLASS}>{meta.sizeText}</span>
            {/*
              🔴 동작 칸은 **비어도 그린다** — 폴더 줄 · 허용 목록 밖 줄에는 단추가 없지만
              칸까지 빼면 그 줄만 날짜·크기가 어긋난다.
            */}
            <span className={SHARE_FOLDER_ENTRY_ACTIONS_CLASS}>
              {openable && <ContactFolderEntryOpenButton folderName={relativePath} fileName={entry.name} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 상태 하나를 그린다. 🔴 `disabled` 면 **아무것도 그리지 않는다**(null).
 * 상태를 직접 넣어 그려 볼 수 있게 따로 두었다(통로 · 네트워크 없이 시험한다).
 */
export function QuoteArchiveFolderSectionView({
  state,
  quoteNumber = "",
}: {
  state: QuoteArchiveFolderSectionState;
  /**
   * 🔴 **보고 있는 견적서의 번호**(가지 번호까지 그대로). 주면 그 번호의 파일만 보인다.
   * 🔴 **안 주면 전부 보인다** — 빈 글자도 「거르지 않음」이다.
   */
  quoteNumber?: string;
}) {
  if (state.kind === "disabled") return null;

  // 🔴 줄의 [열기]와 맨 아래 [폴더 열기]가 **같은 하나**를 본다. 빈 글자면 둘 다 안 그린다.
  const relativePath = quoteArchiveFolderOpenPath(state);
  // 🔴 보이는 몫만 덜어낸다 — 서버가 준 줄은 그대로 두고 그 번호의 것만 남긴다.
  const shown = filterQuoteArchiveEntriesByQuoteNumber(state.kind === "found" ? state.entries : [], quoteNumber);

  return (
    <section
      aria-label={QUOTE_ARCHIVE_FOLDER_SECTION_TITLE}
      data-quote-archive-folder-section=""
      className="print:hidden flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {QUOTE_ARCHIVE_FOLDER_SECTION_TITLE}
        </h2>
        {state.kind === "found" && state.relativePath !== "" && (
          <span className="min-w-0 break-all text-xs text-zinc-500 dark:text-zinc-400">{state.relativePath}</span>
        )}
      </div>

      {state.kind === "loading" && (
        <p aria-live="polite" className={MUTED_CLASS}>
          {QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT}
        </p>
      )}

      {state.kind === "not-found" && <p className={MUTED_CLASS}>{QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT}</p>}

      {/* 🔴 목록을 내지 않는다 — 어느 폴더인지 모르는 채로 내용을 보이면 안 된다. */}
      {state.kind === "multiple" && <p className={WARNING_CLASS}>{QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT}</p>}

      {state.kind === "failed" && (
        <div className="flex flex-col gap-0.5">
          <p className={WARNING_CLASS}>{QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT}</p>
          <p className="break-all text-xs text-zinc-500 dark:text-zinc-400">{state.reason}</p>
        </div>
      )}

      {state.kind === "found" &&
        (state.entries.length === 0 ? (
          <p className={MUTED_CLASS}>{QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT}</p>
        ) : shown.entries.length === 0 ? (
          /* 🔴 폴더는 비어 있지 않다 — 그 번호의 것이 없을 뿐이다. 두 상황을 글자로 가른다. */
          <div className="flex flex-col gap-0.5">
            <p className={MUTED_CLASS}>{QUOTE_ARCHIVE_FOLDER_SECTION_NO_MATCH_TEXT}</p>
            <p className={NOTE_CLASS}>{quoteArchiveFolderHiddenByNumberText(shown.hiddenCount)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <EntryList entries={shown.entries} relativePath={relativePath} />
            {/* 🔴 잘림 곁말은 **서버가 읽은 몫**을 그대로 말한다 — 거르기와 상관없는 사실이다. */}
            {state.truncated && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {quoteArchiveFolderTruncatedText(state.entries.length, state.totalCount)}
              </p>
            )}
            {shown.hiddenCount > 0 && (
              <p className={NOTE_CLASS}>{quoteArchiveFolderHiddenByNumberText(shown.hiddenCount)}</p>
            )}
          </div>
        ))}

      {/*
        🔴 **폴더를 찾았을 때만** 선다 — 못 찾았거나(not-found) 여럿이거나(multiple) 설정이
        꺼져 있거나(disabled) 읽다 실패했으면 **열 자리가 없다.** 빈 폴더에는 그대로 선다
        (폴더는 있다 — 거기에 파일을 넣으러 연다).
        🔴 여는 장치는 자리 열기 단추 한 벌이다 — Windows 가 아니면 스스로 아무것도 그리지
        않고, 「설치 명령 복사」 안내도 그 단추가 제 결과 줄로 함께 낸다. 이 파일이 끄지 않는다.
      */}
      {relativePath !== "" && <ContactFolderPlaceOpenButton relativePath={relativePath} />}
    </section>
  );
}

/**
 * 화면이 뜬 **뒤에** 따로 통로를 부른다. 떠난 뒤에 답이 와도 상태를 건드리지 않는다.
 *
 * 받은 답은 **어느 견적서의 것인지와 함께** 든다 — 그래야 다른 견적서로 넘어갔을 때 지난
 * 폴더의 목록이 잠깐 비치지 않는다(효과 안에서 「불러오는 중」으로 되돌리면 그릴 때마다 한
 * 번 더 그리게 된다).
 *
 * 🔴 「다시 읽어라」를 받는 칸을 두지 않았다 — 지금 이 구역을 다시 읽게 만드는 자리가 화면에
 * 없기 때문이다. 쓰지 않을 칸을 미리 들이지 않는다 — 필요해지면 그 조각에서 더한다.
 */
export default function QuoteArchiveFolderSection({
  quoteId,
  quoteNumber = "",
}: {
  quoteId: string;
  /** 🔴 **보고 있는 견적서의 번호** — 주면 그 번호의 파일만 보인다(결재 탭). */
  quoteNumber?: string;
}) {
  const [answer, setAnswer] = useState<{ quoteId: string; state: QuoteArchiveFolderSectionState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadQuoteArchiveFolderEntries(quoteId).then((state) => {
      if (!cancelled) setAnswer({ quoteId, state });
    });
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  const state: QuoteArchiveFolderSectionState =
    answer !== null && answer.quoteId === quoteId ? answer.state : { kind: "loading" };

  return <QuoteArchiveFolderSectionView state={state} quoteNumber={quoteNumber} />;
}
