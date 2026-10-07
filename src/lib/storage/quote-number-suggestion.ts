import "server-only";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { toKstDateOnly } from "@/lib/domain/date-only";
import { isQuoteArchiveYearFolder } from "@/lib/domain/quote-archive-naming";
import { normalizeShareFolderNameForCompare } from "@/lib/domain/share-folder-naming";
import { resolveQuoteArchiveRoot } from "./quote-archive";

/**
 * ============================================================================
 * 다음 견적서 번호를 **제안**한다 (2026-10-06)
 * ============================================================================
 * 🔴 **채번기가 아니다. 이 모듈을 채번기로 바꾸지 마라.**
 *
 * 견적서 번호는 지금도 앞으로도 **사람이 손으로 적는 자유 텍스트**다(승인된 결정 —
 * vendor/dss-core/src/schema/quotes.ts 의 quoteNumber 주석). 자동 채번하지 않는 까닭은
 * 예전부터 쓰던 번호 체계를 시스템이 넘겨받지 않기 위해서다 — 넘겨받는 순간 시작 번호를
 * 맞추는 일과, 취소된 견적서 때문에 번호가 비는 자리를 정리하는 일이 함께 따라온다.
 * 중복은 지금처럼 **DB 의 부분 unique 인덱스**(`quotes_quote_number_not_deleted_unique`)가
 * 막는다.
 *
 * 🔴 그래서 이 모듈이 내는 값은 **제안**이고, 사람이 **그대로 두거나 고칠 수 있어야 한다.**
 * 화면에 붙이는 조각은 이 값을 번호 칸의 **초기값**으로만 쓴다 — 칸을 읽기 전용으로 만들거나,
 * 저장할 때 이 값으로 덮어쓰거나, 사람이 적은 번호를 이 값과 견주어 거절하면 위 결정이
 * 코드로 뒤집힌다. 번호 칸은 **여전히 자유 입력**이다.
 *
 * ── 무엇을 보고 정하나 ───────────────────────────────────────────────────
 * 두 곳을 보고 **더 큰 쪽 다음**을 제안한다.
 *   1. 공유폴더 — 그 해의 **연도 폴더 하나**(`21. 2026 내자견적서`)에 든 견적서 폴더 이름.
 *   2. 넘겨받은 **이미 쓰인 번호들**(`knownQuoteNumbers`) — 부르는 쪽이 DB 에서 읽어 준다.
 *      🔴 이 모듈은 DB 를 모른다(가져오지도 않는다). 왜 둘 다 보는지는 통로 머리말에 있다:
 *      공유폴더에만 있고 DB 에 없는 번호도, 그 반대도 있을 수 있는데 저장을 거절하는 쪽은
 *      **DB** 다. 폴더만 보면 DB 에만 있는 더 큰 번호와 부딪혀 저장이 거절된다.
 *
 * ── 🔴 같은 번호를 두 사람이 제안받을 수 있다 ────────────────────────────
 * 이 사이트(PO)와 A/S 관리 시스템은 **같은 공유폴더와 같은 DB** 를 본다. 두 사람이 거의
 * 같은 순간에 [새 견적서] 를 열면 **같은 번호를 제안받는다.** 🔴 그래도 번호를 미리 잡아
 * 두지 않는다(예약 표 · 채번 표를 만들지 않는다) — 그 순간 이 모듈은 채번기가 되고 위
 * 결정이 뒤집힌다. 먼저 저장하는 쪽만 들어가고 뒤에 저장하는 쪽은 **DB 의 부분 unique
 * 인덱스**에 막혀 거절된다 — 그것이 마지막 방어선이고, 그 뒤 사람이 번호를 고쳐 적으면
 * 된다(칸이 자유 입력인 까닭이기도 하다).
 *
 * ── 🔴 빈 자리를 메우지 않는다 ───────────────────────────────────────────
 * 「가장 큰 번호 + 1」이다. 중간에 비어 있는 번호가 보여도 그 자리를 채우지 않는다 —
 * 그 자리는 **취소된 견적서**의 자리일 수 있고, 종이에는 그 번호로 나간 장이 있을 수 있다.
 *
 * ── 🔴 개정 접미(`R1`)는 본 번호로 센다 ─────────────────────────────────
 * `DSS 2026-004R1` 은 `004` 의 개정본이지 005 가 아니다. 가지 번호(`-1`)도 같다.
 * 그래서 `2026-004R1` 하나만 있는 해의 다음 번호는 `005` 다.
 *
 * ── 실측 (2026-10-06, 사내 2026 연도 폴더) ───────────────────────────────
 *   견적서 폴더 106 개 · 이름에서 번호를 읽은 것 106 개 전부 · 본 번호 1~95 ·
 *   중간에 빠진 번호 0 개 · 개정 접미가 붙은 것 11 개 → 그때의 제안은 `DSS 2026-096`.
 *
 * ── 🔴 만들지 않는다 · 쓰지 않는다 · 지우지 않는다 ────────────────────────
 * 이웃(quote-archive-entries.ts)과 같은 규율이다. 읽는 이름은 `readdir` 과 `stat` **둘뿐**
 * 이다 — 만들기 · 쓰기 · 지우기 · 옮기기는 **이 파일에 들어올 길이 없다.** 폴더 안의
 * 파일도 보지 않는다(이름조차 읽지 않는다 — 폴더 이름만으로 충분하다). 그 사실을
 * quote-number-suggestion-source.test.ts 가 원본을 글자로 읽어 못 박는다.
 *
 * ── 🔴 돌려주는 값에 절대 경로가 없다 ────────────────────────────────────
 * 나가는 것은 제안 번호와 **근거 숫자 넷**(훑은 폴더 수 · 번호를 읽은 폴더 수 · 공유폴더에서
 * 본 가장 큰 번호 · 넘겨받은 번호들에서 본 가장 큰 번호)뿐이다. 경로를 담을 칸이 타입 수준에
 * 없고, 실패 사유도 경로 없는 짧은 문장이다(fs 오류의 `message` 에는 경로가 들어 있으므로
 * 쓰지 않고 **오류 코드만 보고** 바꾼다).
 *
 * ── 던지지 않는다 ───────────────────────────────────────────────────────
 * 모든 결과가 `{ status, … }` 다. 부르는 쪽(통로)은 try 를 쓰지 않는다.
 *
 * ── 🔴 A/S 에서 가져왔다 — 다른 것은 **읽기 도우미가 어디 있는가** 하나다 (2026-10-07) ──
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/storage/quote-number-suggestion.ts` — 2026-10-07 실측
 * 291줄). 규칙도 상한도 상태 셋도 **한 걸음도 줄이지 않았다.** 다른 것은 둘이다:
 *  ① 🔴 저쪽은 `storage/share-folder-fs.ts` 라는 **공용 도우미**를 부른다(견적서와
 *     연락서가 함께 쓴다). 🔴 **이 사이트에는 그 파일이 없고, 연락서 기능도 없다.**
 *     이웃 `quote-archive-entries.ts` 가 같은 까닭으로 제 안에 비공개로 들고 있고,
 *     여기도 **이 모듈이 실제로 쓰는 만큼만** 아래쪽에 비공개로 두었다. 이름은 저쪽
 *     공용 도우미의 이름 그대로다 — 이 사이트에도 공용 도우미를 세우는 날 **이름을
 *     그대로 들어 옮기면** 된다.
 *  ② 🔴 그 비공개 `listShareFolderNames` 는 **이름을 정렬하지 않는다.** 저쪽 공용
 *     도우미는 이름순으로 돌려주지만(폴더를 **고르는** 다른 부르는 쪽이 차례를 쓴다),
 *     이 모듈이 하는 일은 **가장 큰 번호 하나와 개수를 세는 것**이라 차례가 아무 데도
 *     쓰이지 않는다. 늘어놓고 사이를 뒤지는 코드가 **생길 자리 자체를 없애** 「빈 자리를
 *     메우지 않는다」를 원본 글자로 지키게 한 것이기도 하다(위 머리말 · 소스 시험).
 * ============================================================================
 */

