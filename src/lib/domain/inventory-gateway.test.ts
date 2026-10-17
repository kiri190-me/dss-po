import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  CHARGE_TYPE_LABELS,
  CUSTOMER_NAME_EMPTY_NOTICE,
  INTAKE_NUMBER_RE,
  INVENTORY_STOCK_AS_OF_NOTE,
  filterInventoryParts,
  inventoryPartCustomerName,
  inventoryPartIdLabels,
  inventoryPartNoteFirstLine,
  inventoryPartSpec,
  inventoryStockText,
  inventoryUnreachableMessage,
  isChargeType,
  parseInventoryOhTemplateResponse,
  parseInventoryPartsResponse,
  parseInventoryStockRequestsResponse,
  toPartPickerOptions,
  toPartPickerPriceRows,
  toPartPickerRow,
  toPartPickerRows,
  type InventoryPart,
} from "./inventory-gateway";

/**
 * ============================================================================
 * 재고 관리에서 받아 온 것을 읽는 규칙 (2026-10-17)
 * ============================================================================
 * 🔴 여기서 지키는 가장 큰 것: **「모양이 아니다」와 「하나도 없다」가 다른 값이어야 한다.**
 *    파서가 둘을 뭉개 빈 배열을 돌려주면 부르는 쪽이 「못 받아 왔다」로 바꿀 길이 사라지고,
 *    화면은 재고가 멀쩡한데도 「고를 부품이 하나도 없다」고 말한다.
 *
 * 🔴 두 번째: **재고 · 소유 · 비고가 고르개 줄로 넘어가지 않는다.** props 는 브라우저로
 *    그대로 나가므로 「화면에서 안 그린다」로는 모자라다 — 옮기는 함수에서 떼어 내야 한다.
 *
 * 🔵 이 사이트는 재고 관리에 **아무것도 쓰지 않는다.** 그래서 A/S 의 같은 이름 시험에 있는
 *    올리는 줄 모양 검사 · 거두기 판정 · 화면 모양 변환의 절은 **가져오지 않았다** — 여기
 *    없는 함수의 시험이다.
 *
 * 값은 전부 지어낸 것이다 — 실제 고객사 · 모델 · L/N · S/N 을 적지 않는다(공개 저장소).
 * ============================================================================
 */

/**
 * 재고 관리가 돌려주는 부품 줄(저쪽 API.md 2절의 모양).
 *
 *  · 11 — 다 들어 있다(견적가 · O/H 견적가 둘 다)
 *  · 12 — **견적가가 `0`(무상)이고 O/H 는 `null`**(정하지 않았다)
 *  · 13 — 둘 다 `null` — 단가 줄에 아예 오르지 않는다
 */
const PARTS_BODY = {
  generatedAt: "2026-10-17T05:12:00.000Z",
  count: 3,
  parts: [
    {
      no: 11,
      name: "마그네트론",
      name2: "SPEC-A1",
      customerName: "발진관 조립품",
      kyosanPartNo: "KY-7788",
      drawingNo: "DWG-1001",
      quantity: 7,
      note: "수리소 관리용\n두 번째 줄",
      item: { code: "PCB", name: "PCB" },
      category: { code: "RFG", label: "RFG" },
      owner: { code: "SERVICE_SPARE", label: "보수부재" },
      // 🔴 견적가 둘 — 부품 고르개가 단가 칸을 채우는 값이다.
      quotePrice: 125000,
      overhaulQuotePrice: 98000,
      updatedAt: "2026-10-06T03:00:00.000Z",
    },
    {
      no: 12,
      name: "서큘레이터",
      name2: "",
      customerName: "",
      kyosanPartNo: "ky-9900",
      drawingNo: "",
      quantity: 0,
      note: "",
      owner: { code: "DSS", label: "DSS" },
      quotePrice: 0,
      overhaulQuotePrice: null,
    },
    {
      no: 13,
      name: "케이블 어셈블리",
      name2: "RG-TEST-3M",
      customerName: "",
      kyosanPartNo: "",
      drawingNo: "dwg-2002",
      quantity: 3,
      note: "",
      owner: { code: "KYOSAN", label: "교산 보유" },
    },
  ],
};

