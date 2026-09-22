import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MAX_PART_SUGGESTIONS,
  filterPartOptions,
  partPickPatch,
  partPickUnitPrice,
} from "@dss/core/ui/inventory/part-picker";
import type { PartPickerPriceRow, PartPickerRow } from "@dss/core/ui/inventory/part-picker-rows";
import { isPriceUnset, toPriceFieldValue } from "@dss/core/ui/inventory/part-price-field";

/**
 * ============================================================================
 * 부품 고르개 — 조각 3b-3 **뒤쪽 절반**, 커밋 ①
 * ============================================================================
 * 품명 칸에 글자를 치면 부품 마스터에서 찾아 고를 수 있고, 고르면 품명과 단가가
 * 채워진다. 이 시험이 보는 것은 셋이다.
 *
 *  ㉠ 🔴 **고르개를 베끼지 않고 공용 묶음에서 가져다 쓴다**(설계서 F-3).
 *  ㉡ 🔴 **금액이 고객사로 나가는 자리의 규칙 셋** — 적혀 있으면 덮지 않는다 ·
 *     정하지 않은 것을 0 으로 채우지 않는다 · O/H 줄에 일반 단가를 대신 쓰지 않는다.
 *  ㉢ 🔴 **재고 · 소유구분 · 내부 비고가 화면으로 흘러갈 길이 없다** — 무거운 형제
 *     조회(`getPartList`)를 옮겨 오지 않았고, 가벼운 둘은 그 표를 건드리지 않는다.
 *
 * ── 왜 저쪽에도 있는 시험을 여기서 또 재는가 ────────────────────────────────
 * A/S 에는 같은 함수들을 더 촘촘히 보는 시험이 있다
 * (`src/components/inventory/part-picker.test.tsx`). 그것과 겹치는 것을 알고 둔다 —
 * **이 사이트의 `npm test` 가 이 사이트에서 실제로 도는 그 코드를 봐야** 하기 때문이고
 * (서브모듈 포인터는 두 저장소가 따로 옮긴다), 공용 묶음에는 시험 러너가 없다.
 * 이웃한 `common/responsive-list.test.ts` · `domain/master-data-trash-retention.test.ts`
 * 가 같은 판단으로 서브모듈의 순수 함수를 여기서 잰다.
 *
 * 🔴 여기서는 **금액에 닿는 규칙과 배선**만 잰다 — 저쪽 시험을 그대로 베껴 오지
 * 않았다. 꼬리표 만들기(`partOptionDetail`) 같은 생김새는 저쪽이 본다.
 *
 * ── 왜 폼을 렌더하지 않는가 ─────────────────────────────────────────────────
 * QuoteEditForm 은 **서버 액션을 직접 import 하는 클라이언트 컴포넌트**라 그 사슬
 * 끝의 `server-only` 때문에 `npm test` 에서는 import 자체가 던진다. 이웃 시험들과
 * 같은 방법으로 **원본을 글자로 읽는다**
 * (quote-intake-lookup-source.test.ts 머리말의 그 항목).
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
const querySource = read("src/lib/db/queries/inventory.ts");
const newPageSource = read("src/app/(app)/quotes/new/page.tsx");
const editPageSource = read("src/app/(app)/quotes/[id]/page.tsx");

/**
 * 저장소의 `src/` 아래 **구현 파일**(시험 아닌 .ts/.tsx) 전부. 사본을 경로가 아니라
 * **글자로** 찾으므로 목록이 필요하다.
 *
 * 🔴 **시험 파일은 뺀다.** 시험은 막으려는 글자를 단언에 그대로 적어야 하고(이 파일이
 * 그렇다), 울타리를 다시 쓴 까닭을 머리말에 적을 때 옛 이름도 적어야 한다. 넣으면
 * 이 시험이 **자기 자신을 보고** 붉어진다. 사본은 구현 파일로 생기는 것이라 손실이 없다.
 */
function implementationFiles(dir = "src"): string[] {
  const here = fileURLToPath(new URL(dir, repoUrl));
  const found: string[] = [];
  for (const name of readdirSync(here)) {
    const relative = `${dir}/${name}`;
    if (statSync(fileURLToPath(new URL(relative, repoUrl))).isDirectory()) {
      found.push(...implementationFiles(relative));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      found.push(relative);
    }
  }
  return found;
}

