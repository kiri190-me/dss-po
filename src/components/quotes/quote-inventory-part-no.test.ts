import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { partPickPatch } from "@dss/core/ui/inventory/part-picker";
import type { PartPickerPriceRow, PartPickerRow } from "@dss/core/ui/inventory/part-picker-rows";
import type { QuoteEditData, QuoteEditItemLine } from "@/lib/db/queries/quotes";
import { cableQuoteInputOf } from "@/lib/server/services/quote-workbook";
import { isValidQuoteId, validateQuoteFields } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 🔴 견적서 줄이 **재고 관리의 부품 번호**를 제 칸에 담는다 (2026-10-17)
 * ============================================================================
 * ── 무엇이 망가져 있었나 ────────────────────────────────────────────────────
 * 앞 조각이 부품 고르개를 재고 관리 통로로 옮기면서, 고르개가 돌려주는 `option.id` 가
 * **재고 관리의 부품 번호**(`"1"` · `"2"` 같은 정수 글자)가 되었다. 공용 고르개는 고른
 * 줄에 부을 조각을 `{ partNameText, partId: option.id, unitPrice? }` 로 돌려주는데,
 * 폼이 그것을 **그대로** 줄에 부어 저장까지 보냈다. 저장 검증의 `isValidQuoteId` 는
 * **UUID 만** 통과시키므로 —
 *
 *   🔴 **고르개로 부품을 고른 줄이 하나라도 있는 견적서는 저장이 거절됐다**
 *      (「N번째 부품의 재고 연결을 확인할 수 없습니다.」).
 *
 * 🔴 **앞 조각은 시험 2,202개를 전부 통과했다.** 검색은 눌러 봤고 저장은 안 눌렀기
 *    때문이다. 그래서 이 시험의 첫 묶음은 **그 결함을 그대로 재현한다** — 번호를
 *    `partId` 에 넣던 옛 길로 되돌리면 여기가 붉어진다.
 *
 * ── 어떻게 갈랐나 ───────────────────────────────────────────────────────────
 *   · `partId`           — **이 DB 의 부품 표**를 가리키는 UUID(FK). 고르개로 고른
 *                          줄에서는 **언제나 null** 이다.
 *   · `inventoryPartNo`  — **다른 시스템(재고 관리)의 번호**. FK 가 없는 정수 칸이다.
 *   뜻이 다르므로 칸도 검증도 따로다. 옮기는 자리는 폼의 `pickedPartPatch` 한 곳이고,
 *   🔴 **`vendor/` 의 고르개는 한 글자도 안 고쳤다**(A/S 도 같이 쓰는 별도 저장소다).
 *
 * ── 왜 폼을 렌더하지 않는가 ─────────────────────────────────────────────────
 * QuoteEditForm 은 서버 액션을 직접 import 하는 클라이언트 컴포넌트라 `npm test` 에서는
 * import 자체가 던진다. 이웃 시험들과 같은 방법으로 **원본을 글자로 읽는다**
 * (quote-part-picker-wiring.test.ts 머리말의 그 항목). 🔵 값으로 잴 수 있는 것은
 * **전부 값으로 잰다** — 검증 · 되읽기 · 엑셀 입력은 실제로 돌려 본다.
 *
 * 🔴 **값은 전부 지어낸 것이다** — 실제 고객사 · 모델 · L/N · S/N 은 공개 저장소에
 *    적지 않는다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

const formSource = read("src/components/quotes/QuoteEditForm.tsx");
const form = flat(formSource);

