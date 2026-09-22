/**
 * `node --import ./scripts/test-template-bootstrap.ts` 로 실린다 — 시험 파일이
 * 하나라도 읽히기 **전에** 돈다. 그래서 어떤 시험이 `lib/storage/quote-template`
 * 을 들여오든 그때는 이미 양식 경로 다섯이 환경변수에 들어와 있다.
 *
 * 파일을 나눠 둔 이유(`test-db-bootstrap.ts` 와 같다): 부트스트랩은 `--import`
 * 로 싣는 **진입점**이고, `load-template-env` 는 다른 스크립트도 그냥 `import`
 * 로 가져다 쓸 수 있는 **모듈**이다. 진입점 이름이 곧 「부트스트랩」이면
 * package.json 에서 무엇이 실리는지 한눈에 보인다.
 *
 * 🔴 DB 부트스트랩(`test-db-bootstrap.ts`)과 **섞지 않는다.** 이쪽은 양식 경로
 * 다섯만 넣고 DB 에는 손대지 않는다 — 단위 시험이 DB 에 닿을 길이 없어야 한다는
 * 규칙(`scripts/test-lists/unit.txt` 머리말)이 그대로 지켜진다.
 */
import "./load-template-env";
