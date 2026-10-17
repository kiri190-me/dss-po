import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canPickPartOption, partPickName } from "@dss/core/ui/inventory/part-picker";
import type { InventoryPart, InventoryStockRequest } from "@/lib/domain/inventory-gateway";
import { toQuoteUsedParts } from "@/lib/domain/quote-intake-parts";

/**
 * ============================================================================
 * 견적서의 「인수번호로 불러오기」가 **어디를 보고 있는가** (2026-10-17)
 * ============================================================================
 * 출고된 부품과 O/H 템플릿은 2026-10 에 **재고 관리로 옮겨갔는데** 이 사이트의 견적서만
 * 같은 DB 의 **A/S 제 표**를 읽고 있었고, 그 표에는 더 이상 아무것도 쌓이지 않는다.
 * 🔴 **오류가 아니라 「없음」으로 보이므로 사람은 그 말을 믿고 청구를 빠뜨린다.**
 *
 * 규칙 자체는 순수 쪽 시험이 값으로 잰다(`lib/domain/quote-intake-parts.test.ts`). 여기서는
 * **그 규칙을 화면과 서버 모듈이 실제로 쓰고 있는가**를 원본 글자로 본다 — 둘 중 하나만
 * 있으면 시험이 비어 있는 것과 같다(규칙은 맞는데 화면이 안 쓰거나, 화면은 부르는데 규칙이
 * 없다). QuoteEditForm 은 서버 액션을 부르는 클라이언트 컴포넌트라 이 환경에서 그려 볼 수
 * 없다(이웃 `quote-intake-lookup-source.test.ts` 머리말의 그 사정).
 *
 * 붙잡는 것 다섯:
 *  ㉠ **같은 DB 의 A/S 제 표를 보지 않는다** — 옛 조회도 소유구분 이름표도 남지 않았다.
 *  ㉡ **적힐 이름과 담을 수 있는가를 재는 자가 고르개의 것 하나다.**
 *     ⚠️ 2026-10-17 — 이 사이트도 `"customer"`(고객사 품명)를 넘긴다. 견적서는 고객사로
 *        나가는 서류라는 그 까닭이고, 자를 한 벌로 둔 덕에 고친 자리가 화면 한 곳이었다.
 *        그 결정 자체의 시험은 quote-part-pick.test.ts 의 ① 구역이다.
 *  ㉢ 🔴 **「못 받아 왔다」를 「없다」로 그리지 않는다** — 구역을 통째로 감추는 것도 그 말이다.
 *  ㉣ 담긴 줄의 **열쇠는 순수 쪽이 지은 것**이고, FK 칸(`partId`)에는 재고 번호를 넣지 않는다.
 *  ㉤ 서버 모듈이 **나란히 부르고**, 상단 정보는 재고 관리와 **무관하게** 채워진다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
const read = (relativePath: string) => readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
const flat = (source: string) => source.replace(/\s+/g, " ");
const indexOrFail = (source: string, marker: string) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `원본에서 '${marker}' 를 찾지 못했다`);
  return at;
};

const form = flat(read("src/components/quotes/QuoteEditForm.tsx"));
const loader = flat(read("src/lib/server/quote-intake-lookup.ts"));
const action = flat(read("src/lib/server/actions/quotes.ts"));
const query = flat(read("src/lib/db/queries/quotes.ts"));

describe("㉠ 🔴 같은 DB 의 A/S 제 표를 보지 않는다", () => {
  test("질의 모듈이 옛 재고 표를 한 줄도 읽지 않는다", () => {
    for (const forbidden of [
      "inventoryPartRequestItems",
      "inventoryPartRequests",
      "ohPartTemplateItems",
      "ohPartTemplateModels",
      "ohPartTemplates",
      "partOverhaulUnitPrices",
      "partUnitPrices",
    ]) {
      assert.ok(!query.includes(forbidden), `질의가 아직 ${forbidden} 를 읽는다`);
    }
  });

  test("🔴 질의 모듈은 바깥 시스템을 부르지 않는다 — 부르는 자리는 서버 모듈이다", () => {
    assert.ok(!query.includes("inventory-gateway"), "DB 질의 모듈이 재고 관리를 부른다");
    assert.ok(
      action.includes('import { loadQuoteIntakeLookup, type QuoteIntakeLookup } from "@/lib/server/quote-intake-lookup";'),
      "액션이 새 모듈을 부르지 않는다"
    );
    assert.ok(action.includes("found: await loadQuoteIntakeLookup(intakeNumber)"), "액션이 옛 조회를 그대로 돌려준다");
  });

  test("폼이 소유구분 이름표를 제 손으로 적지 않는다 — 소유는 재고 관리가 준 글자 그대로다", () => {
    assert.ok(!form.includes("stockOwnerLabelOrUnspecified"), "손으로 적은 소유구분 이름표가 남아 있다");
    assert.ok(!form.includes("STOCK_OWNER_LABELS"), "소유구분 이름표 사전이 남아 있다");
    assert.ok(form.includes("{part.ownerLabel"), "재고 관리가 준 소유 글자를 안 그린다");
  });
});

describe("㉡ 🔴 적힐 이름 · 담을 수 있는가 — 자는 고르개의 것 하나다", () => {
  test("폼이 고르개의 두 함수를 그대로 쓴다 — 판정을 손으로 다시 적지 않는다", () => {
    /* ⚠️ 2026-10-17 — 자에 **고객사 품명**이 들어갔다(쓰는 분 지적 ①). 견적서에 적히는
       이름이 고객사 품명이 되었으므로 불러온 줄도 같은 자로 잰다. 🔴 막으려던 것은
       그대로다 — **판정을 폼이 손으로 다시 적지 않는다.** 그 결정의 시험은
       quote-part-pick.test.ts 의 ① 구역이다. */
    /* 🔴 **판정하는 자리 안에서 잰다** — 파일 전체에서 글자를 찾으면 그 까닭을 적어 둔
       **주석**에 걸린다(2026-10-17 에 실제로 그렇게 통과했다). */
    const gate = form.slice(
      indexOrFail(form, "function canAddQuoteIntakeLine("),
      indexOrFail(form, "function canAddQuoteIntakeLine(") + 200
    );
    assert.ok(gate.includes('canPickPartOption(option, "customer")'), "담기 판정을 고르개 함수로 하지 않는다");
    assert.ok(
      form.includes('partPickName(option, "customer")'),
      "적힐 이름을 고르개 함수로 짓지 않는다"
    );
    // 🔴 옛 자가 한 자리도 남아 있으면 안 된다 — 남은 그 줄만 다른 이름을 쓴다.
    assert.ok(!form.includes("canPickPartOption(option)"), "아직 고객사 품명을 안 보는 판정이 있다");
    assert.ok(!form.includes("partPickName(option)"), "아직 우리 품명으로 짓는 자리가 있다");
    // 🔴 자가 두 벌이 되는 길 — 이름 칸을 폼에서 직접 재고 있으면 언젠가 갈린다.
    assert.ok(!form.includes("customerPartName ==="), "폼이 고객사 품명을 제 손으로 잰다");
    assert.ok(!form.includes("partFieldValue("), "폼이 「값이 있는가」를 제 손으로 잰다");
  });

  test("🔴 막는 자리가 **단추와 담기 함수 둘 다**다 — 단추를 안 그리는 것은 편의일 뿐이다", () => {
    // 담는 함수 둘이 각각 제 손으로 한 번 더 거른다(고르개가 `disabled` 와 `if (pickable)` 를
    // 둘 다 두는 그 까닭 — 울타리는 값이 들어가는 자리에 있어야 한다).
    assert.ok(
      form.includes(
        "const rows = list.flatMap((part) => canAddQuoteIntakeLine(part.option) ? [usedPartToItem(part, part.option)] : [] );"
      ),
      "출고 줄 담기가 거르지 않는다"
    );
    assert.ok(
      form.includes(
        "const rows = list.flatMap((part) => canAddQuoteIntakeLine(part.option) ? [ohTemplatePartToItem(part, part.option)] : [] );"
      ),
      "O/H 줄 담기가 거르지 않는다"
    );
  });

  test("🔴 막힌 줄에 **순수 쪽이 쥔 문구**를 적는다 — 두 벌로 적으면 언젠가 갈린다", () => {
    assert.ok(form.includes("USED_PART_NOT_IN_INVENTORY_MESSAGE"), "출고 줄의 문구를 글자로 다시 적었다");
    assert.ok(form.includes("OH_TEMPLATE_PART_NOT_LINKED_MESSAGE"), "템플릿 줄의 문구를 글자로 다시 적었다");
    assert.ok(
      !form.includes('"재고 관리의 부품 목록에서 찾지 못했습니다'),
      "같은 말을 폼에 글자로 다시 적어 두었다"
    );
  });

  test("🔵 막힌 줄을 **감추지 않는다** — 나간 부품이 목록에서 사라지면 청구를 빠뜨린다", () => {
    // 목록은 받아 온 줄 **전부**를 돈다. 거르는 것은 [전부 담기]가 세는 수뿐이다.
    assert.ok(form.includes("{usedParts.value.map((part) => {"), "출고 목록이 걸러진 줄만 그린다");
    assert.ok(form.includes("{ohTemplateParts.map((part) => {"), "O/H 목록이 걸러진 줄만 그린다");
    assert.ok(form.includes("const addableUsedParts = useMemo("), "담을 수 있는 줄을 따로 세지 않는다");
    assert.ok(form.includes("const addableOhTemplateParts = useMemo("), "담을 수 있는 줄을 따로 세지 않는다");
    assert.ok(form.includes("onClick={() => addUsedParts(addableUsedParts)}"), "일괄 담기가 막힌 줄까지 담으려 한다");
    assert.ok(form.includes("onClick={() => addOhTemplateParts(addableOhTemplateParts)}"), "일괄 담기가 막힌 줄까지 담으려 한다");
  });

  test("🔴 그 판정이 **실제로** 순수 매퍼가 만든 줄에 걸린다 — 값으로 확인한다", () => {
    // 🔵 순수 매퍼가 만든 줄을 고르개의 자로 직접 재어, 두 조각이 같은 칸을 보는지 못 박는다.
    const rows = toQuoteUsedParts(
      [stockRequest([{ no: 11, issued: 1 }, { no: 12, issued: 1 }])],
      [
        inventoryPart({ no: 11, name: "우리품명-A", customerName: "고객사품명-A" }),
        inventoryPart({ no: 12, name: "우리품명-B", customerName: "" }),
      ]
    );

    const byNo = new Map(rows.map((row) => [row.option?.id, row]));
    const option = (no: string) => {
      const found = byNo.get(no)?.option;
      assert.ok(found, `No. ${no} 줄이 없다`);
      return found;
    };

    // 🔴 2026-10-17 부터 이 사이트의 자도 `"customer"` 다 — 줄에 적히는 이름이 **고객사 품명**이다.
    assert.equal(canPickPartOption(option("11"), "customer"), true);
    assert.equal(partPickName(option("11"), "customer"), "고객사품명-A", "견적서에 다른 이름이 적힌다");
    // 🔴 고객사 품명이 **빈 줄은 담을 수 없다.** 🔵 그 밑줄은 「틀리면 안 되나」다 — 자를
    //    안 넘기던 때에는 그 줄도 통과했고, 그것이 쓰는 분이 본 화면이다.
    assert.equal(canPickPartOption(option("12"), "customer"), false, "고르개의 자가 고객사 품명을 안 본다");
    assert.equal(canPickPartOption(option("12")), true);
    // 🔵 못 담는 줄도 **목록에는 남아 있다** — 둘 다 왔다.
    assert.equal(rows.length, 2);
  });
});