/** 두 표지 **사이**의 글자. 없으면 바로 멈춘다 — 조용히 빈 글자를 재면 전부 통과한다. */
function sliceBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `표지를 못 찾았다: ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `닫는 표지를 못 찾았다: ${to}`);
  return source.slice(start, end);
}

/**
 * 재고 관리에서 받아 온 부품 한 줄. 🔴 **`id` 가 재고 관리의 번호**다 — 이 사이트가
 * 2026-10-17 부터 받는 모양이고, UUID 가 아니라는 것이 이 시험의 출발점이다.
 */
const OPTION: PartPickerRow = {
  id: "11",
  partName: "시험용 발진관 조립품",
  partSpec: "TEST-2M-001",
  drawingNo: "DWG-TEST-1001",
  kyosanPartNo: "KY-TEST-7788",
};

const PRICES: PartPickerPriceRow[] = [{ partId: "11", unitPrice: "125000", overhaulUnitPrice: "98000" }];

/** 필수 넷. 🔵 전부 지어낸 값이다. */
const MINIMAL = {
  quoteNumber: "DSS 2026-901",
  quoteDate: "2026-10-17",
  customerNameText: "가상전자 주식회사",
  subject: "시험용 수리 견적",
};

/** 고르개가 줄에 부으라고 돌려주는 조각 — 폼이 받는 그 값 그대로다. */
const patch = partPickPatch(OPTION, { prices: PRICES });

describe("① 🔴 고르개로 고른 줄이 저장된다 — 2026-10-17 에 막혀 있던 그 길", () => {
  test("🔴 고르개가 주는 `partId` 는 **UUID 가 아니다** — 결함의 뿌리", () => {
    assert.equal(patch.partId, "11", "고르개가 재고 관리 번호를 열쇠로 주지 않는다");
    assert.equal(
      isValidQuoteId(patch.partId),
      false,
      "이 값이 UUID 로 통과하면 두 칸을 가를 까닭 자체가 없다"
    );
  });

  test("🔴 **옛 길은 거절된다** — 그 번호를 FK 칸에 넣으면 저장이 막힌다", () => {
    const result = validateQuoteFields({
      ...MINIMAL,
      // 🔴 2026-10-17 까지 폼이 하던 그대로. 되돌리면 사용자가 다시 겪는다.
      items: [{ partId: patch.partId, partNameText: patch.partNameText, quantity: 1, unitPrice: "125000" }],
    });
    assert.equal(result.ok, false, "UUID 가 아닌 값이 재고 연결 칸을 통과했다");
    assert.ok(!result.ok);
    assert.match(result.fieldErrors["items.0.partId"], /재고 연결을 확인할 수 없습니다/);
  });

  test("🔴 **새 길은 저장된다** — 번호가 제 칸으로 가면 통과하고 값도 남는다", () => {
    const result = validateQuoteFields({
      ...MINIMAL,
      items: [
        {
          // 🔴 고른 줄의 FK 칸은 **언제나 비어 있다**(폼의 pickedPartPatch).
          partId: null,
          partNameText: patch.partNameText,
          quantity: 1,
          unitPrice: patch.unitPrice ?? "125000",
          inventoryPartNo: patch.partId,
        },
      ],
    });
    assert.ok(result.ok, `고른 줄이 저장되지 않는다: ${JSON.stringify(result)}`);
    assert.equal(result.data.items[0].partId, null);
    assert.equal(result.data.items[0].inventoryPartNo, 11, "번호가 저장에 안 실린다");
  });

  test("🔴 폼이 고르개의 조각을 **그대로 붓지 않는다** — 옮기는 자리가 한 곳이다", () => {
    /**
     * ⚠️ 2026-10-17 — 옮기는 함수가 **폼에서 모듈로 갔다**
     * (`components/quotes/quote-part-pick.ts`). 같은 값을 쓰는 규칙들(상세를 그릴지 ·
     * 이름을 고쳤는지 · 다시 열 때 기억을 되살리기)이 한 곳에 모여야 갈리지 않는다.
     * 🔴 **막으려던 것은 그대로다** — FK 칸을 비우고 번호를 제 칸으로 옮긴다. 자리가
     *    바뀌었으니 **그 자리에서** 잰다.
     */
    const mover = flat(read("src/components/quotes/quote-part-pick.ts"));
    const moverAt = mover.indexOf("export function pickedPartPatch(");
    assert.notEqual(moverAt, -1, "옮기는 함수가 없다 — 고르개의 조각이 어딘가에서 그대로 부어진다");
    const body = mover.slice(moverAt, moverAt + 400);
    assert.ok(body.includes("partId: null,"), "FK 칸을 비우지 않는다 — 저장이 다시 막힌다");
    assert.ok(body.includes("inventoryPartNo"), "번호를 옮겨 담지 않는다");
    // 🔴 폼은 그 함수를 **들여와서** 쓴다 — 제 손으로 다시 적으면 두 벌이 된다.
    assert.ok(
      formSource.includes('} from "@/components/quotes/quote-part-pick";'),
      "폼이 그 모듈에서 들여오지 않는다"
    );
    assert.ok(!form.includes("function pickedPartPatch("), "폼에 사본이 남아 있다");

    /**
     * ⚠️ 2026-10-17(둘째) — 폼은 그 함수를 **직접 부르지 않는다.** 같은 날 더한
     * `quotePartPickPatch`(「부품이 바뀌면 단가도 따라간다」)가 고르개 호출부터 이 옮김까지
     * 한 묶음으로 한다. 🔴 **막으려던 것은 그대로다** — 그래서 **그 함수 몸통 안**에서 잰다.
     */
    const picking = mover.slice(
      mover.indexOf("export function quotePartPickPatch("),
      mover.indexOf("export function quotePartNameEditPatch(")
    );
    assert.ok(picking.includes("export function quotePartPickPatch("), "고르는 함수가 없다");
    assert.ok(picking.includes("pickedPartPatch( partPickPatch("), "고른 조각이 그대로 줄에 부어진다");

    const pick = sliceBetween(form, "onPick={(option) => {", "setPartPickerKey(null); }}");
    assert.ok(pick.includes("quotePartPickPatch(row, option, {"), "폼이 그 길로 안 지난다");
    assert.ok(!pick.includes("partId: option.id"), "🔴 고른 줄의 번호가 FK 칸으로 간다");
  });

  test("🔴 `vendor/` 의 고르개는 **안 고쳤다** — A/S 도 같이 쓰는 별도 저장소다", () => {
    const picker = flat(read("vendor/dss-core/src/ui/inventory/part-picker.tsx"));
    assert.ok(
      picker.includes("const picked = { partNameText: partPickName(option, nameSource), partId: option.id };"),
      "공용 고르개를 고쳐서 풀었다 — 저쪽이 같이 흔들린다"
    );
  });
});

describe("② 🔴 맞으면 되나 · 틀리면 안 되나", () => {
  /** 번호 한 칸만 바꿔 가며 재는 장 — 나머지는 통과하는 값이다. */
  const withNo = (inventoryPartNo: unknown) =>
    validateQuoteFields({
      ...MINIMAL,
      items: [{ partNameText: "시험용 부품", quantity: 1, unitPrice: "1000", inventoryPartNo }],
    });

  test("🔴 번호가 아닌 값은 **거절한다** — 0 으로 접지 않는다", () => {
    for (const bad of [0, -1, 1.5, "아무 글자", 2_147_483_648]) {
      const result = withNo(bad);
      assert.equal(result.ok, false, `'${bad}' 를 번호로 받아 버렸다`);
      assert.ok(!result.ok);
      assert.match(
        result.fieldErrors["items.0.inventoryPartNo"] ?? "",
        /재고 관리 부품 번호/,
        `'${bad}' 를 거절은 했는데 어느 칸인지 안 알려 준다`
      );
    }
  });

  test("🔵 빈 값 셋은 **「없다」이지 오류가 아니다** — 손으로 적은 줄 · 옛 줄이 그렇다", () => {
    for (const empty of [null, undefined, ""]) {
      const result = withNo(empty);
      assert.ok(result.ok, `${String(empty)} 를 오류로 세웠다: ${JSON.stringify(result)}`);
      assert.equal(result.data.items[0].inventoryPartNo, null);
    }
  });

  test("🔵 글자로 온 번호는 받는다 — 화면은 고르개의 열쇠를 **글자로** 들고 다닌다", () => {
    const result = withNo("11");
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.data.items[0].inventoryPartNo, 11);
  });

  test("🔴 **설명 줄에는 실리지 않는다** — 그 줄에는 부품이 없다", () => {
    // 🔴 DB 의 CHECK(quote_items_inventory_part_no_item_line_only)가 마지막으로 막지만,
    //    거기서 걸리면 사람에게는 알 수 없는 오류로 보인다. 코드가 **먼저** 걸러야 한다.
    const result = validateQuoteFields({
      ...MINIMAL,
      items: [
        { kind: "NOTE", partNameText: "* 아래는 별도 주문품", quantity: null, unitPrice: null, inventoryPartNo: 11 },
      ],
    });
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.data.items[0].inventoryPartNo, null, "설명 줄에 재고 관리 번호가 실렸다");
  });
});

describe("③ 🔴 다시 열어도 살아 있다 — 저장 → 되읽기 왕복", () => {
  test("🔴 저장된 번호가 **다음 저장까지 그대로** 간다", () => {
    const first = validateQuoteFields({
      ...MINIMAL,
      items: [
        {
          partId: null,
          partNameText: patch.partNameText,
          quantity: 1,
          unitPrice: "125000",
          inventoryPartNo: patch.partId,
        },
      ],
    });
    assert.ok(first.ok, JSON.stringify(first));
    const saved = first.data.items[0];

    /**
     * 조회가 돌려주는 줄(`QuoteEditItemLine`)을 폼이 펴는 **그 식 그대로**. 글자로
     * 되돌리지 않으면 되살린 줄만 `11 !== "11"` 로 어긋난다.
     */
    const reopened = saved.inventoryPartNo === null ? null : String(saved.inventoryPartNo);
    assert.equal(reopened, "11", "다시 연 줄에 번호가 없다");

    // 손도 안 대고 한 번 더 저장 — 번호가 조용히 사라지면 안 된다.
    const second = validateQuoteFields({
      ...MINIMAL,
      items: [
        { partId: null, partNameText: saved.partNameText, quantity: 1, unitPrice: "125000", inventoryPartNo: reopened },
      ],
    });
    assert.ok(second.ok, JSON.stringify(second));
    assert.equal(second.data.items[0].inventoryPartNo, 11, "다시 저장하니 번호가 날아갔다");
  });

  test("🔴 폼이 **펴는 자리**와 **싣는 자리**가 그 칸을 다룬다", () => {
    const restore = sliceBetween(form, "quote.itemLines.map((item) => ({", "}))");
    assert.ok(
      restore.includes("inventoryPartNo: item.inventoryPartNo === null ? null : String(item.inventoryPartNo),"),
      "다시 열 때 번호를 안 되살린다 — 저장하는 순간 영영 사라진다"
    );

    const collect = sliceBetween(form, "items: items .filter((row) => row.partNameText.trim()", "}), };");
    assert.ok(
      collect.includes("inventoryPartNo: isNote ? null : row.inventoryPartNo,"),
      "저장에 번호를 안 싣는다"
    );
  });

  test("🔵 **품명을 고쳐도 번호는 남는다** — FK 만 푼다(A/S 와 같다)", () => {
    /**
     * 🔵 이름을 손봐도 **그 줄이 그 부품에서 온 것은 사실**이다. 지우면 다시 열 때
     *    어느 부품에서 왔는지 알 길이 없어진다(A/S `quotePartNameEditPatch` 의 그 항목).
     *
     * ⚠️ 2026-10-17(둘째) — 그 조각을 만드는 일이 **모듈로 갔다**(`quotePartNameEditPatch`).
     * 같은 날 「상세가 사라지면 단가도 비운다」가 들어오면서 품명 칸의 onChange 가
     * 금액까지 건드리게 됐기 때문이다. 🔴 **번호를 안 지운다는 것은 그대로다.**
     */
    assert.ok(
      form.includes("updateItem(row.key, quotePartNameEditPatch(row, e.target.value));"),
      "글자를 칠 때 손대는 칸이 달라졌다"
    );
    const mover = flat(read("src/components/quotes/quote-part-pick.ts"));
    const editAt = mover.indexOf("export function quotePartNameEditPatch(");
    assert.notEqual(editAt, -1, "글자를 칠 때 부을 조각을 만드는 함수가 없다");
    const edit = mover.slice(editAt, editAt + 400);
    assert.ok(edit.includes("partId: null"), "글자를 쳐도 FK 를 안 푼다");
    assert.ok(!edit.includes("inventoryPartNo"), "이름만 고쳤는데 번호까지 지운다");
    assert.ok(!edit.includes("pickedPartNameText"), "이름만 고쳤는데 이름 기억까지 지운다");
  });

  test("🔴 불러오기로 담은 줄도 **같은 길로 번호가 남는다**", () => {
    for (const builder of ["function usedPartToItem(", "function ohTemplatePartToItem("]) {
      const body = sliceBetween(form, builder, "sourceKey: part.sourceKey,");
      assert.ok(body.includes("partId: null,"), `${builder} 가 FK 칸에 재고 번호를 넣는다`);
      assert.ok(body.includes("inventoryPartNo: option.id,"), `${builder} 가 번호를 안 남긴다`);
    }
  });
});

describe("④ 🔴 그 번호는 문서로 나가지 않는다", () => {
  /** 🔵 다른 값과 섞일 수 없는 번호다 — 금액 · 수량 · 글자 어디에도 안 나오는 자리를 골랐다. */
  const SECRET_NO = 987654;

  /** 🔴 문서 쪽이 받는 줄의 형에는 이 칸이 **없다** — 뚫렸다고 치고 일부러 실어 보낸다. */
  const leaky = (over: Partial<QuoteEditItemLine> = {}): QuoteEditItemLine => ({
    partId: null,
    kind: "ITEM",
    partNameText: "시험용 발진관 조립품",
    partSpecText: "TEST-2M-001",
    isOverhaulPart: false,
    quantity: 1,
    unitPrice: "125000",
    inventoryPartNo: SECRET_NO,
    ...over,
  });

  test("㉠ 🔴 조회가 **두 목록으로 가른다** — 문서 쪽 목록에 그 칸이 없다", () => {
    const queries = flat(read("src/lib/db/queries/quotes.ts"));
    const forDocument = sliceBetween(
      queries,
      "const items = itemRows.filter(isQuoteAmountItemLine)",
      "const itemLines ="
    );
    assert.ok(!forDocument.includes("inventoryPartNo"), "문서로 나가는 목록에 재고 관리 번호가 실린다");
    // 🔴 문서 쪽이 받는 형에도 그 칸이 없어야 한다 — 없어야 **읽는 일**이 컴파일에서 막힌다.
    const printableType = sliceBetween(queries, "export type QuotePrintableItemLine = {", "};");
    assert.ok(!printableType.includes("inventoryPartNo"), "문서 쪽 형에 그 칸이 들어갔다");
    // 🔵 고치는 쪽은 그 형에 칸 하나를 **더해서** 받는다.
    assert.ok(
      queries.includes("export type QuoteEditItemLine = QuotePrintableItemLine & { inventoryPartNo: number | null; };"),
      "고치는 쪽 형이 문서 쪽 형에서 갈라져 나오지 않는다"
    );
  });

  test("㉡ 🔴 문서를 만드는 자리들이 그 이름을 **한 번도 적지 않는다**", () => {
    for (const path of [
      "src/components/quotes/QuotePrintView.tsx",
      "src/lib/server/services/quote-workbook.ts",
      // 엑셀 네 양식 — 실제로 칸에 글자를 찍는 자리다.
      "src/lib/xlsx/quote-template.ts",
      "src/lib/xlsx/oh-quote-template.ts",
      "src/lib/xlsx/matcher-quote-template.ts",
      "src/lib/xlsx/cable-quote-template.ts",
    ]) {
      assert.ok(!read(path).includes("inventoryPartNo"), `${path} 가 재고 관리 번호를 읽는다`);
    }
  });

  test("㉢ 🔴 **엑셀로 넘어가는 값에 그 번호가 없다** — 값이 든 줄을 그대로 넣어 봐도", () => {
    /**
     * 🔴 **겉이 아니라 결과를 본다.** 위 ㉡ 은 글자를 읽을 뿐이라, 이름만 피해 가는 사고는
     * 못 잡는다. 여기서는 번호가 든 줄을 실제로 넣고 **나온 값**에 그 번호가 없는지 본다.
     *
     * 🔵 `QuoteEditData` 는 칸이 서른 남짓이고 이 함수가 읽는 것은 아홉뿐이라, 읽는 칸만
     *    채워 넘긴다(형을 억지로 맞추느라 시험이 무거워지면 아무도 안 고친다).
     */
    const quote = {
      quoteNumber: "DSS 2026-902",
      quoteDate: "2026-10-17",
      customerNameText: "가상전자 주식회사",
      subject: "시험용 케이블 견적",
      validity: null,
      delivery: null,
      payment: null,
      remarks: null,
      itemLines: [leaky(), leaky({ kind: "NOTE", partNameText: "* 안내", quantity: null, unitPrice: null })],
    } as unknown as QuoteEditData;

    const dumped = JSON.stringify(cableQuoteInputOf(quote));
    assert.ok(!dumped.includes(String(SECRET_NO)), "엑셀로 넘기는 값에 그 칸이 따라갔다");
    assert.ok(!dumped.includes("inventoryPartNo"), "엑셀로 넘기는 값에 그 칸 이름이 남았다");
    // 🔵 멀쩡한 값은 그대로 간다 — 「아무것도 안 나간다」로 통과하는 시험이 되지 않게.
    assert.ok(dumped.includes("시험용 발진관 조립품"), "품명까지 사라졌다");
    assert.ok(dumped.includes("* 안내"), "설명 줄까지 사라졌다");
  });
});
