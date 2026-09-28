import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ============================================================================
 * 🔴 결재선은 **읽기만** 한다 — 이 저장소의 울타리 (조각 PO 결재-A, 2026-09-28)
 * ============================================================================
 * 2026-09-28 사용자 결정: **결재선 설정(누가 몇 번째로 결재하는가)은 A/S 에서만
 * 한다. PO 는 그 결재선을 읽어서 돌리기만 한다.**
 *
 * 표 셋(`shipment_approval_routes` · `shipment_approval_route_steps` ·
 * `quote_approvals`)이 공용 묶음(vendor/dss-core)에 있어 **두 사이트가 같은
 * 자료를 본다.** 그래서 이 사이트에 저장 경로가 하나라도 생기면, A/S 의 화면은
 * 아무것도 모른 채 다른 결과를 보게 된다. 그 일이 일어나지 않았다는 것을 여기서
 * **글자로** 잰다 — 타입으로는 잴 수 없다(안 가져온 함수는 타입이 없다).
 *
 * 재는 것 넷.
 *
 *  1. 🔴 **잠금 열쇠 문자열이 A/S 와 글자 그대로 같다.** 이 조각에서 가장 위험한
 *     자리다 — 글자 하나만 달라도 두 잠금이 서로를 보지 못하고, **그 어긋남은
 *     아무 오류도 내지 않는다.** 실수로 고치면 여기서 잡힌다.
 *  2. 🔴 **「설정하는 쪽」의 이름이 이 저장소 어디에도 없다.**
 *  3. 🔴 **편집 도우미 다섯은 정의만 있고 부르는 곳이 없다.** 지우지 않은 이유는
 *     domain/shipment-approval-route.ts 머리말에 있다(용도 목록의 유일한 출처가
 *     같은 파일에 있어서다).
 *  4. 🔴 **읽기 파일에 쓰기가 한 줄도 없다.**
 *
 * 🔴 **주석은 빼고 잰다** — 이 저장소의 머리말들이 「안 가져왔다」를 **이름으로**
 * 적어 두기 때문이다(quote-attachment-files.test.ts 가 세운 방식과 같다).
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");

/** 주석을 지운 코드만. 블록 주석 전체와 줄 통째로인 `//` 주석을 뺀다. */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const LOCK_FILE = "src/lib/db/mutations/approval-route-shared-lock.ts";
const QUERY_FILE = "src/lib/db/queries/shipment-approval-routes.ts";
const DOMAIN_FILE = "src/lib/domain/shipment-approval-route.ts";
const DOMAIN_TEST = "src/lib/domain/shipment-approval-route.test.ts";
const SELF = "src/lib/db/approval-route-read-only.test.ts";

/**
 * `src` 아래 모든 `.ts`/`.tsx` 를 주석 지운 코드로 훑는다. `skip` 에 적은 경로는
 * 건너뛴다(정의 파일과 그 시험, 그리고 이 파일 자신).
 *
 * 돌려주는 `scanned` 는 **아무것도 안 훑고 통과하는 길을 막기 위한 것**이다.
 */
