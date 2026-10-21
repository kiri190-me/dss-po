/**
 * ============================================================================
 * 🔴 알림 **확인**이 흐르는 길 — 누르는 자리 · 적는 자리 · 사라지는 자리
 * ============================================================================
 * 2026-10-22 까지 이 사이트는 「확인했다」를 적을 자리가 없었다. 여기 오는
 * 알림은 전부 남의 시스템 것이고, 그 글자를 적을 수 있는 곳은 그 알림을 만든
 * 시스템뿐이었다(종 조각 머리말에 그 까닭이 적혀 있었다). 포털에 확인을 적는
 * 통로가 생기면서 그 전제가 사라졌고, 이제 길은 이렇다:
 *
 *   종에서 **줄을 누른다**(@dss/ui 의 <a>)
 *     → 서버 액션(app/actions/notifications.ts)이 **제 세션에서** 사람 번호를 읽고
 *     → oidc.ts 가 포털의 **확인** 통로에 Basic 자격으로 POST 하고
 *     → 포털이 제 목록에서 그 줄을 찾아 지문을 **직접 계산**해 적는다
 *     → 다음 왕복에서 (기록 · 같은 지문 · 「정보 확인용」) 셋이 맞으면 빠진다
 *
 * 🔴 **이 사이트는 판단하지 않는다.** 결재 승인·부품 요청처럼 동작이 필요한
 *    줄은 확인을 적어도 남는다 — 그 가르기는 포털에 있다.
 *
 * ── 여기서 지키는 것 다섯 ───────────────────────────────────────────────
 *  1. 🔴 **확인 주소로 간다** — 지움 주소가 아니다. 둘은 뜻이 다르다.
 *  2. 🔴 **[X] 는 지금대로** 지움 주소로 간다(2026-10-22 요구).
 *  3. 🔴 **어떤 답이 와도 던지지 않는다.** 이 함수는 줄을 누른 그 순간,
 *     **화면이 넘어가는 한가운데서** 불린다 — 예외가 새면 못 적는 데서
 *     그치지 않고 이동까지 흔들린다.
 *  4. 🔴 **누구의 확인인지는 서버가 정한다.** 브라우저가 보낸 사람 번호를
 *     쓰면 남의 알림을 확인 처리하는 통로가 된다.
 *  5. 🔴 두 통로가 **따로 두 벌**이라(까닭은 oidc.ts 에) 요청 모양이 어긋날
 *     수 있다 — 여기서 글자로 맞대어 본다.
 *
 * 🔴 이 시험은 DB 에도 바깥 망에도 닿지 않는다(목록 unit.txt 의 약속). 포털을
 *    부르는 자리는 가짜 fetch 로 가로채고, 한 군데만 아무도 듣지 않는
 *    127.0.0.1:1 을 쓴다. 서버 액션은 **불러 보지 않고 글자로 읽는다** — 그
 *    파일은 세션을 거쳐 DB 로 이어지고, 이 목록은 거기 닿을 길이 없어야 한다.
 * ============================================================================
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { acknowledgePortalNotification, dismissPortalNotifications } from "./oidc";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** 주석을 걷어 낸 코드. 주석에 적힌 낱말이 시험을 통과시키지 않게. */
function withoutComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ACTION_PATH = "src/app/actions/notifications.ts";
const actionRaw = read(ACTION_PATH);
const action = withoutComments(actionRaw);
const oidc = withoutComments(read("src/lib/auth/oidc.ts"));
const bellRaw = read("src/components/PortalNotificationBell.tsx");
const bellComponent = withoutComments(bellRaw);
/* 🔵 서브모듈(vendor/dss-ui)이 실제로 실어 온 종의 속. 「확인이 실패해도 이동을
   막지 않는다」는 그쪽 성질이라 **그쪽 글자로** 확인한다. 포인터가 옛 커밋이면
   여기서 걸린다(확인 자리는 그 뒤에 들어왔다). */
