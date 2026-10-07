/**
 * ============================================================================
 * 그 견적서의 **공유폴더 안 목록**을 통로에서 받아 온다 (조각 PO — 2026-10-07)
 * ============================================================================
 * 🔴 **A/S 에서 가져왔다 — 다만 파일 하나를 그대로 옮기지 못했다.** 원본은 A/S 관리
 * 시스템의 `src/components/quotes/QuoteArchiveFolderSection.tsx`(2026-10-07 실측
 * 453줄)이고, 그 파일은 **두 가지**를 한 몸에 담고 있다:
 *
 *   ㉠ 통로를 부르고 응답을 읽는 부분 — 순수하고, 화면이 없다
 *   ㉡ 받은 상태를 **구역(section)으로 그리는** 부분 — 수리 건 「견적서」 탭의 상자
 *
 * 🔴 **이 사이트에 온 것은 ㉠ 뿐이다.** ㉡ 은 A/S 의 연락서 쪽 단추 둘
 * (`ContactFolderEntryOpenButton` · `ContactFolderPlaceOpenButton`)과 `formatBytes`
 * (domain/image-shrink)를 물고 있는데 **셋 다 이 사이트에 없고**, 이 조각이 필요로
 * 하는 것도 아니다(여기서 세우는 것은 목록 줄의 [Excel 보기] 하나다). 쓰지 않을
 * 화면을 위해 남의 사슬 셋을 끌고 오지 않는다.
 *
 * 🔴 그래서 **이름이 저쪽과 다르다.** 저쪽 파일은 「구역」이라 이름이 그렇고, 이 파일은
 * 「폴더 안 목록을 받아 오는 일」만 하므로 그 일로 이름 지었다. 🔴 **들어 있는 글자는
 * 저쪽의 ㉠ 과 한 글자까지 같다** — 상수 이름(`QUOTE_ARCHIVE_FOLDER_SECTION_*`)도
 * 바꾸지 않았다. 이름을 다듬으면 저쪽과 맞대어 보는 일이 그 순간 끝난다.
 *
 * ── 🔴 구역을 세우고 싶어지는 날 ────────────────────────────────────────
 * 이 사이트에도 공유폴더 구역을 그리게 되면 **저쪽의 ㉡ 을 그때 가져온다** — 그 조각이
 * 여기에 그리는 부분을 더하거나, 저쪽처럼 한 파일로 합치면 된다. 지금 미리 만들어 두지
 * 않는다(쓰지 않는 코드는 아무도 안 고친다).
 *
 * ── 🔴 읽기 전용이다 ────────────────────────────────────────────────────
 * 부르는 통로는 **목록 하나**(GET …/archive-folder/entries)뿐이고, 만들거나 올리거나
 * 지우는 코드가 없다. 파일 바이트가 우리 출처로 흐르는 길도 없다.
 *
 * ── 던지지 않는다 · 바꿔 끼울 수 있다 ──────────────────────────────────────
 * fetch 를 부르는 쪽이 바꿔 끼울 수 있다 — 네트워크 없이 값으로 시험한다
 * (quote-archive-folder-entries.test.ts).
 * ============================================================================
 */

/** 목록 통로의 주소. 🔴 하위 폴더 칸이 없다 — 받을 것도 보낼 것도 없다. */
export function quoteArchiveFolderEntriesUrl(quoteId: string): string {
  return `/api/quotes/${encodeURIComponent(quoteId)}/archive-folder/entries`;
}

// ── 문장 ─────────────────────────────────────────────────────────────────

export const QUOTE_ARCHIVE_FOLDER_SECTION_TITLE = "공유폴더";

export const QUOTE_ARCHIVE_FOLDER_SECTION_LOADING_TEXT = "불러오는 중…";
/**
 * 🔴 폴더를 세우는 일은 **[저장]이 한다**(server/actions/quotes.ts 의
 * `archiveDocumentAfterSave` · 새 장을 만들 때의 폴더 세우기). 저쪽과 같은 문장을 쓰는
 * 까닭이 그것이다 — 이 사이트에서도 참이다.
 */
export const QUOTE_ARCHIVE_FOLDER_SECTION_NOT_FOUND_TEXT =
  "아직 공유폴더에 이 견적서의 폴더가 없습니다 — [저장]을 누르면 만들어집니다";
export const QUOTE_ARCHIVE_FOLDER_SECTION_EMPTY_TEXT = "폴더가 비어 있습니다";
/** 🔴 목록을 내지 않는다 — 사람이 공유폴더를 정리해야 한다. */
export const QUOTE_ARCHIVE_FOLDER_SECTION_MULTIPLE_TEXT =
  "맞는 폴더가 여럿입니다 — 공유폴더에서 하나로 정리해 주세요";
export const QUOTE_ARCHIVE_FOLDER_SECTION_FAILED_TEXT = "공유폴더를 읽지 못했습니다";

