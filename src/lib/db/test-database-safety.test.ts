import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { requireActiveTestDatabase, requireSafeTestDatabaseUrl } from "./test-database-safety";

/**
 * ============================================================================
 * 🔴 안전장치를 **시험이 지킨다**
 * ============================================================================
 * 이 시험들은 DB 에 붙지 않는다 — 순수 함수와 파일 글자만 본다. 그래서 목록
 * `db-safety` 에 있고, `npm run test:db` 가 시험 DB 에 **붙기 전에** 먼저 돈다
 * (package.json 의 pretest:db). 여기가 깨지면 DB 시험은 아예 시작하지 않는다.
 *
 * 본보기: RF_Service_System/src/lib/db/test-database-safety.test.ts
 * ============================================================================
 */

// 가짜 값이다. 실제 비밀번호가 아니다 — 오류 메시지가 비밀을 흘리지 않는지 보려고
// 일부러 알아보기 쉬운 낱말("secret")을 넣었다.
const developmentUrl = "postgres://dss_app:secret@127.0.0.1:5442/dss_as";
const testUrl = "postgres://dss_app:secret@127.0.0.1:5442/dss_as_test";

test("제대로 된 시험 DB 는 통과한다 — 이름이 _test 로 끝나고 개발 DB 와 다르다", () => {
  assert.equal(
    requireSafeTestDatabaseUrl({ developmentDatabaseUrl: developmentUrl, testDatabaseUrl: testUrl }),
    testUrl,
  );
  assert.doesNotThrow(() => requireActiveTestDatabase(testUrl));
});

/* ── 막아야 하는 세 가지 ───────────────────────────────────────────────── */

test("① TEST_DATABASE_URL 이 없으면 거절한다", () => {
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: undefined,
      }),
    /TEST_DATABASE_URL 이 없습니다/,
  );
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: "",
      }),
    /TEST_DATABASE_URL 이 없습니다/,
  );
});

test("② 🔴 운영(실제 업무 자료 dss_as)과 같은 곳이면 거절한다", () => {
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: developmentUrl,
      }),
    /시험 DB 는 개발 DB 와 달라야 합니다/,
  );
});

test("② 쿼리 문자열이나 대소문자만 달라도 「같은 곳」으로 본다", () => {
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: "postgres://dss_app:secret@127.0.0.1:5442/dss_as?sslmode=disable",
      }),
    /시험 DB 는 개발 DB 와 달라야 합니다/,
  );
  // 포트를 적지 않은 쪽과 5432 를 적은 쪽도 같은 곳이다.
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: "postgres://dss_app:secret@DB.local/dss_as",
        testDatabaseUrl: "postgres://dss_app:secret@db.local:5432/dss_as",
      }),
    /시험 DB 는 개발 DB 와 달라야 합니다/,
  );
});

test("③ 이름이 _test 로 끝나지 않으면 거절한다", () => {
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: "postgres://dss_app:secret@127.0.0.1:5442/dss_as_sandbox",
      }),
    /_test 로 끝나는 DB/,
  );
  // 🔴 「_test 로 시작」이나 「test 가 들어감」은 통하지 않는다.
  assert.throws(
    () =>
      requireSafeTestDatabaseUrl({
        developmentDatabaseUrl: developmentUrl,
        testDatabaseUrl: "postgres://dss_app:secret@127.0.0.1:5442/test_dss_as",
      }),
    /_test 로 끝나는 DB/,
  );
});

/* ── 접속을 만드는 순간의 마지막 관문 ──────────────────────────────────── */

test("🔴 접속 관문은 실제 업무 DB 를 거절한다 — 부트스트랩을 건너뛰어도", () => {
  assert.throws(() => requireActiveTestDatabase(developmentUrl), /_test 로 끝나야 합니다/);
  assert.throws(() => requireActiveTestDatabase(undefined), /DATABASE_URL 이 비어 있습니다/);
  assert.throws(() => requireActiveTestDatabase("이건 URL 이 아니다"), /_test 로 끝나야 합니다/);
});

/* ── 새는 것이 없는가 ──────────────────────────────────────────────────── */

test("오류 메시지가 URL 도 비밀번호도 흘리지 않는다", () => {
  const messages: string[] = [];
  const collect = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
  };

  collect(() =>
    requireSafeTestDatabaseUrl({
      developmentDatabaseUrl: developmentUrl,
      testDatabaseUrl: developmentUrl,
    }),
  );
  collect(() =>
    requireSafeTestDatabaseUrl({
      developmentDatabaseUrl: developmentUrl,
      testDatabaseUrl: "postgres://dss_app:secret@127.0.0.1:5442/dss_as_sandbox",
    }),
  );
  collect(() => requireActiveTestDatabase(developmentUrl));

  assert.equal(messages.length, 3);
  for (const message of messages) {
    assert.equal(message.includes("secret"), false, message);
    assert.equal(message.includes("postgres://"), false, message);
    assert.equal(message.includes("127.0.0.1"), false, message);
  }
});

/* ── 🔴 관문이 실제로 걸려 있는가 ──────────────────────────────────────── */

/**
 * 위 시험들은 함수가 **옳게 판정하는지**만 본다. 그 함수를 아무도 부르지 않으면
 * 판정은 아무것도 막지 못한다 — 그리고 그때 시험은 전부 통과한다. 그래서 접속을
 * 만드는 파일의 글자를 직접 읽어, 관문이 거기 걸려 있는 것까지 확인한다.
 *
 * 글자로 보는 이유: 이 목록(db-safety)은 DB 에 붙지 않는 시험만 담는다. 모듈을
 * 실제로 import 하면 그 자리에서 접속 풀이 생긴다.
 */
test("🔴 src/lib/db/index.ts 가 접속을 만들기 전에 이 관문을 부른다", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "index.ts"),
    "utf8",
  );

  assert.match(
    source,
    /import \{[^}]*requireActiveTestDatabase[^}]*\} from "\.\/test-database-safety"/,
    "src/lib/db/index.ts 가 requireActiveTestDatabase 를 들여오지 않습니다.",
  );
  assert.match(
    source,
    /process\.env\.DSS_DB_TEST_MODE === "1"/,
    "DSS_DB_TEST_MODE 를 보는 줄이 없습니다.",
  );

  // postgres( 로 접속 풀을 만드는 자리보다 **먼저** 판정이 와야 한다.
  const guardAt = source.indexOf("requireActiveTestDatabase(");
  const poolAt = source.indexOf("postgres(");
  assert.ok(guardAt > 0, "requireActiveTestDatabase 를 부르는 곳이 없습니다.");
  assert.ok(poolAt > 0, "postgres( 로 접속 풀을 만드는 곳을 찾지 못했습니다.");
  assert.ok(
    guardAt < poolAt,
    "관문이 접속 풀을 만든 뒤에 옵니다 — 그러면 이미 붙은 뒤입니다.",
  );
});
