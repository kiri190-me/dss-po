import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { sumQuoteLaborCost, type BaseLaborHours, type SelectedRepairTask } from "./quote-labor-cost";

/**
 * 🔴 **A/S 관리 시스템의 `lib/domain/quote-labor-cost.test.ts` 에서 작업비 셈에
 * 해당하는 부분만 가져왔다.** 저쪽 파일은 같은 파일 안에 견적서 쪽 규칙 셋
 * (부품 단가 칸 넣기 · 작업 내역 감춤 · 실제 xlsx 양식 대조)을 함께 담고 있고,
 * 그것들은 이 사이트에 아직 없는 화면(견적서 — 조각 3)의 것이다. 그 부분을 함께
 * 들고 오면 엑셀 묶음 4,441줄이 조각 1 에 딸려 온다.
 *
 * 저쪽은 그 시험을 **그대로 갖고 있다.** 여기 있는 것과 저쪽에 남은 것이 같은
 * `sumQuoteLaborCost` 를 본다 — 조각 3 에서 나머지가 따라올 때 이 파일에 이어
 * 붙이면 된다.
 */
/**
 * ============================================================================
 * 작업비 = 기본 작업비 + Σ(공수시간 × 시간당 단가)
 * ============================================================================
 * 기본 작업비는 **(조사h + 통전h + 서류h) × 시간당 단가**다(2026-09-16 사용자
 * 결정). 실제 값으로 못 박는다 — 제너레이터는 조사 21h + 통전 14h = 350만원이고
 * `OH` 가 24시간이므로 O/H 한 건만 골랐을 때 **590만원**이 나와야 한다
 * (2026-08-31 사용자 자료).
 * ============================================================================
 */

function task(patch: Partial<SelectedRepairTask> = {}): SelectedRepairTask {
  return { taskName: "OH", hours: 24, hourlyRate: "100000", ...patch };
}

/**
 * 🔴 **개발 DB 의 지금 값 그대로**(2026-09-16 이행 직후). 새 셈법이 옛 `base_cost`
 * 와 같은 금액을 내놓는지는 이 셋으로만 증명된다 — 하나라도 고치면 그 증명이 사라진다.
 *
 * | 장비 | 시간당 단가 | 조사h | 통전h | 서류h | (옛) base_cost |
 * |---|---|---|---|---|---|
 * | GENERATOR        | 100000 | 21 | 14   | NULL | 3500000 |
 * | MATCHER          | 100000 | 21 | 14   | NULL | 3500000 |
 * | TOTAL_CONTROLLER | 100000 | 22 | NULL | NULL | 2200000 |
 */
const GENERATOR: BaseLaborHours = {
  hourlyRate: "100000",
  investigationHours: 21,
  powerTestHours: 14,
  documentHours: null,
};
const MATCHER: BaseLaborHours = {
  hourlyRate: "100000",
  investigationHours: 21,
  powerTestHours: 14,
  documentHours: null,
};
const TOTAL_CONTROLLER: BaseLaborHours = {
  hourlyRate: "100000",
  investigationHours: 22,
  powerTestHours: null,
  documentHours: null,
};

/** 셋 다 정하지 않은 장비 — 기본 작업비가 `null` 이다. */
const NOTHING_SET: BaseLaborHours = {
  hourlyRate: "100000",
  investigationHours: null,
  powerTestHours: null,
  documentHours: null,
};

