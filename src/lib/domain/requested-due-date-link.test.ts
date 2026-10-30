import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMESTIC_ORDER_DUE_DATE_LINK_NOTE,
  DUE_DATE_FROM_DOMESTIC_ORDER_LABEL,
  DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_LABEL,
  DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_NOTE,
  DUE_DATE_FROM_REPAIR_CASE_LABEL,
  REPAIR_CASE_DUE_DATE_LINK_NOTE,
  resolveDomesticOrderDueDateDisplay,
  resolveDomesticOrderDueDateForComparison,
  resolveRepairCaseRequestedDueDate,
} from "./requested-due-date-link";
import { buildDomesticOrderCellUpdateFields } from "./domestic-order-cell-edit";
import { pickEarliestDueDate } from "./weekly-report-delivery";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져온 시험이다 — 가져오지 **않은** 묶음이 하나 있다 (2026-10-30)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 `src/lib/domain/requested-due-date-link.test.ts`
 * (커밋 `3851693` 기준 499줄). 잰 대상 파일이 저쪽과 머리말 아래 바이트 동일이라
 * (requested-due-date-link.ts 머리말), 그 울타리인 이 시험도 저쪽을 따라간다.
 *
 * ── 저쪽과 다른 점 둘 ──────────────────────────────────────────────────────
 * ① 🔴 **저쪽 ⑦ 묶음(「목록 조회가 빌려 올 재료를 실제로 싣고 오는가」)은 안 가져왔다.**
 *    그 셋은 `db/queries/repair-cases.ts` · `repair-cases-mine.ts` ·
 *    `repair-case-domestic-order-due-dates.ts` 의 **소스 글자를 읽어** 단언하는데,
 *    세 파일 다 이 사이트에 없다(전체 A/S 현황 · 내 작업은 저쪽 화면이다). 그대로
 *    가져오면 readFileSync 가 없는 파일을 열어 **결함과 무관하게 늘 빨간 시험**이 된다.
 *    🔵 그래서 번호를 당겨 메우지 않았다 — ⑦ 자리를 비워 두어야 저쪽과 맞대어 볼 때
 *    「빠진 것이 있다」가 눈에 보인다.
 * ② 아래 ⑧ 은 **이 사이트 전용**이다(저쪽에 없다). 까닭은 그 묶음 머리말에 적었다.
 *
 * 🔵 ⑥ 이 재는 상수 둘은 **이 사이트에서 부르는 화면이 없다.** 그래도 잰다 —
 * 상수가 이 저장소에 있는 한 재어져야 하고, 저쪽과 줄을 맞대어 볼 수 있어야 한다
 * (due-date-inversion.test.ts 머리말이 같은 말을 한다).
 * ============================================================================
 */

/**
 * ============================================================================
 * `납기요청일` ↔ `고객 요청 납기일` — 빌려 오기가 정말 한 방향인가
 * ============================================================================
 * 지키는 것은 여섯이다.
 *
 *  1. **자기 자리에 적힌 것이 먼저** — 양쪽 다 그렇다. 상대 값이 있어도 가리지
 *     않는다.
 *  2. **비었을 때만 빌린다** — 그리고 빌린 값에는 borrowed 표시가 붙는다.
 *  3. **양쪽 다 없으면 빈 값** — 화면이 "-"로 그린다. borrowed 는 거짓이다
 *     (빌려 온 것이 없으니 붙일 표시도 없다).
 *  4. **여럿 중 하나를 고르는 쪽은 주간보고와 같은 답** — 같은 함수를 부르므로
 *     같아야 한다. 그 사실을 시험이 직접 대조한다.
 *  5. **⚠️ 계산된 값은 저장 payload 에 실리지 않는다** — 빌려 온 날짜가
 *     dueDates 에 섞여 나가면 그 줄에 박제된다.
 *  6. **내자 한 줄을 하루로 접는 쪽도 같은 갈림을 쓴다**(2026-10-30, ③-b) —
 *     「납기 역전」이 그 하루로 재므로, 갈림이 ①과 어긋나면 화면은 이 줄의 날짜를
 *     그려 놓고 수리 건의 날짜로 재게 된다.
 *
 * 여기서 확인하지 않는 것: 여러 날짜를 어떤 글자로 적는가(메모 괄호 · 차례)는
 * domestic-order-list.test.ts 가 이미 본다. 이 파일이 보는 것은 **어느 쪽 값을
 * 쓰는가**뿐이다.
 * ============================================================================
 */

