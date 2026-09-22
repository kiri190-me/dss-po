/**
 * ============================================================================
 * 견적서 양식 시험이 볼 환경변수 — 다섯 개만 골라 넣는다
 * ============================================================================
 * 견적서 xlsx 양식을 읽는 시험은 실제 양식 파일의 경로를 환경변수로 받는다
 * (양식에 법인 직인 이미지 · 계좌번호 · 사업자등록번호가 들어 있어 저장소에
 * 커밋하지 않는다 — src/lib/storage/quote-template.ts 머리말). 그 값은
 * `.env.local` 에 적혀 있지만 `npm test` 는 **어떤 설정 파일도 읽지 않아서**,
 * 이 로더가 없으면 양식 시험이 통째로 잠든다 — 🔴 **통과한 것처럼 보이고
 * 아무것도 재지 않는다.** 이 로더가 그 다섯 개만 골라 넣어 깨운다.
 *
 * ── 🔴 통째로 붓지 않는다 ───────────────────────────────────────────────
 * `process.loadEnvFile()` 을 쓰면 안 된다(A/S 쪽 같은 파일이 `dotenv.config()`
 * 를 두고 적어 둔 경고와 **같은 까닭**이다). 그 함수는 파일의 **모든 키**를
 * `process.env` 에 붓는데, `.env.local` 에는 `DATABASE_URL` 이 들어 있다.
 *
 * 🔴 그리고 이 사이트의 `DATABASE_URL` 은 A/S 와 **같은 `dss_as`** 다 — 실제
 * 업무 자료다(src/lib/env.ts 머리말). 지금 단위 시험은 환경변수가 없어 DB 에
 * 닿을 길이 아예 없고, 그 차단이 이 저장소가 `src/lib/db/test-database-safety.ts`
 * 까지 만들어 막아 둔 사고(단위 시험이 실제 자료를 건드리는 일)를 막는 마지막
 * 벽이다. 통째로 부으면 그 문이 열린다.
 *
 * 그래서 `util.parseEnv()` 로 **읽기만** 하고 아래 목록에 적힌 이름만 옮긴다.
 * (A/S 는 `dotenv.parse()` 를 쓴다 — 이 저장소에는 그 꾸러미가 없고, Node 20.12+
 * 의 `util.parseEnv()` 가 같은 일을 한다. 둘 다 `process.env` 를 건드리지 않는다.)
 *
 * 시험 DB 로 바꿔치기하는 `scripts/load-test-env.ts` 와는 사정이 다르다. 그쪽은
 * 안전장치(`requireSafeTestDatabaseUrl`)를 함께 들고 통째로 붓지만, 이 파일에는
 * 그런 장치가 없다.
 *
 * 값을 절대 찍지 않는다 — 경로도, 몇 개를 넣었는지도. `.env` 내용을 출력하지
 * 않는 것이 이 저장소의 규칙이다.
 *
 * 본보기: RF_Service_System/scripts/load-template-env.ts
 * ============================================================================
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * 허용 목록. 이름을 하나씩 적는다 — `_TEMPLATE_PATH` 로 끝나는 것을 정규식으로
 * 훑어 통과시키면, 나중에 같은 꼬리를 가진 다른 값이 생겼을 때 조용히 함께
 * 새어 든다.
 *
 * 🔴 **견적서 다섯뿐이다.** A/S 의 같은 배열에는 보고서 둘
 * (`INSPECTION_REPORT_TEMPLATE_PATH` · `REPAIR_REPORT_TEMPLATE_PATH`)이 함께
 * 들어 있지만, **검사 · 수리 보고서는 A/S 것이고 이 사이트에는 그 기능이 없다.**
 * 쓰지 않을 이름을 적어 두면 「실려 오는 줄 알았는데 아무도 안 읽는」 자리가 된다.
 */
const TEMPLATE_PATH_KEYS = [
  "QUOTE_TEMPLATE_PATH",
  "OH_QUOTE_TEMPLATE_PATH",
  "MATCHER_QUOTE_TEMPLATE_PATH",
  "MATCHER_OH_QUOTE_TEMPLATE_PATH",
  "CABLE_QUOTE_TEMPLATE_PATH",
] as const;

try {
  // 저장소 뿌리 기준으로 읽는다 — 어느 폴더에서 불러도 같은 파일을 본다
  // (load-test-env.ts 의 같은 판단).
  const file = fileURLToPath(new URL("../.env.local", import.meta.url));
  const parsed = parseEnv(readFileSync(file, "utf8"));

  for (const key of TEMPLATE_PATH_KEYS) {
    const value = parsed[key];
    // 사람이 명령줄에서 준 값이 이긴다. 이미 들어 있으면 덮어쓰지 않는다.
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
} catch {
  // `.env.local` 이 없거나, 키가 없거나, 읽다 실패해도 조용히 넘어간다.
  // NAS · CI 처럼 양식 파일이 없는 환경에서는 양식 시험이 건너뛰면 되고,
  // 로더 때문에 시험 전체가 죽는 일이 있어서는 안 된다.
}
