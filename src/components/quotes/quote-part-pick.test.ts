import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { canPickPartOption, partPickName, partPickPatch } from "@dss/core/ui/inventory/part-picker";
import {
  PART_FIELD_LABELS,
  PART_FIELD_ORDER,
  type PartPickerPriceRow,
  type PartPickerRow,
} from "@dss/core/ui/inventory/part-picker-rows";
import {
  QUOTE_PICKED_PART_PREFIX,
  isPickedPartNameKept,
  pickedPartPatch,
  quotePickedPartDetail,
  quotePickedPartOf,
  quoteRestoredPickedPartName,
  type QuotePartPickRow,
} from "@/components/quotes/quote-part-pick";
import { CUSTOMER_NAME_EMPTY_NOTICE } from "@/lib/domain/inventory-gateway";
import { validateQuoteFields } from "@/lib/validation/quote-input";

/**
 * ============================================================================
 * 견적서 줄이 **고른 부품을 기억한다** (2026-10-17 쓰는 분이 짚은 결함 둘)
 * ============================================================================
 * 부품 고르개를 재고 관리 통로로 옮긴 뒤 화면을 보고 쓰는 분이 짚은 것이 둘이다 —
 *
 *  ① 「품명이 **고객사 품명**으로 표시돼야 하는데 그것도 안 되어 있다.」
 *  ② 「품명 칸 밑에 있던 **세부 정보가 안 나온다**.」
 *
 * 둘 다 A/S 에 이미 있는 기능이고(저쪽 커밋 `26d4d4c`), PO 로 옮길 때 빠졌다. 규칙은
 * `quote-part-pick.ts` 에 있고 여기서는 **그 규칙이 지켜지는가**와 **화면이 그것을 실제로
 * 쓰는가**를 함께 잰다 — 둘 중 하나만 재면 시험이 비어 있는 것과 같다(규칙은 맞는데 화면이
 * 안 쓰거나, 화면은 부르는데 규칙이 없다).
 *
 * ── 왜 폼을 렌더하지 않는가 ─────────────────────────────────────────────────
 * QuoteEditForm 은 서버 액션을 직접 import 하는 클라이언트 컴포넌트라 `npm test` 에서는
 * import 자체가 던진다. 이웃 시험들과 같은 방법으로 **원본을 글자로 읽는다**
 * (quote-inventory-part-no.test.ts 머리말의 그 항목). 🔵 값으로 잴 수 있는 것은 **전부
 * 값으로 잰다** — 고르기 · 되짚기 · 저장 검증은 실제로 돌려 본다.
 *
 * 🔴 **값은 전부 지어낸 것이다** — 실제 고객사 · 모델 · L/N · S/N 은 공개 저장소에 적지 않는다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");
const indexOrFail = (source: string, marker: string) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `원본에서 '${marker}' 를 찾지 못했다`);
  return at;
};
/** 두 표지 **사이**의 글자. 없으면 바로 멈춘다 — 조용히 빈 글자를 재면 전부 통과한다. */
const sliceBetween = (source: string, from: string, to: string) => {
  const start = indexOrFail(source, from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `원본에서 닫는 표지 '${to}' 를 찾지 못했다`);
  return source.slice(start, end);
};

const formSource = read("src/components/quotes/QuoteEditForm.tsx");
const form = flat(formSource);
const moduleSource = read("src/components/quotes/quote-part-pick.ts");