/** 내자 줄의 납기요청일 한 줄. 이 파일이 보는 두 칸만 만든다. */
function dueDate(date: string, note: string | null = null) {
  return { dueDate: date, note };
}

// ── ① 내자 정리 쪽 — 이 줄에 적힌 날짜가 먼저 ───────────────────────────

test("내자에 날짜가 있으면 내자 것이 보인다 — 수리 건 날짜가 있어도 가리지 않는다", () => {
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [dueDate("2026-01-20")],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  assert.deepEqual(display.lines, ["2026-01-20"]);
  assert.equal(display.borrowed, false, "이 줄에 적힌 값에 '빌려 옴' 표시가 붙었다");
});

test("내자 날짜가 여럿이면 전부 보이고, 수리 건 날짜는 끼어들지 않는다", () => {
  // 분할 납품이 이 모양이다. 사람이 늘어놓은 1차분·2차분 사이에 아무도 적지
  // 않은 날짜가 끼면, 이 칸은 "발주서에 이렇게 적혀 있다"는 기록이기를 그만둔다.
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [dueDate("2026-01-20", "1차분"), dueDate("2026-02-15", "2차분")],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  assert.deepEqual(display.lines, ["2026-01-20 (1차분)", "2026-02-15 (2차분)"]);
  assert.equal(display.borrowed, false);
});

test("내자가 비어 있으면 수리 건의 고객 요청 납기일이 보이고, 빌려 온 값임이 드러난다", () => {
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  assert.deepEqual(display.lines, ["2026-03-31"]);
  assert.equal(display.borrowed, true, "빌려 온 값인데 표시가 없다 — 화면이 꼬리표를 못 붙인다");
});

test("빌려 온 값은 언제나 한 줄이다 — 메모 괄호가 붙지 않는다", () => {
  // 수리 건의 그 칸은 날짜 하나이고 메모가 없다. 줄이 둘 이상 나오면 화면의
  // 꼬리표가 두 번 그려진다.
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  assert.equal(display.lines.length, 1);
  assert.equal(display.lines[0], "2026-03-31");
});

test("양쪽 다 없으면 그릴 줄이 없다 — 화면이 '-'로 그린다", () => {
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: null,
  });
  assert.deepEqual(display.lines, []);
  assert.equal(display.borrowed, false, "빌려 온 것이 없는데 표시가 붙었다");
});

test("수리 건 쪽이 공백뿐이면 없는 것과 같다 — 빈칸에 꼬리표만 붙지 않는다", () => {
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: "   ",
  });
  assert.deepEqual(display.lines, []);
  assert.equal(display.borrowed, false);
});

test("수리 건 연결이 없는 줄도 그냥 빈칸이다 — 터지지 않는다", () => {
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: null,
  });
  assert.deepEqual(display.lines, []);
});

// ── ② 수리 건 상세정보 쪽 — 이 건에 적힌 날짜가 먼저 ────────────────────

test("수리 건에 고객 요청 납기일이 있으면 자기 것이 보인다 — 내자 날짜가 있어도 가리지 않는다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: "2026-03-31",
    domesticOrderDueDates: ["2026-01-20"],
  });
  assert.equal(display.dueDate, "2026-03-31");
  assert.equal(display.borrowed, false);
});

test("수리 건이 비어 있으면 내자의 납기요청일이 보이고, 빌려 온 값임이 드러난다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: ["2026-01-20"],
  });
  assert.equal(display.dueDate, "2026-01-20");
  assert.equal(display.borrowed, true);
});

test("⚠️ 내자에 날짜가 여러 개면 **가장 이른 하루**가 보인다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: ["2026-02-15", "2026-01-20", "2026-03-31"],
  });
  assert.equal(display.dueDate, "2026-01-20");
  assert.equal(display.borrowed, true);
});