/**
 * 이만큼 안에 답하지 않으면 그만둔다.
 *
 * 🔴 **2000 이다.** 읽는 것이 **두 겹뿐**이기 때문이다 — 루트에서 그 해의 연도 폴더를 고르고,
 * 그 연도 폴더 안의 폴더 이름을 한 번 읽는다. 실측(2026-10-06)에서 연도 폴더 **하나**를 읽는
 * 데 보통 20~40ms(가장 느렸던 한 번이 226ms)였으니 둘을 합쳐도 100ms 안팎이고, 2000 은 그
 * 가장 느렸던 값의 여덟 배가 넘는다.
 * 🔴 이웃(QUOTE_ARCHIVE_ENTRIES_TIMEOUT_MS = 3000)보다 짧은 까닭은 **읽는 폴더 수가 다르기**
 * 때문이다(저쪽은 찾기까지 한 상한에 덮는다). 게다가 이 값은 사람이 [새 견적서]를 누르고
 * **기다리는 시간**이다 — 오래 멈춰 있느니 번호 칸을 비워 두고 사람이 적는 쪽이 낫다.
 * 한쪽을 고칠 일이 있어도 따라 고치지 말 것.
 */
export const QUOTE_NUMBER_SUGGESTION_TIMEOUT_MS = 2000;