/** 다 들어 있는 줄 하나 — 다섯 칸이 **서로 다른 글자**라 차례를 자리로 잴 수 있다. */
const FULL: PartPickerRow = {
  id: "11",
  partName: "시험용 발진관 조립품",
  partSpec: "TEST-2M-001",
  customerPartName: "시험용 고객사 발진관",
  drawingNo: "DWG-TEST-1001",
  kyosanPartNo: "KY-TEST-7788",
};
/** 🔴 고객사 품명이 **빈** 부품 — 견적서에서 고를 수 없어야 하는 그 줄이다. */
const NO_CUSTOMER: PartPickerRow = {
  id: "12",
  partName: "시험용 냉각팬",
  partSpec: null,
  customerPartName: "",
  drawingNo: null,
  kyosanPartNo: null,
};
/** 🔴 `-` 만 적힌 칸도 **없는 칸**이다 — 엑셀에서 넘어온 줄에 흔하다. */
const DASH_CUSTOMER: PartPickerRow = {
  id: "13",
  partName: "시험용 바이어스 모듈",
  partSpec: null,
  customerPartName: "-",
  drawingNo: "-",
  kyosanPartNo: null,
};

const PRICES: PartPickerPriceRow[] = [
  { partId: "11", unitPrice: "125000", overhaulUnitPrice: "98000" },
];

/** 아직 아무것도 고르지 않은 줄. */
const blank = (over: Partial<QuotePartPickRow> = {}): QuotePartPickRow => ({
  partNameText: "",
  inventoryPartNo: null,
  pickedPartNameText: null,
  ...over,
});

/**
 * `option` 을 한 번 고른 뒤의 줄 — 🔴 **폼이 지나는 그 사슬 그대로** 지난다
 * (고르개 → `pickedPartPatch` → `{ ...row, ...patch }`).
 */
function afterPick(option: PartPickerRow, row: QuotePartPickRow = blank()): QuotePartPickRow {
  const patch = pickedPartPatch(partPickPatch(option, { prices: PRICES }, "customer"));
  return {
    ...row,
    partNameText: patch.partNameText,
    inventoryPartNo: patch.inventoryPartNo,
    pickedPartNameText: patch.pickedPartNameText,
  };
}

