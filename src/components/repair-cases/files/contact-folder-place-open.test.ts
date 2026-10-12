import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { QUOTE_FOLDER_HELPER_CONFIRMED_KEY, QUOTE_FOLDER_HELPER_MISSING_TEXT } from "@/components/quotes/quote-folder-open";
import { QUOTE_FOLDER_LINK_PREFIX, buildQuoteFolderLink, parseQuoteFolderLink } from "@/lib/domain/quote-folder-link";
import {
  contactFolderPlaceAttemptedText,
  contactFolderPlaceDisplayName,
  contactFolderPlaceOpeningText,
  runContactFolderPlaceOpen,
  type ContactFolderPlaceOpenEnvironment,
} from "./contact-folder-place-open";

/**
 * ============================================================================
 * 공유폴더 구역의 [폴더 열기] — 누른 뒤의 흐름 (조각 PO 4h)
 * ============================================================================
 * 🔴 **A/S 의 같은 이름 시험에서 가져왔다**(연락서 조각 10). DOM 없이 값으로 잰다 —
 * 주소 열기 · 창 이벤트 · 시계 · 저장소를 전부 바꿔 끼운다.
 *
 * 🔴 **폴더 이름은 가짜**다(저장소가 공개다) — 모양만 실제와 같다.
 * ============================================================================
 */

const source = readFileSync(new URL("./contact-folder-place-open.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const RELATIVE_PATH = "21. 2026 내자견적서/DSS 2026-089 가나상사 MODEL-X1 L123 S456 수리 견적서";
const FOLDER_NAME = "DSS 2026-089 가나상사 MODEL-X1 L123 S456 수리 견적서";

/** 눌린 주소를 모으고 아무 반응도 하지 않는 바깥 세상. 시계는 곧바로 끝난다. */
function environment(overrides: Partial<ContactFolderPlaceOpenEnvironment> = {}) {
  const opened: string[] = [];
  const store = new Map<string, string>();
  const env: Partial<ContactFolderPlaceOpenEnvironment> = {
    openLink: (link) => {
      opened.push(link);
    },
    watchFocusLoss: () => () => {},
    delay: () => Promise.resolve(),
    storage: () => ({
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    }),
    ...overrides,
  };
  return { env, opened, store };
}

/** 초점을 **곧바로** 잃는 바깥 세상 — 도우미가 반응한 PC 다. */
const losesFocus: Partial<ContactFolderPlaceOpenEnvironment> = {
  watchFocusLoss: (onLost) => {
    onLost();
    return () => {};
  },
};

describe("🔴 주소 — 도우미가 받는 그 주소 하나", () => {
  test("상대 경로로 주소를 만들어 연다 — 되읽으면 같은 글자다", async () => {
    const { env, opened } = environment();
    await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.deepEqual(opened, [buildQuoteFolderLink(RELATIVE_PATH)]);
    assert.ok(opened[0]?.startsWith(QUOTE_FOLDER_LINK_PREFIX), opened[0]);
    assert.equal(parseQuoteFolderLink(opened[0]), RELATIVE_PATH);
  });

  test("🔴 규칙 밖 경로면 **주소를 지어내지 않는다** — 열지도 않고 설치를 권하지도 않는다", async () => {
    for (const bad of ["", "..", "a/../b", "끝이점.", "역슬래시\\있음"]) {
      const { env, opened } = environment();
      const outcome = await runContactFolderPlaceOpen({ relativePath: bad, env });
      assert.equal(outcome.kind, "FAILED", bad);
      assert.equal(outcome.offerHelperInstall, false, bad);
      assert.deepEqual(opened, [], bad);
    }
  });

  test("브라우저가 주소를 열지 못하면 — 던지지 않고 FAILED", async () => {
    const { env } = environment({
      openLink: () => {
        throw new Error("열지 못했다");
      },
    });
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "FAILED");
    assert.equal(outcome.offerHelperInstall, false);
    assert.ok(outcome.lines[0]?.text.includes("폴더를 열지 못했습니다"), outcome.lines[0]?.text);
  });
});

describe("도우미가 반응했는가 — 초점으로 본다", () => {
  test("🔴 초점을 잃으면 OPENED · 「확인됨」 표시를 적는다", async () => {
    const { env, store } = environment(losesFocus);
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "OPENED");
    assert.equal(outcome.offerHelperInstall, true);
    assert.deepEqual(outcome.lines, [{ text: contactFolderPlaceOpeningText(FOLDER_NAME), tone: "normal" }]);
    assert.equal(store.get(QUOTE_FOLDER_HELPER_CONFIRMED_KEY), "1");
  });

  test("🔴 반응이 없고 표시도 없으면 — 「도우미가 없는 것 같습니다」 + 열려던 폴더", async () => {
    const { env } = environment();
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "NO_RESPONSE");
    assert.equal(outcome.offerHelperInstall, true);
    assert.equal(outcome.lines[0]?.text, QUOTE_FOLDER_HELPER_MISSING_TEXT);
    assert.equal(outcome.lines[1]?.text, contactFolderPlaceAttemptedText(FOLDER_NAME));
  });

  test("🔴 반응은 없지만 표시가 있으면 — 「없다」고 말하지 않는다(탐색기가 뒤에 떴을 수 있다)", async () => {
    const { env, store } = environment();
    store.set(QUOTE_FOLDER_HELPER_CONFIRMED_KEY, "1");
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "NO_RESPONSE_CONFIRMED");
    assert.equal(outcome.offerHelperInstall, true);
    assert.deepEqual(outcome.lines, [{ text: contactFolderPlaceOpeningText(FOLDER_NAME), tone: "normal" }]);
  });

  test("저장소가 통째로 막혀 있어도 던지지 않는다", async () => {
    const { env } = environment({
      ...losesFocus,
      storage: () => {
        throw new Error("localStorage 가 막혔다");
      },
    });
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "OPENED");
  });

  test("초점 듣기 자체가 던져도 던지지 않는다 — 시간만 기다린 것으로 본다", async () => {
    const { env } = environment({
      watchFocusLoss: () => {
        throw new Error("들을 수 없다");
      },
    });
    const outcome = await runContactFolderPlaceOpen({ relativePath: RELATIVE_PATH, env });
    assert.equal(outcome.kind, "NO_RESPONSE");
  });
});