describe("🔴 고르개는 한 벌이다 — 이 사이트에 사본을 두지 않는다", () => {
  test("폼이 공용 묶음에서 들여온다 — 컴포넌트와 두 순수 함수", () => {
    assert.ok(
      formSource.includes(
        'import {\n  PartSuggestionList,\n  filterPartOptions,\n  partPickPatch,\n} from "@dss/core/ui/inventory/part-picker";'
      ),
      "고르개를 공용 묶음에서 들여오지 않는다"
    );
    assert.ok(
      formSource.includes('} from "@dss/core/ui/inventory/part-picker-rows";'),
      "줄의 모양(형 둘)도 묶음에서 가져와야 한다 — 두 벌이면 칸이 어긋난 날 컴파일러가 말이 없다"
    );
  });

  /**
   * 🔴 **경로가 아니라 글자로 잰다.** 예전 울타리는
   * `src/components/quotes/quote-part-picker.tsx` 가 없는지를 봤는데, F-3 이 A/S
   * 에서도 그 경로를 없애 **영영 생기지 않는 경로**가 되었다 — 막고 있다고 믿는데
   * 아무것도 막지 않는 줄이었다(quote-intake-lookup-source.test.ts 의 그 머리말).
   * 사본은 어느 경로에나 생길 수 있으니, **선언하는 글자**를 저장소 전체에서 찾는다.
   */
  test("🔴 이 저장소의 어느 구현 파일도 고르개를 **선언**하지 않는다 — 부르기만 한다", () => {
    const declarations = [
      "export function filterPartOptions",
      "export function partPickUnitPrice",
      "export function partPickPatch",
      "export function PartSuggestionList",
      "export function toPriceFieldValue",
      "export function isPriceUnset",
      "export type PartPickerRow",
      "export type PartPickerPriceRow",
    ];
    const files = implementationFiles();
    assert.ok(files.length > 50, `구현 파일을 못 걷었다: ${files.length}`);
    for (const file of files) {
      const source = read(file);
      for (const declaration of declarations) {
        assert.equal(
          source.includes(declaration),
          false,
          `${file} 가 '${declaration}' 를 선언한다 — 공용 묶음의 사본이다(설계서 F-3)`
        );
      }
    }
  });
});

describe("🔴 조회 둘 — 가벼운 형제만 옮겨 왔다", () => {
  /**
   * 🔴 **부르는 꼴로 잰다**(`getPartList(` — 괄호까지). 머리말 주석들이 「그 무거운
   * 형제를 옮겨 오지 않았다」를 이름으로 적고 있어, 이름만 찾으면 그 주석에 걸린다.
   * 막으려는 것은 설명이 아니라 **실제로 부르는 줄**이다.
   */
  test("무거운 형제(getPartList · 가용량 · 재고 잔량 표)를 부르지 않는다", () => {
    for (const heavy of ["getPartList(", "getPartOwnerAvailability(", "partStockBalances"]) {
      for (const file of implementationFiles()) {
        assert.equal(
          read(file).includes(heavy),
          false,
          `${file} 가 ${heavy} 를 쓴다 — 재고가 견적서 화면으로 흘러갈 길이 생겼다`
        );
      }
    }
  });

  test("🔴 고르개 목록에 재고 · 소유구분 · 내부 비고 칸이 없다 — 다섯 칸뿐이다", () => {
    const list = flat(
      querySource.slice(
        querySource.indexOf("export async function getPartPickerList("),
        querySource.indexOf("export async function getPartPickerUnitPrices(")
      )
    );
    assert.ok(list.includes("id: parts.id,"), list);
    for (const column of ["partName", "partSpec", "drawingNo", "kyosanPartNo"]) {
      assert.ok(list.includes(`${column}: parts.${column},`), `${column} 칸이 없다`);
    }
    for (const forbidden of ["owner", "notes", "Balance", "quantity", "leftJoin"]) {
      assert.equal(list.includes(forbidden), false, `${forbidden} — 이 조회가 실어 보내면 안 되는 것이다`);
    }
    assert.ok(list.includes("eq(parts.isDeleted, false)"), "지워진 부품을 고를 수 있다");
    // 🔴 차례를 여기서 본다 — 진짜 DB 에서는 collation 과 JS 글자 비교가 어긋나
    // 코드가 맞는 날에도 붉어진다(queries/part-picker.integration.test.ts 의 그 주석).
    assert.ok(list.includes(".orderBy(parts.partName)"), "품명 차례로 돌려주지 않는다");
  });

  test("🔴 단가 목록은 **단가 표 둘만** 조인하고, 단가가 있는 부품만 돌려준다", () => {
    const prices = flat(
      querySource.slice(querySource.indexOf("export async function getPartPickerUnitPrices("))
    );
    assert.ok(prices.includes("leftJoin(partUnitPrices, eq(partUnitPrices.partId, parts.id))"));
    assert.ok(
      prices.includes("leftJoin(partOverhaulUnitPrices, eq(partOverhaulUnitPrices.partId, parts.id))")
    );
    assert.ok(
      prices.includes(
        "or(isNotNull(partUnitPrices.unitPrice), isNotNull(partOverhaulUnitPrices.unitPrice))"
      ),
      "단가가 하나도 없는 부품까지 실어 보낸다"
    );
    for (const forbidden of ["owner", "notes", "Balance"]) {
      assert.equal(prices.includes(forbidden), false, `${forbidden} — 단가 목록에 와서는 안 된다`);
    }
  });

  test("🔴 권한 검사가 조회에 없다 — 세션과 문턱은 액션·페이지 층의 일이다", () => {
    for (const marker of ["hasPermission", "getSessionUser"]) {
      assert.equal(
        querySource.includes(marker),
        false,
        `읽는 층에 ${marker} 가 들어왔다 — 층이 섞이면 어디가 관문인지 알 수 없다`
      );
    }
    assert.ok(querySource.startsWith('import "server-only";'), "클라이언트 번들로 새는 것을 막지 않는다");
  });
});

