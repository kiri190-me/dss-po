import {
  QUOTE_FOLDER_HELPER_CONFIRMED_KEY,
  QUOTE_FOLDER_HELPER_DETECTION_MS,
  QUOTE_FOLDER_HELPER_MISSING_TEXT,
  openLinkInHiddenFrame,
  type QuoteFolderHelperStorage,
  type QuoteFolderOpenOutcome,
} from "@/components/quotes/quote-folder-open";
import type { QuoteIssueNoticeLine } from "@/components/quotes/quote-issue-messages";
import { buildQuoteFolderLink } from "@/lib/domain/quote-folder-link";

/**
 * ============================================================================
 * 공유폴더 구역의 [폴더 열기] — **보고 있는 그 폴더**를 탐색기로 연다 (조각 PO 4h)
 * ============================================================================
 * 🔴 **A/S 에서 가져왔다** — 원본은 `RF_Service_System/src/components/repair-cases/files/
 * contact-folder-place-open.ts`(연락서 조각 10)이고, **셈과 문장은 그대로**다.
 *
 * ── 🔴 편집 화면 머리의 [폴더 열기]와 **다른 물건**이다 ──────────────────
 * 그 단추(견적서 ④b)는 **견적서 id 로 서버에 폴더 위치를 묻는** 모양이라 「어느 폴더를
 * 열까」를 받을 칸이 없고, 폴더가 없을 때의 길 · [위치 복사]까지 달고 있다. 그 공개 모양을
 * 이쪽 사정으로 고치면 편집 화면이 함께 흔들린다 — 그래서 **루트 기준 상대 경로를 받아
 * 그 자리를 여는** 이 흐름이 따로 선다. 🔴 저장소의 울타리 시험
 * (components/quotes/quote-folder-open-screens.test.ts)이 그 단추를 부르는 원본을 **셋으로
 * 못 박고 있다** — 이 파일은 그 이름을 부르지도 적지도 않는다.
 *
 * ── 🔴 서버에 묻지 않는다 ───────────────────────────────────────────────
 * 목록을 받을 때 폴더 경로를 이미 받아 두었다(통로가 `relativePath` 를 준다). 루트는 설치
 * 때 도우미 스크립트에 박혀 있어 웹 페이지가 바꿀 수 없다(domain/quote-folder-link.ts
 * 머리말). 그래서 이 흐름에는 fetch 가 하나도 없다.
 *
 * ── 🔴 숨은 iframe 을 **베끼지 않고 가져다 쓴다** ───────────────────────
 * `openLinkInHiddenFrame` 은 quote-folder-open.ts 의 것을 그대로 부른다(조각 PO 4g 가 같은
 * 까닭으로 그렇게 했다 — 그 파일에 `export` 한 낱말만 더해져 있다). `location.assign` ·
 * `<a>` 클릭은 페이지 자체가 그 주소로 가려고 해서, 도우미가 없는 PC 에서 오류 페이지나
 * 「떠나기」 확인이 끼어든다.
 *
 * ── 감지의 한계 ─────────────────────────────────────────────────────────
 * 초점을 잃는 것은 탐색기가 앞에 뜨거나 브라우저가 묻는 창을 띄울 때다 — 둘 다 도우미가
 * 있다는 뜻이다. 틀릴 수 있어 「확인됨」 표시를 함께 본다(견적서 쪽과 **같은 열쇠** —
 * 도우미는 PC 당 한 벌이다).
 *
 * ── 던지지 않는다 · 바꿔 끼울 수 있다 ───────────────────────────────────
 * 주소 열기 · 창 이벤트 · 시계 · 저장소를 부르는 쪽이 바꿔 끼울 수 있다 — DOM 없이 값으로
 * 시험한다(contact-folder-place-open.test.ts).
 * ============================================================================
 */

// ── 문장 ─────────────────────────────────────────────────────────────────

/** 🔴 견적서 폴더 열기와 **같은 문장**을 쓴다 — 설치되는 도우미가 똑같은 한 벌이다. */
export const CONTACT_FOLDER_PLACE_HELPER_MISSING_TEXT = QUOTE_FOLDER_HELPER_MISSING_TEXT;

const UNOPENABLE_LINK_REASON = "이 폴더 이름은 도우미 주소로 만들 수 없습니다. 공유폴더에서 직접 열어 주세요";
const OPEN_LINK_FAILED_REASON = "브라우저가 폴더 열기 주소를 열지 못했습니다";

export function contactFolderPlaceOpeningText(displayName: string): string {
  return `탐색기로 폴더를 엽니다: ${displayName}`;
}

export function contactFolderPlaceAttemptedText(displayName: string): string {
  return `열려던 폴더: ${displayName}`;
}

function failureText(reason: string): string {
  return `폴더를 열지 못했습니다 — ${reason}`;
}

// ── 바꿔 끼울 수 있는 것 ──────────────────────────────────────────────────

export type ContactFolderPlaceOpenEnvironment = {
  /** 도우미 주소를 페이지를 떠나지 않고 연다. 기본은 숨은 iframe. */
  openLink: (link: string) => void;
  /** 창이 초점을 잃으면 onLost 를 부른다. 돌려준 함수로 그만 듣는다. */
  watchFocusLoss: (onLost: () => void) => () => void;
  delay: (ms: number) => Promise<void>;
  /** 저장소를 꺼내는 일 자체가 던질 수 있다(localStorage 접근이 막힌 브라우저). */
  storage: () => QuoteFolderHelperStorage | null;
};

