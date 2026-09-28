import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * ============================================================================
 * 🔴 견적서 결재 저장 경로의 여섯 불변식 — 글자로 잰다 (조각 PO 결재-B)
 * ============================================================================
 * 🔴 **A/S 에는 이 파일이 없다.** 여기서 재는 여섯은 전부 「무엇이 **어느 자리에**
 * 있는가」· 「무엇이 **없는가**」라서, 값으로는 절반만 보인다(없는 코드는 부를 수
 * 없고, 두 줄의 순서는 둘 다 통과하는 시험을 쉽게 쓸 수 있다). 이웃한
 * `src/lib/db/approval-route-read-only.test.ts`(조각 결재-A)가 세운 방식 그대로다.
 *
 * 재는 것 여섯:
 *
 *  ① 🔴 공유 잠금이 **트랜잭션의 첫 줄**이다 — 두 함수 모두. 다른 행을 먼저 잠근
 *     채로 이것을 기다리면, 배타 잠금을 쥔 삭제가 그 행을 기다리는 순간 **교착**이
 *     된다(mutations/approval-route-shared-lock.ts 머리말).
 *  ② 🔴 관문 순서가 **자격(requireActor) → 지정(mayDecideAssignedApproval)** 이다.
 *     뒤집히면 **지정이 권한을 만들어 낸다.** 그리고 결정 경로는 권한 영역을
 *     **아예 묻지 않는다**(결재는 `quotes` READ/WRITE 와 무관하다).
 *  ③ 🔴 사슬은 앞 행을 **UPDATE 한 뒤에** 다음 행을 INSERT 한다. 뒤집으면 부분
 *     유니크(`quote_approvals_one_active_request`)에 걸린다.
 *  ④ 요청이 거절되는 갈래 셋이 살아 있고, **요청자 본인 단계를 건너뛰는** 인자가
 *     실제로 넘어간다.
 *  ⑤ 🔴 **발행 통로를 부르는 줄이 없다** — 2026-09-18 사용자 결정. 반대 방향
 *     (발행 통로가 결재를 읽지 않는다)은 domain/quote-approval-rules.test.ts 가 잰다.
 *  ⑥ 🔴 **`quotes` 표를 고치는 줄이 없다.** 결재가 끝나도 상태도 첨부도 칸도
 *     하나도 안 바뀐다 — 남는 것은 `quote_approvals` 행들뿐이고 상태는 매번
 *     계산된다(resolveQuoteApprovalState).
 *
 * 🔴 **주석은 빼고 잰다** — 이 저장소의 머리말들이 「안 가져왔다」·「하지 않는다」를
 * **이름으로** 적어 두기 때문이다(approval-route-read-only.test.ts 와 같은 방식).
 * ============================================================================
 */

const repoUrl = new URL("../../../../", import.meta.url);
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");

/** 주석을 지운 코드만. 블록 주석 전체와 줄 통째로인 `//` 주석을 뺀다. */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const MUTATION_FILE = "src/lib/db/mutations/quote-approvals.ts";
const QUERY_FILE = "src/lib/db/queries/quote-approvals.ts";
const ACTION_FILE = "src/lib/server/actions/quote-approvals.ts";

const mutationCode = codeOf(read(MUTATION_FILE));

const REQUEST_HEAD = "export async function requestQuoteApproval(";
const DECIDE_HEAD = "export async function decideQuoteApproval(";

/** 두 함수의 몸을 갈라 둔다 — 갈라 보지 않으면 「순서」 단언이 뜻을 잃는다. */
const requestStart = mutationCode.indexOf(REQUEST_HEAD);
const decideStart = mutationCode.indexOf(DECIDE_HEAD);
const requestBody = mutationCode.slice(requestStart, decideStart);
const decideBody = mutationCode.slice(decideStart);

/**
 * 트랜잭션이 열린 **바로 다음 줄**. 첫 줄 하나만 떼어 보므로 「어딘가에 있다」로는
 * 통과할 수 없다.
 */
