import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AS_GATEWAY_UNREACHABLE_MESSAGES,
  asCompletionUnreachableMessage,
  setAsDomesticOrderCompletion,
} from "./as-gateway";

/**
 * ============================================================================
 * A/S 를 부르는 자리 — 🔴 **못 한 일을 한 것처럼 말하지 않는가** (2026-10-18)
 * ============================================================================
 * 이 파일이 지키는 것이 이 조각의 가장 큰 울타리다. 읽는 통로였다면 「못 받아 왔다」를
 * 「하나도 없다」로 바꾸지 않는 것이 전부였지만, 여기는 **쓰는 통로**라 하나가 더 있다:
 *
 * 🔴 ① **업무 거절과 못 닿음을 가른다.** 저쪽이 "최종 출하 승인이 없다"고 거절한 것과
 *      우리가 저쪽에 닿지도 못한 것은 사람이 할 일이 전혀 다르다. 앞은 수리 건을 보러
 *      가는 일이고 뒤는 설정을 넣거나 저쪽 앱을 보는 일이다.
 * 🔴 ② **「확실히 안 바뀌었다」와 「바뀌었는지 모른다」를 가른다.** 두드리지도 않았으면
 *      단언해도 되지만, 시간이 초과됐거나 답을 못 읽었으면 저쪽은 이미 저장했을 수 있다.
 *      그때 「그대로입니다」라고 말하면 사람이 다시 누른다.
 * 🔴 ③ **`CONFLICT` 와 `SHIPMENT_COMPLETION_BLOCKED` 가 같은 409 다.** 번호로 가르면
 *      둘이 섞인다 — 가르는 것은 `code` 이고, 🔴 `message` 글자를 비교하지 않는다.
 *
 * 망을 타지 않는다 — `globalThis.fetch` 를 갈아 끼운다. 환경변수도 이 파일 안에서만
 * 바꾸고 되돌린다(부를 때마다 읽으므로 갈아 끼울 수 있다). 이웃
 * `RF_Service_System/src/lib/server/inventory-gateway.test.ts` 와 같은 방식이다.
 *
 * 값은 전부 지어낸 것이다 — 실제 고객사 · 인수번호 · 토큰을 적지 않는다(공개 저장소).
 * ============================================================================
 */

const BASE = "http://as.test";
const WRITE_TOKEN = "지어낸-A/S-쓰기-토큰-0123456789abcdef";
const ROW_ID = "11111111-2222-3333-4444-555555555555";
const SUB = "portal-subject-0001";

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  hasSignal: boolean;
};

let calls: FetchCall[] = [];
const realFetch = globalThis.fetch;
const realEnv = {
  base: process.env.AS_APP_BASE_URL,
  write: process.env.AS_WRITE_TOKEN,
};

/** 응답 하나를 돌려주는 가짜 통로. `json` 이 글자면 JSON 으로 못 읽는 응답을 흉내 낸다. */
function stubFetch(responder: (call: FetchCall) => { status: number; json: unknown }) {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      hasSignal: init?.signal instanceof AbortSignal,
    };
    calls.push(call);
    const answer = responder(call);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => {
        if (typeof answer.json === "string") throw new SyntaxError("Unexpected token < in JSON");
        return answer.json;
      },
    } as unknown as Response;
  }) as typeof fetch;
}

/** 망이 통째로 실패하는 흉내. `name` 으로 시간 초과와 그 밖의 실패를 가른다. */
function stubFetchThrowing(errorName: string) {
  globalThis.fetch = (async () => {
    const err = new Error("stub");
    err.name = errorName;
    throw err;
  }) as typeof fetch;
}

const OK_BODY = {
  ok: true,
  id: ROW_ID,
  version: 4,
  repairCaseShipmentCompleted: true,
  repairCaseShipmentReverted: false,
};

function callComplete(completed = true) {
  return setAsDomesticOrderCompletion({
    id: ROW_ID,
    expectedVersion: 3,
    completed,
    requesterSub: SUB,
  });
}

beforeEach(() => {
  calls = [];
  process.env.AS_APP_BASE_URL = BASE;
  process.env.AS_WRITE_TOKEN = WRITE_TOKEN;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.AS_APP_BASE_URL = realEnv.base ?? "";
  process.env.AS_WRITE_TOKEN = realEnv.write ?? "";
});

/* ------------------------------------------------------------------------ */

describe("🔴 설정이 비면 **두드리지 않는다** — 「응답하지 않는다」와 다른 갈래다", () => {
  test("주소가 없으면 부르지도 않는다 (not_configured)", async () => {
    process.env.AS_APP_BASE_URL = "";
    stubFetch(() => ({ status: 200, json: OK_BODY }));

    const result = await callComplete();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "not_configured");
    assert.equal(calls.length, 0, "주소도 없이 통로를 두드렸다");
  });

  test("토큰이 없으면 부르지도 않는다 (not_configured)", async () => {
    process.env.AS_WRITE_TOKEN = "   ";
    stubFetch(() => ({ status: 200, json: OK_BODY }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "not_configured");
    assert.equal(calls.length, 0, "토큰도 없이 통로를 두드렸다");
  });

  test("🔴 포털 번호가 비어 있으면 부르지 않는다 — 보내 봐야 저쪽이 403 이다", async () => {
    stubFetch(() => ({ status: 200, json: OK_BODY }));

    const result = await setAsDomesticOrderCompletion({
      id: ROW_ID,
      expectedVersion: 3,
      completed: true,
      requesterSub: "   ",
    });

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "not_configured");
    assert.equal(calls.length, 0);
  });
});