describe("㉢ 🔴 「못 받아 왔다」를 「없다」로 그리지 않는다", () => {
  test('두 구역이 각각 `status !== "ok"` 갈래를 따로 그린다', () => {
    assert.ok(form.includes('{usedParts.status !== "ok" ? ('), "출고 구역에 못 받아 온 갈래가 없다");
    assert.ok(form.includes('{ohTemplate.status !== "ok" ? ('), "O/H 구역에 못 받아 온 갈래가 없다");
    assert.ok(form.includes("inventoryUnreachableMessage(usedParts.reason)"), "까닭을 사람 말로 적지 않는다");
    assert.ok(form.includes("inventoryUnreachableMessage(ohTemplate.reason)"), "까닭을 사람 말로 적지 않는다");
  });

  test("🔴 못 받아 왔으면 구역을 **감추지 않는다** — 감추는 것도 「없다」는 말이다", () => {
    assert.ok(
      form.includes('{!isCable && (usedParts.status !== "ok" || usedParts.value.length > 0) && ('),
      "못 받아 온 날 출고 구역이 통째로 사라진다"
    );
  });

  test("🔴 O/H 의 빈 상태 문구보다 **못 받아 온 갈래가 먼저**다", () => {
    // 뒤면 「이 모델에 템플릿이 이어져 있지 않습니다」가 떠서, 사람이 멀쩡히 이어 둔 설정을
    // 재고 관리에서 헛되게 뒤진다(A/S 가 2026-09-22 에 같은 자리에서 한 번 겪은 결함).
    assert.ok(
      indexOrFail(form, "O/H 부품 템플릿을 재고 관리에서 불러오지 못했습니다") <
        indexOrFail(form, "O/H 부품 템플릿이 이어져 있지 않습니다"),
      "순서가 거꾸로다"
    );
  });

  test("🔴 불러오기 알림도 그 사실을 말한다 — 「기록은 없습니다」로 적지 않는다", () => {
    const message = form.slice(
      indexOrFail(form, "function lookupResultMessage("),
      indexOrFail(form, "const NO_USED_PARTS")
    );
    assert.ok(message.includes('if (usedParts.status !== "ok") {'), "못 받아 온 갈래가 없다");
    assert.ok(message.includes("나간 부품이 없는 것이 아니라 확인하지 못한 것입니다"), "없는 것처럼 말한다");
    assert.ok(message.includes('if (ohTemplate.status !== "ok") {'), "O/H 쪽 갈래가 없다");
    // 「없습니다」는 받아 왔을 때만 하는 말이다 — 세 갈래의 **맨 끝**에 있다.
    assert.ok(
      message.indexOf("이 건에 출고된 부품 기록은 없습니다") > message.indexOf("확인하지 못한 것입니다"),
      "못 받아 온 갈래보다 「없습니다」가 먼저다"
    );
    assert.ok(
      form.includes("setLookupMessage(lookupResultMessage(found.usedParts, found.ohTemplate));"),
      "폼이 그 규칙을 안 쓴다"
    );
  });

  test("🔴 아직 안 불러온 것은 「받아 왔는데 없다」다 — 있지도 않은 사고를 알리지 않는다", () => {
    assert.ok(form.includes('const NO_USED_PARTS: InventoryResult<QuoteUsedPart[]> = { status: "ok", value: [] };'));
    assert.ok(
      form.includes('const NO_OH_TEMPLATE: InventoryResult<QuoteOhTemplate | null> = { status: "ok", value: null };')
    );
    // 못 찾음 · 오류 갈래가 비우는 자리도 이 둘이다(앞 건의 부품이 남아 담기면 청구가 틀린다).
    assert.equal(form.split("setUsedParts(NO_USED_PARTS);").length - 1, 2, "비우는 갈래가 둘이 아니다");
    assert.equal(form.split("setOhTemplate(NO_OH_TEMPLATE);").length - 1, 2, "비우는 갈래가 둘이 아니다");
  });
});

