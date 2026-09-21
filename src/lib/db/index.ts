import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@dss/core/schema";
import { env } from "@/lib/env";

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
  postgres(env.databaseUrl, {
    max: 10,
    // 컨테이너 재시작 시 끊긴 연결을 오래 붙잡고 있지 않게 한다.
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dssPoPg = client;
}

export const db = drizzle(client, { schema });
export { schema };