describe("보내는 모양 — 저쪽 약속 그대로", () => {
  test("주소 · 메서드 · 쓰기 토큰 · 본문 세 칸 · 시간 제한", async () => {
    stubFetch(() => ({ status: 200, json: OK_BODY }));

    await callComplete(true);

    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, `${BASE}/api/v1/domestic-orders/${ROW_ID}/completion`);
    assert.equal(call.method, "POST");
    assert.equal(call.headers.Authorization, `Bearer ${WRITE_TOKEN}`);
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.deepEqual(call.body, { completed: true, expectedVersion: 3, requester: { sub: SUB } });
    assert.ok(call.hasSignal, "시간 제한을 걸지 않았다");
  });

  test("🔴 completed 는 **불리언 그대로** 간다 — false 가 빠지면 저쪽이 400 이다", async () => {
    stubFetch(() => ({ status: 200, json: { ...OK_BODY, repairCaseShipmentCompleted: false } }));

    await callComplete(false);

    assert.equal((calls[0].body as { completed: unknown }).completed, false);
  });

  test("주소 끝의 / 는 env 가 떼어 낸다 — `//api` 가 되지 않는다", async () => {
    process.env.AS_APP_BASE_URL = `${BASE}/`;
    stubFetch(() => ({ status: 200, json: OK_BODY }));

    await callComplete();

    assert.equal(calls[0].url, `${BASE}/api/v1/domestic-orders/${ROW_ID}/completion`);
  });

  test("id 는 주소에 넣기 전에 감싼다 — 이상한 값이 경로를 늘리지 못한다", async () => {
    stubFetch(() => ({ status: 404, json: { ok: false, code: "NOT_FOUND", message: "없습니다." } }));

    await setAsDomesticOrderCompletion({
      id: "../../users",
      expectedVersion: 1,
      completed: true,
      requesterSub: SUB,
    });

    assert.equal(calls[0].url, `${BASE}/api/v1/domestic-orders/..%2F..%2Fusers/completion`);
  });
});

describe("성공 — 수리 건이 함께 움직였는지를 그대로 들고 온다", () => {
  test("두 칸을 읽어 돌려준다", async () => {
    stubFetch(() => ({
      status: 200,
      json: { ...OK_BODY, repairCaseShipmentCompleted: true, repairCaseShipmentReverted: false },
    }));

    const result = await callComplete();

    assert.equal(result.ok, true);
    assert.deepEqual(result, {
      ok: true,
      id: ROW_ID,
      version: 4,
      repairCaseShipmentCompleted: true,
      repairCaseShipmentReverted: false,
    });
  });

  test("🔵 두 칸이 없으면 false 다 — 「수리 건도 움직였다」로 기울지 않는다", async () => {
    stubFetch(() => ({ status: 200, json: { ok: true, id: ROW_ID, version: 9 } }));

    const result = await callComplete();

    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.repairCaseShipmentCompleted : null, false);
    assert.equal(result.ok === true ? result.repairCaseShipmentReverted : null, false);
  });

  test("🔴 200 인데 모양이 아니면 **성공이 아니다** — 바뀌었는지 모른다", async () => {
    stubFetch(() => ({ status: 200, json: { ok: true, id: ROW_ID } })); // version 이 없다

    const result = await callComplete();

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "unreadable_result");
  });

  test("🔴 200 인데 본문을 JSON 으로 못 읽어도 성공이 아니다", async () => {
    stubFetch(() => ({ status: 200, json: "<html>프록시가 가로챘다</html>" }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "unreadable_result");
  });
});