/** 상한을 넘겼을 때의 사유. 🔴 경로를 담지 않는다(머리말의 규율). */
export const QUOTE_NUMBER_SUGGESTION_SLOW_REASON =
  "공유폴더가 느려 다음 견적서 번호를 알아내지 못했습니다(번호를 직접 적어 주세요).";

/** 🔴 사유에 경로를 담지 않는다(머리말의 규율). */
const OUTSIDE_ROOT_REASON = "찾은 폴더가 공유폴더 밖을 가리켜 읽지 않았습니다.";

/**
 * 제안 번호의 머리. 사내 번호가 수년째 `DSS 2026-001` 꼴이라 그대로 쓴다.
 * 🔴 **강제가 아니다** — 사람이 다른 머리로 바꿔 적어도 아무 일도 일어나지 않는다.
 */
const QUOTE_NUMBER_PREFIX = "DSS";

/** 일련번호 자릿수. 사내 실측이 모두 세 자리다(`2026-001`). 넘으면 늘어난다(`2026-1000`). */
const QUOTE_NUMBER_SEQUENCE_DIGITS = 3;

/**
 * 폴더 이름 · 이미 쓰인 번호에서 **연도와 일련번호**를 읽는 모양.
 *
 * 🔴 **`quote-archive-file-number.ts` 의 ARCHIVE_FILE_NUMBER 와 한 글자만 다르다** — 끝의
 * 앞보기가 `(?=\s)` 가 아니라 `(?=\s|$)` 다. 그 함수는 **파일 이름**용이라 번호 뒤에 늘
 * 무언가가 따라오지만, 여기서 읽는 값은 **번호로 끝날 수 있다**:
 *   · 이미 쓰인 번호는 번호 그 자체다(`DSS 2026-096`).
 *   · 사람이 번호만으로 폴더를 만들어 둘 수 있다.
 * 그 한 글자 말고는 같다 — `DSS` 뒤가 공백이든 하이픈이든 받고(`DSS-2026-099` 가 실제로
 * 들어왔다), 가지(`-1`) · 개정(`R1`) 이 한 겹 붙는 것까지 받고, 대소문자를 접어 본다.
 *
 * 🔴 **번호 뒤가 공백도 끝도 아니면 읽지 않는다**(그 함수와 같은 방어). 실측에
 * `DSS 2026-046- ICD …` 가 있었다 — 번호 뒤에 공백 대신 `-` 를 찍은 오타다. 거기서
 * `2026-046` 을 뽑으면 **사람이 적지 않은 번호**를 우리가 지어내는 셈이다.
 *
 * 두 벌이 어긋나지 않는지는 quote-number-suggestion.test.ts 가 같은 표본을 두 규칙에
 * 넣어 본다.
 */