describe("① 🔴 줄에 적히는 이름은 **고객사 품명**이다", () => {
  test("🔴 고르면 고객사 품명이 들어간다 — 우리 품명이 아니다", () => {
    const picked = pickedPartPatch(partPickPatch(FULL, { prices: PRICES }, "customer"));
    assert.equal(picked.partNameText, "시험용 고객사 발진관");
    assert.notEqual(picked.partNameText, FULL.partName, "우리 품명이 서류로 나간다");
  });

  test("🔴 **틀리면 안 되나** — 그 값을 안 넘기면 우리 품명이 들어간다", () => {
    // 🔵 자가 실제로 바뀐 것을 이 줄이 보인다. 안 넘기던 때가 바로 쓰는 분이 본 화면이다.
    assert.equal(partPickName(FULL), "시험용 발진관 조립품");
    assert.equal(partPickName(FULL, "customer"), "시험용 고객사 발진관");
  });

  test("🔴 고객사 품명이 **없는 부품은 고를 수 없다** — 빈 이름이 서류에 찍히면 안 된다", () => {
    assert.equal(canPickPartOption(NO_CUSTOMER, "customer"), false);
    // 🔴 `-` 만 적힌 칸도 없는 칸이다.
    assert.equal(canPickPartOption(DASH_CUSTOMER, "customer"), false);
    // 🔵 있는 줄은 그대로 고를 수 있다 — 「아무것도 못 고른다」로 통과하는 시험이 되지 않게.
    assert.equal(canPickPartOption(FULL, "customer"), true);
    // 🔴 **틀리면 안 되나** — 기본 자(`"part"`)로는 그 줄도 통과한다. 자를 안 넘기면 막히지 않는다.
    assert.equal(canPickPartOption(NO_CUSTOMER), true);
    // 🔴 막힌 줄을 억지로 고르면 **빈 이름**이 돌아온다 — 그래서 고르는 자리에서 막는 것이다.
    assert.equal(partPickName(NO_CUSTOMER, "customer"), "");
  });

  test("🔴 폼이 **세 자리 전부**에 같은 자를 넘긴다 — 한 곳만 넘기면 어긋난다", () => {
    /**
     * ㉠ 고르개 목록(보이는 이름 · 눌리는가).
     * 🔴 **그 조각 안에서 잰다** — 파일 전체에서 글자를 찾으면 「이 사이트도 `nameSource` 를
     *    넘긴다」고 적어 둔 **주석**에 걸린다. 실제로 그렇게 통과했다(2026-10-17, 프롭을
     *    떼어 내 봤더니 시험이 초록이었다).
     */
    const picker = sliceBetween(form, "<PartSuggestionList", "onPick={(option) => {");
    assert.ok(picker.includes('nameSource="customer"'), "고르개에 자를 안 넘긴다");
    // ㉡ 고른 값을 줄에 붓는 자리
    const pick = sliceBetween(form, "onPick={(option) => {", "setPartPickerKey(null); }}");
    assert.ok(pick.includes("pickedPartPatch( partPickPatch("), "고른 조각이 제 칸으로 안 간다");
    assert.ok(pick.includes('"customer"'), "붓는 자리에 자를 안 넘긴다 — 적히는 이름이 목록과 어긋난다");
    // ㉢ 불러온 줄 둘(출고 부품 · O/H 템플릿) — 담기 판정과 적히는 이름
    assert.ok(
      form.includes('canPickPartOption(option, "customer")'),
      "담기 판정이 고객사 품명을 안 본다"
    );
    assert.ok(form.includes('partPickName(option, "customer")'), "담은 줄에 우리 품명이 적힌다");
    // 🔴 **옛 자가 한 자리도 남아 있으면 안 된다** — 남은 그 줄만 다른 이름을 쓴다.
    assert.ok(!form.includes("partPickName(option)"), "아직 우리 품명으로 짓는 자리가 있다");
    assert.ok(!form.includes("canPickPartOption(option)"), "아직 고객사 품명을 안 보는 판정이 있다");
  });

  test("🔴 막힌 줄에 **까닭을 갈라 적는다** — 「없는 부품」과 「이름이 빈 부품」은 할 일이 다르다", () => {
    assert.ok(form.includes("CUSTOMER_NAME_EMPTY_NOTICE"), "고객사 품명이 빈 줄의 까닭을 안 적는다");
    // 🔴 글자를 폼에 다시 적지 않는다 — 두 벌이 되면 언젠가 갈린다.
    assert.ok(!form.includes('"고객사 품명 없음'), "같은 말을 폼에 글자로 다시 적어 두었다");
    assert.match(CUSTOMER_NAME_EMPTY_NOTICE, /고객사 품명/);
    assert.match(CUSTOMER_NAME_EMPTY_NOTICE, /견적서/, "무엇이 막히는지 안 적혀 있다");
    for (const list of ["option === null ? OH_TEMPLATE_PART_NOT_LINKED_MESSAGE", "option === null ? USED_PART_NOT_IN_INVENTORY_MESSAGE"]) {
      assert.ok(form.includes(`${list} : CUSTOMER_NAME_EMPTY_NOTICE`), `${list} 쪽이 까닭을 안 가른다`);
    }
  });

  test("🔵 **담긴 줄도 같은 이름**이다 — 한 화면의 두 길이 다른 이름을 적으면 안 된다", () => {
    for (const builder of ["function usedPartToItem(", "function ohTemplatePartToItem("]) {
      const body = form.slice(indexOrFail(form, builder), indexOrFail(form, builder) + 600);
      assert.ok(
        body.includes('const partNameText = partPickName(option, "customer");'),
        `${builder} 가 적히는 이름을 다른 자로 짓는다`
      );
      // 🔴 적히는 글자와 **기억하는 글자가 같아야** 한다 — 다르면 담자마자 상세가 사라진다.
      assert.ok(body.includes("pickedPartNameText: partNameText,"), `${builder} 가 기억을 안 남긴다`);
      assert.ok(body.includes("partNameText,"), `${builder} 가 그 값을 줄에 안 적는다`);
    }
  });
});