test("여러 내자 줄에 걸친 날짜도 한 묶음으로 본다 — 줄마다 접은 뒤 다시 고르지 않는다", () => {
  // 분할 발주면 한 건에 내자 줄이 여럿이다(repair_case_id 에 유일 제약이 없다).
  // 부르는 쪽이 그 줄들의 날짜를 통틀어 넘기므로, 이 함수는 묶음이 몇 줄에서
  // 왔는지 알지 못한다.
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: ["2026-05-01", "2026-04-02", "2026-04-01", "2026-06-01"],
  });
  assert.equal(display.dueDate, "2026-04-01");
});

test("⚠️ 주간보고 `입고 요청일`과 같은 날짜다 — 같은 함수를 부른다", () => {
  // 같은 자료를 두 화면이 다른 날짜로 보여 주면 어느 쪽도 믿을 수 없게 된다.
  // 규칙을 베껴 적은 구현으로 바뀌면 이 대조가 그 자리에서 깨져야 한다.
  const dates = ["2026-09-30", "2026-08-31", "2020-01-01", "2026-12-01"];
  assert.equal(
    resolveRepairCaseRequestedDueDate({
      customerRequestedDueDate: null,
      domesticOrderDueDates: dates,
    }).dueDate,
    pickEarliestDueDate(dates)
  );
});

test("이미 지난 날짜라도 그것이 가장 이르면 그것이다 — 오늘을 보지 않는다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: ["2020-01-01", "2026-08-31"],
  });
  assert.equal(display.dueDate, "2020-01-01");
});

test("양쪽 다 없으면 빈 값이다 — 화면이 '-'로 그린다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: [],
  });
  assert.equal(display.dueDate, null);
  assert.equal(display.borrowed, false, "빌려 온 것이 없는데 표시가 붙었다");
});

test("이 건 쪽이 공백뿐이면 없는 것과 같다 — 그때는 내자 날짜를 빌린다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: "  ",
    domesticOrderDueDates: ["2026-01-20"],
  });
  assert.equal(display.dueDate, "2026-01-20");
  assert.equal(display.borrowed, true);
});

test("연결된 내자 줄이 하나도 없으면 그냥 빈칸이다", () => {
  const display = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: null,
    domesticOrderDueDates: [],
  });
  assert.equal(display.dueDate, null);
});

// ── ③ 두 방향이 서로 어긋나지 않는가 ────────────────────────────────────