const ARCHIVE_NAME_NUMBER = /^DSS[ -](\d{4})-(\d+)(?:-\d+|R\d+)?(?=\s|$)/i;

/** 읽어 낸 번호 한 개 — 연도와 **일련번호**. 🔴 일련번호는 장비의 S/N 과 아무 관계가 없다. */
type ArchiveNumber = { year: number; sequence: number };

export type QuoteNumberSuggestionResult =
  | {
      status: "ready";
      /** 제안 번호 — `DSS 2026-096`. 🔴 사람이 그대로 두거나 고칠 수 있는 값이다. */
      quoteNumber: string;
      /** 그 번호의 연도. */
      year: number;
      /** 그 번호의 일련번호(96). 🔴 장비의 S/N 과 아무 관계가 없다. */
      sequence: number;
      /** 근거 — 그 해 연도 폴더에서 훑은 폴더 수. 연도 폴더가 없으면 0 이다. */
      folderCount: number;
      /** 근거 — 그 가운데 **그 해의 번호를 읽은** 폴더 수. */
      numberedFolderCount: number;
      /** 근거 — 공유폴더에서 본 가장 큰 일련번호. 하나도 못 읽었으면 null. */
      highestFolderSequence: number | null;
      /** 근거 — 넘겨받은 「이미 쓰인 번호」에서 본 가장 큰 일련번호. 없으면 null. */
      highestKnownSequence: number | null;
    }
  /** 공유폴더 위치가 설정되지 않았다 — 이 기능만 꺼져 있다. 실패가 아니다. */
  | { status: "disabled" }
  | { status: "failed"; reason: string };

export type SuggestNextQuoteNumberInput = {
  /**
   * 공유폴더 루트. 주지 않으면(`undefined` · `null`) 설정을 읽는다 — 비어 있으면
   * `disabled` 로 끝나고 🔴 **디스크를 한 번도 보지 않는다.** 시험에서는 임시 폴더를 준다.
   */
  root?: string | null;
  /** 어느 해의 번호인가. 주지 않으면 **한국 표준시 기준 올해**다. */
  year?: number;
  /**
   * **이미 쓰인 번호들** — 부르는 쪽이 DB 에서 읽어 넘긴다(머리말 「무엇을 보고 정하나」).
   * 🔴 그 해의 번호가 아닌 것 · 모양이 아닌 것은 조용히 건너뛴다. 주지 않으면 공유폴더만 본다.
   */
  knownQuoteNumbers?: readonly string[];
  /** 기다리기 상한. 시험에서만 바꾼다. */
  timeoutMs?: number;
};

/** 한국 표준시 기준 올해. 시간대를 직접 세지 않는다 — 연말 · 연초가 하루 어긋나지 않게. */
function currentArchiveYear(): number {
  return Number(toKstDateOnly(new Date()).slice(0, 4));
}

/**
 * 이름 하나에서 연도 · 일련번호를 읽는다. 못 읽으면 `null`. **던지지 않는다.**
 * 비교 전에 다듬는 일(NFC · 연속 공백 하나 · 앞뒤 공백 걷기)은 공유폴더 공용 함수가 한다.
 */
function archiveNumberOf(name: string): ArchiveNumber | null {
  if (typeof name !== "string") return null;
  const match = ARCHIVE_NAME_NUMBER.exec(normalizeShareFolderNameForCompare(name));
  if (match === null) return null;
  const sequence = Number(match[2]);
  // 터무니없이 긴 숫자는 안전한 정수가 아니다 — 그런 이름은 번호가 아닌 것으로 친다.
  if (!Number.isSafeInteger(sequence)) return null;
  return { year: Number(match[1]), sequence };
}