function firstStatementInTransaction(body: string): string {
  const txAt = body.indexOf("db.transaction(");
  assert.notEqual(txAt, -1, "트랜잭션을 여는 줄을 찾지 못했다");
  const openAt = body.indexOf("=> {", txAt);
  assert.notEqual(openAt, -1, "트랜잭션 콜백의 여는 중괄호를 찾지 못했다");
  return body.slice(openAt + "=> {".length).trimStart().split("\n")[0].trim();
}

describe("🔴 바닥 — 아무것도 안 읽고 통과하는 길을 막는다", () => {
  test("두 함수가 실제로 이 파일에 있다", () => {
    assert.ok(requestStart > 0, `${REQUEST_HEAD} 를 찾지 못했다`);
    assert.ok(decideStart > requestStart, `${DECIDE_HEAD} 가 요청 함수 뒤에 없다`);
    assert.ok(mutationCode.length > 4000, `주석을 뺀 코드가 ${mutationCode.length}자뿐이다`);
  });
});

describe("① 🔴 공유 잠금이 트랜잭션의 첫 줄이다", () => {
  test("요청 경로 — 트랜잭션이 열리자마자 건다", () => {
    assert.equal(
      firstStatementInTransaction(requestBody),
      "await acquireShipmentApprovalRouteSharedLock(tx);",
      "🔴 다른 행을 먼저 잠근 채로 결재선 공유 잠금을 기다리면, 배타 잠금을 쥔 삭제와 교착한다"
    );
  });

  test("결정 경로 — 결재 행을 FOR UPDATE 로 잠그기 **전**이다", () => {
    assert.equal(
      firstStatementInTransaction(decideBody),
      "await acquireShipmentApprovalRouteSharedLock(tx);",
      "🔴 결재 행을 먼저 잠그고 나서 공유 잠금을 기다리면 삭제(배타 잠금 → 결재 행)와 교착한다"
    );
  });

  test("두 곳 말고는 거는 곳이 없다 — 그리고 배타 잠금은 쓰지 않는다", () => {
    // 부르는 자리만 센다 — 들여오는 줄에는 괄호가 붙지 않는다.
    const calls = mutationCode.split("acquireShipmentApprovalRouteSharedLock(").length - 1;
    assert.equal(calls, 2, `공유 잠금을 거는 곳이 ${calls}곳이다 — 요청 · 결정 둘이어야 한다`);
    assert.ok(
      mutationCode.includes(
        'import { acquireShipmentApprovalRouteSharedLock } from "./approval-route-shared-lock";'
      ),
      "🔴 잠금을 이 파일에서 직접 걸기 시작했다 — 열쇠 문자열은 저장소에 한 곳뿐이어야 한다"
    );
    assert.equal(
      /pg_advisory_xact_lock\(/.test(mutationCode),
      false,
      "배타 잠금은 결재선을 고치는 쪽의 것이다 — 이 사이트에 그 일은 없다"
    );
  });
});

describe("② 🔴 관문 순서 — 자격 먼저, 지정 나중", () => {
  test("결정 경로에서 requireActor 가 mayDecideAssignedApproval 보다 앞이다", () => {
    const actorAt = decideBody.indexOf("requireActor(tx, input.actorUserId)");
    const gateAt = decideBody.indexOf("mayDecideAssignedApproval(");
    assert.ok(actorAt > 0, "자격 검사(requireActor)를 찾지 못했다");
    assert.ok(gateAt > 0, "지정 관문(mayDecideAssignedApproval)을 찾지 못했다");
    assert.ok(
      actorAt < gateAt,
      "🔴 순서가 뒤집히면 지정이 권한을 만들어 낸다 — 지정은 자격 있는 사람들 중 누구인지를 좁힐 뿐이다"
    );
  });

  test("🔴 결정 경로는 권한 영역을 아예 묻지 않는다", () => {
    assert.equal(
      decideBody.includes("hasPermission("),
      false,
      "🔴 결재는 `quotes` READ/WRITE 와 무관하다. 여기서만 문턱을 얹으면 A/S 에서 짠 결재선이 이 사이트에서만 막힌다"
    );
  });

  test("요청 경로만 `quotes` WRITE 를 묻는다 — 견적서 화면과 같은 열쇠다", () => {
    assert.ok(
      requestBody.includes('hasPermission(actor, "quotes", "WRITE")'),
      "요청이 견적서 WRITE 를 묻지 않는다 — 새 권한 영역을 만들지 않는 것이 규칙이다"
    );
  });

  test("자격 판정을 여기 두 벌로 적지 않는다 — 한 함수를 부른다", () => {
    assert.ok(
      mutationCode.includes('import { resolveEligibleActor } from "./eligible-actor";'),
      "자격 검사를 이 파일 안에 다시 적기 시작했다"
    );
    for (const condition of ["approvalStatus", "lockedAt", "isActive"]) {
      assert.equal(
        mutationCode.includes(condition),
        false,
        `계정 자격 조건(${condition})이 이 파일에 두 벌째로 적혔다`
      );
    }
  });
});

describe("③ 🔴 사슬 — 앞 행을 APPROVED 로 고친 **뒤에** 다음 행을 넣는다", () => {
  test("UPDATE 가 INSERT 보다 앞이다", () => {
    const updateAt = decideBody.indexOf(".update(quoteApprovals)");
    const insertAt = decideBody.indexOf(".insert(quoteApprovals)");
    assert.ok(updateAt > 0, "결정을 적는 UPDATE 를 찾지 못했다");
    assert.ok(insertAt > 0, "다음 단계를 여는 INSERT 를 찾지 못했다");
    assert.ok(
      updateAt < insertAt,
      "🔴 앞 행이 아직 REQUESTED 인 채로 INSERT 하면 quote_approvals_one_active_request(부분 유니크)에 걸린다"
    );
  });

  test("이어진 행은 요청자 · 사유 · 판 번호를 물려받고 requested_at 은 안 물려받는다", () => {
    for (const inherited of [
      "requestedByUserId: latest.requestedByUserId",
      "requestReason: latest.requestReason",
      "quoteVersionAtRequest: latest.quoteVersionAtRequest",
    ]) {
      assert.ok(decideBody.includes(inherited), `사슬이 ${inherited} 를 물려받지 않는다`);
    }
    assert.equal(
      decideBody.includes("requestedAt:"),
      false,
      "🔴 requested_at 을 물려받으면 「가장 최근 행」을 고르는 조회가 어느 행을 고를지 정해지지 않는다"
    );
  });
});

describe("④ 요청이 거절되는 갈래 셋 — 그리고 요청자 본인 단계는 건너뛴다", () => {
  test("셋이 그대로 있다", () => {
    for (const code of ["ROUTE_NOT_CONFIGURED", "ROUTE_HAS_NO_OTHER_APPROVER", "ALREADY_REQUESTED"]) {
      assert.ok(requestBody.includes(code), `요청 경로에서 ${code} 갈래가 사라졌다`);
    }
  });

  test("🔴 첫 단계를 고를 때 요청자 본인을 건너뛰도록 넘긴다", () => {
    assert.ok(
      requestBody.includes("findNextRouteStepToApprove(route.steps, 0, actor.id)"),
      "🔴 요청자를 넘기지 않으면 요청자가 자기 차례를 받아 자기가 올린 것을 결재하게 된다"
    );
  });

  test("🔴 사슬에서 넘기는 요청자는 **그 사슬을 올린 사람**이지 방금 결재한 사람이 아니다", () => {
    assert.ok(
      decideBody.includes("latest.requestedByUserId\n        );") ||
        decideBody.includes("latest.requestedByUserId"),
      "사슬이 요청자를 잃었다"
    );
    assert.equal(
      decideBody.includes("findNextRouteStepToApprove(steps, latest.routeStepOrder, actor.id)"),
      false,
      "🔴 방금 결재한 사람을 요청자로 넘기면 사슬이 엉뚱한 단계를 건너뛴다"
    );
  });

  test("용도 문자열을 글자로 적지 않는다 — 도메인 상수 하나를 쓴다", () => {
    assert.ok(requestBody.includes("QUOTE_APPROVAL_ROUTE_SCOPE"), "용도 상수를 쓰지 않는다");
    assert.equal(
      /"QUOTE"/.test(mutationCode),
      false,
      "용도를 글자로 적으면 오타 하나가 「판이 없다」로 조용히 보인다"
    );
  });
});

describe("⑤ 🔴 발행 통로를 부르는 줄이 없다 — 2026-09-18 사용자 결정", () => {
  /** 이 사이트에서 견적서 파일이 실제로 나가는 길과, 그 길이 쓰는 이름들. */
  const ISSUE_PATH_NAMES = [
    "quote-workbook",
    "buildQuoteWorkbook",
    "quote-exports",
    "recordQuoteExport",
    "quoteExports",
    "xlsx",
  ] as const;

  for (const relativePath of [MUTATION_FILE, QUERY_FILE, ACTION_FILE]) {
    test(`${relativePath} 는 발행 통로를 한 번도 부르지 않는다`, () => {
      const code = codeOf(read(relativePath));
      for (const name of ISSUE_PATH_NAMES) {
        assert.equal(
          code.includes(name),
          false,
          `결재가 발행 통로를 부르기 시작했다(${name}). 결재는 기록이고 발행을 막지 않는다 — 막아야 한다면 코드를 고치기 전에 먼저 물을 것.`
        );
      }
    });
  }
});

describe("⑥ 🔴 결재가 끝나도 `quotes` 표는 안 바뀐다", () => {
  for (const relativePath of [MUTATION_FILE, QUERY_FILE, ACTION_FILE]) {
    test(`${relativePath} 에 견적서 표를 쓰는 줄이 하나도 없다`, () => {
      const code = codeOf(read(relativePath));
      for (const write of ["update(quotes)", "insert(quotes)", "delete(quotes)"]) {
        assert.equal(
          code.includes(write),
          false,
          `🔴 결재가 견적서 표를 고치기 시작했다(${write}). 남는 것은 quote_approvals 행들뿐이고 상태는 매번 계산된다`
        );
      }
    });
  }

  test("🔴 결재선 표(판 · 단계)도 한 줄 쓰지 않는다 — 설정은 A/S 에서만 한다", () => {
    for (const write of [
      "insert(shipmentApprovalRoutes",
      "insert(shipmentApprovalRouteSteps",
      "update(shipmentApprovalRoutes",
      "update(shipmentApprovalRouteSteps",
      "delete(shipmentApprovalRoutes",
      "delete(shipmentApprovalRouteSteps",
    ]) {
      assert.equal(mutationCode.includes(write), false, `결재선을 고치는 줄이 생겼다: ${write}`);
    }
  });

  test("견적서 행을 **잠그기만** 한다 — 요청 경로의 FOR UPDATE", () => {
    // 판 번호를 잠근 행에서 읽는다. 잠그지 않으면 방금 읽은 version 이 커밋 직전에
    // updateQuote 로 올라가, 처음부터 낡은 승인이 되어 버린다.
    assert.ok(requestBody.includes('.for("update")'), "요청 경로가 견적서 행을 잠그지 않는다");
    assert.equal(
      decideBody.split('.for("update")').length - 1,
      1,
      "결정 경로가 잠그는 것은 결재 행 하나여야 한다 — 견적서 행까지 잠그면 결재가 견적서 수정과 쓸데없이 줄을 선다"
    );
  });
});