test("양쪽 다 적혀 있으면 각자 자기 것을 본다 — 어느 쪽도 상대 값으로 덮이지 않는다", () => {
  const domestic = resolveDomesticOrderDueDateDisplay({
    dueDates: [dueDate("2026-01-20")],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  const repairCase = resolveRepairCaseRequestedDueDate({
    customerRequestedDueDate: "2026-03-31",
    domesticOrderDueDates: ["2026-01-20"],
  });
  assert.deepEqual(domestic.lines, ["2026-01-20"]);
  assert.equal(repairCase.dueDate, "2026-03-31");
  assert.equal(domestic.borrowed, false);
  assert.equal(repairCase.borrowed, false);
});

// ── ③-b 🔴 내자 한 줄을 **견줄 수 있는 하루**로 접기 (2026-10-30) ────────
//
// 「납기 역전」 판정이 쓰는 날짜다(due-date-inversion.ts). 여기서 지키는 것은
// 하나뿐이다 — **그 칸에 보이는 날짜로 잰다.** 갈림이 위 그리기 함수와 어긋나는
// 순간, 화면은 이 줄에 적힌 날짜를 그려 놓고 수리 건의 날짜로 재게 되고, 사람은
// 빨간 날짜를 보며 왜 빨간지 끝내 알 수 없다.

test("이 줄에 날짜가 있으면 그 날짜로 잰다 — 수리 건 날짜는 보지 않는다", () => {
  assert.equal(
    resolveDomesticOrderDueDateForComparison({
      dueDates: [dueDate("2026-01-20")],
      repairCaseCustomerRequestedDueDate: "2026-03-31",
    }),
    "2026-01-20"
  );
});

test("🔴 날짜가 여럿이면 **가장 이른 하루** — 뒤 회차의 여유가 첫 약속을 지우지 못한다", () => {
  // 🔴 가장 이른 날을 **가운데** 둔다. 끝에 두면 「마지막 줄을 고른다」로 바꿔도
  // 시험이 초록색으로 남는다(실제로 한 번 그렇게 적었다가 일부러 깨뜨려 보고
  // 잡았다 — 사람이 적는 차례는 1차분·2차분이라 보통 이르게 정렬돼 있다).
  const picked = resolveDomesticOrderDueDateForComparison({
    dueDates: [dueDate("2026-03-10", "2차분"), dueDate("2026-01-10", "1차분"), dueDate("2026-05-10")],
    repairCaseCustomerRequestedDueDate: null,
  });
  assert.equal(picked, "2026-01-10");
  // 고르는 일을 주간보고와 같은 함수에 맡겼다는 사실을 대조한다 — 규칙을 베껴
  // 적으면 같은 자료를 두 화면이 다른 날짜로 재게 된다.
  assert.equal(picked, pickEarliestDueDate(["2026-03-10", "2026-01-10", "2026-05-10"]));
});

test("이 줄이 비었을 때만 수리 건의 고객 요청 납기일을 빌린다", () => {
  assert.equal(
    resolveDomesticOrderDueDateForComparison({
      dueDates: [],
      repairCaseCustomerRequestedDueDate: "2026-03-31",
    }),
    "2026-03-31"
  );
});

test("양쪽 어디에도 없으면 null — 「아직 정해지지 않았다」이고, 그것으로 재지 않는다", () => {
  assert.equal(
    resolveDomesticOrderDueDateForComparison({
      dueDates: [],
      repairCaseCustomerRequestedDueDate: null,
    }),
    null
  );
  // 공백만 적힌 값은 없는 것으로 접는다 — 화면에는 빈칸인데 경보만 켜지는 줄이
  // 생기지 않게. 그리기 함수가 쓰는 규칙과 같다.
  assert.equal(
    resolveDomesticOrderDueDateForComparison({
      dueDates: [],
      repairCaseCustomerRequestedDueDate: "   ",
    }),
    null
  );
});

test("🔴 고른 하루는 **언제나 그 칸에 보이는 날짜다** — 갈림이 그리기와 어긋나지 않는다", () => {
  // 글자가 아니라 **갈림**을 맞대어 본다. 그리기 쪽 lines 는 메모가 붙은 글자라
  // (`"2026-01-10 (1차분)"`) 날짜로 견줄 수 없으므로, 고른 하루로 시작하는 줄이
  // 그 칸에 있는지를 본다.
  const rows = [
    { dueDates: [dueDate("2026-01-20")], repairCaseCustomerRequestedDueDate: "2026-03-31" },
    {
      dueDates: [dueDate("2026-03-10", "2차분"), dueDate("2026-01-10", "1차분"), dueDate("2026-05-10")],
      repairCaseCustomerRequestedDueDate: "2026-02-01",
    },
    { dueDates: [], repairCaseCustomerRequestedDueDate: "2026-03-31" },
    { dueDates: [], repairCaseCustomerRequestedDueDate: null },
  ];
  let compared = 0;
  let borrowedSeen = 0;
  for (const row of rows) {
    const display = resolveDomesticOrderDueDateDisplay(row);
    const picked = resolveDomesticOrderDueDateForComparison(row);
    if (picked === null) {
      assert.deepEqual(display.lines, [], `잴 날짜가 없는데 칸에는 보인다: ${JSON.stringify(row)}`);
      continue;
    }
    compared += 1;
    if (display.borrowed) borrowedSeen += 1;
    assert.ok(
      display.lines.some((line) => line.startsWith(picked)),
      `판정이 보는 날(${picked})이 칸에 없다: ${JSON.stringify(display.lines)}`
    );
  }
  // 표본이 비어 공짜로 통과하는 일을 막는다 — 빌려 온 줄도 한 번은 지나야 한다.
  assert.equal(compared, 3, "견준 줄이 셋이어야 한다");
  assert.equal(borrowedSeen, 1, "빌려 온 줄이 표본에 없다");
});

// ── ④ 표시 글자 ────────────────────────────────────────────────────────

test("설명 문장은 화면에 실제로 붙는 표시 글자를 가리킨다", () => {
  // 배지에 적히는 말과 설명에 적히는 말이 어긋나면, 설명이 화면에 없는 표시를
  // 가리키게 된다.
  assert.ok(
    DOMESTIC_ORDER_DUE_DATE_LINK_NOTE.includes(DUE_DATE_FROM_REPAIR_CASE_LABEL),
    "내자 정리 설명이 그 화면의 꼬리표 글자를 말하지 않는다"
  );
  assert.ok(
    REPAIR_CASE_DUE_DATE_LINK_NOTE.includes(DUE_DATE_FROM_DOMESTIC_ORDER_LABEL),
    "수리 건 설명이 그 화면의 꼬리표 글자를 말하지 않는다"
  );
});

test("두 표시는 서로 다른 글자다 — 어느 쪽에서 빌려 왔는지 구분돼야 한다", () => {
  assert.notEqual(DUE_DATE_FROM_REPAIR_CASE_LABEL, DUE_DATE_FROM_DOMESTIC_ORDER_LABEL);
});

// ── ⑤ ⚠️ 계산된 값은 저장에 실리지 않는다 ───────────────────────────────

/** 저장 payload 를 만들 때 쓰는 한 줄. 값은 이 시험이 보는 것만 채운다. */
function cellEditRow(dueDates: readonly { dueDate: string; note: string | null }[]) {
  return {
    repairCaseId: "case-1",
    intakeNumberText: null,
    customerId: null,
    modelNameText: null,
    lotNumberText: null,
    serialNumberText: null,
    faultDescriptionText: null,
    displayOrder: 1,
    purchaseOrderNumber: null,
    projectName: null,
    orderIssuedDate: null,
    dueDates,
    quoteIssuedDate: null,
    quoteNumber: null,
    // 칸 편집이 되실어 보내는 견적서 연결(2026-09-11, domestic-order-cell-edit.ts).
    quoteId: null,
    progressNote: null,
    deliveredDate: null,
    deliveredBy: null,
    taxInvoiceDate: null,
    amountExcludingVat: null,
    paymentCompleted: false,
    japanRemittanceNote: null,
    historyNote: null,
    etcNote: null,
  };
}

test("⚠️ 빌려 온 날짜는 저장 payload 에 실리지 않는다 — 그 줄에 박제되면 안 된다", () => {
  // 화면에는 수리 건의 날짜가 보이는 줄이다. 그 상태로 다른 칸 하나를 고쳐
  // 저장했을 때, 보이던 그 날짜가 이 줄의 납기요청일로 굳으면 안 된다 —
  // 그때부터 "일부러 같게 적었다"와 "그냥 안 건드렸다"를 구분할 수 없고,
  // 나중에 수리 건 쪽이 고쳐져도 이 줄만 옛 값으로 남는다.
  const display = resolveDomesticOrderDueDateDisplay({
    dueDates: [],
    repairCaseCustomerRequestedDueDate: "2026-03-31",
  });
  assert.equal(display.borrowed, true, "이 시험의 전제가 깨졌다 — 빌려 온 상태가 아니다");

  const fields = buildDomesticOrderCellUpdateFields(cellEditRow([]), "quoteNumber", "Q-1");
  assert.deepEqual(fields.dueDates, [], "빌려 온 날짜가 저장에 섞여 나갔다");
  // 계산된 값이 자기 이름으로 키를 하나 더 만들지도 않는다.
  assert.equal(Object.keys(fields).length, 24);
});

test("이 줄에 적힌 납기요청일은 그대로 되실려 나간다 — 칸 하나 고친다고 지워지지 않는다", () => {
  const fields = buildDomesticOrderCellUpdateFields(
    cellEditRow([dueDate("2026-01-20", "1차분")]),
    "quoteNumber",
    "Q-1"
  );
  assert.deepEqual(fields.dueDates, [{ dueDate: "2026-01-20", note: "1차분" }]);
  assert.equal(Object.keys(fields).length, 24);
});

// ── ⑥ 목록용 짧은 표시 ──────────────────────────────────────────────────

test("목록용 짧은 표시는 상세정보의 긴 이름표와 다른 글자다 — 자리가 다르기 때문이다", () => {
  // 표에서 이 값이 사는 곳은 출하일 칸 안의 보조 줄 하나이고 줄바꿈을 하지
  // 않는다. 긴 이름표를 그대로 쓰면 그 열만 넓어져 표가 옆으로 길어진다.
  assert.notEqual(DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_LABEL, DUE_DATE_FROM_DOMESTIC_ORDER_LABEL);
  assert.ok(
    DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_LABEL.length < DUE_DATE_FROM_DOMESTIC_ORDER_LABEL.length,
    "좁은 자리에 쓰려고 만든 표시가 긴 쪽보다 짧지 않다"
  );
});

test("짧은 표시의 설명도 화면에 실제로 붙는 글자를 가리킨다", () => {
  assert.ok(
    DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_NOTE.includes(DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_LABEL),
    "목록 설명이 그 화면의 꼬리표 글자를 말하지 않는다"
  );
});

// ── ⑦ 는 이 사이트에 없다 (이 파일 머리말 ①) ────────────────────────────

// ── ⑧ 🔴 이 사이트 전용 — 베낀 글자가 저쪽과 갈라졌는지 ─────────────────

/**
 * ============================================================================
 * 왜 글자를 **값째로** 박아 두는가 — 보통은 하지 않는 일이다
 * ============================================================================
 * 2026-10-30 에 이 사본이 저쪽보다 뒤처져 있던 것이 드러났다. 저쪽이 2026-10-19 에
 * 상수 둘을 더하고 2026-10-30 에 …_LABEL 의 글자를 바꾸는 동안 이 파일은 그대로였고,
 * **그 몇 주 동안 아무 시험도 깨지지 않았다.** 위 ④ 가 그 자리를 지키는 것처럼
 * 보이지만 실제로 재는 것은 「설명이 이름표를 끼워 넣었는가」뿐이고, 그 설명은
 * 템플릿으로 이름표를 끼워 넣으므로 **이름표를 무엇으로 바꾸든 통과한다.**
 *
 * 🔴 시험이 **두 저장소를 맞대어 볼 수는 없다** — 시험이 도는 자리에 저쪽 저장소가
 * 없다. 이 저장소 안에서 할 수 있는 것은 **값을 바꾸려면 이 줄도 함께 고치게 만드는
 * 것**뿐이다. 고치는 사람이 이 머리말을 읽고 「저쪽도 같이 고쳤나」를 한 번 묻게 하는
 * 것이 이 묶음의 전부이고, 그것이 지난번에 없었던 바로 그 한 번이다.
 *
 * 🔵 그러므로 **이 시험이 깨졌다고 코드가 틀린 것이 아니다.** 깨지면 할 일은 하나다:
 * A/S 의 `src/lib/domain/requested-due-date-link.ts` 를 열어 그쪽 값과 맞춘 뒤, 맞는
 * 값으로 이 줄을 고쳐라. 🔴 **이 줄을 지워서 통과시키지 마라** — 그러면 사본이 갈라진
 * 채 아무도 모르는, 고치기 전의 그 상태로 정확히 되돌아간다.
 * ============================================================================
 */
test("🔴 빌려 온 곳을 알리는 글자 셋이 A/S 사본의 값 그대로다", () => {
  // 저쪽 2026-10-30 판의 값이다. 바꾸려면 저쪽을 먼저 고쳐라(위 머리말).
  assert.equal(DUE_DATE_FROM_REPAIR_CASE_LABEL, "수리 건 요청일");
  assert.equal(DUE_DATE_FROM_DOMESTIC_ORDER_LABEL, "내자 정리에서 작성됨");
  assert.equal(DUE_DATE_FROM_DOMESTIC_ORDER_SHORT_LABEL, "(내자)");
});

test("🔴 …_LABEL 은 칸 이름이 아니라 **어디서 왔는지**를 말한다", () => {
  // 2026-10-30 사용자 요청의 알맹이다. 칸 이름("내자 납기요청일")을 그대로 적으면
  // 바로 위에 날짜가 있어서 그 자체가 **또 하나의 값**처럼 읽힌다. 값을 박아 둔
  // 위 시험과 달리 이쪽은 **왜 그 글자인지**를 재므로, 다른 말로 바꿔 적더라도
  // 「어디서 왔는가」를 말하는 한 통과한다.
  assert.notEqual(
    DUE_DATE_FROM_DOMESTIC_ORDER_LABEL,
    "내자 납기요청일",
    "칸 이름으로 되돌아갔다 — 2026-10-30 에 일부러 버린 글자다"
  );
  assert.ok(
    DUE_DATE_FROM_DOMESTIC_ORDER_LABEL.includes("내자"),
    "어디서 온 값인지가 이름표에 없다"
  );
});
