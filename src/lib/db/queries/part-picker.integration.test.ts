import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

import { partOverhaulUnitPrices, partUnitPrices, parts, users } from "@dss/core/schema";
import { db, pgClient } from "@/lib/db";
import { getPartPickerList, getPartPickerUnitPrices } from "./inventory";

/**
 * ============================================================================
 * 부품 고르개의 두 목록 — 진짜 DB 에서 재는 것 (조각 3b-3 뒤쪽 절반, 커밋 ①)
 * ============================================================================
 * 🔴 **A/S 에는 이 시험이 없다**(2026-09-22 확인 — 저쪽은 컴포넌트 시험
 * `components/inventory/part-picker.test.tsx` 와 소스 시험으로만 이 둘을 덮는다).
 * 여기서 새로 적는 까닭은 두 조회의 요점이 **어떤 칸을 싣지 않는가**와 **null 과
 * "0" 을 가르는가**인데, 그 둘은 글자를 읽어서는 절반만 볼 수 있기 때문이다:
 * SQL 이 실제로 무엇을 돌려주는지가 답이다.
 *
 * 재는 것 넷.
 *
 *  1. 🔴 **고르개 목록에 재고 · 소유구분 · 내부 비고가 없다.** 화면에서 안 그리는
 *     것으로는 모자라다 — 조회가 이미 실어 보낸 뒤다. 그래서 **돌아온 객체의 칸
 *     이름**을 센다(queries/inventory.ts 머리말).
 *  2. 지워진 부품은 고를 수 없다(is_deleted = true 는 목록에 없다).
 *  3. 🔴 **단가가 하나도 없는 부품은 단가 목록에서 빠진다** — 없는 것을 "0" 으로
 *     채우지 않는다. 고르개에서 「줄이 없다」가 곧 「정하지 않았다」이고, 0 으로
 *     채우면 견적서가 그 부품을 0원으로 청구한다.
 *  4. 🔴 **일반 단가와 O/H 단가가 서로를 대신하지 않는다.** 한쪽만 적어 둔 부품은
 *     다른 쪽이 null 로 온다 — 그래야 O/H 줄이 일반 단가를 달고 나가지 않는다.
 *
 * ── 🔴 격리 이름을 다른 스위트와 겹치지 않게 두었다 ─────────────────────────
 * 부품명 접두사 `po-test-picker-` 하나만 쓴다(A/S 도, 이 저장소의 앞선 두
 * 스위트도 쓰지 않는 글자다 — 저쪽은 `test-quote-lookup-`, 이웃은
 * `po-test-lookup-`). **같은 `dss_as_test` 를 여러 저장소가 쓰므로**(docs/DB_TESTS.md)
 * 겹치면 한쪽 after() 가 다른 쪽이 만든 줄을 치운다.
 *
 * 🔴 **고객사 · 제품 · 수리 건을 만들지 않는다.** 이 두 조회는 `parts` 와 단가 표
 * 둘만 읽는다 — 만들면 지울 책임만 생긴다.
 * ============================================================================
 */

const TEST_PART_PREFIX = "po-test-picker-";

let actorUserId: string;
const createdPartIds: string[] = [];

/**
 * 부품 한 줄. 🔴 **`createPart` 대신 직접 넣는다** — 이 저장소에는 재고 등록
 * mutation 이 없다(재고 화면은 A/S 에 남는다). 이 시험이 보는 것은 등록 규칙이
 * 아니라 **조회가 어떤 칸을 싣는가**다(이웃 quote-intake-lookup.integration.test.ts
 * 의 같은 판단).
 */
async function createTestPart(
  label: string,
  extra: { partSpec?: string | null; drawingNo?: string | null; kyosanPartNo?: string | null; isDeleted?: boolean } = {}
): Promise<string> {
  const [row] = await db
    .insert(parts)
    .values({
      partName: `${TEST_PART_PREFIX}${label}-${randomUUID().slice(0, 6)}`,
      partSpec: extra.partSpec ?? null,
      drawingNo: extra.drawingNo ?? null,
      kyosanPartNo: extra.kyosanPartNo ?? null,
      category: "TEST",
      isDeleted: extra.isDeleted ?? false,
      // 🔴 내부 비고를 **일부러 채운다** — 조회가 그것을 실어 보내지 않는지 보려면
      //    값이 있어야 한다. 비어 있으면 「안 왔다」가 아무것도 증명하지 않는다.
      notes: "내부 비고 — 견적서 화면으로 나가서는 안 되는 글자",
    })
    .returning({ id: parts.id });
  createdPartIds.push(row.id);
  return row.id;
}

async function setUnitPrice(partId: string, unitPrice: string) {
  await db.insert(partUnitPrices).values({ partId, unitPrice, updatedBy: actorUserId });
}

async function setOverhaulUnitPrice(partId: string, unitPrice: string) {
  await db.insert(partOverhaulUnitPrices).values({ partId, unitPrice, updatedBy: actorUserId });
}

before(async () => {
  // 단가 표 둘의 updated_by 는 users 를 RESTRICT 로 가리킨다 — 실재하는 계정이어야
  // 한다. 역할은 상관없다(인가는 서버 액션·페이지의 몫이다).
  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.approvalStatus, "APPROVED"), eq(users.isDeleted, false)))
    .limit(1);
  assert.ok(actor, "expected at least one approved user in the test DB");
  actorUserId = actor.id;
});

after(async () => {
  if (createdPartIds.length > 0) {
    // 단가 둘은 ON DELETE CASCADE 라 함께 사라진다.
    await db.delete(parts).where(inArray(parts.id, createdPartIds));
  }
  // 앞선 실행이 중간에 죽어 남긴 줄까지 접두사로 치운다.
  await db.delete(parts).where(like(parts.partName, `${TEST_PART_PREFIX}%`));
  await pgClient.end({ timeout: 5 });
});

