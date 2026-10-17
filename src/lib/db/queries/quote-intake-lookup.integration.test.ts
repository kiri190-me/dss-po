import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";

import { customers, products, repairCases, users, workflowSteps, workflowVersions } from "@dss/core/schema";
import { db, pgClient } from "@/lib/db";
import { lookupIntakeForQuote } from "./quotes";

/**
 * ============================================================================
 * 인수번호로 견적서 채우기 — 🔴 **이 DB 가 아는 것이 여기까지다** (2026-10-17)
 * ============================================================================
 * 이 조회가 돌려주던 **출고된 부품**과 **O/H 템플릿 부품**은 2026-10 에 **재고 관리로
 * 옮겨갔다.** 그 표를 세워 재던 여섯 가지(출고된 것만 센다 · 묶는 축 · 견적가가 따라온다 ·
 * 정하지 않은 값은 null · 0원은 그대로 · O/H 견적가를 때우지 않는다)는 **뜻을 그대로 들고**
 * `src/lib/domain/quote-intake-parts.test.ts` 로 옮겼다 — 이제 그 자료가 저쪽에서 오므로
 * 같은 DB 의 A/S 표를 세워서는 잴 수 없고, 저쪽에서 받아 온 것을 **어떻게 읽는가**가 그
 * 규칙들이 사는 자리다. 🔴 **표를 지운 것이 아니다** — 과거 기록이 들어 있고 A/S 가 쓴다.
 * 지운 것은 **읽는 코드**뿐이다.
 *
 * 여기 남는 것은 **이 조회가 지금도 하는 일** 셋이다 —
 *  1. 인수번호 하나로 고객사 · 모델명 · L/N · S/N · 신고증상이 따라온다.
 *  2. 없는 인수번호는 **오류가 아니라 null** 이다(접수 전에 견적을 내는 일이 있다).
 *  3. 🔴 **제품 개체 id 가 함께 온다** — 재고 관리에 O/H 템플릿을 물을 열쇠(제품 **모델**
 *     id)를 그 값으로 얻는다. 빠지면 O/H 템플릿이 영영 안 뜬다.
 *
 * 🔴 **권한은 여기서 보지 않는다** — 세션과 문턱(quotes READ)은 서버 액션의 몫이고
 * (queries/quotes.ts 의 층 나눔), 그 약속은 소스 시험이 본다
 * (components/quotes/quote-intake-lookup-source.test.ts).
 *
 * ── 이 저장소에서 다른 것 ───────────────────────────────────────────────────
 *  ① **환경 불러오기와 import 경로** — 부트스트랩을 명령줄에서 싣고
 *     (`--import ./scripts/test-db-bootstrap.ts`, docs/DB_TESTS.md) 스키마는 서브모듈에
 *     있다(`@dss/core/schema`). 그래서 A/S 의 첫 줄 `import "../../../../scripts/load-env"`
 *     이 없다.
 *  ② 🔴 **수리 건을 mutation 대신 직접 넣는다**(아래 insertRepairCase). 접수 등록 사슬은
 *     이 저장소에 없다 — 수리 건 화면은 A/S 에 남는다(설계서 「A/S 에 남길 것」).
 *  ③ 🔴 **격리 이름을 저쪽과 다르게 두었다**(아래 상수). 두 저장소가 **같은 `dss_as_test`**
 *     를 쓰므로(docs/DB_TESTS.md), 같으면 한쪽 after() 가 다른 쪽이 만든 줄을 치운다.
 *
 * 격리 규약: 접수 월 "9503", 고객사 접두사 "PO-TEST-LOOKUP-",
 * 제품 모델 접두사 "PO-LOOKUP-TEST-".
 * 🔴 **저쪽(A/S)은 접수 월 "9603" · 고객사 "AS-TEST-QUOTE-LOOKUP-" 을 쓴다. 같게 바꾸지
 * 마라.** 9503 을 고른 것은 A/S 가 9501 · 9502 와 9601~9912 를 이미 쓰고 있어서다.
 * ============================================================================
 */

const TEST_CUSTOMER_NAME_PREFIX = "PO-TEST-LOOKUP-";
const TEST_MODEL_PREFIX = "PO-LOOKUP-TEST-";
const TEST_YEAR_MONTH = "9503";
const TEST_RECEIVED_AT = "2095-03-05";
/** 이 스위트가 넣는 신고증상. 조회가 그 글자를 그대로 주는지 본다. */
const TEST_SYMPTOM = "Bias Fwd Drop 발생";

let engineerId: string;
let customerId: string;
let repairCaseId: string;
let intakeNumber: string;

/**
 * 🔴 **인수번호를 uuid 로 지을 수 없다** — DB CHECK `repair_cases_intake_number_format`
 * 가 `^D[0-9]{2}(0[1-9]|1[0-2])[0-9]{2}$`(D + 연2 + 월2 + 순번2)만 받는다. 채번을
 * 흉내 내 **이 접두사에서 안 쓰인 다음 번호**를 고른다(mutations/quotes.integration.test.ts
 * 의 같은 helper).
 */
