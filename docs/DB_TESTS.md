# DB 에 쓰는 시험을 돌리는 법

이 저장소의 시험은 두 갈래다.

| 갈래 | 명령 | DB 에 붙는가 | 목록 |
| --- | --- | --- | --- |
| 단위 | `npm test` | **아니다** | `scripts/test-lists/unit.txt` |
| 안전장치 | `npm run test:db:safety` | 아니다 | `scripts/test-lists/db-safety.txt` |
| DB | `npm run test:db` | **그렇다** | `scripts/test-lists/db.txt` |

`npm test` 는 준비할 것이 없다. **이 문서는 `npm run test:db` 에 관한 것이다.**

---

## 🔴 먼저 알아야 할 것

이 사이트의 `DATABASE_URL` 은 A/S 관리 시스템과 **같은 `dss_as`** 를 가리킨다
(설계서 `PO_DOMESTIC_SPLIT_DESIGN.md` B-2 · D절). 그 DB 에는 **실제 업무 자료**가
들어 있다 — 수리 건 · 고객 · 견적서.

그래서 DB 시험은 `dss_as` 가 아니라 **`dss_as_test`** 에서 돈다. 두 DB 는 같은
PostgreSQL 컨테이너(`dss-pg-app`, 호스트 포트 5442) 안에 나란히 있다.

그리고 **이 저장소는 마이그레이션을 갖지 않는다.** `drizzle/` 도
`drizzle.config.ts` 도 `drizzle-kit` 도 없다 — 표를 만들고 고치는 일은 언제나
A/S 저장소가 한다(설계서 E-2절 · `vendor/dss-core` README 1절).

**따라서 시험 DB 를 세우는 일은 A/S 에서 하고, 이 저장소는 이미 세워진 그 DB 에
붙기만 한다.** 그 값은 A/S 체크아웃이 옆에 있어야 한다는 것이다. 이 개발 PC 에서는
사실이고, 아래가 그 순서다.

---

## 처음 한 번만 — 준비

### 1. A/S 저장소에서 시험 DB 를 세운다

```bash
cd ../RF_Service_System        # A/S 관리 시스템 체크아웃
docker ps                      # 컨테이너 dss-pg-app 이 healthy 인지 본다
                               # (안 떠 있으면 그 저장소의 docker-compose.yml 로 띄운다)
npm run db:test:prepare        # = db:test:migrate + db:test:seed
```

`db:test:prepare` 가 하는 일(스크립트를 읽어 확인한 것):

- `db:test:migrate` → `drizzle-kit migrate --config drizzle.test.config.ts`.
  그 설정 파일은 `TEST_DATABASE_URL` 하나만 접속 주소로 쓰고, 쓰기 전에
  A/S 의 같은 안전장치를 통과시킨다.
- `db:test:seed` → 시험용 기준 자료를 넣는다. 첫 줄이 `import "./load-test-env"`
  라 `DATABASE_URL` 은 이미 시험 DB 로 바뀐 뒤다.

🔴 **둘 다 `dss_as` 에는 손대지 않는다.** 표만 세우면 되는 경우(예: A/S 에서 새
마이그레이션이 생긴 뒤)에는 `npm run db:test:migrate` 만 돌려도 된다 — 이
저장소의 DB 시험은 제 자료를 스스로 만들고 지운다.

### 2. 이 저장소에 `.env.test.local` 을 만든다

```
TEST_DATABASE_URL=postgres://<사용자>:<비밀번호>@localhost:5442/dss_as_test
```

- 🔴 **`.env.local` 이 아니라 `.env.test.local`** 이다. 파일을 가르는 것이
  안전장치의 절반이다 — 평소 개발에서는 이 값이 아예 읽히지 않는다.
- 사용자·비밀번호는 A/S 저장소의 `.env.test.local` 과 같다(같은 컨테이너다).
- `.gitignore` 의 `.env*` 가 막는다. 커밋되지 않는다.
- 이름이 `_test` 로 끝나지 않거나 `DATABASE_URL` 과 같은 곳을 가리키면
  **시험이 시작조차 하지 않는다**(아래 「무엇이 막는가」).

---

## 돌리기

```bash
npm run test:db
```

`pretest:db` 가 먼저 `npm run test:db:safety` 를 돌린다 — 안전장치 자체가
성한지 확인한 **뒤에** 시험 DB 에 붙는다.

---

## 무엇이 막는가 — 관문은 둘이다

판정은 `src/lib/db/test-database-safety.ts` 한 파일에 있고, 서로 다른 두 시점에서
불린다.