const PARTS = parseInventoryPartsResponse(PARTS_BODY) as InventoryPart[];

describe("부품 목록 읽기", () => {
  test("모양이면 그대로 읽고, 소유·비고를 함께 들고 온다", () => {
    const parts = parseInventoryPartsResponse(PARTS_BODY);
    assert.ok(parts);
    assert.equal(parts.length, 3);
    assert.equal(parts[0].no, 11);
    assert.equal(parts[0].owner.label, "보수부재");
    // 같은 품명이 여럿일 때 사람이 가르는 단서는 비고의 첫 줄이다.
    assert.equal(inventoryPartNoteFirstLine(parts[0]), "수리소 관리용");
    assert.equal(inventoryPartNoteFirstLine(parts[1]), "");
  });

  test("🔴 모양이 아니면 null — 빈 배열이 아니다", () => {
    // 부르는 쪽은 null 을 「못 받아 왔다」로 바꾼다. 여기서 []를 돌려주면 그 길이 끊긴다.
    assert.equal(parseInventoryPartsResponse(null), null);
    assert.equal(parseInventoryPartsResponse("<html>500</html>"), null);
    assert.equal(parseInventoryPartsResponse([]), null);
    assert.equal(parseInventoryPartsResponse({}), null);
    assert.equal(parseInventoryPartsResponse({ parts: "nope" }), null);
  });

  test("🔴 200 에 빈 목록이 온 것은 「하나도 없다」는 사실이다 — null 이 아니다", () => {
    assert.deepEqual(parseInventoryPartsResponse({ count: 0, parts: [] }), []);
  });

  test("🔴 견적가 둘 — `0`(무상)과 「없음」(정하지 않음)을 가른다", () => {
    assert.equal(PARTS[0].quotePrice, 125000);
    assert.equal(PARTS[0].overhaulQuotePrice, 98000);
    // 🔴 `0` 이 null 로 뒤집히면 **무상으로 정해 둔 부품**이 「안 정함」이 된다.
    assert.equal(PARTS[1].quotePrice, 0);
    assert.equal(PARTS[1].overhaulQuotePrice, null);
    // 🔴 칸이 아예 없는 줄은 「정하지 않았다」다. 0 으로 채우면 그 부품이 0원으로
    //    청구되고, 아무도 눈치채지 못한다.
    assert.equal(PARTS[2].quotePrice, null);
    assert.equal(PARTS[2].overhaulQuotePrice, null);
  });

  test("번호나 품명이 빈 줄은 버린다 — 가리킬 수 없는 줄이다", () => {
    const parts = parseInventoryPartsResponse({
      parts: [
        { no: 0, name: "번호 없음" },
        { no: 5, name: "" },
        { no: "6", name: "글자 번호" },
        { no: 7, name: "쓸 수 있는 줄" },
      ],
    });
    assert.deepEqual(parts?.map((p) => p.no), [7]);
  });
});

describe("화면에서 거르기 — 저쪽 q 와 같은 잣대", () => {
  test("빈 글자는 빈 목록 — 수백 개를 통째로 펼치지 않는다", () => {
    assert.deepEqual(filterInventoryParts(PARTS, ""), []);
    assert.deepEqual(filterInventoryParts(PARTS, "   "), []);
  });

  test("다섯 칸에서 찾는다 — 품명·품명2·고객사 품명·교산 품번·도번", () => {
    assert.deepEqual(filterInventoryParts(PARTS, "마그네").map((p) => p.no), [11]);
    assert.deepEqual(filterInventoryParts(PARTS, "SPEC-A1").map((p) => p.no), [11]);
    assert.deepEqual(filterInventoryParts(PARTS, "발진관").map((p) => p.no), [11]);
    assert.deepEqual(filterInventoryParts(PARTS, "KY-7788").map((p) => p.no), [11]);
    assert.deepEqual(filterInventoryParts(PARTS, "dwg-2002").map((p) => p.no), [13]);
  });

  test("🔴 낱말이 여럿이면 **모두** 들어 있어야 한다(저쪽 q 와 같다)", () => {
    assert.deepEqual(filterInventoryParts(PARTS, "마그네 발진관").map((p) => p.no), [11]);
    assert.deepEqual(filterInventoryParts(PARTS, "마그네 서큘"), []);
  });

  test("대소문자를 가리지 않는다", () => {
    assert.deepEqual(filterInventoryParts(PARTS, "KY-9900").map((p) => p.no), [12]);
    assert.deepEqual(filterInventoryParts(PARTS, "rg-test").map((p) => p.no), [13]);
  });
});

