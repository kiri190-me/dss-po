// 시험 목록 파일(scripts/test-lists/<이름>.txt)을 읽어 node --test 로 돌린다.
//
//   node scripts/run-test-list.mjs <목록 이름> -- <node 플래그들>
//
// ── 왜 목록 파일인가 ────────────────────────────────────────────────────
// package.json 에 시험 파일 경로를 줄줄이 적는 길도 있다. 그런데 npm run 은
// Windows 에서 스크립트를 cmd.exe 로 돌리고, cmd.exe 의 명령줄 한도는 8191자다.
// 이웃 저장소(RF_Service_System)가 2026-09-11 에 그 벽을 정통으로 맞았다 —
// `test` 줄이 8113자에 닿아 시험 파일 하나만 더 적어도 `npm test` 가 「명령줄이
// 너무 깁니다」로 아예 돌지 않았다. 여기는 아직 시험이 몇 개뿐이지만, 같은 벽을
// 나중에 다시 맞는 것보다 지금 같은 모양으로 시작하는 편이 싸다. 이 스크립트는
// 셸을 거치지 않고(shell: false) node 를 직접 띄우므로 한도가 CreateProcess 의
// 32767자로 올라간다.
//
// 플래그는 package.json 에 그대로 둔다 — 무엇으로 도는지 거기서 한눈에 보이게.
//
// ── 🔴 이 스크립트가 막는 것 — 전부 「시험이 조용히 덜 도는」 경우다 ────
//   - 목록에 적힌 파일이 없다(오타·옮긴 파일·대소문자 차이). node --test 는 다른
//     파일이 하나라도 잡히면 못 찾은 경로를 **말없이 건너뛴다.**
//   - 경로 줄에 대괄호가 있다(App Router 의 `[id]` 폴더). 아래 「대괄호」 절.
//   - 목록이 비었다. 파일을 하나도 안 주면 node 가 기본 규칙으로 저장소 전체를
//     훑어 엉뚱한 플래그로 모든 시험을 돌린다.
//   - 플래그에 --test 가 없다. 그러면 node 는 첫 파일 하나만 스크립트로 실행한다.
//   - 같은 줄이 두 번 있다.
//
// ── 🔴 대괄호 — 2026-09-22 에 실제로 당했다 ─────────────────────────────
// 조각 3c-2 에서 라우트 인가 시험 11개가 하나도 돌지 않았다.
// `src/app/api/quotes/[id]/xlsx/route-source.test.ts` 에 두었기 때문이다.
// node --test 는 받은 경로를 글롭으로 읽어 `[id]` 를 「i 또는 d 한 글자」라는 문자
// 클래스로 본다. 파일이 실재해도 아무것도 맞지 않아 `tests 0` 이다.
//
//   $ ls -la "src/app/api/quotes/[id]/xlsx/route.ts"      → 파일 있음
//   $ node --test "src/app/api/quotes/[id]/xlsx/route.ts" → ℹ tests 0
//
// 오류가 아니라 침묵이다. `fail 0` 으로 통과하고, 등록 검사
// (scripts/test-lists/test-list-registration.test.ts)도 파일이 정말 있으니 통과한다.
// 그래서 여기서 **돌리기 전에 멈춘다.**
//
// ── 이웃 저장소와 다른 점 ───────────────────────────────────────────────
// RF_Service_System 의 같은 이름 스크립트에는 글롭 패턴 펼치기(`*` 를 fs.globSync 로
// 펼친다)와 명령줄 길이 예산 검사가 더 있다. 여기는 시험이 몇 개뿐이고 패턴 줄이 없어
// 뺐다 — 필요해지면 그 파일을 보고 가져오면 된다.
// **`*` 가 든 줄은 여기서 그냥 「없는 파일」이다.**
//
// 🔴 왜 대괄호를 「막기」만 하고 A/S 처럼 「펼치기」를 가져오지 않았나(2026-09-22 판단):
//   - 지금 이 저장소에는 대괄호 폴더 안의 시험 파일이 **0개**다. 3c-2 가 그 시험을
//     대괄호 폴더 밖(src/app/api/quotes/xlsx-route-source.test.ts)으로 옮겼고,
//     읽는 원본만 `./[id]/xlsx/route.ts` 로 가리킨다.
//   - 펼치기는 필요해질 때 A/S 에서 가져오면 된다(그 파일의 isPatternEntry ·
//     expandPattern 두 함수). 지금 값이 큰 것은 **「안 돌고도 통과하는 길」을 없애는
//     쪽**이다.
//   - 그래서 이 조각은 검사 하나만 더했다. 「왜 A/S 와 다르냐」로 시간을 버리지 않게
//     여기에 적어 둔다.
//
// 의존성 없는 순수 Node 다. scripts/test-lists/test-list-registration.test.ts 가
// 아래 export 를 가져다 같은 규칙으로 목록을 검사한다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIST_DIR = path.join(ROOT, "scripts", "test-lists");