const NETWORK_FAILED_REASON = "서버에 닿지 못했습니다(네트워크 상태를 확인해 주세요)";
const UNREADABLE_RESPONSE_REASON = "서버 응답을 읽지 못했습니다";
const UNKNOWN_REASON = "까닭을 알 수 없습니다";

function rejectedReason(status: number): string {
  return `서버가 요청을 처리하지 못했습니다(HTTP ${status})`;
}

// ── 값 ───────────────────────────────────────────────────────────────────

/** 🔴 **경로를 담는 칸이 없다** — 이름은 그 폴더 안에서의 이름뿐이다. */
export type QuoteArchiveFolderEntryView = {
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  /** 수정 시각(ISO). 서버가 못 읽었으면 칸이 통째로 없다. */
  modifiedAt?: string;
};

export type QuoteArchiveFolderSectionState =
  | { kind: "loading" }
  /** 🔴 공유폴더 저장 설정이 꺼져 있다. */
  | { kind: "disabled" }
  | { kind: "not-found" }
  /** 🔴 목록도 경로도 없다. */
  | { kind: "multiple" }
  | { kind: "failed"; reason: string }
  | {
      kind: "found";
      /** 루트 기준 상대 경로 — `연도 폴더/견적서 폴더`. 파일 열기 주소에 쓴다. */
      relativePath: string;
      entries: QuoteArchiveFolderEntryView[];
      totalCount: number;
      truncated: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 한 줄을 읽는다. 이름이 없으면 그 줄만 버린다 — 나머지 줄은 그대로 남는다. */
function readEntry(value: unknown): QuoteArchiveFolderEntryView | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || value.name === "") return null;
  const modifiedAt = typeof value.modifiedAt === "string" && value.modifiedAt !== "" ? value.modifiedAt : undefined;
  return {
    name: value.name,
    isDirectory: value.isDirectory === true,
    sizeBytes: typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) ? value.sizeBytes : 0,
    ...(modifiedAt === undefined ? {} : { modifiedAt }),
  };
}

/** 🔴 알려진 칸만 옮긴다 — 응답에 다른 칸이 끼어 있어도 화면까지 오지 않는다. 모양이 다르면 null. */
export function readQuoteArchiveFolderEntriesAnswer(payload: unknown): QuoteArchiveFolderSectionState | null {
  if (!isRecord(payload)) return null;
  switch (payload.status) {
    case "found": {
      const entries = Array.isArray(payload.entries)
        ? payload.entries.map(readEntry).filter((entry): entry is QuoteArchiveFolderEntryView => entry !== null)
        : [];
      const totalCount =
        typeof payload.totalCount === "number" &&
        Number.isFinite(payload.totalCount) &&
        payload.totalCount >= entries.length
          ? payload.totalCount
          : entries.length;
      return {
        kind: "found",
        relativePath: typeof payload.relativePath === "string" ? payload.relativePath : "",
        entries,
        totalCount,
        truncated: payload.truncated === true && totalCount > entries.length,
      };
    }
    case "multiple":
      return { kind: "multiple" };
    case "not-found":
      return { kind: "not-found" };
    case "disabled":
      return { kind: "disabled" };
    case "failed": {
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
      return { kind: "failed", reason: reason === "" ? UNKNOWN_REASON : reason };
    }
    default:
      return null;
  }
}

type EntriesResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type QuoteArchiveFolderEntriesFetch = (url: string) => Promise<EntriesResponse>;

/** 실패 응답 `{ error, code }` 의 문장 — 서버 문장 그대로다. */
async function failureReason(response: EntriesResponse): Promise<string> {
  const payload = await response.json().catch(() => null);
  const error = isRecord(payload) && typeof payload.error === "string" ? payload.error.trim() : "";
  return error !== "" ? error : rejectedReason(response.status);
}

/**
 * 통로를 한 번 부른다. **던지지 않는다** — 무슨 일이 나도 `failed` 한 상태로 끝난다.
 * 이것이 실패해도 같은 화면의 다른 일(목록 · 편집 · 저장)은 아무 영향을 받지 않는다.
 */
export async function loadQuoteArchiveFolderEntries(
  quoteId: string,
  fetchImpl: QuoteArchiveFolderEntriesFetch = (url) => fetch(url)
): Promise<QuoteArchiveFolderSectionState> {
  let response: EntriesResponse;
  try {
    response = await fetchImpl(quoteArchiveFolderEntriesUrl(quoteId));
  } catch {
    return { kind: "failed", reason: NETWORK_FAILED_REASON };
  }
  if (!response.ok) return { kind: "failed", reason: await failureReason(response) };
  const answer = readQuoteArchiveFolderEntriesAnswer(await response.json().catch(() => null));
  return answer ?? { kind: "failed", reason: UNREADABLE_RESPONSE_REASON };
}