function readHelperConfirmed(storage: ContactFolderPlaceOpenEnvironment["storage"]): boolean {
  try {
    return storage()?.getItem(QUOTE_FOLDER_HELPER_CONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
}

function markHelperConfirmed(storage: ContactFolderPlaceOpenEnvironment["storage"]): void {
  try {
    storage()?.setItem(QUOTE_FOLDER_HELPER_CONFIRMED_KEY, "1");
  } catch {
    // 적지 못해도 폴더는 열렸다 — 다음에 또 감지할 뿐이다.
  }
}

/**
 * 주소를 열고, 정해진 시간 안에 창이 초점을 잃는지 본다. 듣기는 여는 것보다 **먼저** 건다 —
 * 확인창 · 탐색기는 여는 즉시 뜰 수 있다. 끝나면 듣기를 푼다(늦은 blur 는 세지 않는다).
 */
async function openAndWatch(
  link: string,
  env: ContactFolderPlaceOpenEnvironment
): Promise<"FOCUS_LOST" | "NO_RESPONSE" | "OPEN_FAILED"> {
  let lost = false;
  let signalLost: () => void = () => {};
  const lostSignal = new Promise<void>((resolve) => {
    signalLost = resolve;
  });
  let stopWatching: () => void = () => {};
  try {
    stopWatching = env.watchFocusLoss(() => {
      lost = true;
      signalLost();
    });
  } catch {
    // 들을 수 없으면 감지하지 못한 것으로 — 시간만 기다린다.
  }
  const stop = () => {
    try {
      stopWatching();
    } catch {
      // 풀지 못해도 결과는 이미 정했다.
    }
  };

  try {
    env.openLink(link);
  } catch {
    stop();
    return "OPEN_FAILED";
  }

  if (!lost) await Promise.race([lostSignal, env.delay(QUOTE_FOLDER_HELPER_DETECTION_MS)]);
  stop();
  return lost ? "FOCUS_LOST" : "NO_RESPONSE";
}

// ── 브라우저 기본값 — 부를 때만 window · document 를 만진다 ─────────────────

function watchWindowFocusLoss(onLost: () => void): () => void {
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") onLost();
  };
  window.addEventListener("blur", onLost);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    window.removeEventListener("blur", onLost);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

function browserStorage(): QuoteFolderHelperStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const BROWSER_ENVIRONMENT: ContactFolderPlaceOpenEnvironment = {
  openLink: openLinkInHiddenFrame,
  watchFocusLoss: watchWindowFocusLoss,
  delay: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  storage: browserStorage,
};

// ── 부르는 곳 ────────────────────────────────────────────────────────────

/** 보고 있는 자리의 이름 — 길의 **맨 뒤 토막**이다. 길이 비면 받은 글자 그대로다. */
export function contactFolderPlaceDisplayName(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments[segments.length - 1] ?? relativePath;
}

/**
 * [폴더 열기] 한 번 — **그 폴더**를 연다. 던지지 않는다.
 * `relativePath` 는 공유폴더 루트 아래의 상대 경로(`연도 폴더/견적서 폴더`)다.
 */
export async function runContactFolderPlaceOpen({
  relativePath,
  env: overrides = {},
}: {
  relativePath: string;
  env?: Partial<ContactFolderPlaceOpenEnvironment>;
}): Promise<QuoteFolderOpenOutcome> {
  const env: ContactFolderPlaceOpenEnvironment = { ...BROWSER_ENVIRONMENT, ...overrides };
  const displayName = contactFolderPlaceDisplayName(relativePath);

  // 🔴 규칙에 어긋나는 경로(끝이 점 · 공백 · `..` …)면 주소를 지어내지 않는다 — 규칙 한 벌은
  //    도우미 주소 쪽(domain/quote-folder-link.ts)에만 있다.
  const link = buildQuoteFolderLink(relativePath);
  if (link === null) {
    return {
      kind: "FAILED",
      lines: [{ text: failureText(UNOPENABLE_LINK_REASON), tone: "warning" }],
      offerHelperInstall: false,
    };
  }

  const watched = await openAndWatch(link, env);
  if (watched === "OPEN_FAILED") {
    return {
      kind: "FAILED",
      lines: [{ text: failureText(OPEN_LINK_FAILED_REASON), tone: "warning" }],
      offerHelperInstall: false,
    };
  }

  const opening: QuoteIssueNoticeLine[] = [{ text: contactFolderPlaceOpeningText(displayName), tone: "normal" }];

  if (watched === "FOCUS_LOST") {
    markHelperConfirmed(env.storage);
    return { kind: "OPENED", lines: opening, offerHelperInstall: true };
  }

  // 반응이 없었다. 이 브라우저에서 도우미가 반응한 적이 있으면 「없다」고 말하지 않는다
  // (탐색기가 브라우저 뒤에 떴을 수 있다) — 단추만 곁에 둔다.
  if (readHelperConfirmed(env.storage)) {
    return { kind: "NO_RESPONSE_CONFIRMED", lines: opening, offerHelperInstall: true };
  }

  return {
    kind: "NO_RESPONSE",
    lines: [
      { text: CONTACT_FOLDER_PLACE_HELPER_MISSING_TEXT, tone: "warning" },
      { text: contactFolderPlaceAttemptedText(displayName), tone: "muted" },
    ],
    offerHelperInstall: true,
  };
}