/** 그 해의 번호만 골라 **가장 큰 일련번호**와 **읽은 개수**를 센다. 못 읽는 이름은 건너뛴다. */
function highestSequenceIn(
  names: readonly string[],
  year: number
): { highest: number | null; counted: number } {
  let highest: number | null = null;
  let counted = 0;
  for (const name of names) {
    const found = archiveNumberOf(name);
    if (found === null || found.year !== year) continue;
    counted += 1;
    if (highest === null || found.sequence > highest) highest = found.sequence;
  }
  return { highest, counted };
}

/** `DSS 2026-096`. 일련번호는 적어도 세 자리로 채운다. */
function formatQuoteNumber(year: number, sequence: number): string {
  return `${QUOTE_NUMBER_PREFIX} ${year}-${String(sequence).padStart(QUOTE_NUMBER_SEQUENCE_DIGITS, "0")}`;
}

/**
 * 다음 견적서 번호를 **제안**한다(머리말 — 강제가 아니다). **던지지 않는다** — 모든 결과가
 * `{ status, … }` 다.
 */
export async function suggestNextQuoteNumber(
  input: SuggestNextQuoteNumberInput = {}
): Promise<QuoteNumberSuggestionResult> {
  const year =
    typeof input.year === "number" && Number.isInteger(input.year) ? input.year : currentArchiveYear();

  // 🔴 설정이 비어 있으면 여기서 끝난다 — 아래 디스크를 보는 코드에 닿지 않는다.
  const configured = input.root === undefined || input.root === null ? resolveQuoteArchiveRoot() : input.root;
  if (configured === null || configured.trim().length === 0) {
    return { status: "disabled" };
  }

  // 넘겨받은 번호는 디스크와 상관이 없다 — 먼저 세어 둔다.
  const known = highestSequenceIn(input.knownQuoteNumbers ?? [], year);
  const timeoutMs =
    typeof input.timeoutMs === "number" ? input.timeoutMs : QUOTE_NUMBER_SUGGESTION_TIMEOUT_MS;

  let folderNames: string[];
  try {
    // 🔴 상한 하나가 **연도 폴더 고르기와 그 안 읽기를 함께** 덮는다.
    folderNames = await withShareFolderTimeout(readYearFolderEntries(configured, year), timeoutMs);
  } catch (error) {
    if (error instanceof ShareFolderTimeout) {
      return { status: "failed", reason: QUOTE_NUMBER_SUGGESTION_SLOW_REASON };
    }
    return {
      status: "failed",
      reason: error instanceof ShareFolderFailure ? error.reason : shareFolderReadFailureReason(error),
    };
  }

  const folder = highestSequenceIn(folderNames, year);

  // 🔴 「가장 큰 것 + 1」이다 — 빈 자리를 메우지 않는다(머리말). 양쪽 다 비어 있으면 그 해
  //    첫 장이라 1 이다(연도 폴더가 아직 없는 해가 그렇다).
  const highest = maxOf(folder.highest, known.highest);
  const sequence = highest === null ? 1 : highest + 1;

  return {
    status: "ready",
    quoteNumber: formatQuoteNumber(year, sequence),
    year,
    sequence,
    folderCount: folderNames.length,
    numberedFolderCount: folder.counted,
    highestFolderSequence: folder.highest,
    highestKnownSequence: known.highest,
  };
}

function maxOf(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return left > right ? left : right;
}

