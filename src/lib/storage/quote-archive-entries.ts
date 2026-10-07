import "server-only";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { QuoteArchiveNamingInput } from "@/lib/domain/quote-archive-naming";
import { compareShareFolderNames, isIgnoredShareFolderEntryName } from "@/lib/domain/share-folder-naming";
import { findQuoteArchiveFolder, resolveQuoteArchiveRoot } from "./quote-archive";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져왔다 — 다른 것은 **파일시스템을 어디서 만지는가** 하나다 (2026-10-07)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/storage/quote-archive-entries.ts` — 2026-10-07 실측
 * 243줄). 읽는 차례도 상한도 상태 다섯도 **한 걸음도 줄이지 않았다.** 다른 것은 하나다:
 *
 * ── 🔴 다른 것 ① 읽기 도우미가 **이 파일 안에 있다** ──────────────────────
 * 저쪽은 `storage/share-folder-fs.ts` 라는 **공용 도우미**를 부른다(견적서와 연락서가
 * 함께 쓴다). 🔴 **이 사이트에는 그 파일이 없고, 연락서 기능도 없다** — 쓸 사람이
 * 하나뿐인 「공용」 도우미를 세우는 셈이다. 게다가 이 사이트의 `storage/quote-archive.ts`
 * 는 저쪽이 그 끌어내기를 하기 **전 판**이라, 루트 확인 · 경로 가두기 · 오류 사유 표를
 * 아직 제 안에 비공개로 들고 있다. 그래서 같은 절편을 또 한 벌 세우지 않고, 이 조각이
 * 실제로 쓰는 만큼만 **이 파일 아래쪽에 비공개로** 두었다.
 *   · 이름은 저쪽 공용 도우미의 이름 그대로다(withShareFolderTimeout ·
 *     requireExistingShareFolderRoot · listShareFolderDirents · statShareFolderEntry …).
 *     나중에 이 사이트에도 공용 도우미를 세우는 날, **이름을 그대로 들어 옮기면** 된다.
 *   · 🔴 그래서 이 파일에는 `node:fs/promises` 가 **딱 두 이름**만 들어온다 —
 *     `readdir` 과 `stat`. 만들기 · 쓰기 · 지우기는 들어올 길이 없고, 그 사실을
 *     quote-archive-entries-source.test.ts 가 원본을 글자로 읽어 못 박는다.
 * ============================================================================
 */

/**
 * ============================================================================
 * 견적서 공유폴더 **안에 무엇이 있는가** — 그 폴더의 맨 위 칸만 읽는다
 * ============================================================================
 * 폴더를 **찾는** 일은 storage/quote-archive.ts 의 findQuoteArchiveFolder 가 한다 — 이
 * 모듈은 찾기를 새로 쓰지 않고 그것을 그대로 부른 뒤, 찾은 폴더 하나의 맨 위 칸을 읽어
 * 줄로 만든다. 그래야 [폴더 열기]가 여는 폴더와 이 목록이 **반드시 같은 폴더**다.
 *
 * ── 🔴 만들지 않는다 · 쓰지 않는다 · 지우지 않는다 ────────────────────────
 * 읽는 이름은 `readdir` · `stat` 둘뿐이다 — `mkdir` · `writeFile` · `unlink` · `rmdir` ·
 * `rename` 은 **이 파일에 들어올 길이 없다.** 앱은 사람의 서류함을 고치지 않는다. 그
 * 사실을 quote-archive-entries-source.test.ts 가 원본을 글자로 읽어 못 박는다.
 *
 * ── 🔴 파일 내용을 읽지 않는다 ───────────────────────────────────────────
 * 여기서 나가는 것은 **이름 · 크기 · 수정 시각 · 폴더인가** 넷뿐이다. 공유폴더의 파일은
 * 첨부 통로의 권한 · 확장자 검사 · 앞머리 바이트 대조 **밖**에 있다 — 우리 출처로
 * 내보내면 그 방어선이 통째로 빠진다. 파일을 **여는** 일은 그 PC 의 탐색기 도우미가 한다
 * (domain/quote-folder-link.ts). 그래서 `readFile` · 스트림이 여기 없다.
 *
 * ── 🔴 한 칸만 읽는다 — 하위 폴더로 내려가는 길이 **없다** ─────────────────
 * 실측(2026-10-06, A/S 쪽 2026 연도 폴더)에서 견적서 폴더 105 개 안의 파일 342 개에 대해
 * **하위 폴더는 0 개**였다 — 평평하다. 쓰지 않을 길을 들이면 상한 · 검사 · 시험이 함께
 * 따라오고, 그만큼 틀릴 자리가 는다. 혹시 사람이 폴더를 하나 만들어 두었으면 **폴더 한
 * 줄로만** 보이고(그 안은 읽지 않는다) 그 아래는 [폴더 열기]로 탐색기에서 본다.
 *
 * ── 🔴 돌려주는 값에 **절대 경로**가 없다 ─────────────────────────────────
 * 줄을 가리키는 값은 **그 폴더 안에서의 이름**뿐이고, 폴더를 가리키는 값은 **공유폴더
 * 루트 기준 상대 경로**(`연도 폴더/견적서 폴더`)뿐이다 — 이웃 통로
 * (api/quotes/[id]/archive-folder)가 [폴더 열기]에 쓰는 바로 그 값이고, 화면이 줄의
 * [열기] 주소를 만들 때 쓴다. 컨테이너 안 경로(루트)도, 이어 붙인 전체 경로도 담을 칸이
 * 타입 수준에 없다. 실패 사유도 경로 없는 짧은 문장이다(fs 오류의 `message` 에는 경로가
 * 들어 있으므로 쓰지 않고 **오류 코드만 보고** 바꾼다).
 *
 * ── 🔴 맞는 폴더가 여럿이면 목록을 내지 않는다 ───────────────────────────
 * 어느 폴더인지 모르는 채로 내용을 보이면 **남의 견적서 서류를 보일 수 있다.** 찾기는
 * 「이름순 첫째」를 고르지만(저장과 같은 선택), 이 모듈은 그 사실(multipleFolderMatches)을
 * 보면 `multiple` 로 끝낸다 — 정리는 사람이 한다.
 *
 * ── 🔴 기다리는 시간과 줄 수에 상한을 둔다 ───────────────────────────────
 * 둘 다 「사람이 폴더에 수천 장을 넣어 둔 날」과 「NAS 가 느린 날」을 위한 것이다. 상한을
 * 넘으면 기다리기를 그만두고(`failed`), 줄이 넘치면 **앞의 N 개만 주고 「더 있습니다」를
 * 함께 나른다.** 상한은 곧 **NAS 왕복 횟수**이기도 하다 — 줄마다 `stat` 을 한 번씩 때리기
 * 때문에, 고를 것을 먼저 고른 **뒤에** 그만큼만 읽는다.
 *
 * ── 던지지 않는다 ───────────────────────────────────────────────────────
 * 모든 결과가 `{ status, … }` 다. 부르는 쪽(통로)은 try 를 쓰지 않는다.
 * ============================================================================
 */

/**
 * 이만큼 안에 답하지 않으면 그만둔다.
 *
 * 🔴 **3000 이다.** 이 상한 하나가 **찾기와 읽기를 함께** 덮는다 — 찾기
 * (findQuoteArchiveFolder)가 제 상한을 들지 않아 한 번에 묶었다. 재는 일은 `readdir`
 * 세 번(연도 폴더 · 견적서 폴더 · 그 안)과 남긴 줄마다의 `stat` 이다. 더 키우지 않는
 * 까닭은 이 시간이 곧 **요청 워커가 NAS 에 매달려 있는 시간**이기 때문이다 — 오래
 * 기다리느니 「잠시 뒤 다시」가 낫다.
 */
export const QUOTE_ARCHIVE_ENTRIES_TIMEOUT_MS = 3000;

/**
 * 한 번에 보여 주는 줄 수의 상한.
 *
 * 🔴 **100 이다.** 실측(2026-10-06)에서 2026 연도 폴더의 견적서 폴더 105 개에 든 파일은 모두
 * 342 개였다 — 폴더당 평균 3~4 개이고 많아야 열 개 안쪽이다. 100 이면 그 열 배가 넘는다.
 * 더 키우지 않는 까닭은 **줄마다 `stat` 을 한 번씩 때리기 때문**이다 — 크게 두면 NAS 가 느린
 * 날 기다리기 상한에 먼저 걸려 목록이 **통째로** `failed` 가 된다. 잘라서라도 보여 주는
 * 쪽이 낫다.
 */
export const QUOTE_ARCHIVE_ENTRIES_LIMIT = 100;

/** 상한을 넘겼을 때의 사유. 사람이 다시 눌러 볼 수 있게 「잠시 뒤」를 적는다. */
export const QUOTE_ARCHIVE_ENTRIES_SLOW_REASON =
  "공유폴더가 느려 목록을 읽지 못했습니다(잠시 뒤 다시 시도하세요).";

/** 🔴 사유에 경로를 담지 않는다(머리말의 규율). */
const OUTSIDE_ROOT_REASON = "읽으려는 폴더가 공유폴더 밖을 가리켜 읽지 않았습니다.";

/** 한 줄. 🔴 **경로를 담는 칸이 없다** — 이름은 그 폴더 안에서의 이름뿐이다. */
export type QuoteArchiveEntry = {
  name: string;
  isDirectory: boolean;
  /** 파일 크기(바이트). 🔴 폴더는 **0** 이다 — 안으로 내려가지 않으므로 재지 않는다. */
  sizeBytes: number;
  /** 수정 시각(에포크 ms). 그 한 줄의 stat 이 막히면 null 이고, 이름은 그대로 보인다. */
  modifiedAtMs: number | null;
};

export type QuoteArchiveEntriesResult =
  | {
      status: "found";
      /**
       * 공유폴더 루트 기준 슬래시 경로 — `연도 폴더/견적서 폴더`. 디스크의 실제 이름이다
       * (이웃 통로 api/quotes/[id]/archive-folder 가 [폴더 열기]에 쓰는 값과 같다).
       * 🔴 컨테이너 안 경로(루트)는 여기에 들어 있지 않다.
       */
      relativePath: string;
      entries: QuoteArchiveEntry[];
      /** 거른 뒤의 전체 줄 수. `entries.length` 보다 클 수 있다(아래 truncated). */
      totalCount: number;
      /** 🔴 상한에 걸려 잘렸는가 — 화면이 「더 있습니다」를 세운다. */
      truncated: boolean;
    }
  /** 🔴 맞는 폴더가 여럿이다 — **목록도 경로도 내지 않는다**(머리말). */
  | { status: "multiple" }
  /** 연도 폴더나 견적서 폴더가 아직 없다 — 만들지 않는다. */
  | { status: "not-found" }
  /** 공유폴더 위치가 설정되지 않았다 — 이 기능만 꺼져 있다. 실패가 아니다. */
  | { status: "disabled" }
  | { status: "failed"; reason: string };

export type ListQuoteArchiveEntriesInput = {
  /**
   * 공유폴더 루트. 주지 않으면(`undefined` · `null`) 설정을 읽는다 — 비어 있으면
   * `disabled` 로 끝나고 🔴 **디스크를 한 번도 보지 않는다.** 시험에서는 임시 폴더를 준다.
   */
  root?: string | null;
  /** 발행일자 `"YYYY-MM-DD"` — 연도 폴더를 정한다(찾기가 쓴다). */
  quoteDate: string;
  naming: QuoteArchiveNamingInput;
  /** 줄 수 상한. 시험에서만 바꾼다. */
  limit?: number;
  /** 기다리기 상한. 시험에서만 바꾼다. */
  timeoutMs?: number;
};

/** 폴더를 먼저, 그 안에서 이름순 — 탐색기와 같은 차례다. */
export function compareQuoteArchiveEntries(a: ShareFolderDirent, b: ShareFolderDirent): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return compareShareFolderNames(a.name, b.name);
}

/**
 * 그 견적서의 공유폴더 폴더를 찾고, 찾았으면 그 맨 위 칸을 읽는다.
 * **던지지 않는다** — 모든 결과가 `{ status, … }` 다.
 */
export async function listQuoteArchiveEntries(
  input: ListQuoteArchiveEntriesInput
): Promise<QuoteArchiveEntriesResult> {
  // 🔴 설정이 비어 있으면 여기서 끝난다 — 아래 디스크를 보는 코드에 닿지 않는다.
  const configured = input.root === undefined || input.root === null ? resolveQuoteArchiveRoot() : input.root;
  if (configured === null || configured.trim().length === 0) {
    return { status: "disabled" };
  }

  const limit =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : QUOTE_ARCHIVE_ENTRIES_LIMIT;
  const timeoutMs = typeof input.timeoutMs === "number" ? input.timeoutMs : QUOTE_ARCHIVE_ENTRIES_TIMEOUT_MS;

  try {
    // 🔴 상한 하나가 **찾기와 읽기를 함께** 덮는다(머리말의 상한 설명).
    return await withShareFolderTimeout(findAndRead(configured, input, limit), timeoutMs);
  } catch (error) {
    if (error instanceof ShareFolderTimeout) {
      return { status: "failed", reason: QUOTE_ARCHIVE_ENTRIES_SLOW_REASON };
    }
    return {
      status: "failed",
      reason: error instanceof ShareFolderFailure ? error.reason : shareFolderReadFailureReason(error),
    };
  }
}

async function findAndRead(
  rawRoot: string,
  input: ListQuoteArchiveEntriesInput,
  limit: number
): Promise<QuoteArchiveEntriesResult> {
  // 🔴 찾기를 새로 쓰지 않는다 — [폴더 열기]와 **같은 폴더**를 가리켜야 한다.
  //    findQuoteArchiveFolder 는 던지지 않고 값으로 답한다(읽기 전용 찾기).
  const found = await findQuoteArchiveFolder({
    root: rawRoot,
    quoteDate: input.quoteDate,
    naming: input.naming,
  });
  if (found.status === "not-found") return { status: "not-found" };
  if (found.status === "failed") return { status: "failed", reason: found.reason };
  // 🔴 어느 폴더인지 모르는데 내용을 보이면 안 된다 — 경로도 목록도 내지 않는다.
  if (found.multipleFolderMatches) return { status: "multiple" };

  const entries = await read(rawRoot, found.relativePath, limit);
  return { status: "found", relativePath: found.relativePath, ...entries };
}

async function read(
  rawRoot: string,
  relativePath: string,
  limit: number
): Promise<{ entries: QuoteArchiveEntry[]; totalCount: number; truncated: boolean }> {
  // 루트는 이미 있는 폴더여야 한다 — 없으면 만들지 않고 실패한다.
  const root = await requireExistingShareFolderRoot(rawRoot);
  // 찾기가 준 경로는 **디스크의 실제 이름**을 슬래시로 이은 것이다(연도 폴더 · 견적서 폴더).
  // 다듬은 이름으로 이으면 없는 폴더가 된다 — 받은 그대로 마디로 쪼개 잇는다.
  const folder = path.join(root, ...relativePath.split("/"));
  // 이름을 그대로 잇는 자리라 방어로 한 겹 더 본다(찾기 쪽에도 같은 검사가 있다).
  assertInsideShareFolderRoot(root, folder, OUTSIDE_ROOT_REASON);

  // 🔴 그 자리의 맨 위 칸만. 그 아래 폴더는 폴더 한 줄로만 보이고, 그 안을 읽지 않는다.
  //    찌꺼기(Thumbs.db · desktop.ini · ~$… · 점으로 시작)는 **세기 전에** 뺀다 — 「더
  //    있습니다」가 사람이 넣은 적 없는 줄 때문에 거짓으로 서지 않게.
  const visible = (await listShareFolderDirents(folder)).filter(
    (dirent) => !isIgnoredShareFolderEntryName(dirent.name)
  );
  const kept = [...visible].sort(compareQuoteArchiveEntries).slice(0, limit);

  // 🔴 stat 은 **남긴 줄에만** 때린다 — 상한이 곧 NAS 왕복 횟수다.
  const entries: QuoteArchiveEntry[] = [];
  for (const dirent of kept) {
    const info = await statShareFolderEntry(folder, dirent.name);
    entries.push({
      name: dirent.name,
      isDirectory: dirent.isDirectory,
      sizeBytes: dirent.isDirectory ? 0 : (info?.sizeBytes ?? 0),
      modifiedAtMs: info?.modifiedAtMs ?? null,
    });
  }

  return { entries, totalCount: visible.length, truncated: visible.length > entries.length };
}

/**
 * ============================================================================
 * 공유폴더를 **읽는** 절편 — A/S 의 storage/share-folder-fs.ts 에서 옮겨 왔다
 * ============================================================================
 * 🔴 **비공개다.** 밖으로 나가는 이름은 위의 둘(compareQuoteArchiveEntries ·
 * listQuoteArchiveEntries)뿐이다. 이름은 저쪽 공용 도우미의 이름 그대로 두었다 — 이
 * 사이트에도 공용 도우미를 세우는 날 **이 토막을 그대로 들어 옮기면** 된다(머리말 ①).
 *
 * 🔴 **읽기만** 한다(readdir · stat). 만들기 · 쓰기 · 지우기는 여기에 들이지 않는다.
 * 실패 사유는 화면 · 응답으로 나가므로 **절대 경로 · 루트 값을 담지 않는다** — fs 오류의
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

/** 폴더 맨 위 칸 하나 — **이름과 종류뿐**이다. 🔴 경로를 담지 않는다. */
type ShareFolderDirent = { name: string; isDirectory: boolean };

/**
 * 폴더 **맨 위 칸**의 폴더와 파일을 그대로 돌려준다(정렬도 거르기도 하지 않는다 —
 * 그것은 부르는 쪽의 규칙이다).
 *
 * 🔴 **하위 폴더로 내려가지 않는다** — `readdir` 에 재귀를 주지 않는다. 사람이 그 안에
 * `사진/` · `OLD/` 를 만들어 두었으면 재귀가 그 전부를 끌어온다.
 *
 * 심볼릭 링크 · 장치 파일은 담지 않는다 — 링크는 공유폴더 밖을 가리킬 수 있다.
 *
 * 🔴 크기 · 수정 시각은 **여기서 읽지 않는다.** `readdir` 이 그것을 주지 않아 줄마다
 * `stat` 을 한 번씩 더 때려야 하는데, 수천 장이 든 폴더에서 그것은 NAS 왕복 수천 번이다.
 * 보여 줄 것을 **먼저 고른 뒤**(줄 수 상한) 그만큼만 statShareFolderEntry 로 읽는다.
 */
async function listShareFolderDirents(parent: string): Promise<ShareFolderDirent[]> {
  const dirents = await readdir(parent, { withFileTypes: true });
  const found: ShareFolderDirent[] = [];
  for (const dirent of dirents) {
    if (dirent.isDirectory()) found.push({ name: dirent.name, isDirectory: true });
    else if (dirent.isFile()) found.push({ name: dirent.name, isDirectory: false });
  }
  return found;
}

/**
 * 한 줄의 크기 · 수정 시각. **못 읽으면 null** — 그 줄의 이름은 그대로 보여 준다.
 * 한 파일의 stat 이 막혔다고 목록을 통째로 버리면 사람이 아무것도 못 본다.
 */
async function statShareFolderEntry(
  parent: string,
  name: string
): Promise<{ sizeBytes: number; modifiedAtMs: number } | null> {
  try {
    const info = await stat(path.join(parent, name));
    return { sizeBytes: info.size, modifiedAtMs: info.mtimeMs };
  } catch {
    return null;
  }
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
 * 들어 있다). 🔴 이 사이트의 storage/quote-archive.ts 가 찾기에 쓰는 표와 **같은 일곱
 * 갈래 · 같은 문장**이다 — 한 폴더를 두고 두 자리가 다른 말을 하지 않게.
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