const LIST_NAME = /^[a-z0-9][a-z0-9-]*$/;
/** 🔴 대괄호가 든 경로 줄은 node --test 가 글롭으로 읽는다 — 머리말의 「대괄호」 절. */
const BRACKET = /[[\]]/;

/** 목록 폴더에 있는 목록 이름들(.txt 를 뗀 것). */
export function listNames() {
  return fs
    .readdirSync(LIST_DIR)
    .filter((name) => name.endsWith(".txt"))
    .map((name) => name.slice(0, -".txt".length))
    .sort();
}

/**
 * 목록 파일의 경로 줄을 **파일 안 줄 번호와 함께** 돌려준다. `#` 로 시작하는 줄과 빈
 * 줄은 건너뛴다. 줄 번호는 1부터다 — 오류 문구가 「몇째 줄」을 말할 수 있게 남긴다.
 * @param {string} name
 * @returns {{ lineNumber: number, entry: string }[]}
 */
export function readTestListLines(name) {
  if (!LIST_NAME.test(name)) {
    throw new Error(`목록 이름이 올바르지 않습니다: "${name}" (소문자·숫자·하이픈만)`);
  }
  const file = path.join(LIST_DIR, `${name}.txt`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `목록 파일이 없습니다: scripts/test-lists/${name}.txt\n  있는 목록: ${listNames().join(", ")}`,
    );
  }
  return fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line, index) => ({ lineNumber: index + 1, entry: line.trim() }))
    .filter(({ entry }) => entry !== "" && !entry.startsWith("#"));
}

/**
 * 목록 파일을 읽어 경로 줄만 돌려준다. `#` 로 시작하는 줄과 빈 줄은 건너뛴다.
 * @param {string} name
 * @returns {string[]}
 */
export function readTestList(name) {
  return readTestListLines(name).map(({ entry }) => entry);
}

/**
 * 🔴 경로 줄에 대괄호가 있으면 돌리기 전에 멈춘다. 통과면 null, 아니면 그대로 찍을
 * 여러 줄 문구를 돌려준다(어느 줄인지 · 왜 안 되는지 · 어떻게 하면 되는지).
 *
 * 까닭은 이 파일 머리말의 「대괄호」 절에 있다 — 한 줄로 줄이면: node --test 가 경로를
 * 글롭으로 읽어 `[id]` 를 문자클래스로 보므로 그 시험은 **조용히 안 돈다.**
 *
 * @param {string} listName
 * @param {{ lineNumber: number, entry: string }[]} lines
 * @returns {string|null}
 */
export function findBracketProblem(listName, lines) {
  const offenders = lines.filter(({ entry }) => BRACKET.test(entry));
  if (offenders.length === 0) return null;
  return [
    `scripts/test-lists/${listName}.txt 의 경로 줄에 대괄호가 있어 시험을 돌리지 않았습니다:`,
    ...offenders.map(({ lineNumber, entry }) => `  - ${lineNumber}째 줄: ${entry}`),
    "",
    "  왜 안 되는가: node --test 는 받은 경로를 글롭으로 읽습니다. `[id]` 는 「i 또는 d 한",
    "  글자」라는 문자클래스가 되어 그 줄은 아무 파일도 가리키지 못합니다. 파일이 실재해도",
    "  `tests 0` — 오류가 아니라 침묵입니다. `fail 0` 으로 통과하고 등록 검사",
    "  (scripts/test-lists/test-list-registration.test.ts)도 파일이 정말 있으니 통과합니다.",
    "  그래서 그 시험이 안 도는 것을 아무도 모르게 됩니다.",
    "",
    "  어떻게 하면 되는가: 시험 파일을 대괄호 폴더 **밖에** 두고, 읽는 원본만 그 안을",
    "  `./[id]/…` 로 가리키세요. 본보기: src/app/api/quotes/xlsx-route-source.test.ts",
    "  (조각 3c-2 — `./[id]/xlsx/route.ts` 를 글자로 읽습니다).",
    "",
    "  (A/S 저장소의 같은 실행기에는 `*` 펼치기가 있어 그 칸을 `*` 로 적습니다. 이 저장소에",
    "   왜 안 가져왔는지는 scripts/run-test-list.mjs 머리말에 적어 두었습니다.)",
  ].join("\n");
}

