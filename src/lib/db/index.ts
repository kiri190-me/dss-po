import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@dss/core/schema";
import { env } from "@/lib/env";
import { requireActiveTestDatabase } from "./test-database-safety";

/**
 * 이 사이트가 보는 DB 는 **A/S 관리 시스템과 같은 dss_as** 다.
 *
 * 표의 정의(Drizzle 스키마)는 서브모듈 vendor/dss-core 한 벌뿐이다 — 손으로
 * 베낀 복제본을 두면 한쪽에서 칸 이름을 바꿔도 다른 쪽은 아무 말 없이
 * 지나가고, 어긋남은 운영에서 드러난다. 그 판단의 근거는 설계서
 * PO_DOMESTIC_SPLIT_DESIGN.md B-3 · E-2절에 있다.
 *
 * 🔴 **이 저장소는 마이그레이션을 갖지 않는다.** `drizzle/` 도
 *    `drizzle.config.ts` 도 없고 package.json 에 db:generate · db:migrate 도
 *    없다. 칸을 더하거나 고치는 일은 언제나 A/S 에서 한다.
 */
const databaseUrl = env.databaseUrl;

/**
 * ============================================================================
 * 🔴 DB 에 쓰는 시험이 **실제 업무 자료**에 붙는 것을 막는 한 줄
 * ============================================================================
 * 위에서 본 대로 이 사이트의 DATABASE_URL 은 A/S 와 같은 `dss_as` 이고, 거기에는
 * 실제 수리 건 · 고객 · 견적서가 들어 있다. DB 시험은 `DSS_DB_TEST_MODE=1` 을 켜고
 * 도는데(scripts/load-test-env.ts), 그 프로세스가 `_test` 로 끝나지 않는 DB 에
 * 붙으려 하면 **접속 풀이 생기기 전에** 여기서 던진다.
 *
 * 부트스트랩(scripts/test-db-bootstrap.ts)에도 같은 뜻의 검사가 있지만, 그것은
 * 시험을 띄우기 전에 한 번 도는 검사다. 부트스트랩을 건너뛰거나 도중에
 * DATABASE_URL 이 바뀌면 그 검사는 이미 지나간 뒤다 — **마지막 관문은 접속을
 * 만드는 이 자리**여야 한다. 판정과 까닭은 ./test-database-safety.ts 에 있다.
 *
 * 이 줄이 지워지지 않도록 test-database-safety.test.ts 가 이 파일의 글자를 읽어
 * 「관문이 접속보다 먼저 온다」까지 확인한다.
 * ============================================================================
 */
if (process.env.DSS_DB_TEST_MODE === "1") {
  requireActiveTestDatabase(databaseUrl);
}

const globalForDb = globalThis as unknown as {
  /**
   * 개발 중 Next.js 가 모듈을 다시 불러올 때마다 접속 풀이 새로 생기는 것을
   * 막는다. 없으면 몇 번 고치는 사이에 PostgreSQL 의 max_connections 를 다
   * 쓴다 — 🔴 같은 DB 를 A/S 도 쓰고 있어서 이쪽이 연결을 흘리면 **저쪽이
   * 먼저 죽는다.**
   */
  __dssPoPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__dssPoPg ??
  postgres(databaseUrl, {
    max: 10,
    // 컨테이너 재시작 시 끊긴 연결을 오래 붙잡고 있지 않게 한다.
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dssPoPg = client;
}

export const db = drizzle(client, { schema });
export { schema };

/**
 * 접속 풀 자체. **화면 코드는 쓰지 않는다** — DB 시험이 끝낼 때 닫으려고 연다.
 *
 * postgres.js 는 열린 풀이 있으면 프로세스를 살려 둔다. 시험이 이것을 닫지 않으면
 * `node --test` 가 끝나고도 돌아오지 않는다(「시험은 다 통과했는데 멈춰 있다」).
 * A/S 의 통합 시험들도 같은 이유로 pgClient.end() 를 부른다.
 */
export const pgClient = client;