describe("🔴 저쪽이 거절했다 — 번호가 아니라 code 로 가른다", () => {
  test("409 SHIPMENT_COMPLETION_BLOCKED — message 를 **글자 그대로** 올린다", async () => {
    const message = "최종 출하 승인이 완료되어야 진행할 수 있습니다.";
    stubFetch(() => ({ status: 409, json: { ok: false, code: "SHIPMENT_COMPLETION_BLOCKED", message } }));

    const result = await callComplete();

    assert.deepEqual(result, { ok: false, kind: "rejected", code: "SHIPMENT_COMPLETION_BLOCKED", message });
  });

  test("🔴 같은 409 라도 CONFLICT 는 다른 코드로 온다 — 둘이 섞이면 안 된다", async () => {
    stubFetch(() => ({
      status: 409,
      json: { ok: false, code: "CONFLICT", message: "다른 사용자가 먼저 수정했습니다." },
    }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "rejected" ? result.code : null, "CONFLICT");
  });

  test("403 · 404 · 400 · 503(DB) 도 거절로 온다 — 못 닿은 것이 아니다", async () => {
    for (const [status, code] of [
      [400, "VALIDATION_ERROR"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [503, "DATABASE_UNAVAILABLE"],
    ] as const) {
      stubFetch(() => ({ status, json: { ok: false, code, message: "까닭 한 줄." } }));

      const result = await callComplete();

      assert.equal(result.ok, false);
      assert.equal(result.ok === false ? result.kind : null, "rejected", `${status} ${code}`);
      assert.equal(result.ok === false && result.kind === "rejected" ? result.code : null, code);
    }
  });

  test("🔴 모르는 code 는 거절로 읽지 않는다 — 업무가 막은 것처럼 보이면 엉뚱한 곳을 고친다", async () => {
    stubFetch(() => ({ status: 418, json: { ok: false, code: "NEW_THING", message: "뭔가." } }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "error");
  });

  test("🔴 까닭이 없는 4xx 도 거절이 아니다 — 통로가 아직 안 열려 HTML 이 오는 경우", async () => {
    stubFetch(() => ({ status: 404, json: "<!DOCTYPE html>" }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "error");
  });
});

describe("🔴 못 닿았다 — 고치는 길이 저마다 다르다", () => {
  test("401 — 토큰이 어긋났다. 🔴 몸통에 `ok` 칸이 없어도 가려낸다", async () => {
    stubFetch(() => ({ status: 401, json: { error: "unauthorized" } }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "unauthorized");
  });

  test("503 api_closed — 저쪽에 토큰이 설정되지 않았다", async () => {
    stubFetch(() => ({ status: 503, json: { error: "api_closed" } }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "api_closed");
  });

  test("시간 초과", async () => {
    stubFetchThrowing("AbortError");

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "timeout");
  });

  test("망이 끊겼다", async () => {
    stubFetchThrowing("TypeError");

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "error");
  });

  test("5xx", async () => {
    stubFetch(() => ({ status: 500, json: { error: "boom" } }));

    const result = await callComplete();

    assert.equal(result.ok === false && result.kind === "unreachable" ? result.reason : null, "error");
  });

  test("🔴 어느 갈래도 `ok: true` 가 아니다", async () => {
    const stubs: (() => void)[] = [
      () => stubFetch(() => ({ status: 401, json: { error: "unauthorized" } })),
      () => stubFetch(() => ({ status: 503, json: { error: "api_closed" } })),
      () => stubFetch(() => ({ status: 500, json: {} })),
      () => stubFetch(() => ({ status: 200, json: "<html>" })),
      () => stubFetchThrowing("AbortError"),
    ];
    for (const make of stubs) {
      make();
      const result = await callComplete();
      assert.equal(result.ok, false);
    }
  });
});

describe("🔴 사람에게 하는 말 — 「그대로다」와 「모른다」를 가른다", () => {
  test("두드리지도 않았으면 **그대로라고 단언한다**", () => {
    for (const reason of ["not_configured", "unauthorized", "api_closed"] as const) {
      const text = asCompletionUnreachableMessage(reason, true);
      assert.ok(text.startsWith(AS_GATEWAY_UNREACHABLE_MESSAGES[reason]), text);
      assert.ok(text.includes("완료 처리를 하지 못했고"), text);
      assert.ok(text.includes("그대로입니다"), text);
      assert.ok(!text.includes("알 수 없습니다"), text);
    }
  });

  test("🔴 보냈는데 답을 모르면 **단언하지 않는다** — 다시 누르게 두지 않는다", () => {
    for (const reason of ["timeout", "error", "unreadable_result"] as const) {
      const text = asCompletionUnreachableMessage(reason, true);
      assert.ok(text.includes("알 수 없습니다"), text);
      assert.ok(text.includes("새로고침"), text);
      assert.ok(!text.includes("그대로입니다"), text);
    }
  });

  test("누른 단추에 따라 말이 갈린다 — 완료 처리 ↔ 완료 해제", () => {
    assert.ok(asCompletionUnreachableMessage("not_configured", true).includes("완료 처리"));
    assert.ok(!asCompletionUnreachableMessage("not_configured", true).includes("완료 해제"));
    assert.ok(asCompletionUnreachableMessage("not_configured", false).includes("완료 해제"));
    assert.ok(!asCompletionUnreachableMessage("not_configured", false).includes("완료 처리"));
  });

  test("🔴 여섯 갈래 어느 것도 「완료되었습니다」라고 말하지 않는다", () => {
    for (const reason of Object.keys(AS_GATEWAY_UNREACHABLE_MESSAGES) as (keyof typeof AS_GATEWAY_UNREACHABLE_MESSAGES)[]) {
      for (const completed of [true, false]) {
        const text = asCompletionUnreachableMessage(reason, completed);
        assert.ok(!text.includes("완료되었습니다"), text);
        assert.ok(!text.includes("처리했습니다"), text);
      }
    }
  });
});