describe("② 🔴 고른 부품의 상세 — 작성자만 보는 작은 글씨", () => {
  test("🔴 **값이 있는 칸만** 정해진 차례로, 이름표를 달아 적는다", () => {
    assert.equal(
      quotePickedPartDetail(FULL),
      "고객사 품명 시험용 고객사 발진관 · 품명 시험용 발진관 조립품 · 품명2 TEST-2M-001 · 교산 품번 KY-TEST-7788 · 도번 DWG-TEST-1001"
    );
    // 🔴 빈 칸과 `-` 만 적힌 칸은 **아예 빠진다** — `- · - · -` 가 줄을 채우면 있는 값이 묻힌다.
    assert.equal(quotePickedPartDetail(DASH_CUSTOMER), "품명 시험용 바이어스 모듈");
    assert.equal(quotePickedPartDetail(NO_CUSTOMER), "품명 시험용 냉각팬");
  });

  test("🔴 차례를 적는 자리는 **공용 묶음 한 곳**이다 — 여기서 다시 적지 않는다", () => {
    const detail = quotePickedPartDetail(FULL);
    let previous = -1;
    for (const key of PART_FIELD_ORDER) {
      const at = detail.indexOf(PART_FIELD_LABELS[key]);
      assert.ok(at > previous, `${PART_FIELD_LABELS[key]} 의 자리가 정해진 차례와 다르다`);
      previous = at;
    }
    // 🔴 모듈이 이름표나 차례를 **제 손으로 적고 있으면** 언젠가 갈린다.
    for (const label of [PART_FIELD_LABELS.kyosanPartNo, PART_FIELD_LABELS.drawingNo]) {
      assert.ok(
        !moduleSource.includes(`"${label}"`),
        `quote-part-pick.ts 가 '${label}' 를 제 손으로 적는다`
      );
    }
  });

  test("🔴 고른 줄에는 **보인다** — 울타리가 「아무 데도 안 보인다」가 되면 안 된다", () => {
    const row = afterPick(FULL);
    assert.equal(quotePickedPartOf(row, [FULL, NO_CUSTOMER])?.id, "11");
    assert.equal(row.partNameText, "시험용 고객사 발진관");
    assert.equal(row.inventoryPartNo, "11", "줄이 번호를 안 기억한다");
  });

  test("🔴 이름을 **손으로 고치면 사라지고**, 그대로면 보인다", () => {
    const options = [FULL, NO_CUSTOMER];
    const row = afterPick(FULL);
    // 그대로면 보인다.
    assert.equal(quotePickedPartOf(row, options)?.id, "11");
    // 🔴 고치면 안 그린다 — 그대로 두면 **딴 부품의 품번**을 이 줄의 것으로 읽게 된다.
    assert.equal(quotePickedPartOf({ ...row, partNameText: "시험용 고객사 발진관 (개조)" }, options), null);
    // 🔴 통째로 지운 경우도 여기에 저절로 들어간다.
    assert.equal(quotePickedPartOf({ ...row, partNameText: "" }, options), null);
    // 🔵 앞뒤 공백만 다른 것은 고친 것이 아니다.
    assert.equal(quotePickedPartOf({ ...row, partNameText: "  시험용 고객사 발진관  " }, options)?.id, "11");
    // 🔵 고친 글자를 **되돌리면** 다시 보인다 — 번호는 그대로 남아 있기 때문이다.
    assert.equal(quotePickedPartOf({ ...row, partNameText: "시험용 고객사 발진관" }, options)?.id, "11");
  });

  test("🔵 고른 적이 없거나 · 목록을 못 받아 왔으면 **아무것도 안 그린다**", () => {
    // 손으로 적은 줄 — 기억이 없다.
    assert.equal(quotePickedPartOf(blank({ partNameText: "손으로 적은 부품" }), [FULL]), null);
    // 🔴 재고 관리에서 목록을 못 받아 온 날(빈 목록)은 **지어내지 않는다**.
    assert.equal(quotePickedPartOf(afterPick(FULL), []), null);
    // 🔵 목록에 그 번호가 없는 날(그 사이 지워진 부품)도 같다.
    assert.equal(quotePickedPartOf(afterPick(FULL), [NO_CUSTOMER]), null);
    // 🔴 번호가 없는데 이름 기억만 있는 줄도 안 그린다 — 되짚을 것이 없다.
    assert.equal(quotePickedPartOf(blank({ partNameText: "ㄱ", pickedPartNameText: "ㄱ" }), [FULL]), null);
  });

  test("🔴 이름을 견주는 자는 **한 곳**이다 — 그리기가 제 손으로 다시 재지 않는다", () => {
    const row = afterPick(FULL);
    assert.equal(isPickedPartNameKept(row), true);
    assert.equal(isPickedPartNameKept({ ...row, partNameText: "다른 이름" }), false);
    assert.equal(isPickedPartNameKept(blank({ partNameText: "" })), false, "기억 없는 줄이 「그대로」로 읽힌다");
    // 🔴 그 함수는 **목록을 보지 않는다** — 통신이 끊긴 날에도 답이 달라지면 안 된다.
    assert.ok(
      !sliceBetween(moduleSource, "export function isPickedPartNameKept(", "}").includes("options"),
      "이름 판정이 목록을 본다"
    );
  });

  test("🔴 다시 연 줄에도 **상세가 보인다** — 저장한 견적서를 고치러 들어간 그 화면", () => {
    const reopened: QuotePartPickRow = {
      partNameText: "시험용 고객사 발진관",
      inventoryPartNo: "11",
      pickedPartNameText: quoteRestoredPickedPartName({
        inventoryPartNo: 11,
        partNameText: "시험용 고객사 발진관",
      }),
    };
    assert.equal(quotePickedPartOf(reopened, [FULL])?.id, "11");
    // 🔵 **이름을 고쳐 저장한 줄**도 다시 열면 보인다 — 저장된 품명을 그대로 기억으로 삼는다.
    assert.equal(
      quoteRestoredPickedPartName({ inventoryPartNo: 11, partNameText: " 고쳐 적은 이름 " }),
      "고쳐 적은 이름"
    );
    // 🔵 번호가 없는 옛 줄은 **지금까지 그대로** — 기억이 없다.
    assert.equal(quoteRestoredPickedPartName({ inventoryPartNo: null, partNameText: "손으로 적은 줄" }), null);
  });

  test("🔴 폼이 그 상세를 **실제로 그린다** — 규칙만 있고 화면이 안 쓰면 증상이 그대로다", () => {
    assert.ok(form.includes("quotePickedPartOf(row, partOptionRows)"), "폼이 상세를 찾지 않는다");
    assert.ok(form.includes("{quotePickedPartDetail(picked)}"), "폼이 상세를 그리지 않는다");
    assert.ok(form.includes(`{QUOTE_PICKED_PART_PREFIX} —`), "무슨 글자인지 적어 주지 않는다");
    assert.equal(QUOTE_PICKED_PART_PREFIX, "고른 부품");
    // 🔴 **품명 칸 밑**이다 — 후보 목록과 오류 줄 사이, 그 칸의 `relative` 묶음 안.
    const cell = sliceBetween(
      form,
      "{/* 🔴 `relative` — 부품 후보 목록이 이 칸",
      "{/* 🔴 규격 칸은 **케이블 견적서에만** 있다"
    );
    assert.ok(cell.includes("quotePickedPartDetail(picked)"), "상세가 품명 칸 밑에 있지 않다");
    // 🔴 다시 열 때 기억을 되살리지 않으면 **저장한 견적서에서만** 안 보인다.
    assert.ok(
      form.includes("pickedPartNameText: quoteRestoredPickedPartName(item),"),
      "다시 열 때 이름 기억을 안 되살린다"
    );
  });
});