### ① 시험을 띄우기 전 — `scripts/load-test-env.ts`

`requireSafeTestDatabaseUrl()` 이 세 가지를 본다. 하나라도 어긋나면 던진다.

| 어긋남 | 메시지 |
| --- | --- |
| `TEST_DATABASE_URL` 이 없다 | `TEST_DATABASE_URL 이 없습니다 — …` |
| `DATABASE_URL` 과 **같은 곳**이다 | `시험 DB 는 개발 DB 와 달라야 합니다 — …` |
| DB 이름이 `_test` 로 안 끝난다 | `DB 시험은 이름이 _test 로 끝나는 DB 에서만 …` |

「같은 곳」은 문자열이 아니라 **접속 신원**(프로토콜·사용자·비밀번호·호스트·포트·DB
이름)으로 본다. 쿼리 문자열만 붙이거나 호스트 대소문자만 바꿔서는 빠져나가지
못한다.

통과하면 그 URL 을 `DATABASE_URL` 자리에 놓고 `DSS_DB_TEST_MODE=1` 을 켠다.
원래의 개발 URL 은 `DSS_DEVELOPMENT_DATABASE_URL` 로 밀려난다.

### ② 🔴 접속을 만드는 순간 — `src/lib/db/index.ts`

```ts
if (process.env.DSS_DB_TEST_MODE === "1") {
  requireActiveTestDatabase(databaseUrl);
}
```

`DSS_DB_TEST_MODE=1` 인 프로세스가 `_test` 로 끝나지 않는 DB 에 붙으려 하면
**접속 풀이 생기기 전에** 던진다.

①만 있으면 부족하다 — 누가 부트스트랩을 건너뛰고 환경변수만 켜거나, 시험 도중에
`DATABASE_URL` 을 바꿔 끼우면 ①은 이미 지나간 뒤다. **마지막 관문은 접속을 만드는
자리**여야 한다.

이 줄이 지워지지 않도록 `src/lib/db/test-database-safety.test.ts` 가 그 파일의
글자를 읽어 「관문이 접속보다 먼저 온다」까지 확인한다.

오류 메시지에는 URL 도 사용자도 비밀번호도 들어가지 않는다 — 시험이 실패한 출력은
널리 퍼진다. 그것도 시험이 지킨다.

---

## 새 DB 시험을 더할 때

1. 파일을 만든다. 이름은 `*.integration.test.ts` 로 한다.
2. 🔴 `scripts/test-lists/db.txt` 에 한 줄 적는다. 어느 목록에도 없으면
   `scripts/test-lists/test-list-registration.test.ts` 가 `npm test` 에서 실패한다.
3. 🔴 만든 자료는 **스스로 지운다.** 지울 때는 반드시 제가 만든 줄로 범위를
   좁힌다(`where(eq(표.id, 방금만든id))`). 범위 없는 `delete` 는 시험 DB 전체를
   비운다.
4. 🔴 마지막에 `pgClient.end()` 로 접속 풀을 닫는다. 안 닫으면 시험이 다 통과하고도
   `node --test` 가 돌아오지 않는다.

본보기: `src/lib/db/db-roundtrip.integration.test.ts` (가장 단순한 한 벌 —
읽고 · 넣고 · 지우고 · 사라진 것을 본다).

---

## 안 될 때

| 증상 | 까닭 |
| --- | --- |
| `TEST_DATABASE_URL 이 없습니다` | `.env.test.local` 이 없거나 이름이 틀렸다. `.env.local` 에 적지 않았는지 보라 |
| `시험 DB 는 개발 DB 와 달라야 합니다` | `TEST_DATABASE_URL` 이 `dss_as` 를 가리킨다. 🔴 고치기 전에는 절대 우회하지 말 것 |
| `_test 로 끝나는 DB` | DB 이름을 보라. `dss_as_test` 여야 한다 |
| `relation "…" does not exist` | 시험 DB 에 표가 없다. A/S 에서 `npm run db:test:prepare` 를 돌린다 |
| A/S 에 새 마이그레이션이 생긴 뒤 칸이 없다고 한다 | A/S 에서 `npm run db:test:migrate` 를 다시 돌린다 |
| 시험은 다 통과했는데 명령이 안 끝난다 | 그 시험이 `pgClient.end()` 를 안 불렀다 |
| `.env` 값이 안 먹는다 | 같은 이름이 두 줄이면 나중 것이 이긴다. 셸에 이미 있는 값은 파일보다 세다 |
