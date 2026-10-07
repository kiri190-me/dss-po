import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeQuoteArchiveNameForCompare } from "./quote-archive-naming";
import {
  compareShareFolderNames,
  isIgnoredShareFolderEntryName,
  normalizeShareFolderNameForCompare,
} from "./share-folder-naming";

/**
 * ============================================================================
 * 공유폴더 **목록을 세우는 규칙** — 순서와 「빼는 줄」 (2026-10-07)
 * ============================================================================
 * 순수 함수다 — 파일시스템이 없다. 이 규칙을 쓰는 자리는 견적서 폴더 목록
 * (storage/quote-archive-entries.ts)이고, 거기서의 동작은 그 옆 시험이 임시 폴더에서 본다.
 *
 * 🔴 맨 아래 한 묶음이 **두 벌이 갈라지지 않게** 지킨다: 이 파일의
 * normalizeShareFolderNameForCompare 와 quote-archive-naming.ts 의
 * normalizeQuoteArchiveNameForCompare 는 **같은 세 줄**이다(그쪽이 A/S 의 끌어내기 이전
 * 판이라 아직 제 것을 들고 있다 — share-folder-naming.ts 머리말). 한쪽만 고쳐지는 날
 * 이 시험이 소리를 낸다.
 * ============================================================================
 */

describe("공유폴더 이름 — 비교할 때의 모양", () => {
  test("NFC + 연속 공백 하나 + 앞뒤 공백 걷기", () => {
    assert.equal(normalizeShareFolderNameForCompare("  가나  상사  "), "가나 상사");
    // 한글을 풀어쓴(NFD) 이름도 같은 모양이 된다 — 사람이 맥 · NAS 에서 적으면 이렇게 들어온다.
    assert.equal(
      normalizeShareFolderNameForCompare("가나상사".normalize("NFD")),
      "가나상사"
    );
    assert.equal(normalizeShareFolderNameForCompare("DSS\t2026-089\n수리"), "DSS 2026-089 수리");
  });

  test("정렬 — 다듬은 이름으로 견주고, 같으면 디스크의 실제 이름으로 가른다", () => {
    assert.ok(compareShareFolderNames("a.pdf", "b.pdf") < 0);
    assert.ok(compareShareFolderNames("b.pdf", "a.pdf") > 0);
    assert.equal(compareShareFolderNames("같은이름", "같은이름"), 0);

    // 다듬으면 같은 두 이름 — 순서가 흔들리지 않게 실제 이름으로 가른다(0 이 아니다).
    const nfd = "가나상사".normalize("NFD");
    const nfc = "가나상사".normalize("NFC");
    assert.notEqual(nfd, nfc);
    assert.notEqual(compareShareFolderNames(nfd, nfc), 0);
    // 어느 쪽에서 물어도 답이 뒤집히기만 한다 — 늘 같은 하나가 앞이다.
    assert.equal(compareShareFolderNames(nfd, nfc) + compareShareFolderNames(nfc, nfd), 0);

    // 목록을 통째로 정렬해도 같은 말을 한다.
    assert.deepEqual(["b", "  a ", "c"].sort(compareShareFolderNames), ["  a ", "b", "c"]);
  });
});

describe("공유폴더 목록에서 빼는 줄", () => {
  test("🔴 프로그램이 남긴 것 · 숨김 파일은 뺀다", () => {
    for (const name of [
      "~$견적서.xlsx",
      "Thumbs.db",
      "thumbs.db",
      "THUMBS.DB",
      "desktop.ini",
      "Desktop.ini",
      ".DS_Store",
      ".@__thumb",
    ]) {
      assert.equal(isIgnoredShareFolderEntryName(name), true, name);
    }
  });

  test("사람이 넣은 줄은 뺀 적이 없다", () => {
    for (const name of [
      "DSS 2026-089 가나상사 수리 견적서.xlsx",
      "견적서 - 有印.pdf",
      "사진",
      "thumbs.db.xlsx",
      "내 desktop.ini 설명.txt",
      "~견적서.xlsx",
    ]) {
      assert.equal(isIgnoredShareFolderEntryName(name), false, name);
    }
  });

  test("이름이 글자가 아니면 빼지 않는다 — 판단하지 않고 그대로 둔다", () => {
    assert.equal(isIgnoredShareFolderEntryName(undefined as unknown as string), false);
    assert.equal(isIgnoredShareFolderEntryName(null as unknown as string), false);
  });
});

describe("🔴 두 벌이 갈라지지 않는다 — 다듬기는 quote-archive-naming 과 같은 말을 한다", () => {
  test("같은 입력에 같은 답", () => {
    for (const name of [
      "",
      "  ",
      "가나상사",
      "  가나  상사  ",
      "DSS 2026-089 가나상사 MODEL-X1 수리 견적서",
      "가나상사".normalize("NFD"),
      "21. 2026 내자견적서",
      "a\tb\nc",
      "...",
    ]) {
      assert.equal(
        normalizeShareFolderNameForCompare(name),
        normalizeQuoteArchiveNameForCompare(name),
        `두 다듬기가 갈라졌다: ${JSON.stringify(name)}`
      );
    }
  });
});