describe("getPartPickerList — 고르기 위한 가벼운 목록", () => {
  test("🔴 칸이 다섯뿐이다 — 재고 · 소유구분 · 내부 비고가 오지 않는다", async () => {
    const partId = await createTestPart("columns", {
      partSpec: "20kW",
      drawingNo: "D-9001",
      kyosanPartNo: "KY-9001",
    });

    const list = await getPartPickerList();
    const row = list.find((part) => part.id === partId);
    assert.ok(row, "만든 부품이 목록에 없다");
    assert.deepEqual(
      Object.keys(row).sort(),
      ["drawingNo", "id", "kyosanPartNo", "partName", "partSpec"],
      "🔴 칸이 늘었다 — 화면에서 안 그리는 것으로는 모자라다, 조회가 이미 실어 보낸 뒤다"
    );
    assert.equal(row.partSpec, "20kW");
    assert.equal(row.drawingNo, "D-9001");
    assert.equal(row.kyosanPartNo, "KY-9001");
  });

  test("지워진 부품은 고를 수 없다", async () => {
    const livingId = await createTestPart("living");
    const deletedId = await createTestPart("deleted", { isDeleted: true });

    const ids = new Set((await getPartPickerList()).map((part) => part.id));
    assert.ok(ids.has(livingId), "살아 있는 부품이 빠졌다");
    assert.equal(ids.has(deletedId), false, "지운 부품을 견적서에서 고를 수 있다");
  });

  /*
   * 🔴 **차례는 여기서 재지 않는다.** 품명 차례(ORDER BY part_name)를 진짜 DB 에서
   * 재려면 JS 의 글자 비교와 Postgres 의 collation 이 같아야 하는데, 한글 · 대소문자가
   * 섞인 실제 부품명에서 그 둘은 어긋난다 — 코드가 맞는 날에도 붉어지는 시험이 된다.
   * `.orderBy(parts.partName)` 이 있는지는 소스 시험이 본다
   * (components/quotes/quote-part-picker-wiring.test.ts).
   */
});

describe("getPartPickerUnitPrices — 고를 때 채울 단가", () => {
  test("🔴 단가가 하나도 없는 부품은 아예 빠진다 — 0 으로 채우지 않는다", async () => {
    const partId = await createTestPart("unpriced");

    const rows = await getPartPickerUnitPrices();
    assert.equal(
      rows.some((row) => row.partId === partId),
      false,
      "🔴 단가를 정하지 않은 부품이 목록에 있다 — 고르개가 그것을 0원으로 읽는다"
    );
  });

  test("🔴 일반 단가만 적어 둔 부품은 O/H 단가가 null 이다 — 대신 쓰지 않는다", async () => {
    const partId = await createTestPart("plain-only");
    await setUnitPrice(partId, "125000");

    const row = (await getPartPickerUnitPrices()).find((price) => price.partId === partId);
    assert.ok(row, "단가를 적어 둔 부품이 목록에 없다");
    assert.equal(Number(row.unitPrice), 125000);
    assert.equal(row.overhaulUnitPrice, null, "🔴 O/H 단가가 일반 단가로 채워졌다");
  });

  test("🔴 O/H 단가만 적어 둔 부품은 일반 단가가 null 이다", async () => {
    const partId = await createTestPart("oh-only");
    await setOverhaulUnitPrice(partId, "98000");

    const row = (await getPartPickerUnitPrices()).find((price) => price.partId === partId);
    assert.ok(row);
    assert.equal(row.unitPrice, null);
    assert.equal(Number(row.overhaulUnitPrice), 98000);
  });

  test('0원(무상)으로 정해 둔 단가는 그대로 온다 — "정하지 않음"과 다르다', async () => {
    const partId = await createTestPart("free");
    await setUnitPrice(partId, "0");

    const row = (await getPartPickerUnitPrices()).find((price) => price.partId === partId);
    assert.ok(row, "🔴 0원으로 정해 둔 부품이 빠졌다 — 무상 부품은 실제 값이다");
    assert.equal(Number(row.unitPrice), 0);
  });

  test("🔴 칸이 셋뿐이다 — 재고 · 소유구분 · 내부 비고가 오지 않는다", async () => {
    const partId = await createTestPart("both");
    await setUnitPrice(partId, "1000");
    await setOverhaulUnitPrice(partId, "2000");

    const row = (await getPartPickerUnitPrices()).find((price) => price.partId === partId);
    assert.ok(row);
    assert.deepEqual(Object.keys(row).sort(), ["overhaulUnitPrice", "partId", "unitPrice"]);
  });

  test("지워진 부품의 단가는 오지 않는다 — 고를 수 없는 부품이다", async () => {
    const partId = await createTestPart("deleted-priced", { isDeleted: true });
    await setUnitPrice(partId, "50000");

    assert.equal(
      (await getPartPickerUnitPrices()).some((price) => price.partId === partId),
      false
    );
  });

  test("부품 하나에 줄이 하나다 — 두 표를 조인해도 줄이 늘지 않는다", async () => {
    const partId = await createTestPart("single-row");
    await setUnitPrice(partId, "7000");
    await setOverhaulUnitPrice(partId, "8000");

    const rows = (await getPartPickerUnitPrices()).filter((price) => price.partId === partId);
    assert.equal(rows.length, 1, "같은 부품이 여러 줄로 온다 — 고르개가 어느 줄을 볼지 알 수 없다");
  });
});