/**
 * ============================================================================
 * ③ 🔴 그 값들은 **밖으로 나가지 않는다** — 그리고 **저장은 그대로 된다**
 * ============================================================================
 * 견적서는 고객사로 나가는 종이다. 우리 품명 · 교산 품번 · 도번이 거기 찍히면 되돌릴 수
 * 없고, 나간 뒤에야 알게 된다. 울타리가 셋이다 —
 *  ㉠ 나가는 길 넷에 이 값들의 이름이 **한 번도 없다**
 *  ㉡ 폼이 나가는 쪽으로 옮기는 자리 셋이 **칸을 하나씩 적는다**(`{ ...row }` 가 없다)
 *  ㉢ 🔴 서버가 **모르는 칸을 버린다** — ㉠㉡ 이 뚫려도 DB 에는 안 닿는다
 *
 * 🔴 그리고 **저장이 여전히 되는가**를 함께 잰다 — `pickedPartPatch` 를 모듈로 옮기면서
 *    2026-10-17 에 저장을 막던 그 결함을 되살리지 않았는지가 이 구역의 마지막 묶음이다.
 * ============================================================================
 */
describe("③ 🔴 밖으로 나가지 않는다 · 저장은 그대로 된다", () => {
  /** 🔴 견적서 줄이 **밖으로 나가는** 길 전부. 늘어나면 여기 적어야 한다. */
  const OUTBOUND = [
    "src/components/quotes/QuotePrintView.tsx",
    "src/lib/server/services/quote-workbook.ts",
    "src/lib/validation/quote-input.ts",
    "src/lib/db/mutations/quotes.ts",
    "src/lib/db/queries/quotes.ts",
  ];

  test("㉠ 🔴 나가는 길 어디에도 **고른 부품의 기억**이 없다", () => {
    for (const path of OUTBOUND) {
      const source = read(path);
      for (const forbidden of [
        "pickedPartNameText",
        "quote-part-pick",
        "quotePickedPartDetail",
        QUOTE_PICKED_PART_PREFIX,
      ]) {
        assert.ok(
          !source.includes(forbidden),
          `${path} 에 '${forbidden}' 이 있다 — 작성자만 볼 값이 고객사에 나가는 길로 들어갔다`
        );
      }
    }
  });

  test("㉠ 🔴 나가는 길 어디에도 **우리 쪽 품번 이름표**가 없다", () => {
    // 상세를 「직접 적어서」 내보내는 길도 같은 사고다 — 값의 이름만 피해 가면 못 잡는다.
    for (const path of OUTBOUND) {
      const source = read(path);
      for (const label of [PART_FIELD_LABELS.kyosanPartNo, PART_FIELD_LABELS.drawingNo]) {
        assert.ok(!source.includes(label), `${path} 에 '${label}' 이 있다`);
      }
    }
  });

  test("㉡ 🔴 폼이 옮기는 자리 셋이 **칸을 하나씩 적는다** — 줄을 통째로 붓지 않는다", () => {
    const blocks = {
      저장: sliceBetween(form, "items: items .filter((row) => row.partNameText.trim()", "}), };"),
      "미리보기 품목": sliceBetween(form, 'items: items .filter((row) => row.lineKind === "ITEM")', "})),"),
      "미리보기 품목표": sliceBetween(form, "itemLines: items .filter((row) =>", "}), }}"),
    };
    for (const [name, block] of Object.entries(blocks)) {
      assert.ok(!block.includes("...row"), `${name} 가 줄을 통째로 붓는다`);
      assert.ok(!block.includes("pickedPartNameText"), `${name} 에 화면 전용 기억이 실린다`);
      assert.ok(block.includes("partNameText: row.partNameText,"), `${name} 가 품명을 안 싣는다`);
    }
    // 🔴 저장만 번호를 싣는다 — 미리보기 둘에는 **한 글자도** 없다(고객사가 볼 종이다).
    assert.ok(blocks.저장.includes("inventoryPartNo: isNote ? null : row.inventoryPartNo,"));
    for (const name of ["미리보기 품목", "미리보기 품목표"] as const) {
      assert.ok(!blocks[name].includes("inventoryPartNo"), `${name} 에 재고 관리 번호가 실린다`);
    }
  });

  test("㉢ 🔴 서버가 **모르는 칸을 버린다** — 앞 울타리가 뚫려도 DB 에는 안 닿는다", () => {
    const result = validateQuoteFields({
      quoteNumber: "DSS 2026-903",
      quoteDate: "2026-10-17",
      customerNameText: "가상전자 주식회사",
      subject: "시험용 수리 견적",
      items: [
        {
          partId: null,
          partNameText: "시험용 고객사 발진관",
          quantity: 1,
          unitPrice: "125000",
          inventoryPartNo: "11",
          // 🔴 뚫렸다고 치고 **일부러** 실어 보낸다.
          pickedPartNameText: "시험용 고객사 발진관",
          pickedPartDetail: quotePickedPartDetail(FULL),
        },
      ],
    });
    assert.ok(result.ok, `통과할 줄 알았는데 실패: ${JSON.stringify(result)}`);
    assert.deepEqual(Object.keys(result.data.items?.[0] ?? {}).sort(), [
      "inventoryPartNo",
      "isOverhaulPart",
      "kind",
      "partId",
      "partNameText",
      "partSpecText",
      "quantity",
      "unitPrice",
    ]);
    const saved = JSON.stringify(result.data);
    for (const leaked of ["pickedPart", "시험용 발진관 조립품", "KY-TEST-7788", "DWG-TEST-1001", "TEST-2M-001"]) {
      assert.ok(!saved.includes(leaked), `저장되는 값에 '${leaked}' 이 남았다`);
    }
  });

  test("🔴 **저장이 여전히 된다** — 옮긴 `pickedPartPatch` 가 번호를 제 칸으로 보낸다", () => {
    const patch = pickedPartPatch(partPickPatch(FULL, { prices: PRICES }, "customer"));
    // 🔴 FK 칸은 **언제나 비어 있다** — 재고 관리의 번호는 이 DB 의 UUID 가 아니다.
    assert.equal(patch.partId, null);
    assert.equal(patch.inventoryPartNo, "11");
    const result = validateQuoteFields({
      quoteNumber: "DSS 2026-904",
      quoteDate: "2026-10-17",
      customerNameText: "가상전자 주식회사",
      subject: "시험용 수리 견적",
      items: [
        {
          partId: patch.partId,
          partNameText: patch.partNameText,
          quantity: 1,
          unitPrice: patch.unitPrice ?? "125000",
          inventoryPartNo: patch.inventoryPartNo,
        },
      ],
    });
    assert.ok(result.ok, `고른 줄이 저장되지 않는다: ${JSON.stringify(result)}`);
    assert.equal(result.data.items[0].partId, null);
    assert.equal(result.data.items[0].inventoryPartNo, 11, "번호가 저장에 안 실린다");
  });

  test("🔵 `unitPrice` 키는 **채울 때만** 따라온다 — 지어 넣으면 적어 둔 금액이 지워진다", () => {
    const filled = pickedPartPatch(partPickPatch(FULL, { prices: PRICES }, "customer"));
    assert.equal(filled.unitPrice, "125000");
    const kept = pickedPartPatch(
      partPickPatch(FULL, { prices: PRICES, currentUnitPrice: "150000" }, "customer")
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(kept, "unitPrice"),
      false,
      "🔴 키가 있으면 부르는 쪽의 {...row, ...patch} 가 적혀 있던 금액을 덮는다"
    );
    // 🔵 그래도 이름과 번호 · 기억은 언제나 간다.
    assert.deepEqual(Object.keys(kept).sort(), [
      "inventoryPartNo",
      "partId",
      "partNameText",
      "pickedPartNameText",
    ]);
  });
});
