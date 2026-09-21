import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq, sql } from "drizzle-orm";
import { productModels } from "@dss/core/schema";

import { db, pgClient } from "./index";

/**
 * ============================================================================
 * 길이 통하는지 보는 가장 단순한 시험 — 읽고 · 넣고 · 지우고 · 사라진 것을 본다
 * ============================================================================
 * 이 저장소에서 **DB 에 실제로 쓰는 첫 시험**이다. 견적서나 내자와는 상관이 없다.
 * 장치(부트스트랩 · 안전장치 · 목록 · 스크립트)가 갖춰졌는지만 증명한다.
 *
 * 표로 `product_models` 를 고른 이유: 넣을 때 다른 표를 하나도 요구하지 않는다
 * (필수 칸이 model_name 하나뿐이고 id 는 DB 가 만든다). 그래서 이 시험이 실패하면
 * 원인은 「길이 안 통한다」이지 「자료가 모자란다」가 아니다.
 *
 * 🔴 여기서 만든 줄은 **이 시험이 스스로 지운다.** 도중에 실패해 남더라도 아래
 *    after() 가 같은 표시를 가진 줄만 골라 치운다. 표시는 실행마다 새 UUID 라
 *    다른 자료와 절대 겹치지 않는다.
 *
 * 목록 `db`(scripts/test-lists/db.txt)에 있고 `npm run test:db` 가 돌린다.
 * 돌리기 전에 A/S 에서 시험 DB 를 준비해야 한다 — docs/DB_TESTS.md.
 * ============================================================================
 */

/** 이 실행이 만든 줄임을 알아보는 표시. 실행마다 새로 만든다. */
const MARKER = `DSS-PO-ROUNDTRIP-${randomUUID()}`;

after(async () => {
  // 시험이 도중에 깨졌더라도 이 표시를 가진 줄은 남기지 않는다.
  await db.delete(productModels).where(eq(productModels.modelName, MARKER));
  // 풀을 닫지 않으면 node --test 가 끝나고도 돌아오지 않는다.
  await pgClient.end({ timeout: 5 });
});

test("🔴 붙어 있는 DB 의 이름이 _test 로 끝난다", async () => {
  const rows = await db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = String((rows as unknown as { name: string }[])[0]?.name ?? "");
  assert.ok(name.length > 0, "current_database() 가 비었습니다.");
  assert.ok(
    name.toLowerCase().endsWith("_test"),
    `시험이 시험 DB 가 아닌 곳에 붙어 있습니다: ${name}`,
  );
});

test("표를 읽는다", async () => {
  const rows = await db
    .select({ id: productModels.id })
    .from(productModels)
    .limit(1);
  assert.ok(Array.isArray(rows));
});

test("한 줄 넣고 → 읽고 → 지우고 → 사라진 것을 본다", async () => {
  const inserted = await db
    .insert(productModels)
    .values({ modelName: MARKER })
    .returning({ id: productModels.id });
  assert.equal(inserted.length, 1);
  const id = inserted[0].id;

  const found = await db
    .select({ id: productModels.id, modelName: productModels.modelName })
    .from(productModels)
    .where(eq(productModels.id, id));
  assert.equal(found.length, 1);
  assert.equal(found[0].modelName, MARKER);

  // 🔴 반드시 방금 넣은 줄 하나로 범위를 좁혀 지운다.
  await db.delete(productModels).where(eq(productModels.id, id));

  const gone = await db
    .select({ id: productModels.id })
    .from(productModels)
    .where(eq(productModels.id, id));
  assert.equal(gone.length, 0);
});