/**
 * 대소문자까지 정확히 같은 이름의 파일이 있는가.
 *
 * 🔴 Windows 는 대소문자를 가리지 않아 `existsSync` 로는 통과하지만, 최종 운영은
 * NAS(Linux) Docker 라 거기서는 못 찾는다 — 그때 그 시험은 **조용히 안 돈다.**
 */
function existsWithExactCase(relativePath, dirCache) {
  let dir = ROOT;
  for (const segment of relativePath.split("/")) {
    let names = dirCache.get(dir);
    if (!names) {
      try {
        names = new Set(fs.readdirSync(dir));
      } catch {
        return false;
      }
      dirCache.set(dir, names);
    }
    if (!names.has(segment)) return false;
    dir = path.join(dir, segment);
  }
  return fs.statSync(dir).isFile();
}

/**
 * 돌리기 전에 막아야 할 문제들. 비어 있으면 통과다.
 * @param {string[]} entries
 * @returns {string[]}
 */
export function findListProblems(entries) {
  const problems = [];
  if (entries.length === 0) {
    problems.push("목록이 비었습니다 — 파일 없이 node --test 를 부르면 저장소 전체를 돌립니다.");
  }
  const seen = new Set();
  const dirCache = new Map();
  for (const entry of entries) {
    if (seen.has(entry)) {
      problems.push(`같은 줄이 두 번 있습니다: ${entry}`);
      continue;
    }
    seen.add(entry);
    if (/\s/.test(entry)) {
      problems.push(`한 줄에 한 경로만 적습니다: ${entry}`);
    } else if (entry.includes("\\") || entry.startsWith("/") || entry.startsWith(".")) {
      problems.push(
        `저장소 뿌리 기준 상대경로를 슬래시로 적습니다(./ · \\ · 절대경로 불가): ${entry}`,
      );
    } else if (!existsWithExactCase(entry, dirCache)) {
      problems.push(`없는 파일입니다(대소문자까지 확인): ${entry}`);
    }
  }
  return problems;
}

function fail(message, exitCode = 1) {
  console.error(`[run-test-list] ${message}`);
  process.exit(exitCode);
}

function main() {
  const [listName, separator, ...nodeFlags] = process.argv.slice(2);
  if (!listName || separator !== "--") {
    fail("사용법: node scripts/run-test-list.mjs <목록 이름> -- <node 플래그들>", 2);
  }
  if (!nodeFlags.includes("--test")) {
    fail("플래그에 --test 가 없습니다 — 없으면 node 가 첫 파일 하나만 실행합니다.", 2);
  }

  let lines = [];
  try {
    lines = readTestListLines(listName);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }
  const entries = lines.map(({ entry }) => entry);

  // 🔴 대괄호는 다른 검사보다 먼저 본다 — 아래 findListProblems 는 이것을 못 잡는다.
  // `[id]` 는 실제 폴더 이름이라 「없는 파일」 검사를 통과한다. 그것이 2026-09-22 에
  // 시험 11개가 조용히 안 돈 까닭이다(머리말의 「대괄호」 절).
  const bracketProblem = findBracketProblem(listName, lines);
  if (bracketProblem) fail(bracketProblem);

  const problems = findListProblems(entries);
  if (problems.length > 0) {
    fail(
      `scripts/test-lists/${listName}.txt 에 문제가 있어 시험을 돌리지 않았습니다:\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
  }

  console.log(`[run-test-list] ${listName}: 파일 ${entries.length}개`);

  const child = spawn(process.execPath, [...nodeFlags, ...entries], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  // 터미널의 Ctrl+C 는 자식도 함께 받는다. 부모는 먼저 죽지 말고 자식이 정리하고
  // 끝나기를 기다렸다가 그 결과로 끝난다.
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("error", (error) => fail(`node 를 띄우지 못했습니다: ${error.message}`));
  child.on("exit", (code, signal) => {
    if (signal) fail(`시험 프로세스가 시그널 ${signal} 로 끝났습니다.`);
    process.exit(code ?? 1);
  });
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  const normalize = (file) => {
    const resolved = path.resolve(file);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) main();
