import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { formatBytes } from "./image-shrink";
import {
  SHARE_FOLDER_ENTRY_ACTIONS_CLASS,
  SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS,
  SHARE_FOLDER_ENTRY_META_SIZE_CLASS,
  SHARE_FOLDER_ENTRY_NAME_GROW_CLASS,
  SHARE_FOLDER_ENTRY_ROW_CLASS,
  formatShareFolderEntryModifiedAt,
  shareFolderEntryMeta,
} from "./share-folder-entry-meta";

/**
 * ============================================================================
 * 공유폴더 한 줄의 곁말 · 표의 생김새 (조각 PO 4h)
 * ============================================================================
 * 🔴 A/S 의 같은 이름 파일에서 가져왔다. 저쪽은 **창 넷이 이 한 벌을 쓰는가**까지 재지만
 * 이 사이트의 창은 **하나**다(결재 탭의 공유폴더 구역) — 그래서 마지막 묶음만 「그 하나가
 * 쓰는가」로 바뀌었다. 나머지 단언은 저쪽과 같은 것을 잰다.
 *
 * 🔴 꾸민 날짜 글자는 **돌리는 PC 의 시간대**를 따르므로 글자를 못 박지 않고 **같은 식으로
 * 계산해** 견준다.
 * ============================================================================
 */