describe("🔴 기본 작업비 = 세 공수시간의 합 × 시간당 단가", () => {
  test("🔴 실제 값 — 개발 DB 의 공수시간으로 셈한 기본 작업비가 옛 base_cost 그대로다", () => {
    // 이 셋이 어긋나면 새 구조로 갈아 끼우면서 **청구 금액이 바뀐 것**이다.
    assert.equal(sumQuoteLaborCost([], GENERATOR).baseCost, 3500000, "제너레이터 (21+14)×10만");
    assert.equal(sumQuoteLaborCost([], MATCHER).baseCost, 3500000, "매쳐 (21+14)×10만");
    assert.equal(sumQuoteLaborCost([], TOTAL_CONTROLLER).baseCost, 2200000, "T/C 22×10만");
  });

  test("🔴 정하지 않은 몫(null)은 합계에 들어가지 않는다 — 0 으로 접지 않는다", () => {
    // T/C 는 통전·서류가 NULL 이다. 0 으로 접어도 금액은 같지만, 접는 순간 「정하지
    // 않았다」와 「0시간이다」가 한 값이 되어 화면이 그 둘을 가를 수 없다.
    assert.equal(sumQuoteLaborCost([], { ...GENERATOR, powerTestHours: null }).baseCost, 2100000, "조사 21h 만");
    assert.equal(sumQuoteLaborCost([], { ...GENERATOR, investigationHours: null }).baseCost, 1400000, "통전 14h 만");
  });

  test("🔴 셋 다 정하지 않았으면 기본 작업비는 null 이다 — 0 이 아니다", () => {
    const result = sumQuoteLaborCost([task({ hours: 8 })], NOTHING_SET);
    assert.equal(result.baseCost, null, "더하지 않았다는 사실이 남아야 화면이 알린다");
    assert.equal(result.total, 800000);
  });

  test("장비 종류를 아직 안 골랐으면(null) 기본 작업비도 없다", () => {
    const result = sumQuoteLaborCost([task({ hours: 8 })], null);
    assert.equal(result.baseCost, null);
    assert.equal(result.total, 800000);
  });

  test("🔴 서류 0시간은 '정하지 않음'이 아니라 '더했는데 0원'이다", () => {
    // 🔴 셋 중 서류만 0 을 받는다(schema/repair-labor.ts 의 그 CHECK) — 「서류작업이
    // 없는 장비」는 사람이 확인해서 내린 답이고, 그 답이 있으면 기본 작업비는 null 이
    // 아니다.
    const zero = sumQuoteLaborCost([], { ...NOTHING_SET, documentHours: 0 });
    assert.equal(zero.baseCost, 0, "0 은 '더했는데 0원'이다");
    assert.equal(sumQuoteLaborCost([], NOTHING_SET).baseCost, null, "null 은 '아예 안 더했다'이다");
  });

  test("시간당 단가를 숫자로 읽을 수 없으면 어느 몫도 셀 수 없다 — 기본 작업비가 null", () => {
    for (const hourlyRate of ["abc", ""]) {
      const result = sumQuoteLaborCost([task({ hours: 8 })], { ...GENERATOR, hourlyRate });
      assert.equal(result.baseCost, null, `"${hourlyRate}" 로 기본 작업비를 셈했다`);
      assert.equal(result.total, 800000);
    }
  });
});