function scanSrc(skip: readonly string[]): { scanned: number; hits: (needle: string) => string[] } {
  const files: Array<[string, string]> = [];
  const walk = (relativeDir: string) => {
    for (const entry of readdirSync(fileURLToPath(new URL(relativeDir, repoUrl)), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (skip.includes(relativePath)) continue;
      files.push([relativePath, codeOf(read(relativePath))]);
    }
  };
  walk("src");

  return {
    scanned: files.length,
    hits: (needle) => files.filter(([, code]) => code.includes(needle)).map(([path]) => path),
  };
}

/**
 * ============================================================================
 * ① 🔴 잠금 열쇠 — 글자가 갈라지면 아무 오류 없이 틈이 열린다
 * ============================================================================
 * A/S `src/lib/db/mutations/shipment-approval-routes.ts:110` 의 `ROUTE_LOCK_KEY`
 * 와 **같은 문자열**이어야 한다. 두 저장소가 같은 DB 를 보므로, 갈라지면
 * 「결재선을 읽은 뒤 A/S 에서 계정 삭제가 커밋되고, 그다음 지워진 사람에게 결재
 * 행이 가는」 틈이 이 사이트에서만 열린다.
 * ============================================================================
 */
describe("🔴 결재선 잠금 — 공유 잠금 하나, 열쇠는 한 곳에만", () => {
  test("🔴 열쇠 문자열이 A/S 와 글자 그대로 같다", () => {
    const code = codeOf(read(LOCK_FILE));
    assert.ok(
      code.includes('const ROUTE_LOCK_KEY = "shipment_approval_routes:current";'),
      "🔴 열쇠가 A/S 의 ROUTE_LOCK_KEY 와 다르다 — 글자 하나만 달라도 두 잠금이 서로를 못 본다"
    );
  });

  test("🔴 거는 것은 **공유** 잠금이고, 배타 잠금은 여기 없다", () => {
    const code = codeOf(read(LOCK_FILE));
    assert.ok(
      code.includes(
        "sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${ROUTE_LOCK_KEY}, 0))`"
      ),
      "공유 잠금을 거는 줄이 A/S :137-139 와 다르다"
    );
    // 배타 잠금은 결재선을 **고치는 쪽**의 것이다 — 이 사이트에 그 일은 없다.
    assert.equal(
      /pg_advisory_xact_lock\(/.test(code),
      false,
      "배타 잠금이 들어왔다 — 결재선을 고치는 쪽의 것이다"
    );
  });

  test("🔴 머리말이 A/S 의 파일 경로와 줄 번호를 적어 둔다 — 다음 사람이 맞대어 볼 곳", () => {
    const source = read(LOCK_FILE);
    for (const mark of [
      "src/lib/db/mutations/shipment-approval-routes.ts",
      "ROUTE_LOCK_KEY",
      ":110",
      ":137-139",
    ]) {
      assert.ok(source.includes(mark), `머리말에서 ${mark} 이 사라졌다`);
    }
  });

  test("🔴 열쇠 문자열이 적힌 곳은 이 저장소에 하나뿐이다", () => {
    const scan = scanSrc([SELF]);
    assert.ok(scan.scanned > 100, `훑은 파일이 ${scan.scanned}개뿐이다 — 걷는 길이 끊겼는지 보라`);
    assert.deepEqual(
      scan.hits('"shipment_approval_routes:current"'),
      [LOCK_FILE],
      "열쇠를 두 곳에 적으면 한쪽만 고쳐지는 날이 온다"
    );
  });
});

/**
 * ============================================================================
 * ② 🔴 「설정하는 쪽」은 오지 않았다
 * ============================================================================
 * 아래 이름들은 **정의도 호출도** 이 저장소에 없어야 한다. 하나라도 살아나면
 * 「결재선 설정을 PO 에서도 한다」가 되어 2026-09-28 결정이 깨진다.
 * ============================================================================
 */
describe("🔴 결재선을 **고치는** 이름이 이 저장소 어디에도 없다", () => {
  test("저장 경로 · 배타 잠금 · 후보 목록 · 대리결재", () => {
    const scan = scanSrc([SELF]);
    assert.ok(scan.scanned > 100, `훑은 파일이 ${scan.scanned}개뿐이다 — 걷는 길이 끊겼는지 보라`);

    for (const forbidden of [
      // 결재선 저장(A/S mutations/shipment-approval-routes.ts) — 설정은 A/S 에서만.
      "saveShipmentApprovalRoute",
      "saveShipmentApprovalRouteInTx",
      "ShipmentApprovalRouteSaveRejected",
      // 🔴 배타 잠금 — 결재선을 고치는 쪽과 계정 삭제가 쓴다. 이 사이트에 그 일은 없다.
      "acquireShipmentApprovalRouteLock",
      // 설정 화면 전용 조회와 그 줄 타입(queries 에서 일부러 뺐다).
      "listSelectableApproverCandidates",
      "SelectableApproverCandidate",
      // 설정 화면과 그 입력 검사.
      "ShipmentApprovalRouteSection",
      "shipment-approval-route-input",
      // 🔴 견적서 결재는 위임을 한 줄도 쓰지 않는다 — 결재선을 타는 행은
      //    대표 · 위임 판정을 건너뛴다.
      "shipmentApprovalDelegations",
      "shipment_approval_delegations",
    ]) {
      assert.deepEqual(
        scan.hits(forbidden),
        [],
        `🔴 결재선을 고치는 쪽의 이름이 살아났다: ${forbidden}`
      );
    }
  });
});

/**
 * ============================================================================
 * ③ 🔴 편집 도우미 다섯 — 정의는 있고, 부르는 곳이 없다
 * ============================================================================
 * 이 다섯은 ①의 도메인 파일에 **정의가 있다**(일부러 안 잘랐다 — 그 파일
 * 머리말). 그러니 「없다」가 아니라 **「부르는 곳이 없다」**로 잰다: 정의 파일과
 * 그 파일의 시험만 빼고 훑는다.
 * ============================================================================
 */
describe("🔴 편집 도우미는 이 사이트에서 아무도 부르지 않는다", () => {
  test("정의 파일과 그 시험 말고는 어디에도 나오지 않는다", () => {
    const scan = scanSrc([DOMAIN_FILE, DOMAIN_TEST, SELF]);
    assert.ok(scan.scanned > 100, `훑은 파일이 ${scan.scanned}개뿐이다 — 걷는 길이 끊겼는지 보라`);

    for (const helper of [
      "validateShipmentApprovalRouteSteps",
      "moveRouteStepUp",
      "moveRouteStepDown",
      "removeRouteStep",
      "isSameRouteStepList",
    ]) {
      assert.deepEqual(
        scan.hits(helper),
        [],
        `🔴 편집 도우미를 부르는 곳이 생겼다: ${helper} — 설정은 A/S 에서만 한다`
      );
    }
  });

  test("🔴 그 다섯의 정의는 그대로 있다 — 「안 부른다」가 「지웠다」가 되지 않게", () => {
    const code = codeOf(read(DOMAIN_FILE));
    for (const helper of [
      "export function validateShipmentApprovalRouteSteps(",
      "export function moveRouteStepUp(",
      "export function moveRouteStepDown(",
      "export function removeRouteStep(",
      "export function isSameRouteStepList(",
    ]) {
      assert.ok(code.includes(helper), `${helper} 정의가 사라졌다 — 용도 목록의 출처가 흔들린다`);
    }
    // 용도 목록의 유일한 출처 셋도 함께 지킨다(자르면 안 되는 진짜 이유).
    for (const constant of [
      "export const SHIPMENT_APPROVAL_ROUTE_SCOPES",
      "export const SHIPMENT_APPROVAL_ROUTE_SCOPE_LABELS",
      "export const SHIPMENT_APPROVAL_ROUTE_EMPTY_NOTICES",
    ]) {
      assert.ok(code.includes(constant), `${constant} 가 사라졌다`);
    }
  });
});

/**
 * ============================================================================
 * ④ 🔴 읽기 파일에 쓰기가 한 줄도 없다
 * ============================================================================
 * A/S 원본도 그렇다(내보내는 것이 전부 `select`). 이 사이트에서는 그것이 규칙
 * 자체다 — 결재선은 읽기만 한다.
 * ============================================================================
 */
describe("🔴 결재선 조회 파일은 읽기 전용이다", () => {
  test("insert · update · delete · execute 가 한 번도 나오지 않는다", () => {
    const code = codeOf(read(QUERY_FILE));
    for (const write of ["insert(", "update(", "delete(", "execute(", "sql`"]) {
      assert.equal(
        code.includes(write),
        false,
        `🔴 읽기 전용이어야 할 조회 파일에 쓰기가 들어왔다: ${write}`
      );
    }
    // 읽는 것은 실제로 있다 — 위 금지가 「파일이 비었을 뿐」이 아님을 함께 잰다.
    assert.ok(code.includes(".select({"), "조회가 하나도 없다 — 파일이 비었는지 보라");
  });

  test("이 사이트가 쓸 조회 넷이 그대로 있다", () => {
    const code = codeOf(read(QUERY_FILE));
    for (const exported of [
      "export async function getCurrentShipmentApprovalRoute(",
      "export async function getCurrentShipmentApprovalRouteChain(",
      "export async function getShipmentApprovalRouteSteps(",
      "export async function listShipmentApprovalRouteSteps(",
    ]) {
      assert.ok(code.includes(exported), `${exported} 가 사라졌다`);
    }
  });

  test("🔴 잠금 파일에도 결재선을 고치는 것이 없다 — 이름은 달라도 하는 일이 그래야 한다", () => {
    const code = codeOf(read(LOCK_FILE));
    for (const write of ["insert(", "update(", "delete("]) {
      assert.equal(code.includes(write), false, `잠금 파일에 쓰기가 들어왔다: ${write}`);
    }
    assert.ok(
      code.includes("export async function acquireShipmentApprovalRouteSharedLock("),
      "공유 잠금 도우미가 사라졌다"
    );
  });
});
