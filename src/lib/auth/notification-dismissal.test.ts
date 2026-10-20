/**
 * ============================================================================
 * 🔴 알림 지움이 흐르는 길 — 누르는 자리 · 적는 자리 · 사라지는 자리
 * ============================================================================
 * 2026-10-19 까지 「이 알림 그만 보겠다」는 **각 사이트의 브라우저**에 적혔다.
 * 브라우저 저장소는 주소(포트)별로 갈려서, A/S(3000)에서 지운 줄이 이 사이트
 * (3600)의 종에는 그대로 떴다 — 같은 사람이 시스템마다 다른 목록을 봤다.
 * 그래서 지움을 포털 한 곳으로 모았고, 이 사이트가 하는 일은 하나다:
 *
 *   종의 ✕ (@dss/ui 가 그린다)
 *     → 서버 액션(app/actions/notifications.ts)이 **제 세션에서** 사람 번호를 읽고
 *     → oidc.ts 가 포털의 쓰기 통로에 Basic 자격으로 POST 하고
 *     → revalidate 로 사내 구간 레이아웃이 다시 그려지면 그 줄이 빠진다
 *
 * 🔵 **이 사이트에는 제 알림이 없다**(notification-bell-wiring.test.ts 와 같은
 *    근거 — 견적서 결재 알림은 A/S 의 종에 뜬다). 그래서 제 줄에 접두사를
 *    붙이는 일도, 포털이 준 지움으로 제 줄을 거르는 일도 여기에는 없다 —
 *    포털이 이미 걸러서 준다. 할 일은 ✕ 를 포털로 보내는 것 하나뿐이다.
 *
 * ── 여기서 지키는 것 다섯 ───────────────────────────────────────────────
 *  1. 🔴 **어떤 답이 와도 던지지 않는다.** 이 함수는 사람이 ✕ 를 누른 그
 *     순간, 종의 다른 처리 한가운데서 불린다 — 여기서 예외가 새면 그 누름이
 *     통째로 멈춘다. 못 지우면 그 줄이 남을 뿐이다.
 *  2. 🔴 **200개씩 나눠 보낸다.** 넘기면 포털이 400 으로 **통째로** 거절한다
 *     (앞의 200개만 받아 주지 않는다).
 *  3. 🔴 **빈 목록은 아예 보내지 않는다** — 포털이 400(no_keys)으로 거절한다.
 *  4. 🔴 **누구의 지움인지는 서버가 정한다.** 브라우저가 보낸 사람 번호를
 *     쓰면 남의 알림을 지울 수 있는 통로가 된다.
 *  5. 🔴 **`client_secret` 은 브라우저로 나가지 않는다.** 시크릿을 읽는 모듈을
 *     클라이언트 조각이 부르지 않는지 **소스를 훑어** 확인한다.
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

import { dismissPortalNotifications } from "./oidc";

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
const bellComponent = withoutComments(read("src/components/PortalNotificationBell.tsx"));

/* ── 가짜 포털 ────────────────────────────────────────────────────────── */

type PortalCall = { url: string; headers: Record<string, string>; body: URLSearchParams };

