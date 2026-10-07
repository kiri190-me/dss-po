/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — **목록을 세우는 절반만** 옮겼다 (2026-10-07)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/domain/share-folder-naming.ts` — 2026-10-07 실측
 * 220줄). 옮긴 세 함수는 원본과 **한 글자도 다르지 않다.**
 *
 * ── 🔴 왜 절반만인가 ─────────────────────────────────────────────────────
 * 저쪽 원본은 두 가지를 담고 있다:
 *   ① **이름을 짓는 규칙** — 금지 글자 표(FORBIDDEN_IN_NAME) · sanitize · truncate ·
 *      buildShareFolderStem · matchesShareFolderPrefix · numberedShareFolderFileName
 *   ② **목록을 세우는 규칙** — normalize · compare · isIgnored…  ← **이 파일**
 *
 * ①은 저쪽에서 2026-10-05 에 `quote-archive-naming.ts` 에서 **끌어낸** 것이고, 저쪽
 * `quote-archive-naming.ts` 는 그 이름들을 다시 내보내기만 한다. 🔴 **이 사이트의
 * `domain/quote-archive-naming.ts` 는 그 끌어내기 이전 판**이라 ①을 아직 제 안에
 * 그대로 들고 있다(sanitizeQuoteArchiveNamePiece · normalizeQuoteArchiveNameForCompare
 * · FORBIDDEN_IN_NAME …). 그래서 ①을 여기로 베껴 오면 **같은 금지 글자 표가 이 저장소
 * 안에 두 벌**이 된다 — 저쪽 원본 머리말이 「갈라지면 안 되는 것을 한 벌로 둔다」며
 * 바로 그것을 막으려고 쓰여 있다. 한쪽만 고쳐지는 날이 반드시 온다.
 *
 * 그래서 이 조각(견적서 폴더 **목록 읽기**)이 실제로 쓰는 ②만 옮겼다. ①이 필요해지면
 * 그때는 베끼지 말고 `quote-archive-naming.ts` 를 저쪽처럼 **이 파일 위로 옮겨
 * 세우는** 조각을 따로 잡아야 한다(그 파일은 지금 「머리말 아래는 바이트 동일」로
 * 묶여 있어, 손대는 일 자체가 별건이다).
 *
 * 🔴 아래 normalizeShareFolderNameForCompare 는 `quote-archive-naming.ts` 의
 * normalizeQuoteArchiveNameForCompare 와 **글자까지 같은 세 줄**이다 — 저쪽에서
 * compareShareFolderNames 가 그것을 쓰기 때문에 함께 왔다. 두 벌이 조용히 갈라지지
 * 않도록 share-folder-naming.test.ts 가 **둘의 결과가 같은지**를 직접 견준다.
 *
 * 이 모듈은 순수하다 — 파일시스템 · DB · 세션에 닿지 않고 아무것도 import 하지 않는다.
 * ============================================================================
 */

/** 디스크에 이미 있는 이름을 **비교할 때만** 쓰는 모양: NFC + 연속 공백 하나 + 앞뒤 공백 걷기. */
export function normalizeShareFolderNameForCompare(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * 폴더 이름 정렬 — 다듬은 이름으로 견주고, 같으면 디스크의 실제 이름으로 가른다.
 * 맞는 폴더가 여럿일 때 **늘 같은 하나**를 고르기 위한 것이다(사람이 NFD 로 적은
 * 이름과 NFC 로 적은 이름이 섞여 있어도 순서가 흔들리지 않게).
 */
export function compareShareFolderNames(a: string, b: string): number {
  const left = normalizeShareFolderNameForCompare(a);
  const right = normalizeShareFolderNameForCompare(b);
  if (left !== right) return left < right ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * 목록에서 빼는 이름들 — 사람이 만든 것이 아니라 프로그램이 남긴 것이다.
 * 대소문자를 접어서 본다(`Thumbs.db` · `thumbs.db` 가 같은 것).
 */
const PROGRAM_LEFTOVER_NAMES = new Set(["thumbs.db", "desktop.ini"]);

/**
 * 공유폴더 목록에서 이 줄을 **빼는가**.
 *  · `~$…` — 엑셀 · 워드가 **열어 둔 동안** 만드는 잠금 파일이다. 사람이 파일을 닫으면
 *    사라지므로 목록에 보이면 「이게 뭐죠」만 부른다.
 *  · `Thumbs.db` · `desktop.ini` — 윈도우 탐색기가 남기는 것이다(대소문자를 접는다).
 *  · 점으로 시작하는 이름 — 숨김 파일이다(NAS 는 리눅스라 `.DS_Store` · `.@__thumb` 가
 *    실제로 쌓인다).
 *
 * 실측(2026-10-06, A/S 쪽 실측): 견적서 2026 연도 폴더의 파일 342 개 가운데 **57 개가
 * 찌꺼기**였고 거의 전부 `Thumbs.db` 였다 — 거르지 않으면 목록의 1/6 이 사람이 넣은 적
 * 없는 줄이다.
 */
export function isIgnoredShareFolderEntryName(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.startsWith(".")) return true;
  if (name.startsWith("~$")) return true;
  return PROGRAM_LEFTOVER_NAMES.has(name.toLowerCase());
}
