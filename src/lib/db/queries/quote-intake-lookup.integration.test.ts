import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

import {
  customers,
  inventoryPartRequestItems,
  inventoryPartRequests,
  partUnitPrices,
  parts,
  products,
  repairCases,
  users,
  workflowSteps,
  workflowVersions,
} from "@dss/core/schema";
import { db, pgClient } from "@/lib/db";
import { lookupIntakeForQuote } from "./quotes";

/**
 * ============================================================================
 * 🔴 A/S 관리 시스템의 같은 이름 시험을 옮겨 왔다 (조각 3b-3 앞쪽 절반)
 * ============================================================================
 * 저쪽 파일은 `lib/db/queries/quote-intake-lookup.integration.test.ts` 이고,
 * **단언은 한 줄도 바꾸지 않았다.** 다른 것은 셋뿐이다:
 *
 *  ① **환경 불러오기와 import 경로** — 이 저장소는 부트스트랩을 명령줄에서 싣고
 *     (`--import ./scripts/test-db-bootstrap.ts`, docs/DB_TESTS.md) 스키마는
 *     서브모듈에 있다(`@dss/core/schema`). 그래서 저쪽 첫 줄
 *     `import "../../../../scripts/load-env"` 이 없다.
 *  ② 🔴 **부품 · 단가 · 수리 건을 mutation 대신 직접 넣는다**(아래 helper 셋).
 *     저쪽은 `createPart` · `savePartOwnerSettings` · `createRepairCase` 를 부르는데
 *     그 셋(재고 등록 · 소유구분 설정 · 접수 등록 사슬)은 이 저장소에 없다 —
 *     재고 화면도 수리 건 화면도 A/S 에 남는다(설계서 「A/S 에 남길 것」). 이 시험이
 *     그 줄들로 하는 일은 **조회가 issued_quantity · owner · 단가를 어떻게 읽는가**
 *     하나라, 표에 직접 넣으면 충분하다. 등록 규칙 자체는 A/S 쪽 시험이 그대로 지킨다.
 *     (같은 판단을 mutations/quotes.integration.test.ts 가 수리 건 한 줄에 이미 했다.)
 *  ③ 🔴 **격리 이름을 저쪽과 다르게 두었다**(아래 상수). 두 저장소가 **같은
 *     `dss_as_test`** 를 쓰므로(docs/DB_TESTS.md), 같으면 한쪽 after() 가 다른 쪽이
 *     만든 줄을 치운다.
 * ============================================================================
 * 인수번호로 견적서 채우기 — 사용한 부품과 그 단가
 * ============================================================================
 * 확인하는 것은 다섯 가지다.
 *
 *  1. **출고된 것만 센다.** 요청만 하고 안 나간 부품을 견적에 올리면 쓰지도
 *     않은 값을 청구하게 된다.
 *  2. **(부품, 소유구분) 짝으로 묶는다.** 화면이 줄마다 어느 소유구분에서
 *     나갔는지를 보여 주므로, DSS 것과 교산 것을 한 줄로 합치면 그 사실이 사라진다.
 *  3. **그 부품에 정해 둔 단가가 따라온다.** 소유구분과는 무관하다(2026-09-17).
 *  4. **🔴 단가를 정하지 않은 부품은 null 이다.** 0 이 아니다 — 0 으로 오면
 *     견적서가 정하지 않은 것을 0원으로 청구하게 된다.
 *  5. **소유구분이 없는 옛 요청에도 단가가 붙는다.** 부품 하나에 값이 하나다.
 *
 * 🔴 **권한은 여기서 보지 않는다** — 세션과 문턱(quotes READ)은 서버 액션의 몫이고
 * (queries/quotes.ts 의 층 나눔), 그 약속은 소스 시험이 본다
 * (components/quotes/quote-intake-lookup-source.test.ts).
 *
 * 격리 규약: 접수 월 "9503", 고객사 접두사 "PO-TEST-LOOKUP-",
 * 제품 모델 접두사 "PO-LOOKUP-TEST-", 부품명 접두사 "po-test-lookup-".
 * 🔴 **저쪽(A/S)은 접수 월 "9603" · 고객사 "AS-TEST-QUOTE-LOOKUP-" · 부품명
 * "test-quote-lookup-" 을 쓴다. 같게 바꾸지 마라.** 9503 을 고른 것은 A/S 가
 * 9501 · 9502 와 9601~9912 를 이미 쓰고 있어서다(저쪽 전체를 훑어 확인했다).
 * ============================================================================
 */