/**
 * ============================================================================
 * 🔴 부품 고르개로 넘기는 줄 — **재고 · 소유 · 비고는 넘어가지 않는다**
 * ============================================================================
 * 받아 온 쪽(`InventoryPart`)에는 수량 · 소유 · 비고가 들어 있다. 그 셋은 재고 담당의
 * 정보라 견적서 화면으로 내보내지 않는다 — 🔴 **화면에서 안 그리는 것으로는 모자라다.**
 * props 는 브라우저로 그대로 나가므로 **옮기는 함수에서 떼어 내야** 안 나간다.
 *
 * 🔵 열쇠가 **재고 관리의 부품 번호(No.)** 인 것도 여기서 잰다. 같은 DB 의 `parts.id`(UUID)가
 *    아니라서, 그 값을 `part_id`(FK)에 넣으면 저장이 거절된다.
 * ============================================================================
 */
describe("🔴 고르개 줄로 옮기기 — 경계를 긋는 자리는 하나다", () => {
  test("🔴 옮긴 줄은 여섯 칸뿐이다 — 재고 · 소유 · 비고를 **아예 담지 않는다**", () => {
    const mapped = toPartPickerRows(PARTS);
    assert.deepEqual(
      Object.keys(mapped[0]).sort(),
      ["customerPartName", "drawingNo", "id", "kyosanPartNo", "partName", "partSpec"],
      "칸이 늘었다 — 재고 담당의 정보가 견적서 화면으로 흘러간다"
    );
    const asText = JSON.stringify(mapped);
    for (const forbidden of ["보수부재", "교산 보유", "수리소 관리용", "quantity", "owner", "note"]) {
      assert.ok(!asText.includes(forbidden), `옮긴 줄에 '${forbidden}' 이 있다`);
    }
  });

  test("줄 하나를 옮기는 함수도 같은 여섯 칸이다 — 손으로 칸을 적는 자리를 만들지 않는다", () => {
    assert.deepEqual(toPartPickerRow(PARTS[0]), {
      id: "11",
      partName: "마그네트론",
      partSpec: "SPEC-A1",
      customerPartName: "발진관 조립품",
      drawingNo: "DWG-1001",
      kyosanPartNo: "KY-7788",
    });
  });

  test("🔴 열쇠는 재고 관리의 부품 번호(No.)다 — 같은 DB 의 UUID 가 아니다", () => {
    assert.deepEqual(toPartPickerRows(PARTS).map((row) => row.id), ["11", "12", "13"]);
    assert.deepEqual(toPartPickerPriceRows(PARTS).map((row) => row.partId), ["11", "12"]);
  });

  test("🔴 단가 줄에도 재고 · 소유 · 비고가 없다 — 열쇠와 값 둘뿐이다", () => {
    assert.deepEqual(Object.keys(toPartPickerPriceRows(PARTS)[0]).sort(), [
      "overhaulUnitPrice",
      "partId",
      "unitPrice",
    ]);
  });

  test("🔴 `0`(무상)은 `\"0\"` 으로, 「정하지 않음」은 `null` 로 — 0 으로 채우지 않는다", () => {
    const byId = new Map(toPartPickerPriceRows(PARTS).map((row) => [row.partId, row]));
    assert.deepEqual(byId.get("11"), { partId: "11", unitPrice: "125000", overhaulUnitPrice: "98000" });
    // 🔴 무상으로 정해 둔 0 이 null 로 뒤집히면 고르개가 단가 칸을 비워 둔다.
    assert.deepEqual(byId.get("12"), { partId: "12", unitPrice: "0", overhaulUnitPrice: null });
    // 🔴 둘 다 없는 부품은 **줄 자체가 없다** — 고르개가 「정하지 않았다」로 읽는다.
    assert.equal(byId.has("13"), false);
  });

  test("🔴 못 받아 온 것을 빈 목록으로 바꾸지 않는다 — 「없다」와 「모른다」가 다르다", () => {
    assert.deepEqual(toPartPickerOptions({ status: "unreachable", reason: "timeout" }), {
      status: "unreachable",
      reason: "timeout",
    });
    // 반대쪽: 200 에 빈 목록이 온 것은 사실이라 그대로 「없다」로 남는다.
    assert.deepEqual(toPartPickerOptions({ status: "ok", value: [] }), { status: "ok", value: [] });
  });
});

