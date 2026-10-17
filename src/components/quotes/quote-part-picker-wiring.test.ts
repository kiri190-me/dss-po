import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MAX_PART_SUGGESTIONS,
  filterPartOptions,
  partPickPatch,
  partPickUnitPrice,
} from "@dss/core/ui/inventory/part-picker";
import type { PartPickerPriceRow, PartPickerRow } from "@dss/core/ui/inventory/part-picker-rows";
import { isPriceUnset, toPriceFieldValue } from "@dss/core/ui/inventory/part-price-field";
/* 🔴 **갈래를 옮기는 함수를 진짜로 돌려 본다** — 이 시험의 나머지가 글자를 읽는 쪽이라,
   「ok 는 ok 로 · 못 받아 온 것은 못 받아 온 채로」가 실제로 그런지는 불러 봐야 안다.
   🔵 받아 온 것을 읽는 규칙 자체는 lib/domain/inventory-gateway.test.ts 가 촘촘히 본다. */
import { inventoryUnreachableMessage, toPartPickerOptions } from "@/lib/domain/inventory-gateway";

/**
 * ============================================================================
 * 부품 고르개 — 조각 3b-3 **뒤쪽 절반**, 커밋 ①
 * (🔴 2026-10-17 **부품이 오는 곳이 바뀌었다** — 아래 ㉣)
 * ============================================================================
 * 품명 칸에 글자를 치면 부품 마스터에서 찾아 고를 수 있고, 고르면 품명과 단가가
 * 채워진다. 이 시험이 보는 것은 넷이다.
 *
 *  ㉠ 🔴 **고르개를 베끼지 않고 공용 묶음에서 가져다 쓴다**(설계서 F-3).
 *  ㉡ 🔴 **금액이 고객사로 나가는 자리의 규칙 셋** — 적혀 있으면 덮지 않는다 ·
 *     정하지 않은 것을 0 으로 채우지 않는다 · O/H 줄에 일반 단가를 대신 쓰지 않는다.
 *  ㉢ 🔴 **재고 · 소유구분 · 내부 비고가 화면으로 흘러갈 길이 없다** — 무거운 형제
 *     조회(`getPartList`)를 부르는 줄이 이 저장소 어디에도 없다.
 *  ㉣ 🔴 **부품은 재고 관리 통로에서 온다**(2026-10-17). 같은 DB 의 A/S 부품 표
 *     (`parts`)를 곧바로 읽던 조회 둘(`lib/db/queries/inventory.ts`)은 파일째 걷어냈다 —
 *     그 표에는 2026-10 부터 새 부품이 들어오지 않아, 재고 관리에 등록한 부품이 이
 *     고르개에 **뜨지 않았다**(「고장」이 아니라 「옛것만 나옴」이라 아무도 신고하지 않는다).
 *     🔴 그래서 이 시험이 새로 지키는 것이 하나 더 있다: **「못 받아 왔다」가 폼까지
 *     그대로 간다.** 페이지가 미리 풀어 빈 목록으로 만들면 화면이 「재고에 부품이 하나도
 *     없다」고 거짓말하고, 사람은 그 말을 믿고 멀쩡히 있는 부품을 찾아 헤맨다.
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
  test("폼이 공용 묶음에서 들여온다 — 컴포넌트와 순수 함수들", () => {
    /* ⚠️ 2026-10-17 — 들여오는 이름이 **셋 늘었다**. 불러온 줄(출고 부품 · O/H 템플릿)에
       적힐 이름과 담을 수 있는가를 재는 자가 고르개의 것 하나여야 해서다
       (quote-intake-inventory.test.ts 의 ㉡). 🔴 막으려던 것은 그대로다 — **사본이 아니라
       묶음에서 온다.** 🔵 `nameSource` 는 넘기지 않는다(기본값 `"part"`). */
    /* ⚠️ 2026-10-17(둘째) — `partPickPatch` 가 **빠졌다.** 「부품이 바뀌면 단가도 따라간다」가
       들어오면서 고르개를 부르는 일이 `quote-part-pick.ts` 의 `quotePartPickPatch` 안으로
       갔다(그 사이에 「같은 부품인가」 판단이 끼기 때문이다). 🔴 **사본이 아니라 묶음에서
       온다**는 것은 그대로다 — 그 모듈이 같은 묶음에서 들여온다(바로 아래 단언). */
    assert.ok(
      formSource.includes(
        'import {\n  PartSuggestionList,\n  canPickPartOption,\n  filterPartOptions,\n  partOptionDetail,\n  partPickName,\n} from "@dss/core/ui/inventory/part-picker";'
      ),
      "고르개를 공용 묶음에서 들여오지 않는다"
    );
    assert.ok(
      read("src/components/quotes/quote-part-pick.ts").includes(
        'import { partPickPatch } from "@dss/core/ui/inventory/part-picker";'
      ),
      "고른 조각을 짓는 모듈이 공용 묶음에서 들여오지 않는다 — 사본을 지었을 수 있다"
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

describe("🔴 재고가 견적서 화면으로 흘러갈 길이 없다", () => {
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

  /**
   * 🔴 **옛 길이 남아 있으면 안 된다**(2026-10-17). 같은 DB 의 A/S 부품 표를 곧바로
   * 읽던 조회 둘은 파일째 지웠다 — 그 표에는 새 부품이 들어오지 않으므로, 한 화면이라도
   * 저 길로 되돌아가면 그 화면만 **조용히 옛 목록**을 보인다.
   *
   * 🔵 지운 것은 **읽는 코드**뿐이다 — 표(`parts` · 단가 표 둘)는 그대로 있고 A/S 가 쓴다.
   */
  test("🔴 옛 조회(getPartPickerList · getPartPickerUnitPrices)가 저장소에 없다", () => {
    assert.equal(
      existsSync(fileURLToPath(new URL("src/lib/db/queries/inventory.ts", repoUrl))),
      false,
      "걷어낸 조회 파일이 되살아났다"
    );
    /* 🔴 **부르는 꼴 · 들여오는 꼴로 잰다**(위 형제 시험과 같은 까닭이다) — 걷어낸
       까닭을 적어 둔 주석들이 이름을 그대로 쓰고 있어, 이름만 찾으면 그 설명에 걸린다. */
    for (const gone of [
      "getPartPickerList(",
      "getPartPickerUnitPrices(",
      'from "@/lib/db/queries/inventory"',
    ]) {
      for (const file of implementationFiles()) {
        assert.equal(
          read(file).includes(gone),
          false,
          `${file} 가 ${gone} 를 쓴다 — 부품 마스터는 재고 관리에서 온다`
        );
      }
    }
  });
});

describe("페이지 둘이 **재고 관리에서** 받아 실어 보낸다 — 관문 뒤에서", () => {
  for (const [label, source] of [
    ["새 견적서", newPageSource],
    ["견적서 수정", editPageSource],
  ] as const) {
    test(`${label} 화면이 통로에서 받아 두 목록을 넘긴다`, () => {
      const body = flat(source);
      assert.ok(body.includes("partOptions={partOptions}"), "partOptions 를 넘기지 않는다");
      assert.ok(body.includes("partPrices={partPrices}"), "partPrices 를 넘기지 않는다");
      assert.ok(
        body.includes("const partOptions = toPartPickerOptions(inventoryParts);"),
        "받아 온 것을 고르개 줄로 옮겨 담지 않는다"
      );
      // 🔴 **통로를 두 번 두드리지 않는다.** 단가는 같은 응답의 견적가 · O/H 견적가를
      //    옮겨 담을 뿐이다(toPartPickerPriceRows 머리말).
      assert.ok(
        body.includes(
          'const partPrices = inventoryParts.status === "ok" ? toPartPickerPriceRows(inventoryParts.value) : [];'
        ),
        "단가를 같은 응답에서 옮겨 담지 않는다"
      );
      assert.equal(
        source.match(/fetchInventoryParts\(/g)?.length,
        1,
        "🔴 통로를 한 번만 두드려야 한다 — 두 번 두드리면 화면 열기가 그만큼 늦는다"
      );
      // 🔴 **이미 나란히 도는 Promise.all 안**이어야 한다. 차례로 기다리면 저쪽이
      //    느린 날 견적서 화면이 열리는 데 그만큼 더 걸린다.
      const all = body.indexOf("await Promise.all([");
      assert.ok(all >= 0 && all < body.indexOf("fetchInventoryParts()"), "함께 기다리지 않는다");
      assert.ok(
        body.indexOf("fetchInventoryParts()") < body.indexOf("]);"),
        "Promise.all 밖에서 따로 기다린다"
      );
      // 🔴 통로를 두드리는 것이 **쓰기 권한 판정 뒤**여야 한다. 앞에 두면 들어올 수
      //    없는 사람 때문에도 재고 관리를 한 번씩 부르는 셈이 된다.
      assert.ok(
        body.indexOf('hasPermission(user, "quotes", "WRITE")') < body.indexOf("fetchInventoryParts()"),
        "권한 판정보다 통로가 먼저다"
      );
    });

    /**
     * 🔴 **이 조각에서 제일 중요한 줄이다.** 페이지가 `status === "ok"` 로 미리 풀어
     * 빈 배열을 폼에 넘기면, 재고 관리가 꺼진 날 화면이 「재고에 부품이 하나도 없다」고
     * 거짓말한다 — 사람은 그 말을 믿고 손으로 품명을 적거나 멀쩡히 있는 부품을 찾아
     * 헤맨다. 갈래는 **폼까지 그대로** 간다.
     */
    test(`🔴 ${label} 화면이 못 받아 온 갈래를 폼까지 그대로 내려보낸다`, () => {
      const body = flat(source);
      assert.equal(
        /partOptions = inventoryParts\.status/.test(body),
        false,
        "페이지가 갈래를 미리 풀어 버린다 — 폼이 까닭을 말할 길이 사라진다"
      );
      assert.equal(
        /toPartPickerOptions\(inventoryParts\.value\)/.test(body),
        false,
        "성공 갈래의 알맹이만 옮긴다 — 실패가 어디에도 남지 않는다"
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
    /* ⚠️ 2026-10-17(둘째) — 그 조각을 짓는 일이 `quotePartNameEditPatch` 로 갔다(같은 날
       들어온 「상세가 사라지면 단가도 비운다」가 거기 얹히기 때문이다). 🔴 **FK 를 푼다는
       것은 그대로다** — 그래서 **그 함수 몸통 안**에서 잰다. */
    assert.ok(
      form.includes("updateItem(row.key, quotePartNameEditPatch(row, e.target.value));"),
      "글자를 칠 때 줄에 붓는 조각이 달라졌다"
    );
    const mover = flat(read("src/components/quotes/quote-part-pick.ts"));
    const at = mover.indexOf("export function quotePartNameEditPatch(");
    assert.notEqual(at, -1, "그 조각을 짓는 함수가 없다");
    assert.ok(mover.slice(at, at + 400).includes("partId: null"), "이름만 고쳐도 part_id 가 남는다");
  });

  test("🔴 고를 때 건네는 것 둘 — OH 표시 · 단가 목록", () => {
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
    /**
     * ⚠️ 2026-10-17(둘째) — **셋째(`currentUnitPrice`)는 폼이 안 건넨다.** 「덮을까
     * 지킬까」가 **같은 부품을 다시 골랐는가**로 갈리게 되었고(「부품이 바뀌면 단가도
     * 따라간다」), 그 판단은 줄의 번호를 쥔 `quotePartPickPatch` 가 한다.
     * 🔴 여기서 다시 건네면 **언제나 지키게** 되어 다른 부품으로 바꾼 줄에 앞 부품의
     *    금액이 남는다 — 고치려던 그 증상 그대로다.
     */
    const mover = flat(read("src/components/quotes/quote-part-pick.ts"));
    const at = mover.indexOf("export function quotePartPickPatch(");
    assert.notEqual(at, -1, "고르개를 부르는 함수가 없다");
    assert.ok(
      mover.slice(at, at + 700).includes('currentUnitPrice: same ? row.unitPrice : "",'),
      "🔴 적혀 있는 금액을 안 건네면 같은 부품을 다시 골랐을 때 덮는다"
    );
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
    /* ⚠️ 2026-10-17 — 안내가 **두 가지 더** 말한다(쓰는 분 지적 ①②): 줄에 적히는 이름은
       고객사 품명이고, 칸 밑의 작은 글씨는 작성자만 본다. 찾는 칸에도 고객사 품명이
       들어갔다(고르개가 처음부터 그 칸으로 거른다). 🔴 막으려던 것은 그대로다 —
       **찾아 고르는 길과 손으로 적는 길을 화면이 말한다.** */
    assert.ok(form.includes("품명 칸에 글자를 치면 재고 관리의 부품을"), "안내 문장이 없다");
    assert.ok(
      form.includes("<b>품명 / 품명2 / 고객사 품명 / 도번 / 교산 품번</b>"),
      "무엇으로 찾는지 안 적혀 있다"
    );
    assert.ok(form.includes("지금처럼 그냥 적으면 됩니다"), "손으로 적는 길이 남는다는 말이 없다");
    assert.ok(form.includes("줄에 적히는 이름은 <b>고객사 품명</b>"), "적히는 이름이 무엇인지 안 적혀 있다");
  });
});

/**
 * ============================================================================
 * 🔴 못 받아 왔을 때 — 「없음」이 아니라 「확인 못 함」 (2026-10-17)
 * ============================================================================
 * 재고 관리가 꺼져 있거나 늦거나 토큰이 틀리면 고를 부품이 없다. 그때 화면이 아무 말도
 * 않으면 **사람은 「재고에 부품이 하나도 없다」로 읽고 그대로 믿는다** — 멀쩡히 있는
 * 부품을 두고. 그래서 갈래를 폼까지 그대로 나르고, 폼은 **까닭을 적는다.**
 * 🔵 그러면서도 **손으로 적는 길은 막지 않는다** — 재고 관리가 꺼져 있다고 견적서를 못
 *    쓰게 되면 그것이 더 큰 사고다.
 * ============================================================================
 */
describe("🔴 못 받아 왔을 때 폼이 하는 말", () => {
  test("🔴 옮기는 함수가 실패 갈래를 **그대로** 넘긴다 — 빈 목록으로 바꾸지 않는다", () => {
    assert.deepEqual(toPartPickerOptions({ status: "unreachable", reason: "timeout" }), {
      status: "unreachable",
      reason: "timeout",
    });
    // 🔵 200 에 빈 목록이 온 것은 **사실**이다 — 이것만 ok 다(그때는 안내가 뜨지 않는다).
    assert.deepEqual(toPartPickerOptions({ status: "ok", value: [] }), { status: "ok", value: [] });
  });

  test("폼이 갈래를 받는다 — 목록이 아니라", () => {
    assert.ok(
      form.includes("partOptions: InventoryResult<PartPickerRow[]>;"),
      "🔴 프롭이 목록이면 페이지가 어딘가에서 빈 배열로 뭉갰다는 뜻이다"
    );
    /* ⚠️ 2026-10-17 — 같은 모듈에서 **하나 더** 들여온다(`CUSTOMER_NAME_EMPTY_NOTICE` —
       고객사 품명이 빈 부품을 못 담는 까닭). 🔴 막으려던 것은 그대로다 — **사람에게 하는
       말을 폼이 제 손으로 지어내지 않는다.** */
    assert.ok(
      formSource.includes('} from "@/lib/domain/inventory-gateway";'),
      "까닭을 적는 말을 제 손으로 지어낸다 — A/S 와 글자가 갈린다"
    );
    assert.ok(formSource.includes("inventoryUnreachableMessage"), "못 받아 온 까닭을 그 모듈에서 안 가져온다");
  });

  test("🔴 빈 목록으로 접는 자리가 **한 곳**뿐이다 — 후보 목록이 받는 값", () => {
    assert.ok(
      form.includes('const partOptionRows = partOptions.status === "ok" ? partOptions.value : [];'),
      "후보 목록에 넘길 줄을 고르는 자리가 없다"
    );
    assert.equal(
      formSource.match(/partOptions\.status === "ok" \? partOptions\.value : \[\]/g)?.length,
      1,
      "빈 목록으로 접는 자리가 둘이다 — 한 곳은 까닭을 잃는다"
    );
    assert.ok(
      form.includes("filterPartOptions(partOptionRows, row.partNameText)"),
      "후보 목록이 푼 줄이 아니라 갈래를 받는다"
    );
  });

  /**
   * 🔴 **「맞으면 되나」와 「틀리면 안 되나」를 둘 다 본다.** 안내가 있기만 하면 되는 것이
   * 아니다 — 잘 받아 온 날에도 떠 있으면 사람은 멀쩡한 목록을 두고 통로를 의심한다.
   * 폼은 서버 액션을 물고 있어 `npm test` 에서 렌더할 수 없으므로(이 파일 머리말),
   * **그 안내가 실패 갈래 안에만 있는지**를 글자로 잰다.
   */
  test("🔴 안내는 **못 받아 온 갈래 안에만** 있다 — 잘 받아 온 날에는 그려지지 않는다", () => {
    const guard = '{partOptions.status !== "ok" && (';
    const guardAt = formSource.indexOf(guard);
    assert.ok(guardAt > 0, "못 받아 온 갈래를 그리는 자리가 없다");

    const noticeText = "재고 관리의 부품 목록을 불러오지 못했습니다";
    assert.equal(
      formSource.match(/재고 관리의 부품 목록을 불러오지 못했습니다/g)?.length,
      1,
      "🔴 같은 안내가 둘이다 — 한 쪽은 갈래 밖에 있어 잘 받아 온 날에도 뜬다"
    );
    const noticeAt = formSource.indexOf(noticeText);
    assert.ok(noticeAt > guardAt, "안내가 갈래보다 앞에 있다 — 조건 밖이다");
    assert.ok(
      formSource.slice(guardAt, formSource.indexOf(")}", noticeAt)).includes(noticeText),
      "안내가 그 갈래의 괄호 안에 있지 않다"
    );
  });

  test("🔴 안내가 **까닭**을 적고 「없다」라고 말하지 않는다", () => {
    assert.ok(
      form.includes(
        "재고 관리의 부품 목록을 불러오지 못했습니다 — {inventoryUnreachableMessage(partOptions.reason)}"
      ),
      "까닭(저쪽이 왜 안 됐는지)을 적지 않는다"
    );
    assert.ok(
      form.includes("<b>없는 것이 아니라 확인하지 못한 것</b>입니다."),
      "「없다」와 「모른다」를 가르는 문장이 없다"
    );
    // 🔵 손으로 적는 길이 그대로 열려 있다는 말까지가 이 안내의 몫이다.
    assert.ok(form.includes("품명과 단가는 손으로 적을 수 있습니다."), "막다른 길처럼 읽힌다");
    // 🔴 그 까닭 글자 어느 것도 「없습니다」라고 말하지 않는다(글자는 저 모듈 한 곳이다).
    for (const reason of ["not_configured", "timeout", "unauthorized", "api_closed", "error"] as const) {
      assert.equal(
        /재고에 (부품이 )?없/.test(inventoryUnreachableMessage(reason)),
        false,
        `${reason} 의 말이 「재고에 없다」로 읽힌다`
      );
    }
  });

  test("🔴 안내가 **부품 비용 구역 안**에 있다 — 고를 칸 곁이 아니면 눈에 안 닿는다", () => {
    const sectionAt = formSource.indexOf('{isCable ? "품목" : "부품 비용"}');
    assert.ok(sectionAt > 0, "부품 비용 구역의 머리를 못 찾았다");
    assert.ok(
      sectionAt < formSource.indexOf('{partOptions.status !== "ok" && ('),
      "안내가 부품 비용 구역보다 앞에 있다"
    );
  });
});