const TEST_CUSTOMER_NAME_PREFIX = "PO-TEST-LOOKUP-";
const TEST_MODEL_PREFIX = "PO-LOOKUP-TEST-";
const TEST_PART_PREFIX = "po-test-lookup-";
const TEST_YEAR_MONTH = "9503";
const TEST_RECEIVED_AT = "2095-03-05";
/** 이 스위트가 넣는 신고증상. 조회가 그 글자를 그대로 주는지 본다. */
const TEST_SYMPTOM = "Bias Fwd Drop 발생";

let actorUserId: string;
let engineerId: string;
let customerId: string;
let repairCaseId: string;
let intakeNumber: string;
const createdPartIds: string[] = [];
const createdRequestIds: string[] = [];

/**
 * 부품 한 줄. 🔴 **`createPart` 대신 직접 넣는다**(머리말 ②) — 이 저장소에는 재고
 * 등록 mutation 이 없다. 조회가 읽는 칸은 품명 · 규격 · 작업비뿐이다.
 */
async function createTestPart(label: string): Promise<string> {
  const [row] = await db
    .insert(parts)
    .values({
      partName: `${TEST_PART_PREFIX}${label}-${randomUUID().slice(0, 6)}`,
      partSpec: null,
      category: "TEST",
    })
    .returning({ id: parts.id });
  createdPartIds.push(row.id);
  return row.id;
}

/**
 * 그 부품의 단가. 🔴 **`savePartOwnerSettings` 대신 직접 넣는다**(머리말 ②).
 * `part_unit_prices` 는 부품 하나에 한 줄이고(part_id UNIQUE), 소유구분 칸이 없다
 * (2026-09-17 — 그 축이 없어졌다).
 */
async function setUnitPrice(partId: string, unitPrice: string) {
  await db.insert(partUnitPrices).values({ partId, unitPrice, updatedBy: actorUserId });
}

/**
 * 부품 요청 한 건과 그 줄들을 **직접 넣는다.** 요청 → 승인 → 출고 흐름을 다
 * 타지 않는 이유는, 이 시험이 보는 것이 그 흐름이 아니라 **조회가 issued_quantity
 * 와 owner 를 어떻게 읽는가**이기 때문이다. 그 흐름 자체는 A/S 의 재고 쪽 통합
 * 시험이 따로 본다.
 */
async function insertIssuedRequest(
  items: { partId: string; owner: string | null; issued: number; requested?: number }[]
) {
  const [request] = await db
    .insert(inventoryPartRequests)
    .values({ repairCaseId, requestedByUserId: engineerId, status: "FULLY_ISSUED" })
    .returning({ id: inventoryPartRequests.id });
  createdRequestIds.push(request.id);

  await db.insert(inventoryPartRequestItems).values(
    items.map((item) => ({
      requestId: request.id,
      partId: item.partId,
      owner: item.owner as never,
      requestedQuantity: item.requested ?? Math.max(item.issued, 1),
      issuedQuantity: item.issued,
    }))
  );
  return request.id;
}

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
  // part_unit_prices.updated_by 는 users 를 RESTRICT 로 가리킨다 — 실재하는 계정이어야
  // 한다. 역할은 상관없다(인가는 서버 액션의 몫이다).
  actorUserId = engineer.id;

  const [customer] = await db
    .insert(customers)
    .values({ name: `${TEST_CUSTOMER_NAME_PREFIX}${randomUUID().slice(0, 8)}` })
    .returning({ id: customers.id });
  customerId = customer.id;

  repairCaseId = await insertRepairCase();
});