describe("페이지 둘이 목록을 실어 보낸다 — 관문 뒤에서", () => {
  for (const [label, source] of [
    ["새 견적서", newPageSource],
    ["견적서 수정", editPageSource],
  ] as const) {
    test(`${label} 화면이 두 목록을 넘긴다`, () => {
      const body = flat(source);
      assert.ok(body.includes("partOptions={partOptions}"), "partOptions 를 넘기지 않는다");
      assert.ok(body.includes("partPrices={partPrices}"), "partPrices 를 넘기지 않는다");
      assert.ok(
        body.includes("getPartPickerList(), getPartPickerUnitPrices(),"),
        "두 조회를 함께 기다리지 않는다"
      );
      // 🔴 조회가 **쓰기 권한 판정 뒤**에 있어야 한다. 앞에 두면 들어올 수 없는
      // 사람에게도 부품 마스터를 한 번 읽어 주는 셈이 된다.
      assert.ok(
        body.indexOf('hasPermission(user, "quotes", "WRITE")') < body.indexOf("getPartPickerList()"),
        "권한 판정보다 조회가 먼저다"
      );
    });
  }
});

// ── 고르개의 판단 — 🔴 금액에 닿는 자리 ─────────────────────────────────────

const OPTIONS: PartPickerRow[] = [
  { id: "p1", partName: "RF Generator Board", partSpec: "20kW", drawingNo: "D-1001", kyosanPartNo: "KY-77" },
  { id: "p2", partName: "Cooling Fan", partSpec: null, drawingNo: null, kyosanPartNo: null },
  { id: "p3", partName: "Bias Module", partSpec: "Rev B", drawingNo: "D-2002", kyosanPartNo: null },
];

const PRICES: PartPickerPriceRow[] = [
  { partId: "p1", unitPrice: "125000.00", overhaulUnitPrice: "98000.00" },
  // 일반 단가만 있다 — O/H 줄에서 이것을 대신 쓰면 안 된다.
  { partId: "p2", unitPrice: "3000.00", overhaulUnitPrice: null },
  // 🔴 "0" 은 무상 부품이라는 **실제 값**이다. 정하지 않음(null)과 다르다.
  { partId: "p3", unitPrice: "0", overhaulUnitPrice: null },
];