describe("O/H 템플릿 읽기", () => {
  test("🔴 「이어 둔 템플릿이 없다」는 오류가 아니다 — template: null 로 온다", () => {
    assert.deepEqual(parseInventoryOhTemplateResponse({ modelId: "m", template: null }), { template: null });
  });

  test("🔴 모양이 아니면 null — 「템플릿이 없다」와 섞이지 않는다", () => {
    assert.equal(parseInventoryOhTemplateResponse(null), null);
    assert.equal(parseInventoryOhTemplateResponse({ template: { name: "줄이 없다" } }), null);
  });

  test("안 이어진 줄도 그대로 들고 온다 — 빼면 「다 담겼다」고 믿게 된다", () => {
    const parsed = parseInventoryOhTemplateResponse({
      template: {
        id: "t1",
        name: "시험용 O/H",
        note: "",
        items: [
          { displayOrder: 1, no: 11, name: "증폭기 PCB", partName: "마그네트론", quantity: 2, linked: true },
          { displayOrder: 2, no: null, name: "유량계", partName: null, quantity: 1, linked: false },
        ],
      },
    });
    assert.equal(parsed?.template?.items.length, 2);
    assert.equal(parsed?.template?.items[1].linked, false);
    assert.equal(parsed?.template?.items[1].name, "유량계");
  });

  test("🔴 번호가 없는데 linked 가 참이면 거짓으로 본다 — 안 이어진 줄을 이어진 것처럼 다루지 않는다", () => {
    const parsed = parseInventoryOhTemplateResponse({
      template: { id: "t1", name: "", note: "", items: [{ displayOrder: 1, no: null, name: "유량계", quantity: 1, linked: true }] },
    });
    assert.equal(parsed?.template?.items[0].linked, false);
  });
});

/**
 * ============================================================================
 * 🔴 인수번호 모양 — **세 시스템이 같은 자로 잰다**
 * ============================================================================
 * 서버가 재고 관리를 두드리기 **전에** 이 자로 거른다. 자가 갈리면 한쪽이 400 이라 부르지도
 * 못하는 번호를 다른 쪽은 받아들이고, 그 어긋남은 「저기서는 되던 번호가 여기서는 안 된다」
 * 로만 드러난다.
 *
 * 🔴 **「맞으면 되나」와 「틀리면 안 되나」를 둘 다 본다.** 맞는 쪽만 재면 자가 `/^D/` 처럼
 *    느슨해져도 이 시험은 통과한다 — 그러면 두드리기 전 거르기가 조용히 무너진다.
 * ============================================================================
 */