describe("고른 작업 — 기본 작업비에 더한다", () => {
  test("🔴 실제 값 — 제너레이터에서 OH 하나를 고르면 350만 + 240만 = 590만원", () => {
    const result = sumQuoteLaborCost([task()], GENERATOR);
    assert.equal(result.tasksTotal, 2400000);
    assert.equal(result.baseCost, 3500000);
    assert.equal(result.total, 5900000);
  });

  test("여러 작업은 각각 공수시간 × 단가로 더해진다", () => {
    const result = sumQuoteLaborCost(
      [
        task({ taskName: "OH", hours: 24 }),
        task({ taskName: "FAN 교환", hours: 2 }),
        task({ taskName: "MCU 기판 교환 작업", hours: 12 }),
      ],
      GENERATOR
    );
    assert.equal(result.tasksTotal, 3800000, "(24+2+12)시간 × 10만원");
    assert.equal(result.total, 7300000);
  });

  test("아무것도 안 고르면 기본 작업비만 남는다", () => {
    const result = sumQuoteLaborCost([], GENERATOR);
    assert.equal(result.tasksTotal, 0);
    assert.equal(result.total, 3500000);
  });

  test("줄마다의 시간당 단가를 그대로 쓴다 — 옛 견적서가 지금 단가로 다시 셈되지 않는다", () => {
    // 단가가 오르기 전에 저장된 줄과 오른 뒤의 줄이 한 견적서에 섞일 수 있다.
    const result = sumQuoteLaborCost(
      [task({ taskName: "옛 줄", hours: 10, hourlyRate: "80000" }), task({ taskName: "새 줄", hours: 10 })],
      null
    );
    assert.equal(result.tasksTotal, 1800000, "80만 + 100만");
  });

  test("숫자로 안 읽히는 값은 합계를 NaN 으로 만들지 않고, 무엇이 빠졌는지 알린다", () => {
    const result = sumQuoteLaborCost(
      [task({ taskName: "정상", hours: 2 }), task({ taskName: "망가진 단가", hourlyRate: "abc" })],
      GENERATOR
    );
    assert.equal(result.tasksTotal, 200000);
    assert.deepEqual(result.unknown, ["망가진 단가"], "조용히 빼면 사람은 합계가 맞는 줄 안다");
    assert.equal(Number.isFinite(result.total), true);
  });

  test("빈 목록에 기본 작업비도 없으면 0 이다", () => {
    assert.deepEqual(sumQuoteLaborCost([], null), {
      total: 0,
      tasksTotal: 0,
      baseCost: null,
      unknown: [],
    });
  });
});

/**
 * ============================================================================
 * 세 가지 제외 — 조사 · 통전 · 서류
 * ============================================================================
 * 각 몫은 **자기 공수시간 × 시간당 단가**이고 서로를 보지 않는다. 실제 값
 * (제너레이터 조사 21h · 통전 14h · 10만원, 기본 350만원)으로:
 *   · 조사작업 제외만 → 조사 몫 210만원을 뺀다 → 고른 작업 + 140만원
 *   · 통전작업 제외만 → 통전 몫 140만원을 뺀다 → 고른 작업 + 210만원
 *   · 둘 다          → 두 몫을 다 뺀다 → 고른 작업만
 *   · 서류작업 제외  → 서류 시간이 NULL 이라 **뺄 금액을 몰라 못 뺀다**
 *
 * 🔴 이 묶음이 지키는 것은 금액 하나가 아니라 **"못 뺐으면 못 뺐다고 말한다"** 이다.
 * 조용히 0 을 빼면 합계는 350만원인데 사람은 210만원이 나온 줄 안다.
 * ============================================================================
 */