describe("㉣ 🔴 담은 줄의 열쇠와 FK 칸", () => {
  test("적히는 이름을 **고르개가 짓는다** — 폼이 품명을 제 손으로 잇지 않는다", () => {
    for (const builder of ["function usedPartToItem(", "function ohTemplatePartToItem("]) {
      const at = indexOrFail(form, builder);
      const body = form.slice(at, at + 800);
      /* ⚠️ 2026-10-17 — 같은 값을 **한 번만 셈해** 품명 칸과 이름 기억에 둘 다 쓴다
         (quote-part-pick.ts 의 `isPickedPartNameKept` — 둘이 다르면 담자마자 상세가
         사라진다). 🔴 막으려던 것은 그대로다 — **폼이 품명을 제 손으로 잇지 않는다.** */
      assert.ok(body.includes('const partNameText = partPickName(option, "customer");'), builder);
      assert.ok(body.includes("partNameText,"), builder);
    }
  });

  test("🔴 `partId` 는 비운다 — 재고 관리의 부품 번호는 `parts.id` 가 아니다", () => {
    // 🔴 넣으면 저장이 거절된다(validation/quote-input.ts 가 UUID 를 본다).
    // ⚠️ 2026-10-17 — 그 번호를 적어 둘 자리가 생겼다(`quote_items.inventory_part_no`).
    //    담은 줄도 **같은 길로** 번호를 남긴다 — 규칙과 까닭은 그 조각의 시험에 있다
    //    (quote-inventory-part-no.test.ts). 여기서는 **FK 칸이 비는 것**만 지킨다.
    for (const builder of ["function usedPartToItem(", "function ohTemplatePartToItem("]) {
      const at = indexOrFail(form, builder);
      const body = form.slice(at, at + 800);
      assert.ok(body.includes("partId: null,"), `${builder} 가 FK 칸에 재고 번호를 넣는다`);
    }
  });

  test("담긴 줄을 다시 안 담게 하는 열쇠는 **순수 쪽이 지은 것**을 그대로 쓴다", () => {
    assert.ok(form.includes("sourceKey: part.sourceKey,"), "폼이 열쇠를 제 손으로 다시 짓는다");
    assert.ok(!form.includes("function usedPartKey("), "옛 (부품, 소유구분) 열쇠가 남아 있다");
    assert.ok(!form.includes("function ohTemplatePartKey("), "옛 차례 열쇠가 남아 있다");
  });
});