/** 포털이 보내는 정상 답. `recorded` 는 **뜻이 지켜진 수**다(새 행 수가 아니다). */
function accepted(count: number): Response {
  return new Response(JSON.stringify({ recorded: count, dropped: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rejected(status: number): Response {
  return new Response(
    JSON.stringify({ error: "invalid_request", error_description: "" }),
    { status, headers: { "content-type": "application/json" } },
  );
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

function keys(count: number, prefix = "rf-service-system"): string[] {
  return Array.from({ length: count }, (_, at) => `${prefix}:APPROVAL:${at + 1}`);
}

/* ── 1. 🔴 보내지 않아야 하는 때 ──────────────────────────────────────── */

test("🔴 보낼 열쇠가 없으면 포털을 아예 부르지 않는다 — 빈 묶음은 400 으로 거절된다", async () => {
  for (const empty of [[], [""], ["", ""]]) {
    const { calls, recorded } = await callingPortal(
      () => accepted(0),
      () => dismissPortalNotifications("00000000-0000-0000-0000-000000000000", empty),
    );
    assert.equal(calls.length, 0, `${JSON.stringify(empty)} 로 포털을 불렀다`);
    assert.equal(recorded, false);
  }
});

test("포털 계정과 이어지지 않은 사람은 아예 적지 않는다 — 빈 sub 로는 나가지 않는다", async () => {
  // 🔴 이 사이트의 users.ssoSubject 는 **비어 있을 수 있다**(text, nullable).
  const { calls, recorded } = await callingPortal(
    () => accepted(1),
    () => dismissPortalNotifications("", keys(1)),
  );
  assert.equal(calls.length, 0);
  assert.equal(recorded, false);
});

/* ── 2. 🔴 나가는 모양 ────────────────────────────────────────────────── */

test("🔴 자격증명은 Authorization: Basic 으로만 나간다 — 주소에 싣지 않는다", async () => {
  const { calls, recorded } = await callingPortal(
    () => accepted(1),
    () => dismissPortalNotifications("사람-1", ["rf-service-system:APPROVAL:7"]),
  );

  assert.equal(recorded, true);
  assert.equal(calls.length, 1);

  const [call] = calls;
  assert.equal(call.url, "http://portal.invalid/api/integration/notification-dismissals");
  // 🔴 주소에 실리면 포털이 400 으로 거절하고, 그 값은 이미 접근 로그에 남아
  //    **다시 발급**해야 한다(dss-auth/docs/사이트-알림-통로.md).
  assert.equal(call.url.includes("?"), false, "🔴 주소에 무언가 실렸다");
  assert.match(call.headers.authorization, /^Basic /);
  assert.equal(call.headers["content-type"], "application/x-www-form-urlencoded");

  // 몸통에 실리는 것은 둘뿐이다.
  assert.deepEqual([...call.body.keys()].sort(), ["keys", "sub"]);
  assert.equal(call.body.get("sub"), "사람-1");
  assert.equal(call.body.get("keys"), "rf-service-system:APPROVAL:7");
});

test("읽는 통로와 같은 자격·같은 상한·같은 no-store 를 쓴다", () => {
  const write = oidc.slice(oidc.indexOf("async function recordDismissalChunk"));
  assert.match(write, /authorization: `Basic \$\{Buffer\.from\(credentials/);
  assert.match(write, /signal: AbortSignal\.timeout\(NOTIFICATIONS_TIMEOUT_MS\)/);
  assert.match(write, /cache: "no-store"/);
});

test("🔴 자격증명을 로그에 찍지 않는다 — 찍히는 것은 오류의 종류와 상태뿐이다", () => {
  const write = oidc.slice(oidc.indexOf("async function recordDismissalChunk"));
  for (const logged of write.matchAll(/console\.(error|log|warn)\(([\s\S]*?)\);/g)) {
    const args = logged[2];
    assert.equal(
      /credentials|ssoClientSecret|ssoClientId|authorization/i.test(args),
      false,
      `🔴 로그에 자격증명이 딸려 나간다: ${args.trim().slice(0, 60)}`,
    );
    // 🔴 열쇠도 찍지 않는다 — 그 안에 견적서 번호 같은 업무 식별자가 있다.
    assert.equal(/\bkeys?\b/.test(args), false, `🔴 로그에 열쇠가 딸려 나간다: ${args.trim()}`);
  }
});

/* ── 3. 🔴 200개씩 나눠 보낸다 ────────────────────────────────────────── */

test("🔴 200개까지는 한 번에 간다", async () => {
  const { calls, recorded } = await callingPortal(
    () => accepted(200),
    () => dismissPortalNotifications("사람-1", keys(200)),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.get("keys")?.split(",").length, 200);
  assert.equal(recorded, true);
});

test("🔴 201개부터 나눠 보낸다 — 한 번에 보내면 포털이 **통째로** 거절한다", async () => {
  const wanted = keys(450);
  const { calls, recorded } = await callingPortal(
    () => accepted(1),
    () => dismissPortalNotifications("사람-1", wanted),
  );

  assert.equal(calls.length, 3, "묶음 수가 다르다");
  assert.deepEqual(
    calls.map((call) => call.body.get("keys")?.split(",").length),
    [200, 200, 50],
  );
  // 🔴 나누면서 **한 개도 흘리지 않는다.** 차례도 그대로다.
  assert.deepEqual(
    calls.flatMap((call) => call.body.get("keys")?.split(",") ?? []),
    wanted,
  );
  // 사람 번호는 묶음마다 같은 값이 실린다.
  assert.deepEqual(new Set(calls.map((call) => call.body.get("sub"))), new Set(["사람-1"]));
  assert.equal(recorded, true);
});

test("같은 열쇠가 두 번 실려 와도 한 번만 보낸다", async () => {
  const { calls } = await callingPortal(
    () => accepted(1),
    () =>
      dismissPortalNotifications("사람-1", [
        "rf-service-system:APPROVAL:1",
        "rf-service-system:APPROVAL:1",
        "",
        "dss-improvements:NEW:2",
      ]),
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.get("keys")?.split(","), [
    "rf-service-system:APPROVAL:1",
    "dss-improvements:NEW:2",
  ]);
});

/* ── 4. 🔴 어떤 답이 와도 던지지 않는다 ───────────────────────────────── */

test("🔴 포털에 닿지 못해도 던지지 않는다 — false 로 돌아온다", async () => {
  // 실제로 불러 본다. 아무도 듣고 있지 않은 자리(127.0.0.1:1)라 연결이 곧바로
  // 거절된다 — 바깥 망에 나가지 않고 DB 도 쓰지 않는다.
  const realEnv = { ...process.env };
  process.env.SSO_ISSUER = "http://127.0.0.1:1";
  process.env.SSO_CLIENT_ID = "dss-po";
  process.env.SSO_CLIENT_SECRET = "not-a-real-secret";

  try {
    assert.equal(await dismissPortalNotifications("사람-1", keys(1)), false);
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
    assert.equal(await dismissPortalNotifications("사람-1", keys(1)), false);
  } finally {
    process.env = realEnv;
  }
});

test("🔴 거절(400·401·403·429·503)도 삼킨다 — 던지지 않고 false 다", async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const { recorded } = await callingPortal(
      () => rejected(status),
      () => dismissPortalNotifications("사람-1", keys(1)),
    );
    assert.equal(recorded, false, `${status} 에서 false 가 아니다`);
  }
});

test("🔴 한 묶음이 거절돼도 나머지 묶음은 그대로 보낸다", async () => {
  // 가운데가 503 이어도 셋 다 나가야 한다. 여기서 멈추면 뒤쪽 열쇠는 영영
  // 적히지 않는데, 🔵 이 통로는 몇 번을 다시 보내도 안전하므로 멈출 까닭이 없다.
  const { calls, recorded } = await callingPortal(
    (_call, nth) => (nth === 2 ? rejected(503) : accepted(200)),
    () => dismissPortalNotifications("사람-1", keys(450)),
  );
  assert.equal(calls.length, 3);
  assert.equal(recorded, false, "🔴 하나라도 거절됐으면 false 여야 한다");
});

test("🔴 이 통로에는 throw 가 한 군데도 없다", () => {
  const write = oidc.slice(oidc.indexOf("async function recordDismissalChunk"));
  assert.ok(write.length > 0, "지움을 적는 함수를 찾지 못했다");
  assert.equal(/\bthrow\b/.test(write), false, "🔴 지움 통로가 던진다 — 누름이 통째로 멈춘다");
  assert.equal(/\bthrow\b/.test(action), false, "🔴 서버 액션이 던진다");
});

/* ── 5. 🔴 누구의 지움인지는 **서버가** 정한다 ────────────────────────── */

test('🔴 서버 액션이다 — 파일 첫 줄이 "use server" 다', () => {
  assert.match(actionRaw, /^"use server";\n/, '🔴 "use server" 가 파일 맨 앞이 아니다');
});

test("🔴 사람 번호를 **세션에서** 읽는다 — 브라우저가 보낸 값을 쓰지 않는다", () => {
  assert.match(action, /const user = await getSessionUser\(\);/);
  // 🔴 이 사이트의 ssoSubject 는 nullable 이다 — 레이아웃이 종에 넘길 때와
  //    같은 모양으로 받아야 포털에 빈 sub 이 나가지 않는다.
  assert.match(action, /const subject = user\.ssoSubject \?\? "";/);
  assert.match(action, /dismissPortalNotifications\(subject, \[key\]\)/);
  // 🔴 받는 것은 종이 넘겨 준 줄 하나뿐이다. sub·subject 를 인자로 받으면
  //    브라우저가 아무 번호나 실어 **남의 알림을 지울 수 있는 통로**가 된다.
  const signature = action.slice(
    action.indexOf("export async function dismissNotificationAction"),
  );
  assert.match(
    signature,
    /^export async function dismissNotificationAction\(\s*item: NotificationBellItem,?\s*\)/,
  );
  // 세션이 끊긴 사람은 아무 일도 일어나지 않는다(로그인으로 튀지 않는다).
  assert.equal(action.includes("requireSession"), false, "🔴 종 하나 때문에 화면이 로그인으로 튄다");
});

test("🔴 세션이 없거나·포털과 안 이어졌거나·열쇠가 비면 포털을 부르지 않는다", () => {
  assert.match(action, /if \(!user\) return;/);
  assert.match(action, /if \(subject === ""\) return;/);
  assert.match(action, /if \(key === ""\) return;/);
});

/* ── 6. 🔴 `client_secret` 이 브라우저로 나가지 않는다 ────────────────── */

/** `"use client"` 가 **첫 줄**인 파일만 고른다(주석에 적힌 낱말은 세지 않는다). */
function clientFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = withoutComments(fs.readFileSync(full, "utf8")).trimStart();
      if (/^["']use client["']/.test(source)) found.push(full);
    }
  };
  walk(path.resolve(ROOT, "src"));
  return found;
}

test("🔴 시크릿을 읽는 모듈을 클라이언트 조각이 부르지 않는다", () => {
  // oidc.ts 와 env.ts 는 `client_secret` 을 읽는다. 클라이언트 그래프에 한 번
  // 들어가면 그 값이 번들에 실릴 길이 생긴다 — 들어갔는지는 화면에서 드러나지
  // 않으므로 여기서 본다.
  //
  // 🔴 단순 grep 으로는 못 잡는다. 이 저장소에는 주석에 `"use client"` 라고
  //    적어 둔 **서버** 조각이 있고((app)/layout.tsx · (app)/quotes/page.tsx),
  //    그것까지 클라이언트로 세면 이 시험은 늘 실패한다.
  const files = clientFiles();
  assert.ok(files.length > 0, "클라이언트 조각을 하나도 못 찾았다 — 고르는 방식이 깨졌다");
  for (const file of files) {
    const source = withoutComments(fs.readFileSync(file, "utf8"));
    assert.equal(
      /from "@\/lib\/auth\/oidc"|from "@\/lib\/env"/.test(source),
      false,
      `🔴 클라이언트 조각이 서버 전용 모듈을 부른다: ${path.relative(ROOT, file)}`,
    );
  }
});

test("🔴 종은 서버 조각 그대로다 — 지우기를 붙이면서 클라이언트로 넘기지 않았다", () => {
  // 넘어갔다면 `client_secret` 을 다루는 자리가 하나 더 생긴다(그 조각 머리말).
  assert.equal(bellComponent.includes('"use client"'), false);
  assert.equal(
    fs.existsSync(path.resolve(ROOT, "src/app/api/notifications")),
    false,
    "브라우저용 중계 통로가 생겼다 — 생겼다면 세션 재검증까지 함께 봐야 한다",
  );
});

/* ── 7. 그리는 자리 — ✕ 가 서고, 다음 렌더에서 줄어든다 ───────────────── */

test("🔴 종에 서버 액션을 넘긴다 — 이 함수가 있어야 ✕ 가 그려진다", () => {
  assert.match(
    bellComponent,
    /import \{ dismissNotificationAction \} from "@\/app\/actions\/notifications";/,
  );
  assert.match(bellComponent, /<NotificationBell[\s\S]*?onDismiss=\{dismissNotificationAction\}[\s\S]*?\/>/);
});

test("🔴 모든 줄에 ✕ 가 선다 — 이 사이트에는 가려야 할 **제 줄**이 없다", () => {
  // 가려야 하는 것은 「처리해야 사라지는 제 할 일」인데(A/S 가 그렇다) 여기
  // 오는 줄은 전부 남의 시스템 것이다. canDismiss 를 넘기면 그때는 까닭이
  // 함께 적혀 있어야 한다.
  assert.equal(bellComponent.includes("canDismiss"), false);
});

test("🔴 이 사이트에는 제 알림이 없다 — 내줄 통로도 없다(그래서 접두사도 거르기도 없다)", () => {
  // 제 알림이 생기면 포털에 내주는 통로가 먼저 생긴다. 그때는 (1) 제 줄의
  // key 에 자기 client_id 를 붙이고 (2) 포털이 준 지움으로 제 줄을 거르는
  // 일이 여기에 붙어야 한다 — 포털은 **부른 사이트 자신의 알림을 모른다.**
  assert.equal(
    fs.existsSync(path.resolve(ROOT, "src/app/api/integration/notifications")),
    false,
    "제 알림을 내주기 시작했다 — 지움 거르기와 접두사를 함께 붙여야 한다",
  );
});

test("🔴 지운 뒤 다음 렌더에서 줄이 빠진다 — 사내 구간 **레이아웃**을 되살린다", () => {
  // 종은 (app)/layout.tsx 가 그린다. 라우트 그룹이라 URL 에 나타나지 않으므로
  // 경로는 `/` 다. 화면 하나만 되살리면 레이아웃은 그대로라 ✕ 를 눌러도 줄이
  // 남는다(같은 줄을 lib/server/actions/quote-approvals.ts 가 이미 쓴다).
  assert.match(action, /revalidatePath\("\/", "layout"\);/);
  // 적히지 않았으면 되살리지 않는다 — 목록이 똑같을 것이므로 캐시만 버리게 된다.
  const tail = action.slice(action.indexOf("const recorded"));
  assert.ok(
    tail.indexOf("if (!recorded) return;") < tail.indexOf('revalidatePath("/", "layout")'),
    "🔴 거절당했는데도 사이트 전체 캐시를 버린다",
  );
});

test("🔴 개수(배지)를 사이트가 미리 줄이지 않는다 — 다음 렌더에서 포털이 다시 센다", () => {
  // 포털은 지운 줄을 items 에서 빼면서 count 도 함께 줄여 보낸다. 여기서 또
  // 빼면 포털이 센 값과 어긋나 「알림이 있다는데 열면 없다」가 된다.
  assert.match(bellComponent, /count=\{feed\.count\}/);
});