/**
 * 🔴 **그 해의 연도 폴더만** 읽는다 — 번호는 해마다 다시 1 부터라 다른 해를 훑을 까닭이 없다.
 * 연도 폴더 판정은 **이미 있는 함수**가 한다 — 이름 규칙(`NN. YYYY 내자견적서`)을 여기에 두
 * 벌째 적지 않는다.
 *
 * 맞는 연도 폴더가 **여럿이면 전부** 읽는다(사람이 `20. 2026` 과 `21. 2026` 을 둘 다 만들어 둔
 * 날이 있을 수 있다). 하나만 보면 다른 쪽에 있는 더 큰 번호를 놓쳐 **이미 쓴 번호를 제안**하게
 * 된다 — 안전한 쪽으로 틀린다. 보통은 한 개다.
 *
 * 읽는 것은 **폴더 이름뿐**이다. 폴더 안으로 내려가지 않고 파일 이름도 보지 않는다.
 */
async function readYearFolderEntries(rawRoot: string, year: number): Promise<string[]> {
  // 루트는 이미 있는 폴더여야 한다 — 없으면 만들지 않고 실패한다.
  const root = await requireExistingShareFolderRoot(rawRoot);

  const names: string[] = [];
  for (const yearFolderName of await listShareFolderNames(root, (name) => isQuoteArchiveYearFolder(name, year))) {
    // 이을 때는 디스크의 실제 이름을 쓴다 — 다듬은 이름으로 이으면 없는 폴더가 된다.
    const yearDirectory = path.join(root, yearFolderName);
    assertInsideShareFolderRoot(root, yearDirectory, OUTSIDE_ROOT_REASON);
    names.push(...(await listShareFolderNames(yearDirectory)));
  }
  return names;
}

/**
 * ============================================================================
 * 공유폴더를 **읽는** 절편 — A/S 의 storage/share-folder-fs.ts 에서 옮겨 왔다
 * ============================================================================
 * 🔴 **비공개다.** 밖으로 나가는 이름은 위의 하나(suggestNextQuoteNumber)와 상수 둘뿐이다.
 * 이름은 저쪽 공용 도우미의 이름 그대로 두었다 — 이 사이트에도 공용 도우미를 세우는 날
 * **이 토막을 그대로 들어 옮기면** 된다(머리말 ①). 이웃 quote-archive-entries.ts 가 같은
 * 까닭으로 같은 이름의 토막을 들고 있다.
 *
 * 🔴 **읽기만** 한다(readdir · stat). 만들기 · 쓰기 · 지우기는 여기에 들이지 않는다.
 * 실패 사유는 응답으로 나가므로 **절대 경로 · 루트 값을 담지 않는다** — fs 오류의
 * `message` 에는 경로가 들어 있으므로 쓰지 않고 **오류 코드만 보고** 짧은 한국어로 바꾼다.
 * ============================================================================
 */

/** 사람이 읽는 실패 사유를 들고 나오는 내부 오류. 부르는 쪽이 잡아서 바꾼다. */
class ShareFolderFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ShareFolderFailure";
  }
}

/** 공유폴더가 제때 답하지 않았다 — 기다리기를 그만두었다는 표시(아래 withShareFolderTimeout). */
class ShareFolderTimeout extends Error {
  constructor() {
    super("share folder timed out");
    this.name = "ShareFolderTimeout";
  }
}

/**
 * 공유폴더 일을 **기다리는 시간에 상한**을 둔다. 상한을 넘으면 ShareFolderTimeout 을
 * 던져 요청을 돌려보낸다.
 *
 * 🔴 fs 작업 자체는 끊을 수 없다 — NAS 가 느리면 그 readdir 은 뒤에서 계속 돈다.
 * 여기서 끊는 것은 **기다리기**뿐이다. 그래야 NAS 가 멎었을 때 요청 워커가 거기
 * 매달려 앱 전체가 느려지는 일이 없다.
 *
 * 매달린 작업이 나중에 실패해도 unhandled rejection 이 되지 않게 미리 손을 붙여 둔다.
 */