describe("품명 칸이 거른다 — 재고에서 찾던 네 가지로", () => {
  test("품명 · 품명2 · 도번 · 교산 품번 넷으로 찾는다", () => {
    assert.deepEqual(filterPartOptions(OPTIONS, "generator").map((o) => o.id), ["p1"]);
    assert.deepEqual(filterPartOptions(OPTIONS, "20kw").map((o) => o.id), ["p1"], "품명2(규격)");
    assert.deepEqual(filterPartOptions(OPTIONS, "d-2002").map((o) => o.id), ["p3"], "도번");
    assert.deepEqual(filterPartOptions(OPTIONS, "ky-77").map((o) => o.id), ["p1"], "교산 품번");
  });

  test("🔴 빈 글자면 아무것도 뜨지 않는다 — 칸을 누르자마자 목록이 밑줄을 가리면 안 된다", () => {
    assert.deepEqual(filterPartOptions(OPTIONS, ""), []);
    assert.deepEqual(filterPartOptions(OPTIONS, "   "), []);
  });

  test("한 번에 보여 주는 수를 끊는다 — 좁혀 치라는 신호다", () => {
    const many: PartPickerRow[] = Array.from({ length: MAX_PART_SUGGESTIONS + 5 }, (_unused, i) => ({
      id: `m${i}`,
      partName: `Module ${i}`,
      partSpec: null,
      drawingNo: null,
      kyosanPartNo: null,
    }));
    assert.equal(filterPartOptions(many, "module").length, MAX_PART_SUGGESTIONS);
  });
});

describe("고르면 품명 · 재고 연결 · 단가가 채워진다", () => {
  test("품명과 재고 연결은 언제나 채운다", () => {
    const patch = partPickPatch(OPTIONS[1], { prices: PRICES, currentUnitPrice: "" });
    assert.equal(patch.partNameText, "Cooling Fan");
    assert.equal(patch.partId, "p2");
    assert.equal(patch.unitPrice, "3000");
  });

  test("🔴 이미 적어 둔 금액은 덮지 않는다 — 사람이 조정해 둔 값이다", () => {
    const patch = partPickPatch(OPTIONS[0], { prices: PRICES, currentUnitPrice: "150000" });
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, "unitPrice"),
      false,
      "🔴 unitPrice 키가 있으면 부르는 쪽의 {...row, ...patch} 가 적혀 있던 금액을 덮는다"
    );
    assert.equal(patch.partId, "p1", "연결은 그래도 붙는다");
  });

  test("🔴 O/H 줄은 O/H 단가만 본다 — 없으면 **안 채운다**", () => {
    // p1 은 둘 다 있다 — O/H 줄이면 O/H 단가다.
    assert.equal(partPickUnitPrice("p1", { prices: PRICES, isOverhaulPart: true }), "98000");
    assert.equal(partPickUnitPrice("p1", { prices: PRICES, isOverhaulPart: false }), "125000");
    // p2 는 O/H 단가가 없다 — 🔴 일반 단가(3000)로 때우면 틀린 금액이 조용히 박힌다.
    assert.equal(partPickUnitPrice("p2", { prices: PRICES, isOverhaulPart: true }), null);
  });

  test("🔴 단가 줄이 없는 부품은 빈칸이다 — 0 으로 채우지 않는다", () => {
    assert.equal(partPickUnitPrice("없는부품", { prices: PRICES }), null);
    const patch = partPickPatch(
      { id: "없는부품", partName: "손으로 적은 것", partSpec: null, drawingNo: null, kyosanPartNo: null },
      { prices: PRICES }
    );
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "unitPrice"), false);
  });

  test('🔴 "0"(무상 부품)은 0 으로 채운다 — 정하지 않음과 다르다', () => {
    assert.equal(partPickUnitPrice("p3", { prices: PRICES }), "0");
    assert.equal(toPriceFieldValue("0"), "0");
    assert.equal(toPriceFieldValue(null), "", "null 은 빈칸이다");
    assert.equal(isPriceUnset(null), true);
    assert.equal(isPriceUnset("0"), false, '"0" 은 정해 둔 값이다');
  });

  test("단가 목록을 안 주면 단가를 채우지 않는다 — 단가 칸이 없는 화면도 같은 고르개를 쓴다", () => {
    assert.equal(partPickUnitPrice("p1", {}), null);
  });

  test("numeric 의 소수 꼬리를 칸에 넣지 않는다", () => {
    assert.equal(toPriceFieldValue("125000.00"), "125000");
  });
});