async function nextTestIntakeNumber(): Promise<string> {
  const taken = await db
    .select({ intakeNumber: repairCases.intakeNumber })
    .from(repairCases)
    .where(like(repairCases.intakeNumber, `D${TEST_YEAR_MONTH}%`));
  const used = new Set(taken.map((row) => row.intakeNumber));
  for (let seq = 0; seq < 100; seq += 1) {
    const candidate = `D${TEST_YEAR_MONTH}${String(seq).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  assert.fail(
    `D${TEST_YEAR_MONTH}00~99 가 전부 쓰였다 — 앞선 실행의 after() 가 치우지 못한 줄이 남아 있다.`
  );
}

/**
 * 🔴 **수리 건 한 줄을 직접 넣는다**(머리말 ②). `repair_cases` 의 NOT NULL 여섯을
 * 채운다 — 인수번호 · 고객사 · 제품 · 워크플로 판 · 지금 단계 · 접수일. 워크플로 판과
 * 단계는 **시험 DB 에 이미 있는 것을 골라 쓴다**(시드가 넣어 둔다 — docs/DB_TESTS.md).
 * 만들지 않는다: 그 표는 이 시험의 것이 아니고, 만들면 지울 책임이 생긴다.
 *
 * 🔵 제품 개체에 **제품 모델을 잇지 않는다**(`product_model_id` 가 null 이다). 그래서
 *    서버 모듈은 O/H 템플릿을 물을 열쇠를 얻지 못하고 저쪽을 부르지 않는다 — 이 시험이
 *    보는 것은 **개체 id 가 오는가**까지다(모델 id 를 얻는 길은 그 다음 한 걸음이다).
 */
async function insertRepairCase(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);

  const [version] = await db.select({ id: workflowVersions.id }).from(workflowVersions).limit(1);
  assert.ok(version, "expected at least one workflow_versions row in the test DB");

  const [step] = await db
    .select({ id: workflowSteps.id })
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowVersionId, version.id))
    .limit(1);
  assert.ok(step, "expected at least one workflow_steps row for that version in the test DB");

  const [product] = await db
    .insert(products)
    .values({
      modelName: `${TEST_MODEL_PREFIX}${suffix}`,
      lotNumber: `LOT-${suffix}`,
      serialNumber: `SN-${suffix}`,
    })
    .returning({ id: products.id });

  const [row] = await db
    .insert(repairCases)
    .values({
      intakeNumber: await nextTestIntakeNumber(),
      customerId,
      productId: product.id,
      workflowVersionId: version.id,
      currentWorkflowStepId: step.id,
      assignedEngineerId: engineerId,
      receivedAt: TEST_RECEIVED_AT,
      reportedSymptom: TEST_SYMPTOM,
    })
    .returning({ id: repairCases.id, intakeNumber: repairCases.intakeNumber });
  intakeNumber = row.intakeNumber;
  return row.id;
}

before(async () => {
  const [engineer] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.role, "AS_ENGINEER"), eq(users.approvalStatus, "APPROVED"), eq(users.isDeleted, false))
    )
    .limit(1);
  assert.ok(engineer, "expected at least one approved AS_ENGINEER in the test DB");
  engineerId = engineer.id;

  const [customer] = await db
    .insert(customers)
    .values({ name: `${TEST_CUSTOMER_NAME_PREFIX}${randomUUID().slice(0, 8)}` })
    .returning({ id: customers.id });
  customerId = customer.id;

  repairCaseId = await insertRepairCase();
});

after(async () => {
  await db.delete(repairCases).where(like(repairCases.intakeNumber, `D${TEST_YEAR_MONTH}%`));
  await db.delete(products).where(like(products.modelName, `${TEST_MODEL_PREFIX}%`));
  // 🔴 `repair_case_intake_sequences` 는 지우지 않는다 — 인수번호를 채번하지 않고
  // 직접 지어 넣으므로(insertRepairCase) 이 스위트는 그 표에 줄을 만들지 않는다.
  await db.delete(customers).where(like(customers.name, `${TEST_CUSTOMER_NAME_PREFIX}%`));
  await pgClient.end({ timeout: 5 });
});

describe("lookupIntakeForQuote", () => {
  test("인수번호로 고객사·모델명·L/N·S/N·신고증상이 따라온다", async () => {
    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found, "찾지 못했다");
    assert.equal(found.repairCaseId, repairCaseId);
    assert.equal(found.customerId, customerId);
    assert.ok(found.modelName?.startsWith(TEST_MODEL_PREFIX));
    assert.ok(found.lotNumber?.startsWith("LOT-"));
    assert.ok(found.serialNumber?.startsWith("SN-"));
    assert.equal(found.faultDescription, TEST_SYMPTOM);
  });

  test("없는 인수번호는 오류가 아니라 null — 접수 전에 견적을 내는 일이 있다", async () => {
    assert.equal(await lookupIntakeForQuote("D999999"), null);
  });

  test("🔴 제품 개체 id 가 함께 온다 — 재고 관리에 O/H 템플릿을 물을 열쇠가 여기서 나온다", async () => {
    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    // 🔴 이 값이 빠지면 서버 모듈이 제품 **모델** id 를 얻지 못해 저쪽을 부르지도 못하고,
    //    화면은 영영 「이 모델에 템플릿이 이어져 있지 않습니다」만 띄운다.
    assert.ok(found.productId, "제품 개체 id 가 없다");
    const [product] = await db
      .select({ modelName: products.modelName })
      .from(products)
      .where(eq(products.id, found.productId));
    assert.ok(product?.modelName?.startsWith(TEST_MODEL_PREFIX), "다른 개체를 가리킨다");
  });
});