describe("🔴 인수번호 모양 — 맞는 것과 틀린 것을 둘 다 잰다", () => {
  test("맞는 모양: D + 숫자 6자리", () => {
    for (const ok of ["D260701", "D000000", "D999999"]) {
      assert.ok(INTAKE_NUMBER_RE.test(ok), `${ok} 이 거절됐다`);
    }
  });

  test("🔴 틀린 모양은 **전부** 거절한다 — 자가 느슨해지면 여기서 붉어진다", () => {
    for (const bad of [
      "", // 빈 글자
      "D26070", // 다섯 자리
      "D2607011", // 일곱 자리
      "d260701", // 소문자 — 부르는 쪽이 대문자로 바꿔 넘긴다
      "260701", // D 가 없다
      "D26070A", // 끝이 글자
      "DD260701", // D 가 둘
      "D-260701", // 가운데 글자
      "D260701 ", // 뒤 공백 — 부르는 쪽이 다듬어 넘긴다
      " D260701", // 앞 공백
      "D260701\n", // 줄바꿈 — `$` 를 `\n` 앞에서 끊는 자였다면 여기서 통과한다
    ]) {
      assert.equal(INTAKE_NUMBER_RE.test(bad), false, `${JSON.stringify(bad)} 이 통과했다`);
    }
  });

  test("🔴 DB CHECK 보다 **넓은 것이 맞다** — 좁히면 세 시스템의 자가 갈린다", () => {
    /**
     * `repair_cases_intake_number_format` 은 가운데 두 자리를 달로 보아 01~12 만 받는다.
     * 🔴 이 자는 **저쪽 통로가 받는 모양**을 맞추는 것이라 일부러 넓다. 좁은 쪽에 걸리는
     *    번호는 그런 수리 건이 애초에 없어 저쪽에서 빈 목록으로 돌아온다 — 막아 줄 것이 없다.
     *    「DB 랑 다르네」로 보고 좁히면 이 단언이 깨진다.
     */
    assert.ok(INTAKE_NUMBER_RE.test("D269901"), "달이 99 인 번호까지 넓게 받는 것이 맞다");
    assert.ok(INTAKE_NUMBER_RE.test("D260001"), "달이 00 인 번호까지 넓게 받는 것이 맞다");
  });
});

describe("그 수리 건에 나간 부품 읽기", () => {
  const BODY = {
    generatedAt: "2026-10-17T05:12:00.000Z",
    count: 2,
    requests: [
      {
        requestKey: "AS-TEST-0001",
        id: "r1",
        intakeNumber: "D260701",
        type: "USE",
        status: { code: "PARTIAL", label: "일부 나감" },
        closed: false,
        requestedAt: "2026-10-16T01:00:00.000Z",
        lines: [{ no: 11, name: "마그네트론", quantity: 8, issued: 5 }],
        decision: null,
        hold: null,
      },
      {
        requestKey: null,
        id: "r2",
        intakeNumber: "D260701",
        type: "USE",
        status: { code: "CONFIRMED", label: "마감" },
        closed: true,
        requestedAt: "2026-10-15T06:00:00.000Z",
        lines: [{ no: null, name: "(지워진 부품)", quantity: 2, issued: 0 }],
        decision: { byName: "담당자", at: "2026-10-15T08:00:00.000Z", note: "재고가 없습니다" },
        hold: { reason: "부품 입고 대기", byName: "담당자", at: "2026-10-15T07:00:00.000Z" },
      },
    ],
    notFound: [],
  };

  test("🔴 상태 글자를 저쪽이 준 그대로 들고 온다 — 손으로 다시 적지 않는다", () => {
    const requests = parseInventoryStockRequestsResponse(BODY);
    assert.equal(requests?.[0].status.label, "일부 나감");
    // 「마감」은 상태값이 아니라 closed 칸이다 — code 는 CONFIRMED 다.
    assert.equal(requests?.[1].status.code, "CONFIRMED");
    assert.equal(requests?.[1].status.label, "마감");
    assert.equal(requests?.[1].closed, true);
  });

  test("🔵 requestKey 가 null 인 줄 = 재고 관리에서 직접 올린 신청. 지어내지 않는다", () => {
    const requests = parseInventoryStockRequestsResponse(BODY);
    assert.equal(requests?.[0].requestKey, "AS-TEST-0001");
    assert.equal(requests?.[1].requestKey, null);
  });

  test("차례를 다시 매기지 않는다 — 저쪽이 최근 것부터 준다", () => {
    const requests = parseInventoryStockRequestsResponse(BODY);
    assert.deepEqual(requests?.map((r) => r.id), ["r1", "r2"]);
  });

  test("나간 수량과 결정·보류 사유를 그대로 들고 온다", () => {
    const requests = parseInventoryStockRequestsResponse(BODY);
    assert.deepEqual(requests?.[0].lines, [{ no: 11, name: "마그네트론", quantity: 8, issued: 5 }]);
    assert.equal(requests?.[1].decision?.note, "재고가 없습니다");
    assert.equal(requests?.[1].hold?.reason, "부품 입고 대기");
  });

  test("🔴 모양이 아니면 null, 빈 목록은 빈 목록", () => {
    assert.equal(parseInventoryStockRequestsResponse({ requests: null }), null);
    assert.equal(parseInventoryStockRequestsResponse("오류 페이지"), null);
    assert.deepEqual(parseInventoryStockRequestsResponse({ count: 0, requests: [], notFound: [] }), []);
  });
});