describe("보고 있는 자리의 이름 — 길의 맨 뒤 토막", () => {
  test("마디가 여럿이면 맨 뒤", () => {
    assert.equal(contactFolderPlaceDisplayName(RELATIVE_PATH), FOLDER_NAME);
  });

  test("마디가 하나면 그대로", () => {
    assert.equal(contactFolderPlaceDisplayName("한마디"), "한마디");
  });
});

describe("🔴 읽기 전용이다 · 서버에 묻지 않는다", () => {
  test("fetch · 통로 주소 · 서버 사슬이 한 글자도 없다", () => {
    for (const forbidden of ["fetch(", "/api/", "@/lib/server/", "server-only", "node:fs"]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  test("🔴 숨은 iframe 을 **베끼지 않았다** — 공용 함수를 가져다 쓴다", () => {
    assert.ok(source.includes("openLinkInHiddenFrame"), "공용 함수를 안 쓴다");
    assert.equal(source.includes('document.createElement("iframe")'), false, "iframe 만들기를 또 적었다");
    for (const leave of ["location.assign(", "location.href =", "location.replace(", "window.open("]) {
      assert.equal(source.includes(leave), false, `'${leave}' 로 주소를 연다 — 페이지를 떠난다`);
    }
  });

  test("🔴 편집 화면 머리 단추의 울타리를 건드리지 않는다 — 그 이름을 부르지 않는다", () => {
    // components/quotes/quote-folder-open-screens.test.ts 가 그 단추를 부르는 원본을 셋으로 못 박는다.
    for (const bad of ["QuoteFolderOpenButton", "QuoteFolderOpenControl", "runQuoteFolderOpen("]) {
      assert.equal(source.includes(bad), false, bad);
    }
  });
});
