/**
 * ============================================================================
 * DB 시험이 볼 환경변수를 여기서 정한다 — 그리고 안전한 것만 통과시킨다
 * ============================================================================
 *
 * 하는 일은 셋이다:
 *   1. `.env.local`(개발 값)과 `.env.test.local`(시험 값)을 읽는다.
 *   2. 🔴 `TEST_DATABASE_URL` 이 **써도 되는 것인지** 판정한다
 *      (src/lib/db/test-database-safety.ts — 있는가 · 개발과 다른가 · `_test` 로 끝나는가).
 *   3. 통과한 URL 만 `DATABASE_URL` 자리에 놓고 `DSS_DB_TEST_MODE=1` 을 켠다.
 *
 * 🔴 `.env.local` 을 함께 읽는 이유는 **개발 DB 를 쓰려는 게 아니라, 시험 DB 가
 *    거기와 같은 곳이 아닌지 견주기 위해서**다. 그 값은 2번 판정에만 쓰이고
 *    DSS_DEVELOPMENT_DATABASE_URL 로 밀려난다. 이 사이트의 DATABASE_URL 은 A/S 와
 *    같은 `dss_as` — 실제 업무 자료다(src/lib/env.ts 머리말).
 *
 * dotenv 를 쓰지 않는다: 이 저장소에는 그 꾸러미가 없고, Node 20.12+ 의
 * `process.loadEnvFile()` 이 같은 일을 한다. 두 도구 모두 **이미 정해진 환경변수를
 * 덮어쓰지 않는다** — 셸에서 준 값이 파일보다 세다(확인함).
 *
 * 값을 절대 찍지 않는다. 실패해도 이름만 말한다.
 *
 * 본보기: RF_Service_System/scripts/load-test-env.ts
 * ============================================================================
 */

import { fileURLToPath } from "node:url";

import { requireSafeTestDatabaseUrl } from "../src/lib/db/test-database-safety";

/**
 * 저장소 뿌리 기준으로 읽는다 — 어느 폴더에서 불러도 같은 파일을 본다.
 * 없으면 조용히 넘어간다(`.env.test.local` 이 아직 없는 새 체크아웃도 있다.
 * 그때는 아래 판정이 「TEST_DATABASE_URL 이 없습니다」로 멈춰 준다).
 */
function loadEnvFileIfPresent(relativePath: string): void {
  const file = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  }
}

loadEnvFileIfPresent(".env.local");
loadEnvFileIfPresent(".env.test.local");

const safeTestDatabaseUrl = requireSafeTestDatabaseUrl({
  developmentDatabaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
});

// 개발 URL 은 자리를 내주고 이름을 바꿔 남는다 — 나중에 또 견주어야 할 때를 위해.
process.env.DSS_DEVELOPMENT_DATABASE_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL = safeTestDatabaseUrl;
process.env.DSS_DB_TEST_MODE = "1";