describe("🔴 올린 사람 — 가르는 값은 포털 번호뿐이다", () => {
  const MY_SUB = "지어낸-포털번호-나-1111";

  test("포털 번호와 이름을 그대로 읽는다", () => {
    const parsed = parseInventoryStockRequestsResponse({
      requests: [
        {
          requestKey: "AS-TEST-0001",
          id: "r1",
          intakeNumber: "D260701",
          status: { code: "PENDING", label: "확인 대기" },
          requester: { sub: MY_SUB, name: "홍길동" },
        },
      ],
    });
    assert.deepEqual(parsed?.[0].requester, { sub: MY_SUB, name: "홍길동" });
  });

  test("🔴 포털 번호가 없으면 통째로 null — 이름만으로 사람을 가르지 않는다", () => {
    const parsed = parseInventoryStockRequestsResponse({
      requests: [
        {
          requestKey: "AS-TEST-0009",
          id: "r9",
          status: { code: "PENDING", label: "확인 대기" },
          requester: { name: "홍길동" },
        },
      ],
    });
    assert.equal(parsed?.[0].requester, null);
  });

  test("requester 칸이 아예 없는 응답도 읽는다 — 「누가 올렸는지 모른다」다", () => {
    const parsed = parseInventoryStockRequestsResponse({
      requests: [{ requestKey: "AS-TEST-0010", id: "r10", status: { code: "PENDING", label: "확인 대기" } }],
    });
    assert.equal(parsed?.[0].requester, null);
  });
});

describe("자잘한 것", () => {
  test("유상/무상 코드와 글자", () => {
    assert.equal(isChargeType("PAID"), true);
    assert.equal(isChargeType("free"), false);
    assert.equal(CHARGE_TYPE_LABELS.PAID, "유상");
    assert.equal(CHARGE_TYPE_LABELS.FREE, "무상");
  });

  test("🔴 못 받아 온 까닭 다섯 다 「없습니다」라고 말하지 않는다", () => {
    for (const reason of ["not_configured", "timeout", "unauthorized", "api_closed", "error"] as const) {
      const message = inventoryUnreachableMessage(reason);
      assert.ok(message.length > 0, reason);
      assert.doesNotMatch(message, /재고에 (부품이 )?없습니다/, reason);
    }
  });
});

/**
 * ============================================================================
 * 🔴 부품 줄에 **그 부품의 모든 것**을 보인다 — 값이 있는 것만
 * ============================================================================
 * 다 적으면 줄이 길어져 **아무것도 안 읽히는** 쪽으로 망가진다. 그래서 「없는 칸은 안 그린다」가
 * 규칙이고, 🔴 **`-` 만 적힌 칸도 없는 칸**이다 — 이 자료는 엑셀에서 넘어와 빈칸 대신 `-` 가
 * 적힌 줄이 많다. 재고 관리도 **같은 글자들**을 빈 값으로 본다(저쪽 `DASH_ONLY`) — 자가
 * 어긋나면 한쪽은 「이름이 있다」고 그리는데 다른 쪽은 「비어 있다」고 한다.
 * ============================================================================
 */