describe("세 가지 제외", () => {
  /** 서류 공수시간까지 정해진 장비 — 셋을 함께 켜는 갈래를 보려면 필요하다. */
  const ALL_THREE: BaseLaborHours = { ...GENERATOR, documentHours: 5 };

  test("🔴 실제 값 — 조사작업 제외만: 350만 − 조사 몫 210만 → 고른 작업 + 140만원", () => {
    assert.deepEqual(sumQuoteLaborCost([task()], GENERATOR, { investigation: true }), {
      total: 3800000,
      tasksTotal: 2400000,
      baseCost: 3500000,
      unknown: [],
      investigationDeduction: 2100000,
      investigationNotice: null,
    });
  });

  test("🔴 실제 값 — 통전작업 제외만: 350만 − 통전 몫 140만 → 고른 작업 + 210만원", () => {
    assert.deepEqual(sumQuoteLaborCost([task()], GENERATOR, { powerTest: true }), {
      total: 4500000,
      tasksTotal: 2400000,
      baseCost: 3500000,
      unknown: [],
      powerTestDeduction: 1400000,
      powerTestNotice: null,
    });
  });

  test("🔴 서류작업 제외만 — 서류 5시간이면 50만원이 빠진다", () => {
    const result = sumQuoteLaborCost([], ALL_THREE, { document: true });
    assert.equal(result.baseCost, 4000000, "(21+14+5)×10만");
    assert.equal(result.documentDeduction, 500000);
    assert.equal(result.documentNotice, null, "그대로 뺐으면 할 말이 없다");
    assert.equal(result.total, 3500000);
  });

  test("🔴 조사 + 통전 — 두 몫을 다 빼면 고른 작업만 남는다", () => {
    assert.deepEqual(sumQuoteLaborCost([task()], GENERATOR, { investigation: true, powerTest: true }), {
      total: 2400000,
      tasksTotal: 2400000,
      baseCost: 3500000,
      unknown: [],
      investigationDeduction: 2100000,
      investigationNotice: null,
      powerTestDeduction: 1400000,
      powerTestNotice: null,
    });
  });

  test("🔴 셋 다 — 기본 작업비가 남김없이 빠져 고른 작업만 남는다", () => {
    const result = sumQuoteLaborCost([task()], ALL_THREE, {
      investigation: true,
      powerTest: true,
      document: true,
    });
    assert.equal(result.baseCost, 4000000);
    assert.equal(result.investigationDeduction, 2100000);
    assert.equal(result.powerTestDeduction, 1400000);
    assert.equal(result.documentDeduction, 500000);
    assert.equal(result.total, 2400000, "고른 작업만");
  });

  test("🔴 세 몫의 합이 곧 기본 작업비다 — 따로따로 뺀 금액을 더하면 400만원", () => {
    const one = (exclusions: Parameters<typeof sumQuoteLaborCost>[2]) =>
      sumQuoteLaborCost([], ALL_THREE, exclusions);
    const sum =
      (one({ investigation: true }).investigationDeduction ?? 0) +
      (one({ powerTest: true }).powerTestDeduction ?? 0) +
      (one({ document: true }).documentDeduction ?? 0);
    assert.equal(sum, 4000000);
  });

  test("고른 작업은 차감에 걸리지 않는다 — 뺀 몫은 기본 작업비에서만 나간다", () => {
    const result = sumQuoteLaborCost([task()], GENERATOR, { powerTest: true });
    assert.equal(result.tasksTotal, 2400000, "OH 24시간은 그대로 청구한다");
    assert.equal(result.total, 4500000, "(350만 − 140만) + 240만");
  });

  test("🔴 셋 다 켜고 작업을 하나도 안 고르면 0원 — 음수가 아니다", () => {
    const result = sumQuoteLaborCost([], ALL_THREE, {
      investigation: true,
      powerTest: true,
      document: true,
    });
    assert.equal(result.total, 0);
  });

  test("체크를 켜지 않으면 시간이 있어도 빼지 않는다 — 사람의 결정이다", () => {
    const result = sumQuoteLaborCost([], GENERATOR, { investigation: false, powerTest: false });
    assert.equal(result.total, 3500000);
    assert.equal(result.powerTestDeduction, undefined, "부탁하지 않았으니 키도 없다");
    assert.equal(result.investigationDeduction, undefined);
  });

  describe("🔴 못 빼면 빼지 않고 까닭을 돌려준다", () => {
    test("🔴 서류 — 지금 세 장비 모두 서류 시간이 NULL 이라 이 경로가 실제로 쓰인다", () => {
      const result = sumQuoteLaborCost([task({ hours: 2 })], GENERATOR, { document: true });
      assert.equal(result.documentDeduction, null, "0 을 빼지 않는다");
      assert.equal(result.documentNotice, "NO_HOURS");
      assert.equal(result.total, 3700000, "합계는 뺀 적 없는 값 그대로다 — 350만 + 20만");
    });

    test("🔴 통전 — T/C 는 통전 공수시간을 정하지 않았다", () => {
      // 조용히 0 을 빼면 합계는 220만원 그대로인데 사람은 뺀 줄 안다.
      const result = sumQuoteLaborCost([], TOTAL_CONTROLLER, { powerTest: true });
      assert.equal(result.powerTestDeduction, null, "0 을 빼지 않는다");
      assert.equal(result.powerTestNotice, "NO_HOURS");
      assert.equal(result.total, 2200000, "합계는 뺀 적 없는 값 그대로다");
    });

    test("🔴 조사 — 조사 공수시간을 정하지 않은 장비", () => {
      const result = sumQuoteLaborCost([], { ...GENERATOR, investigationHours: null }, { investigation: true });
      assert.equal(result.investigationDeduction, null);
      assert.equal(result.investigationNotice, "NO_HOURS");
      assert.equal(result.total, 1400000, "통전 몫 140만원은 그대로 남는다");
    });

    test("🔴 한 갈래를 못 빼도 다른 갈래는 그대로 뺀다 — 서로를 보지 않는다", () => {
      const result = sumQuoteLaborCost([], GENERATOR, {
        investigation: true,
        powerTest: true,
        document: true,
      });
      assert.equal(result.investigationDeduction, 2100000, "조사는 뺐다");
      assert.equal(result.powerTestDeduction, 1400000, "통전도 뺐다");
      assert.equal(result.documentDeduction, null, "서류만 못 뺐다");
      assert.equal(result.documentNotice, "NO_HOURS");
      assert.equal(result.total, 0);
    });

    test("🔴 장비 종류를 안 골랐으면(base 가 null) 어느 몫도 셀 수 없다", () => {
      const result = sumQuoteLaborCost([task({ hours: 8 })], null, {
        investigation: true,
        powerTest: true,
        document: true,
      });
      assert.equal(result.baseCost, null, "null 을 0 으로 접지 않는다");
      for (const notice of [result.investigationNotice, result.powerTestNotice, result.documentNotice]) {
        assert.equal(notice, "NO_HOURS");
      }
      assert.equal(result.total, 800000, "고른 작업의 합만");
    });

    test("시간당 작업비를 숫자로 읽을 수 없으면 셋 다 못 뺀다", () => {
      for (const hourlyRate of ["abc", ""]) {
        const result = sumQuoteLaborCost([], { ...GENERATOR, hourlyRate }, {
          investigation: true,
          powerTest: true,
          document: true,
        });
        assert.equal(result.investigationDeduction, null, `"${hourlyRate}" 로 조사 몫을 뺐다`);
        assert.equal(result.investigationNotice, "UNKNOWN_HOURLY_RATE");
        assert.equal(result.powerTestNotice, "UNKNOWN_HOURLY_RATE");
        // 서류는 시간부터 모른다 — 단가를 보기 전에 답이 난다.
        assert.equal(result.documentNotice, "NO_HOURS");
        assert.equal(result.total, 0, "기본 작업비도 셀 수 없으니 더한 것이 없다");
      }
    });
  });

  test("🔴 어떤 값이 와도 합계는 고른 작업의 합 이상, 고른 작업 + 기본 작업비 이하다 — 음수 없음", () => {
    const taskSets: SelectedRepairTask[][] = [[], [task()], [task({ hours: 2 }), task({ taskName: "FAN", hours: 1 })]];
    const flags = [true, false];
    for (const investigationHours of [21, 0, null]) {
      for (const powerTestHours of [14, 0, null]) {
        for (const documentHours of [5, 0, null]) {
          for (const hourlyRate of ["100000", "abc"]) {
            const base: BaseLaborHours = { hourlyRate, investigationHours, powerTestHours, documentHours };
            for (const investigation of flags) {
              for (const powerTest of flags) {
                for (const documentOff of flags) {
                  for (const tasks of taskSets) {
                    const result = sumQuoteLaborCost(tasks, base, {
                      investigation,
                      powerTest,
                      document: documentOff,
                    });
                    const label = `${JSON.stringify(base)} · 제외 ${investigation}/${powerTest}/${documentOff} · 작업 ${tasks.length}줄`;
                    assert.ok(result.total >= result.tasksTotal, label);
                    assert.ok(result.total <= result.tasksTotal + (result.baseCost ?? 0), label);
                    // 켰으니 키가 있다 — 없으면 화면이 까닭을 못 말한다.
                    if (investigation) assert.ok(result.investigationDeduction !== undefined, label);
                    if (powerTest) assert.ok(result.powerTestDeduction !== undefined, label);
                    if (documentOff) assert.ok(result.documentDeduction !== undefined, label);
                    // 셋 다 켜고 셋 다 뺐으면 기본 작업비는 남김없이 빠진다.
                    if (
                      investigation &&
                      powerTest &&
                      documentOff &&
                      result.investigationDeduction != null &&
                      result.powerTestDeduction != null &&
                      result.documentDeduction != null
                    ) {
                      assert.equal(result.total, result.tasksTotal, label);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  test("값을 읽지 못한 작업은 여전히 이름으로 알린다", () => {
    const result = sumQuoteLaborCost(
      [task({ taskName: "정상", hours: 2 }), task({ taskName: "망가진 단가", hourlyRate: "abc" })],
      GENERATOR,
      { investigation: true }
    );
    assert.equal(result.total, 200000 + 1400000);
    assert.deepEqual(result.unknown, ["망가진 단가"]);
  });

  test("🔴 세 몫을 셈하는 곳은 한 곳이다 — 갈래마다 같은 셈을 따로 적지 않는다", () => {
    const source = readFileSync(new URL("./quote-labor-cost.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const count = (text: string) => source.split(text).length - 1;
    assert.equal(count("function resolveShare("), 1);
    assert.equal(count("resolveShare("), 4, "정의 하나 + 조사 · 통전 · 서류 셋이 불러야 한다");
  });

  test("🔴 조사 몫이 「나머지」이던 시절의 알림 종류는 값으로 남아 있지 않다", () => {
    // 남겨 두면 다음 사람이 「아직 기본 작업비에서 빼서 셈하는구나」로 읽는다. 왜
    // 사라졌는지는 머리말의 「사라진 예외들」이 말한다 — 거기 적힌 이름은 따옴표에
    // 담긴 **값**이 아니라 설명이므로 이 시험에 걸리지 않는다.
    const source = readFileSync(new URL("./quote-labor-cost.ts", import.meta.url), "utf8");
    for (const gone of ['"NO_BASE_COST"', '"CLAMPED_TO_ZERO"', '"NO_POWER_TEST_HOURS"', "resolvePowerTestShare"]) {
      assert.equal(source.split(gone).length - 1, 0, `${gone} 가 아직 남아 있다`);
    }
    assert.ok(source.includes("사라진 예외들"), "왜 사라졌는지를 적어 두지 않았다");
  });

  test("🔴 제외를 주지 않거나 꺼 두면 결과 객체가 통째로 예전 그대로다 — 키도 없다", () => {
    const cases: [SelectedRepairTask[], BaseLaborHours | null][] = [
      [[task()], GENERATOR],
      [[task()], TOTAL_CONTROLLER],
      [[task({ hours: 8 })], NOTHING_SET],
      [[], null],
    ];
    for (const [tasks, base] of cases) {
      const before = sumQuoteLaborCost(tasks, base);
      const label = `기본 ${JSON.stringify(base)}`;
      assert.deepEqual(sumQuoteLaborCost(tasks, base, undefined), before, label);
      const off = sumQuoteLaborCost(tasks, base, { investigation: false, powerTest: false, document: false });
      assert.deepEqual(off, before, label);
      for (const key of [
        "investigationDeduction",
        "investigationNotice",
        "powerTestDeduction",
        "powerTestNotice",
        "documentDeduction",
        "documentNotice",
      ]) {
        assert.ok(!(key in off), `꺼 두었는데 ${key} 키가 생겼다 — ${label}`);
      }
    }
    // 위 비교는 둘 다 함께 달라지면 못 잡는다 — 값으로도 못 박는다.
    assert.deepEqual(sumQuoteLaborCost([task()], GENERATOR), {
      total: 5900000,
      tasksTotal: 2400000,
      baseCost: 3500000,
      unknown: [],
    });
  });
});