describe("㉤ 서버 모듈 — 나란히 부르고, 상단 정보는 저쪽과 무관하다", () => {
  test("🔴 셋을 `Promise.all` 로 나란히 부른다", () => {
    assert.ok(
      loader.includes(
        "const [parts, template, requests] = await Promise.all([ fetchInventoryParts(), ohTemplatePromise, fetchInventoryStockRequestsByIntake(header.intakeNumber), ]);"
      ),
      "차례로 기다리면 저쪽이 느린 날 통로 수만큼 느려진다"
    );
  });

  test("🔴 모델이 안 붙은 개체는 저쪽을 **부르지 않는다** — 물을 열쇠가 없다", () => {
    assert.ok(
      loader.includes("const productModelId = productId === null ? null : await getProductModelIdForProduct(productId);"),
      "제품 모델 id 를 얻는 자리가 없다"
    );
    assert.ok(
      loader.includes(
        'productModelId === null ? Promise.resolve({ status: "ok", value: null }) : fetchInventoryOhTemplate(productModelId);'
      ),
      "모델이 없는데 저쪽을 부른다"
    );
    /* 🔵 **A/S 는 이 함수를 `db/queries/repair-cases.ts` 에 둔다.** 이 사이트에는 수리 건
       조회 모듈이 없어 같은 이름으로 견적서 질의 모듈에 두었다 — 지운 모델을 빼는 것까지
       저쪽과 같은 규칙이다(휴지통에 든 설정으로 청구하면 안 된다). */
    assert.ok(
      query.includes("export async function getProductModelIdForProduct(productId: string): Promise<string | null> {"),
      "제품 모델 id 를 읽는 질의가 없다"
    );
    assert.ok(
      query.includes("and(eq(products.id, productId), eq(productModels.isDeleted, false))"),
      "지운 제품 모델까지 열쇠로 내준다"
    );
  });

  test("🔴 제품 **개체 id** 는 화면으로 내려보내지 않는다 — 떼어 내는 자리가 있다", () => {
    assert.ok(loader.includes("const { productId, ...header } = found;"), "개체 id 가 그대로 화면으로 나간다");
    assert.ok(
      loader.includes('export type QuoteIntakeLookup = Omit<QuoteIntakeCase, "productId"> & {'),
      "타입에서 빠지지 않았다"
    );
  });

  test("🔴 **부품 마스터를 못 받아 왔으면 두 목록 다 「못 받아 왔다」**다", () => {
    // 품명 · 견적가 · 소유가 전부 그 마스터에서 온다 — 없는 채로 묶어 내려보내면 화면이
    // 「전부 담을 수 없다」고 그리고, 사람은 멀쩡한 이름을 찾아 헤맨다.
    assert.ok(
      loader.includes(
        'const usedParts: InventoryResult<QuoteUsedPart[]> = parts.status !== "ok" ? parts : requests.status !== "ok" ? requests : { status: "ok", value: toQuoteUsedParts(requests.value, parts.value) };'
      ),
      "출고 목록이 마스터 실패를 삼킨다"
    );
    assert.ok(
      loader.includes(
        'const ohTemplate: InventoryResult<QuoteOhTemplate | null> = parts.status !== "ok" ? parts : template.status !== "ok" ? template : { status: "ok", value: toQuoteOhTemplate(template.value, parts.value) };'
      ),
      "O/H 목록이 마스터 실패를 삼킨다"
    );
    // 🔴 어느 갈래도 빈 목록으로 바꾸지 않는다.
    assert.ok(!loader.includes("value: [] }"), "실패를 빈 목록으로 바꾸는 자리가 있다");
  });

  test("🔴 상단 정보는 저쪽이 꺼져 있어도 그대로 채워진다 — 통로 하나가 전체를 실패로 만들지 않는다", () => {
    assert.ok(loader.includes("return { ...header, usedParts, ohTemplate };"), "머리 칸을 조건부로 내려보낸다");
    // 못 받아 온 것을 이유로 통째로 null 을 돌려주는 길이 없다 — null 은 「건을 못 찾았다」뿐이다.
    assert.equal(loader.split("return null;").length - 1, 1, "못 받아 온 것을 「건이 없다」로 접는 자리가 있다");
    assert.ok(loader.includes("if (found === null) return null;"), "그 한 자리가 「건을 못 찾았다」가 아니다");
  });

  test("🔴 쓰는 통로를 만들지 않는다 — 이 사이트는 재고 관리에 아무것도 쓰지 않는다", () => {
    for (const write of ["method: \"POST\"", "method: \"PATCH\"", "INVENTORY_WRITE_TOKEN"]) {
      assert.ok(!loader.includes(write), `서버 모듈에 ${write} 가 생겼다`);
    }
  });
});

// ───────────────────────────── 값으로 재는 자리가 쓰는 재료 (지어낸 이름만 쓴다)

function inventoryPart(over: Partial<InventoryPart> & { no: number }): InventoryPart {
  return {
    name: `부품-${over.no}`,
    name2: "",
    customerName: "",
    kyosanPartNo: "",
    drawingNo: "",
    quantity: 0,
    note: "",
    owner: { code: "DSS", label: "DSS" },
    quotePrice: null,
    overhaulQuotePrice: null,
    ...over,
  };
}

function stockRequest(lines: { no: number; issued: number }[]): InventoryStockRequest {
  return {
    requestKey: null,
    id: "req-1",
    intakeNumber: "D260101",
    status: { code: "CONFIRMED", label: "확인" },
    closed: false,
    requestedAt: "2096-03-05T01:00:00.000Z",
    lines: lines.map((line) => ({
      no: line.no,
      name: `부품-${line.no}`,
      quantity: line.issued,
      issued: line.issued,
    })),
    decision: null,
    hold: null,
    requester: null,
  };
}