const BEHAVIOR_PATH = "vendor/dss-ui/src/notification-bell/BellBehavior.tsx";
const behavior = withoutComments(read(BEHAVIOR_PATH));

/**
 * 소스에서 **함수 하나의 몸통**만 잘라 낸다 — 중괄호를 세어 끝을 찾는다.
 *
 * 🔴 `slice(indexOf(...))` 로 자르면 **파일 끝까지**가 딸려 온다. 그러면
 *    「이 함수에 throw 가 없다」가 뒤에 붙은 **다른 함수**까지 보게 되고,
 *    반대로 「이 함수에 X 가 있다」는 뒤쪽 함수의 X 로도 통과한다 — 어느 쪽이든
 *    시험이 재는 것이 조용히 달라진다. 그래서 울타리를 친다.
 * 🔴 못 찾으면 **빈 토막을 돌려주지 않고 그 자리에서 실패한다.** 빈 토막에는
 *    어떤 금지 패턴도 없어서, 돌려주면 시험이 통째로 통과해 버린다(다른
 *    저장소에서 그렇게 반쯤 죽은 시험이 발견된 적이 있다).
 */
function functionBody(source: string, signature: string, where: string): string {
  const at = source.indexOf(signature);
  assert.notEqual(at, -1, `${where}: '${signature}' 를 찾지 못했다 — 시험이 빈 토막을 본다`);

  const open = source.indexOf("{", at);
  assert.notEqual(open, -1, `${where}: '${signature}' 의 몸통이 열리지 않는다`);

  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = source.slice(at, cursor + 1);
        assert.ok(
          body.length > signature.length + 2,
          `${where}: 잘라 낸 토막이 비었다 — 이 시험은 아무것도 재지 않는다`,
        );
        return body;
      }
    }
  }

  return assert.fail(`${where}: '${signature}' 의 몸통이 닫히지 않는다`);
}

/** 줄바꿈·들여쓰기 때문에 시험이 깨지지 않게 공백을 하나로 만든다. */
function squeeze(source: string): string {
  return source.replace(/\s+/g, " ");
}

const ackCall = functionBody(oidc, "export async function acknowledgePortalNotification", "oidc.ts");
const dismissChunk = functionBody(oidc, "async function recordDismissalChunk", "oidc.ts");
const ackAction = functionBody(
  action,
  "export async function acknowledgeNotificationAction",
  ACTION_PATH,
);
const dismissAction = functionBody(
  action,
  "export async function dismissNotificationAction",
  ACTION_PATH,
);
const notifyAcknowledged = functionBody(behavior, "export function notifyAcknowledged", BEHAVIOR_PATH);

/* ── 가짜 포털 ────────────────────────────────────────────────────────── */

type PortalCall = { url: string; headers: Record<string, string>; body: URLSearchParams };