describe("폼의 배선 — 목록이 어느 줄에 뜨는가", () => {
  test("🔴 펴 둔 줄을 한 값으로 들고 있다 — 여러 줄이 한꺼번에 뜨면 서로를 가린다", () => {
    assert.ok(form.includes("const [partPickerKey, setPartPickerKey] = useState<string | null>(null);"));
    assert.ok(form.includes("onFocus={() => setPartPickerKey(row.key)}"), "칸에 들어가면 열리지 않는다");
    assert.ok(
      form.includes("onBlur={() => setPartPickerKey((prev) => (prev === row.key ? null : prev))}"),
      "칸을 나갈 때 **제 줄만** 닫아야 한다"
    );
    assert.ok(form.includes('if (e.key === "Escape") setPartPickerKey(null);'), "Escape 로 닫히지 않는다");
  });

  test("🔴 후보 목록이 품명 칸 **바로 밑**에 뜬다 — 흐름 안에 두면 밑줄이 밀려 내려간다", () => {
    const row = flat(
      formSource.slice(
        formSource.indexOf('{/* 🔴 `relative` — 부품 후보 목록이 이 칸'),
        formSource.indexOf("{/* 🔴 규격 칸은 **케이블 견적서에만** 있다")
      )
    );
    assert.ok(row.includes('<div className="relative">'), "relative 가 없다");
    assert.ok(row.includes("{partPickerKey === row.key && !disabled && ( <PartSuggestionList"));
    assert.ok(row.includes('autoComplete="off"'), "브라우저 제 기억 목록이 후보 위에 겹쳐 뜬다");
  });

  test("🔴 글자를 치면 재고 연결이 풀린다 — 화면의 글자와 통계가 같은 것을 가리키게", () => {
    assert.ok(
      form.includes("updateItem(row.key, { partNameText: e.target.value, partId: null });"),
      "이름만 고쳐도 part_id 가 남는다"
    );
  });

  test("🔴 고를 때 고르개에 건네는 것 셋 — OH 표시 · 적혀 있는 금액 · 단가 목록", () => {
    const pick = flat(
      formSource.slice(
        formSource.indexOf("onPick={(option) => {"),
        formSource.indexOf("setPartPickerKey(null); }}")
      )
    );
    assert.ok(pick.includes("prices: partPrices,"), "단가 목록을 안 건넨다");
    assert.ok(
      pick.includes('isOverhaulPart: kind === "OVERHAUL" && row.isOverhaulPart,'),
      "🔴 O/H 견적서의 OH 표시가 있는 줄일 때만 O/H 단가여야 한다"
    );
    assert.ok(pick.includes("currentUnitPrice: row.unitPrice,"), "🔴 적혀 있는 금액을 안 건네면 덮는다");
  });

  /**
   * 🔴 **고르는 길에서만** 잰다. 폼의 다른 자리(참고 목록 둘 · 담기 함수 둘)는 단가를
   * 읽어 **보여 주고 옮겨 적는다** — 그것은 판단이 아니다. 여기서 막는 것은 「고른
   * 순간 폼이 어느 단가를 쓸지 스스로 고르는 것」이고, 그 판단은 공용 묶음의
   * `partPickUnitPrice` 한 곳에만 있어야 한다.
   */
  test("🔴 고르는 길에 단가 규칙을 다시 적지 않았다 — 판단은 고르개 쪽 한 곳이다", () => {
    const pick = flat(
      formSource.slice(
        formSource.indexOf("onPick={(option) => {"),
        formSource.indexOf("setPartPickerKey(null); }}")
      )
    );
    for (const rule of ["overhaulUnitPrice", "toPriceFieldValue(", "isPriceUnset("]) {
      assert.equal(
        pick.includes(rule),
        false,
        `고르는 길이 ${rule} 로 단가를 스스로 판단한다 — 규칙이 두 곳에 갈린다`
      );
    }
  });

  test("찾아 고르는 길이 생긴 것을 화면이 말한다 — 손으로 적는 길도 그대로라고", () => {
    assert.ok(form.includes("품명 칸에 글자를 치면 재고의 부품을"), "안내 문장이 없다");
    assert.ok(form.includes("<b>품명 / 품명2 / 도번 / 교산 품번</b>"), "무엇으로 찾는지 안 적혀 있다");
    assert.ok(form.includes("지금처럼 그냥 적으면 됩니다"), "손으로 적는 길이 남는다는 말이 없다");
  });
});