async function withShareFolderTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  // 나중에 깨지는 약속에 미리 손을 붙인다(값은 버린다 — race 는 원래 약속을 그대로 본다).
  void work.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ShareFolderTimeout()), Math.max(0, timeoutMs));
        // 이 타이머 하나 때문에 프로세스가 안 끝나는 일이 없게.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 루트는 이미 있는 폴더여야 한다 — 없으면 만들지 않고 실패한다(절편 머리말). */
async function requireExistingShareFolderRoot(rawRoot: string): Promise<string> {
  if (typeof rawRoot !== "string" || rawRoot.trim().length === 0) {
    throw new ShareFolderFailure("공유폴더 위치가 설정되지 않았습니다.");
  }
  const root = path.resolve(rawRoot.trim());
  let info;
  try {
    info = await stat(root);
  } catch (error) {
    const code = shareFolderErrorCode(error);
    if (code === "EACCES" || code === "EPERM") {
      throw new ShareFolderFailure("공유폴더에 접근할 권한이 없습니다.");
    }
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new ShareFolderFailure("공유폴더를 찾을 수 없습니다(연결이 끊겼을 수 있습니다).");
    }
    throw error;
  }
  if (!info.isDirectory()) {
    throw new ShareFolderFailure("공유폴더를 찾을 수 없습니다(폴더가 아닙니다).");
  }
  return root;
}

/**
 * 폴더 **맨 위 칸**의 **폴더 이름**만 돌려준다(거르개를 주면 거기 맞는 것만).
 *
 * 🔴 **하위 폴더로 내려가지 않는다** — `readdir` 에 재귀를 주지 않는다.
 * 🔴 **파일은 담지 않는다** — 사람이 연도 폴더에 바로 올려 둔 엑셀이 후보가 되면 안 된다.
 * 심볼릭 링크 · 장치 파일도 담기지 않는다(링크는 공유폴더 밖을 가리킬 수 있다).
 *
 * 🔴 **차례를 세우지 않는다**(머리말 ②). 저쪽 공용 도우미는 이름순으로 돌려주지만 이
 * 모듈이 보는 것은 **가장 큰 번호 하나와 개수**뿐이라 차례가 쓰이는 자리가 없다.
 */
async function listShareFolderNames(parent: string, matches?: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(parent, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (matches !== undefined && !matches(entry.name)) continue;
    found.push(entry.name);
  }
  return found;
}

/**
 * 이은 경로가 루트 밖이면 거절한다. 이름을 다듬으므로 일어나지 않아야 하지만,
 * 디스크의 이름을 그대로 잇는 자리가 있어 방어로 둔다. 사유는 부르는 쪽이 정한다.
 */
function assertInsideShareFolderRoot(root: string, target: string, reason: string): void {
  const relative = path.relative(root, target);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new ShareFolderFailure(reason);
  }
}

function shareFolderErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * 읽기 쪽 fs 오류 → 사람이 읽는 짧은 사유. **오류의 message 는 쓰지 않는다**(경로가
 * 들어 있다). 🔴 이웃 quote-archive-entries.ts · storage/quote-archive.ts 가 쓰는 표와
 * **같은 일곱 갈래 · 같은 문장**이다 — 한 폴더를 두고 세 자리가 다른 말을 하지 않게.
 */
function shareFolderReadFailureReason(error: unknown): string {
  switch (shareFolderErrorCode(error)) {
    case "EACCES":
    case "EPERM":
      return "공유폴더를 읽을 권한이 없습니다.";
    case "ENOENT":
    case "ENOTDIR":
      return "공유폴더의 폴더를 찾을 수 없습니다(찾는 중 옮겨졌거나 연결이 끊겼을 수 있습니다).";
    case "ENAMETOOLONG":
      return "폴더 경로가 너무 깁니다.";
    case "EIO":
    case "ETIMEDOUT":
    case "EHOSTDOWN":
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "ECONNRESET":
      return "공유폴더에 연결할 수 없습니다(네트워크 · NAS 상태를 확인하세요).";
    default:
      return "공유폴더를 읽지 못했습니다.";
  }
}