/** 확인 통로의 정상 답. 포털은 숫자 셋만 돌려준다(목록은 돌려주지 않는다). */
function accepted(): Response {
  return new Response(JSON.stringify({ recorded: 1, dropped: 0, skipped: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rejected(status: number): Response {
  return new Response(JSON.stringify({ error: "invalid_request", error_description: "" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * 포털 자리에 가짜를 세우고 일을 시킨 뒤, **무엇이 나갔는지**를 돌려준다.
 * 🔴 진짜 망에 나가지 않는다. 환경변수도 이 블록 안에서만 산다.
 */
async function callingPortal(
  answer: (call: PortalCall, nth: number) => Response,
  run: () => Promise<boolean>,
): Promise<{ calls: PortalCall[]; recorded: boolean }> {
  const calls: PortalCall[] = [];
  const realFetch = globalThis.fetch;
  const realEnv = { ...process.env };

  process.env.SSO_ISSUER = "http://portal.invalid";
  process.env.SSO_CLIENT_ID = "dss-po";
  process.env.SSO_CLIENT_SECRET = "not-a-real-secret";

  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const call: PortalCall = {
      url: String(input),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: new URLSearchParams(String(init.body ?? "")),
    };
    calls.push(call);
    return answer(call, calls.length);
  }) as typeof fetch;

  let recorded: boolean;
  try {
    recorded = await run();
  } finally {
    globalThis.fetch = realFetch;
    process.env = realEnv;
  }

  return { calls, recorded };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. 🔴 확인은 **확인 주소**로 간다 — 지움 주소가 아니다
 * ═════════════════════════════════════════════════════════════════════════ */

test("🔴 확인은 포털의 **확인** 통로로 나간다 — 지움 통로가 아니다", async () => {
  const { calls, recorded } = await callingPortal(
    () => accepted(),
    () => acknowledgePortalNotification("사람-1", "rf-service-system:APPROVAL:7"),
  );

  assert.equal(recorded, true);
  assert.equal(calls.length, 1);

  const [call] = calls;
  assert.equal(
    call.url,
    "http://portal.invalid/api/integration/notification-acknowledgements",
    "🔴 확인이 엉뚱한 통로로 나간다",
  );
  // 🔴 뜻이 다른 두 통로다. 지움으로 가면 재로그인할 때 그 줄이 돌아온다.
  assert.equal(call.url.includes("notification-dismissals"), false, "🔴 지움 통로로 갔다");

  // 🔴 주소에 실리면 포털이 400 으로 거절하고, 그 값은 이미 접근 로그에 남아
  //    **다시 발급**해야 한다(dss-auth/docs/사이트-알림-통로.md).
  assert.equal(call.url.includes("?"), false, "🔴 주소에 무언가 실렸다");
  assert.match(call.headers.authorization, /^Basic /);
  assert.equal(call.headers["content-type"], "application/x-www-form-urlencoded");

  // 몸통에 실리는 것은 둘뿐이다. 칸 이름은 열쇠가 하나여도 `keys` 다.
  assert.deepEqual([...call.body.keys()].sort(), ["keys", "sub"]);
  assert.equal(call.body.get("sub"), "사람-1");
  assert.equal(call.body.get("keys"), "rf-service-system:APPROVAL:7");
});

test("🔴 [X](지움)는 **지금대로** 지움 통로로 간다 — 확인으로 옮겨 가지 않았다", async () => {
  // 2026-10-22 요구: 「[X] 는 지금대로 — 당장 사라지고 재로그인하면 다시 생기는
  // 방식으로」. 확인을 붙이면서 이쪽 주소가 따라 바뀌면 그 요구가 깨진다.
  const { calls, recorded } = await callingPortal(
    () => accepted(),
    () => dismissPortalNotifications("사람-1", ["rf-service-system:APPROVAL:7"]),
  );

  assert.equal(recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://portal.invalid/api/integration/notification-dismissals");
  assert.equal(
    calls[0].url.includes("notification-acknowledgements"),
    false,
    "🔴 ✕ 가 확인 통로로 간다 — 지운 줄이 재로그인해도 안 돌아온다",
  );
});

test("🔴 확인과 지움은 **서로 다른 주소**다 — 한쪽을 베끼며 주소까지 베끼지 않았다", () => {
  assert.match(ackCall, /\/api\/integration\/notification-acknowledgements/);
  assert.equal(
    ackCall.includes("notification-dismissals"),
    false,
    "🔴 확인 함수가 지움 주소를 들고 있다",
  );
  assert.match(dismissChunk, /\/api\/integration\/notification-dismissals/);
  assert.equal(
    dismissChunk.includes("notification-acknowledgements"),
    false,
    "🔴 지움 함수가 확인 주소를 들고 있다",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. 🔴 보내지 않아야 하는 때
 * ═════════════════════════════════════════════════════════════════════════ */

test("포털 계정과 이어지지 않은 사람은 아예 적지 않는다 — 빈 sub 로는 나가지 않는다", async () => {
  // 🔴 이 사이트의 users.ssoSubject 는 **비어 있을 수 있다**(text, nullable).
  const { calls, recorded } = await callingPortal(
    () => accepted(),
    () => acknowledgePortalNotification("", "rf-service-system:APPROVAL:7"),
  );
  assert.equal(calls.length, 0);
  assert.equal(recorded, false);
});

test("🔴 빈 열쇠로는 포털을 부르지 않는다 — 포털이 400(no_keys)으로 거절한다", async () => {
  const { calls, recorded } = await callingPortal(
    () => accepted(),
    () => acknowledgePortalNotification("사람-1", ""),
  );
  assert.equal(calls.length, 0);
  assert.equal(recorded, false);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. 🔴 어떤 답이 와도 던지지 않는다 — 이동을 막으면 안 된다
 * ═════════════════════════════════════════════════════════════════════════ */

test("🔴 포털에 닿지 못해도 던지지 않는다 — false 로 돌아온다", async () => {
  // 실제로 불러 본다. 아무도 듣고 있지 않은 자리(127.0.0.1:1)라 연결이 곧바로
  // 거절된다 — 바깥 망에 나가지 않고 DB 도 쓰지 않는다.
  const realEnv = { ...process.env };
  process.env.SSO_ISSUER = "http://127.0.0.1:1";
  process.env.SSO_CLIENT_ID = "dss-po";
  process.env.SSO_CLIENT_SECRET = "not-a-real-secret";

  try {
    assert.equal(await acknowledgePortalNotification("사람-1", "site:K:1"), false);
  } finally {
    process.env = realEnv;
  }
});

test("🔴 설정이 빠져도 던지지 않는다 — env 의 getter 가 던지는 자리까지 삼킨다", async () => {
  const realEnv = { ...process.env };
  delete process.env.SSO_ISSUER;
  delete process.env.SSO_CLIENT_ID;
  delete process.env.SSO_CLIENT_SECRET;

  try {
    assert.equal(await acknowledgePortalNotification("사람-1", "site:K:1"), false);
  } finally {
    process.env = realEnv;
  }
});

test("🔴 거절(400·401·403·429·503)도 삼킨다 — 던지지 않고 false 다", async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const { recorded } = await callingPortal(
      () => rejected(status),
      () => acknowledgePortalNotification("사람-1", "site:K:1"),
    );
    assert.equal(recorded, false, `${status} 에서 false 가 아니다`);
  }
});

test("🔴 이 통로에도 throw 가 한 군데도 없다", () => {
  assert.equal(/\bthrow\b/.test(ackCall), false, "🔴 확인 통로가 던진다 — 이동까지 흔들린다");
  assert.equal(/\bthrow\b/.test(ackAction), false, "🔴 확인 서버 액션이 던진다");
});

test("🔴 자격증명도 열쇠도 로그에 찍지 않는다 — 찍히는 것은 오류의 종류와 상태뿐이다", () => {
  for (const [where, body] of [
    ["oidc.ts", ackCall],
    [ACTION_PATH, ackAction],
  ] as const) {
    const logs = [...body.matchAll(/console\.(error|log|warn)\(([\s\S]*?)\);/g)];
    assert.ok(logs.length > 0, `${where}: 거절을 한 줄도 남기지 않는다`);
    for (const logged of logs) {
      const args = logged[2];
      assert.equal(
        /credentials|ssoClientSecret|ssoClientId|authorization/i.test(args),
        false,
        `🔴 ${where}: 로그에 자격증명이 딸려 나간다: ${args.trim().slice(0, 60)}`,
      );
      // 🔴 열쇠도 찍지 않는다 — 그 안에 견적서 번호 같은 업무 식별자가 있다.
      assert.equal(
        /\bkeys?\b|\bitem\b/.test(args),
        false,
        `🔴 ${where}: 로그에 열쇠가 딸려 나간다: ${args.trim().slice(0, 60)}`,
      );
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. 🔴 확인이 실패해도 **그 줄이 향하던 화면으로 간다**
 * ═════════════════════════════════════════════════════════════════════════ */

test("🔴 @dss/ui 가 확인 함수를 try 로 감싼다 — 던져도 이동이 막히지 않는다", () => {
  // 이동은 평범한 <a href> 가 한다. 누름 한가운데서 예외가 새면 그 이동까지
  // 흔들리므로, 묶음이 한 겹 받아 준다. 🔴 이 성질을 깨면 안 된다 — 깨졌는지는
  // 화면에서 바로 안 드러나므로(가끔 안 넘어간다) 여기서 글자로 본다.
  assert.match(
    squeeze(notifyAcknowledged),
    /try \{ onAcknowledge\(item\); \} catch \{/,
    "🔴 @dss/ui 가 확인 함수를 감싸지 않는다 — 실패가 이동을 막는다",
  );
  assert.equal(
    /\bthrow\b/.test(notifyAcknowledged),
    false,
    "🔴 받아 놓고 다시 던진다 — 감싼 뜻이 없다",
  );
  // 종이 누름을 받는 자리가 그 함수를 거쳐 간다(직접 부르면 위 보호가 빠진다).
  assert.match(
    squeeze(behavior),
    /acknowledge: \(target\) => \{[\s\S]*?notifyAcknowledged\(picked, latest\.current\.onAcknowledge\);/,
    "🔴 누름이 notifyAcknowledged 를 거치지 않는다",
  );
});

test("🔴 서버 액션도 제 손으로 삼킨다 — 묶음의 보호에 기대지 않는다", () => {
  // 서버 액션은 **약속(Promise)** 을 돌려준다. 묶음의 try 는 그 자리에서 나는
  // 예외만 받아 주므로, 나중에 깨지는 약속까지 막으려면 이쪽에도 울타리가 있어야
  // 한다. 🔵 못 적으면 그 줄이 종에 남을 뿐이다.
  assert.match(ackAction, /try \{/);
  assert.match(ackAction, /\} catch \(error\) \{/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. 🔴 누구의 확인인지는 **서버가** 정한다
 * ═════════════════════════════════════════════════════════════════════════ */

test('🔴 서버 액션이다 — 파일 첫 줄이 "use server" 다', () => {
  assert.match(actionRaw, /^"use server";\n/, '🔴 "use server" 가 파일 맨 앞이 아니다');
});

test("🔴 확인 액션이 sub 을 인자로 받지 않는다 — 받는 것은 눌린 줄 하나뿐이다", () => {
  assert.match(
    ackAction,
    /^export async function acknowledgeNotificationAction\(\s*item: NotificationBellItem,?\s*\)/,
    "🔴 받는 모양이 바뀌었다",
  );
  const head = ackAction.slice(0, ackAction.indexOf("{"));
  assert.equal(
    /\bsub\b|subject/.test(head),
    false,
    "🔴 사람 번호를 인자로 받는다 — 남의 알림을 확인 처리하는 통로가 된다",
  );
});

test("🔴 사람 번호를 **세션에서** 읽는다 — 빈 ssoSubject 도 가른다", () => {
  assert.match(ackAction, /const user = await getSessionUser\(\);/);
  assert.match(ackAction, /if \(!user\) return;/);
  // 🔴 이 사이트의 ssoSubject 는 nullable 이다 — ✕ 와 같은 갈래여야 포털에
  //    빈 sub 이 나가지 않는다.
  assert.match(ackAction, /const subject = user\.ssoSubject \?\? "";/);
  assert.match(ackAction, /if \(subject === ""\) return;/);
  assert.match(ackAction, /if \(key === ""\) return;/);
  assert.match(ackAction, /acknowledgePortalNotification\(subject, key\)/);
  // 세션이 끊긴 사람은 아무 일도 일어나지 않는다(로그인으로 튀지 않는다).
  assert.equal(
    ackAction.includes("requireSession"),
    false,
    "🔴 종 하나 때문에 화면이 로그인으로 튄다",
  );
});

test("🔴 무엇을 없앨지 이 사이트가 가르지 않는다 — 종류를 보는 갈래가 없다", () => {
  // 결재 승인·부품 요청처럼 동작이 필요한 줄을 남기는 일은 **포털**이 한다
  // (기록 · 지문 · 분류 셋을 본다). 여기에 같은 규칙을 한 벌 더 두면 두 곳이
  // 서로 다른 말을 하는 날이 온다.
  assert.equal(
    /\bkind\b|kindLabel|APPROVAL|sourceId/.test(ackAction),
    false,
    "🔴 사이트가 알림 종류를 보고 가른다 — 그 판단은 포털 것이다",
  );
});

test("🔴 적혔을 때만 되살린다 — 거절당했는데 사이트 전체 캐시를 버리지 않는다", () => {
  assert.match(ackAction, /revalidatePath\("\/", "layout"\);/);
  const tail = ackAction.slice(ackAction.indexOf("const recorded"));
  assert.ok(tail.length > 0, "되살리기 앞의 갈래를 찾지 못했다");
  assert.ok(
    tail.indexOf("if (!recorded) return;") < tail.indexOf('revalidatePath("/", "layout")'),
    "🔴 거절당했는데도 사이트 전체 캐시를 버린다",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. 🔴 종에 넘기는 자리
 * ═════════════════════════════════════════════════════════════════════════ */

test("🔴 종에 확인 서버 액션을 넘긴다 — 안 넘기면 눌러도 아무 일도 안 일어난다", () => {
  assert.match(
    bellComponent,
    /import \{[\s\S]*?\backnowledgeNotificationAction\b[\s\S]*?\} from "@\/app\/actions\/notifications";/,
  );
  assert.match(
    bellComponent,
    /<NotificationBell[\s\S]*?onAcknowledge=\{acknowledgeNotificationAction\}[\s\S]*?\/>/,
  );
});

test("🔴 [X] 와 「보이는 알림 지우기」는 그대로 지움으로 간다", () => {
  // 두 단추가 **다른 일**을 한다. 확인을 붙이면서 이쪽을 같은 함수로 묶으면
  // 「지금은 그만 보겠다」가 「해소됐다」가 되어 재로그인해도 안 돌아온다.
  assert.match(
    bellComponent,
    /<NotificationBell[\s\S]*?onDismiss=\{dismissNotificationAction\}[\s\S]*?\/>/,
  );
  assert.match(bellComponent, /<NotificationBell[\s\S]*?onDismissAll=\{dismissAll\}[\s\S]*?\/>/);
  assert.match(dismissAction, /dismissPortalNotifications\(subject, \[key\]\)/);
  assert.equal(
    dismissAction.includes("acknowledgePortalNotification"),
    false,
    "🔴 ✕ 가 확인까지 적는다 — 지운 줄이 재로그인해도 안 돌아온다",
  );
});

test("🔴 종은 서버 조각 그대로다 — 확인을 붙이면서 클라이언트로 넘기지 않았다", () => {
  // 넘어갔다면 `client_secret` 을 다루는 자리가 하나 더 생긴다(그 조각 머리말).
  assert.equal(bellComponent.includes('"use client"'), false);
  assert.equal(
    fs.existsSync(path.resolve(ROOT, "src/app/api/notifications")),
    false,
    "브라우저용 중계 통로가 생겼다 — 생겼다면 세션 재검증까지 함께 봐야 한다",
  );
});

test("🔴 여기서는 제 줄과 남의 줄을 가르지 않는다 — 이 사이트에는 제 알림이 없다", () => {
  // 제 알림이 생기면 (1) 제 줄의 확인은 포털이 아니라 이 사이트에 적어야 하고
  // (2) 종에 넘기기 전에 갈라야 한다 — 포털은 부른 사이트 자신의 알림을 모른다.
  assert.equal(
    fs.existsSync(path.resolve(ROOT, "src/app/api/integration/notifications")),
    false,
    "제 알림을 내주기 시작했다 — 확인을 제 줄과 남의 줄로 갈라야 한다",
  );
});

test("🔴 낡아진 까닭이 주석에 남아 있지 않다 — 다음 사람이 그것을 믿고 되돌린다", () => {
  // 2026-10-22 까지 종 조각 머리말에는 「확인(onAcknowledge)을 넘기지 않는 이유」가
  // 적혀 있었다: 「이 사이트에는 적을 자리가 없다」. 포털에 자리가 생겨 그 전제가
  // 사라졌는데 글자만 남으면, 다음 사람이 그 까닭을 믿고 이 조각을 걷어 낸다.
  assert.equal(
    bellRaw.includes("확인(onAcknowledge)을 넘기지 않는 이유"),
    false,
    "🔴 낡은 까닭이 그대로 있다",
  );
  assert.equal(
    bellRaw.includes("이 사이트에는 적을 자리가 없다. 줄을"),
    false,
    "🔴 낡은 까닭의 본문이 그대로 있다",
  );
  // 🔴 그 자리가 바뀌는 날을 위한 메모는 **있어야 한다**(2026-10-22 요구).
  assert.ok(
    bellRaw.includes("제 알림이 생기면"),
    "🔴 「제 알림이 생기면 여기서 갈라야 한다」가 주석에 없다",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7. 🔴 두 벌이라 어긋날 수 있다 — 요청 모양을 맞대어 본다
 * ══════════════════════════════════════════════════════════════════════════
 * 확인과 지움은 **따로 두 벌**이다. 나누지 않은 까닭은 oidc.ts 에 적혀 있다
 * (나누려면 이미 돌고 있는 지움 쪽을 고쳐야 하는데, 이번 조각의 요구가
 * 「[X] 는 지금대로」였다). 🔴 그 대신 **한쪽만 고쳐지는 날**을 여기서 잡는다.
 * ═════════════════════════════════════════════════════════════════════════ */

test("🔴 확인과 지움은 요청 모양이 같다 — 한쪽만 고치면 여기서 걸린다", () => {
  const shapes: Array<[string, RegExp]> = [
    ["POST 로 보낸다", /method: "POST"/],
    ["자격증명을 같은 자리에서 읽는다", /encodeURIComponent\(env\.ssoClientId\)/],
    ["시크릿도 같은 자리에서 읽는다", /encodeURIComponent\( env\.ssoClientSecret, \)/],
    [
      "자격증명은 머리말(Basic)로만 나간다",
      /authorization: `Basic \$\{Buffer\.from\(credentials, "utf8"\)\.toString\("base64"\)\}`/,
    ],
    ["몸통은 폼 모양이다", /"content-type": "application\/x-www-form-urlencoded"/],
    ["답은 JSON 으로 받는다", /accept: "application\/json"/],
    ["몸통에 sub 과 keys 를 싣는다", /new URLSearchParams\(\{ sub: subject, keys: /],
    ["답을 캐시하지 않는다", /cache: "no-store"/],
    ["같은 시간 상한을 쓴다", /signal: AbortSignal\.timeout\(NOTIFICATIONS_TIMEOUT_MS\)/],
    ["거절을 삼키고 false 를 준다", /if \(!response\.ok\) \{ console\.error\([\s\S]*?return false; \}/],
  ];

  for (const [what, shape] of shapes) {
    assert.match(squeeze(ackCall), shape, `🔴 확인 쪽이 어긋났다 — ${what}`);
    assert.match(squeeze(dismissChunk), shape, `🔴 지움 쪽이 어긋났다 — ${what}`);
  }
});

test("🔴 확인은 열쇠를 **하나만** 받는다 — 안 돌리는 나누기 고리를 두지 않았다", () => {
  // 확인은 줄을 하나 누르는 일이라 열쇠가 언제나 하나다. 「확인 전부」 같은
  // 단추가 생기면 그때 지움 쪽처럼 200개씩 나눠 보내는 고리를 더한다.
  assert.match(
    ackCall,
    /^export async function acknowledgePortalNotification\(\s*subject: string,\s*key: string,?\s*\)/,
  );
  assert.equal(
    ackCall.includes("DISMISSALS_PER_REQUEST"),
    false,
    "나누기 고리가 생겼다 — 그렇다면 상한과 흘림을 재는 시험도 함께 와야 한다",
  );
});