after(async () => {
  if (createdRequestIds.length > 0) {
    await db
      .delete(inventoryPartRequestItems)
      .where(inArray(inventoryPartRequestItems.requestId, createdRequestIds));
    await db.delete(inventoryPartRequests).where(inArray(inventoryPartRequests.id, createdRequestIds));
  }
  if (createdPartIds.length > 0) {
    // 단가는 ON DELETE CASCADE 라 함께 사라진다.
    await db.delete(parts).where(inArray(parts.id, createdPartIds));
  }
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

  test("그 부품에 정해 둔 단가가 따라온다 — 소유구분과 무관하다", async () => {
    const partId = await createTestPart("priced");
    await setUnitPrice(partId, "125000");
    await insertIssuedRequest([{ partId, owner: "DSS", issued: 2 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    const used = found.usedParts.find((p) => p.partId === partId);
    assert.ok(used, "출고한 부품이 목록에 없다");
    assert.equal(used.owner, "DSS");
    assert.equal(used.quantity, 2);
    assert.equal(Number(used.unitPrice), 125000);
  });

  test("🔴 단가를 정하지 않은 부품은 null 이다 — 0 이 아니다", async () => {
    const partId = await createTestPart("unpriced");
    await insertIssuedRequest([{ partId, owner: "DSS", issued: 1 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    const used = found.usedParts.find((p) => p.partId === partId);
    assert.ok(used);
    assert.equal(used.unitPrice, null, "정하지 않은 단가는 null 이어야 한다");
  });

  test("0원(무상)으로 정해 둔 단가는 그대로 온다 — 정하지 않음과 다르다", async () => {
    const partId = await createTestPart("free");
    await setUnitPrice(partId, "0");
    await insertIssuedRequest([{ partId, owner: "DSS", issued: 1 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    const used = found.usedParts.find((p) => p.partId === partId);
    assert.ok(used);
    assert.notEqual(used.unitPrice, null, "0 은 null 이 아니다");
    assert.equal(Number(used.unitPrice), 0);
  });

  test("같은 부품이 두 소유구분으로 나가면 두 줄이다 — 어디서 나갔는지가 남는다", async () => {
    const partId = await createTestPart("two-owners");
    // 🔴 단가는 부품마다 하나이므로 두 줄에 **같은 값**이 붙는다. 줄이 갈리는
    // 것은 단가 때문이 아니라 소유구분을 화면에 보여 주기 위해서다.
    await setUnitPrice(partId, "100");
    // ⚠️ 요청 **하나**에는 같은 부품이 한 번만 들어간다
    // (inventory_part_request_items_request_part_unique). 소유구분이 다르면
    // 요청 자체가 갈린다 — 실제로도 DSS 것을 받고 나서 교산 것을 따로 청구한다.
    await insertIssuedRequest([{ partId, owner: "DSS", issued: 1 }]);
    await insertIssuedRequest([{ partId, owner: "KYOSAN", issued: 3 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    const rows = found.usedParts
      .filter((p) => p.partId === partId)
      .map((p) => [p.owner, p.quantity, Number(p.unitPrice)]);
    assert.equal(rows.length, 2, "두 줄이어야 한다");
    assert.deepEqual(rows.sort(), [
      ["DSS", 1, 100],
      ["KYOSAN", 3, 100],
    ]);
  });

  test("🔴 소유구분이 없는 옛 요청에도 단가가 붙는다 — 부품 하나에 값이 하나다", async () => {
    const partId = await createTestPart("no-owner");
    await setUnitPrice(partId, "555");
    await insertIssuedRequest([{ partId, owner: null, issued: 1 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    const used = found.usedParts.find((p) => p.partId === partId);
    assert.ok(used);
    assert.equal(used.owner, null);
    // 소유구분 축이 있던 시절에는 어느 줄의 값인지 고를 수 없어 빈칸이었다.
    // 이제 고를 일이 없으므로, 사람이 다시 찾아 적지 않아도 된다.
    assert.equal(Number(used.unitPrice), 555);
  });

  test("출고되지 않은 요청은 세지 않는다 — 쓰지도 않은 값을 청구하면 안 된다", async () => {
    const partId = await createTestPart("not-issued");
    await insertIssuedRequest([{ partId, owner: "DSS", issued: 0, requested: 5 }]);

    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    assert.equal(
      found.usedParts.some((p) => p.partId === partId),
      false,
      "출고량 0 인 줄이 목록에 있다"
    );
  });

  test("🔴 O/H 템플릿 칸도 함께 온다 — 조회를 쪼개지 않았다(이 저장소에서 더한 단언)", async () => {
    // A/S 에는 없는 단언이다. 이 조각의 지시가 「조회를 쪼개지 마라」였고, 폼이
    // 아직 그 값을 그리지 않으므로(참고 목록은 뒤쪽 절반) **화면으로는 빠진 것을
    // 알 수 없다.** 그래서 모양이 살아 있는지 여기서 본다.
    //
    // 이 시험의 제품은 제품 모델(`product_model_id`)을 잇지 않으므로 템플릿이
    // 안 붙는 것이 정상이다 — 그때 코드는 null, 목록은 빈 배열이다.
    const found = await lookupIntakeForQuote(intakeNumber);
    assert.ok(found);
    assert.equal(found.ohTemplateCode, null);
    assert.deepEqual(found.ohTemplateParts, []);
  });
});
