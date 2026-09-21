/**
 * `node --import ./scripts/test-db-bootstrap.ts` 로 실린다 — 시험 파일이 하나라도
 * 읽히기 **전에** 돈다. 그래서 어떤 시험이 src/lib/db 를 들여오든 그때는 이미
 * DATABASE_URL 이 시험 DB 로 바뀌어 있고 DSS_DB_TEST_MODE 가 켜져 있다.
 *
 * 파일을 나눠 둔 이유(A/S 와 같다): 부트스트랩은 `--import` 로 싣는 **진입점**이고,
 * load-test-env 는 다른 스크립트(예: 시험 DB 를 준비하는 도구)도 그냥 `import` 로
 * 가져다 쓰는 **모듈**이다. 진입점 이름이 곧 「부트스트랩」이면 package.json 에서
 * 무엇이 실리는지 한눈에 보인다.
 */
import "./load-test-env";