const metaSource = readFileSync(new URL("./share-folder-entry-meta.ts", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n"
);
/** 주석을 뺀 코드 — 머리말이 까닭을 설명하느라 적은 낱말에 걸리지 않게. */
const code = metaSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ISO = "2026-09-08T02:00:00.000Z";
const LOCAL = new Date(ISO).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

describe("① 🔴 크기와 수정시각이 **따로** 나온다 — 이어 붙지 않는다", () => {
  test("파일 줄 — 크기 칸과 수정시각 칸이 서로 다른 글자다", () => {
    const meta = shareFolderEntryMeta({ isDirectory: false, sizeBytes: 2048, modifiedAt: ISO }, "폴더");
    assert.equal(meta.sizeText, "2.0 KB");
    assert.equal(meta.modifiedText, LOCAL);
    assert.equal(meta.sizeText.includes("·"), false, meta.sizeText);
    assert.equal(meta.modifiedText.includes("·"), false, meta.modifiedText);
  });

  test("크기는 첨부 목록과 **같은 함수**로 적는다(formatBytes) — 모양을 새로 짓지 않았다", () => {
    for (const bytes of [0, 1, 1023, 1024, 1024 * 1024, 12_345_678]) {
      assert.equal(shareFolderEntryMeta({ isDirectory: false, sizeBytes: bytes }, "폴더").sizeText, formatBytes(bytes));
    }
  });
});

describe("② 🔴 수정시각이 없으면 **빈 글자**다 — 칸은 화면이 그대로 둔다", () => {
  test("modifiedAt 이 없는 줄 — 크기만 있고 수정시각은 빈 글자", () => {
    const meta = shareFolderEntryMeta({ isDirectory: false, sizeBytes: 512 }, "폴더");
    assert.equal(meta.sizeText, "512 B");
    assert.equal(meta.modifiedText, "");
  });

  test("🔴 빈 글자가 「없음」 같은 말로 바뀌지 않는다 — 자리는 비워 두되 글자를 지어내지 않는다", () => {
    const meta = shareFolderEntryMeta({ isDirectory: true, sizeBytes: 0 }, "폴더");
    assert.equal(meta.modifiedText, "");
    for (const invented of ["없음", "-", "알 수 없음"]) {
      assert.notEqual(meta.modifiedText, invented);
    }
  });
});

describe("③ 폴더 줄은 크기 대신 **부르는 쪽이 준 글자**", () => {
  test("받은 글자를 그대로 쓴다 — 낱말을 여기서 정하지 않는다", () => {
    assert.equal(shareFolderEntryMeta({ isDirectory: true, sizeBytes: 999 }, "폴더").sizeText, "폴더");
    assert.equal(shareFolderEntryMeta({ isDirectory: true, sizeBytes: 999 }, "〈폴더〉").sizeText, "〈폴더〉");
  });

  test("🔴 「폴더」라는 낱말이 이 공용 조각의 **코드**에 박혀 있지 않다", () => {
    assert.equal(/["'`]폴더["'`]/.test(code), false, "낱말을 공용으로 모았다");
  });

  test("폴더 줄도 수정시각은 파일과 같은 자리에 똑같이 나온다", () => {
    assert.equal(shareFolderEntryMeta({ isDirectory: true, sizeBytes: 0, modifiedAt: ISO }, "폴더").modifiedText, LOCAL);
  });
});

describe("④ 🔴 못 읽는 값은 **원본 그대로**", () => {
  test("날짜가 아닌 글자는 받은 그대로 돌아온다 — 줄이 비어 보이지 않게", () => {
    assert.equal(formatShareFolderEntryModifiedAt("날짜아님"), "날짜아님");
    assert.equal(shareFolderEntryMeta({ isDirectory: false, sizeBytes: 1, modifiedAt: "날짜아님" }, "폴더").modifiedText, "날짜아님");
  });
});

describe("⑤ 🔴 날짜 글자 모양이 **안 바뀌었다** — 자리를 나눴을 뿐이다", () => {
  test("ko-KR · dateStyle medium · timeStyle short 그대로", () => {
    assert.equal(formatShareFolderEntryModifiedAt(ISO), LOCAL);
    // 날것(ISO)이 그대로 나가지 않는다.
    assert.notEqual(formatShareFolderEntryModifiedAt(ISO), ISO);
  });
});

describe("⑥ 🔴 줄은 **표**다 — 1fr 은 이름 하나뿐이라 세 칸의 자리가 모든 줄에서 같다", () => {
  test("🔴 열 넷의 길이가 줄 하나에 **통째로** 박혀 있다 — 이름만 1fr, 나머지는 고정", () => {
    assert.ok(SHARE_FOLDER_ENTRY_ROW_CLASS.includes("sm:grid-cols-[minmax(0,1fr)_10rem_5rem_9rem]"), SHARE_FOLDER_ENTRY_ROW_CLASS);
  });

  test("🔴 폭은 **칸이 아니라 줄**이 쥔다 — 칸에 폭을 걸면 좁은 화면까지 따라간다", () => {
    for (const className of [
      SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS,
      SHARE_FOLDER_ENTRY_META_SIZE_CLASS,
      SHARE_FOLDER_ENTRY_ACTIONS_CLASS,
      SHARE_FOLDER_ENTRY_NAME_GROW_CLASS,
    ]) {
      assert.equal(/(^|\s)w-/.test(className), false, `칸에 폭이 걸려 있다: ${className}`);
      assert.equal(/(^|\s)min-w-\[/.test(className), false, `칸에 폭이 걸려 있다: ${className}`);
    }
  });

  test("🔴 수정날짜 칸은 **왼쪽 맞춤** · 크기 칸은 오른쪽 맞춤", () => {
    assert.ok(SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS.includes("text-left"), SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS);
    assert.ok(SHARE_FOLDER_ENTRY_META_SIZE_CLASS.includes("text-right"), SHARE_FOLDER_ENTRY_META_SIZE_CLASS);
    // 긴 날것이 와도 옆 칸을 덮지 않는다.
    assert.ok(SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS.includes("break-all"), SHARE_FOLDER_ENTRY_META_MODIFIED_CLASS);
  });

  test("🔴 동작 칸은 안에서 접힌다 — 안내가 길어도 **줄 높이만** 늘고 열은 안 밀린다", () => {
    assert.ok(SHARE_FOLDER_ENTRY_ACTIONS_CLASS.includes("flex-wrap"), SHARE_FOLDER_ENTRY_ACTIONS_CLASS);
    assert.ok(SHARE_FOLDER_ENTRY_ACTIONS_CLASS.includes("min-w-0"), SHARE_FOLDER_ENTRY_ACTIONS_CLASS);
  });

  test("🔴 좁은 화면 배치가 **남아 있다** — sm 아래에서는 예전처럼 접힌다", () => {
    assert.ok(SHARE_FOLDER_ENTRY_ROW_CLASS.includes("flex flex-wrap"), SHARE_FOLDER_ENTRY_ROW_CLASS);
    assert.ok(SHARE_FOLDER_ENTRY_ROW_CLASS.includes("sm:grid"), SHARE_FOLDER_ENTRY_ROW_CLASS);
    assert.equal(/(^|\s)grid(\s|$)/.test(SHARE_FOLDER_ENTRY_ROW_CLASS), false, "좁은 화면에서도 표가 선다");
    assert.equal(/(^|\s)grid-cols-/.test(SHARE_FOLDER_ENTRY_ROW_CLASS), false, SHARE_FOLDER_ENTRY_ROW_CLASS);
  });
});

describe("⑦ 🔴 이 사이트의 **그 한 창**이 이것을 쓴다 — 제 손으로 날짜를 꾸미지 않는다", () => {
  const sectionSource = readFileSync(
    new URL("../../components/quotes/QuoteArchiveFolderSection.tsx", import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");
  const sectionCode = sectionSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("공유폴더 구역이 공용 조각을 불러 쓴다", () => {
    assert.ok(sectionCode.includes('from "@/lib/domain/share-folder-entry-meta"'), "공용 조각을 안 쓴다");
  });

  test("🔴 그 창이 날짜도 열 길이도 제 손으로 적지 않는다 — 두 벌이 되면 갈라진다", () => {
    assert.equal(sectionCode.includes("toLocaleString"), false, "구역이 날짜를 제 손으로 꾸민다");
    assert.equal(sectionCode.includes("grid-cols-"), false, "구역이 열 길이를 제 손으로 적는다");
    assert.equal(sectionCode.includes("formatBytes"), false, "구역이 크기를 제 손으로 적는다");
  });
});

describe("⑧ 🔴 순수하다 — 통로도 서버도 DB 도 없다", () => {
  test("fs · fetch · 서버 · DB 가 한 글자도 없다", () => {
    for (const forbidden of ["node:fs", "fetch(", "@/lib/server/", "@/lib/db/", "server-only", "use client"]) {
      assert.equal(metaSource.includes(forbidden), false, forbidden);
    }
  });
});