describe("🔴 부품 줄에 보이는 것 — 값이 있는 것만, `-` 는 값이 아니다", () => {
  const part = (over: Partial<InventoryPart>): InventoryPart => ({
    no: 11,
    name: "마그네트론",
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
  });

  test("고객사 품명 — 적혀 있으면 그대로, 비어 있으면 빈 글자", () => {
    assert.equal(inventoryPartCustomerName(part({ customerName: "발진관 조립품" })), "발진관 조립품");
    assert.equal(inventoryPartCustomerName(part({ customerName: "" })), "");
  });

  test("🔴 `-` 만 적힌 고객사 품명은 **없는 것**이다 — 서류에 `-` 가 이름으로 찍히면 안 된다", () => {
    // 🔴 재고 관리도 `-` 를 고객사 품명으로 받지 않는다. 여기서 값으로 세면 견적서는 그
    //    부품을 고객사 이름으로 고를 수 있다고 그리고, 나가는 종이에는 `-` 가 찍힌다.
    for (const dash of ["-", "--", "–", "—", "－", "ㅡ", "  -  "]) {
      assert.equal(inventoryPartCustomerName(part({ customerName: dash })), "", dash);
    }
  });

  test("🔴 교산 품번 · 도번 — **값이 있는 것만** 이름표를 달아 돌려준다", () => {
    assert.deepEqual(
      inventoryPartIdLabels(part({ kyosanPartNo: "KY-7788", drawingNo: "DWG-1001" })),
      [
        { label: "교산 품번", value: "KY-7788" },
        { label: "도번", value: "DWG-1001" },
      ]
    );
    // 한쪽만 있으면 한 줄만 — 「도번 없음」을 적지 않는다.
    assert.deepEqual(inventoryPartIdLabels(part({ kyosanPartNo: "KY-7788", drawingNo: "-" })), [
      { label: "교산 품번", value: "KY-7788" },
    ]);
    // 둘 다 없으면 **아무것도 없다** — 화면이 그 줄을 아예 안 그린다.
    assert.deepEqual(inventoryPartIdLabels(part({ kyosanPartNo: "-", drawingNo: "" })), []);
  });

  test("품명2도 같은 자로 잰다 — 품명 뒤에 ` · -` 가 붙으면 읽는 눈을 뺏는다", () => {
    assert.equal(inventoryPartSpec(part({ name2: "SPEC-A1" })), "SPEC-A1");
    assert.equal(inventoryPartSpec(part({ name2: "-" })), "");
  });

  test("🔴 재고 수에는 **언제 잰 값인지**가 붙어 있다", () => {
    /**
     * 🔴 이 수는 화면을 **열 때** 한 번 받아 온 값이다. 숫자만 적으면 「지금 3개 있다」로
     *    읽혀, 그 수를 믿고 수량을 정했다가 막상 나갈 때 모자라면 사람은 재고 관리가
     *    틀렸다고 생각한다 — 틀린 것은 그 수를 **언제 잰 것인지 말하지 않은 화면**이다.
     * 🔵 「현재 재고」라고 적지 않는 까닭도 같다 — 그것은 더 틀린 말이다.
     */
    assert.equal(inventoryStockText(part({ quantity: 3 })), "재고 3개(불러온 때 기준)");
    // 0 도 그대로 적는다 — 「없다」가 아니라 「그때 0 이었다」다.
    assert.equal(inventoryStockText(part({ quantity: 0 })), "재고 0개(불러온 때 기준)");
    assert.ok(inventoryStockText(part({ quantity: 3 })).includes(INVENTORY_STOCK_AS_OF_NOTE));
    assert.doesNotMatch(inventoryStockText(part({ quantity: 3 })), /현재|지금/);
  });

  test("🔴 다섯 가지가 **모두** 나올 길이 있다 — 하나라도 빠지면 그 부품을 가릴 수 없다", () => {
    const full = part({
      name2: "SPEC-A1",
      customerName: "발진관 조립품",
      kyosanPartNo: "KY-7788",
      drawingNo: "DWG-1001",
    });
    const shown = [
      full.name,
      inventoryPartSpec(full),
      inventoryPartCustomerName(full),
      ...inventoryPartIdLabels(full).map((item) => item.value),
    ];
    assert.deepEqual(shown, ["마그네트론", "SPEC-A1", "발진관 조립품", "KY-7788", "DWG-1001"]);
  });

  test("🔴 비어 있을 때의 안내는 **까닭**까지 말한다 — 「없음」으로 끝내지 않는다", () => {
    assert.match(CUSTOMER_NAME_EMPTY_NOTICE, /고객사 품명 없음/);
    assert.match(CUSTOMER_NAME_EMPTY_NOTICE, /견적서/, "견적서에서 막히는 까닭이 안 적혀 있다");
  });
});
