import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  currentAddress,
  isGuardedPath,
  loginStartTarget,
  LOGIN_START_PATH,
  RETURN_TO_HEADER,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/proxy-rules";

/**
 * ============================================================================
 * 🔴 모든 요청이 지나가는 자리 — 잘못 잡으면 아무도 못 들어온다
 * ============================================================================
 * src/proxy.ts 는 이 사이트의 **모든 요청**을 지난다. 여기서 나는 사고는 둘 다
 * 사이트 전체를 멈춘다:
 *
 *   1. 🔴 /api/auth/… 를 잡으면 — 로그인하러 가는 요청을 다시 로그인으로 보내
 *      **무한 되돌기**가 된다. 아무도 못 들어온다.
 *   2. 정적 파일을 잡으면 — 쓸데없이 느려지고, 되돌기가 CSS·JS·이미지를 막는다
 *      (Next 문서가 matcher 대목에서 그대로 경고하는 것).
 *
 * 판정이 두 곳에 적혀 있다는 것이 이 파일의 핵심이다:
 *   · `config.matcher` — Next 가 읽는 **글자 그대로의** 정규식. 상수를 들여와
 *     쓰면 조용히 무시되므로(문서: "values need to be constants") 중복이 강제다.
 *   · `isGuardedPath` — proxy 함수 안에서 한 겹 더 보는 순수 함수.
 * 둘이 어긋나면 한쪽만 고친 사람이 사고를 낸다. 아래 셋째 묶음이 **같은 표로
 * 둘을 함께** 돌려 그것을 막는다.
 *
 * 마지막 묶음은 **구조**를 본다 — proxy 가 DB·세션에 닿지 않는지, 주소가 어느
 * 길로 화면 틀까지 가는지. 그 자리들은 요청 맥락 없이는 불러 볼 수 없어서
 * 글자로 확인한다(service-menu-wiring.test.ts 와 같은 방식이다).
 * ============================================================================
 */

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

/* ── 잡아야 하는 주소 / 잡으면 안 되는 주소 ──────────────────────────────
   아래 셋째 묶음에서 matcher 글자와 isGuardedPath 를 **같은 표로** 견준다.
   그래서 여기에는 질의문자열 없이 경로만 적는다 — matcher 는 경로만 본다. */

const GUARDED: [string, string][] = [
  ["/", "첫 화면"],
  ["/quotes/test-123", "통합 알림이 건너오는 깊은 주소"],
  ["/quotes/test-123/edit", "더 깊은 주소"],
  ["/api/authorize", "🔴 /api/auth 로 시작하지만 다른 주소다 — 토막 단위로 견뎌야 한다"],
  ["/logindepot", "login 으로 시작하지만 다른 주소다"],
  ["/api/quotes", "로그인 통로가 아닌 API 는 일부러 잡는다 — 새 API 의 기본값이 「로그인 필요」이도록"],
];

const UNGUARDED: [string, string][] = [
  ["/api/auth", "🔴 로그인 통로"],
  ["/api/auth/", "🔴 로그인 통로(끝 슬래시)"],
  ["/api/auth/sso/start", "🔴 로그인 통로 — 잡으면 무한 되돌기"],
  ["/api/auth/sso/callback", "🔴 포털이 돌려보내는 자리"],
  ["/api/auth/sso/backchannel-logout", "🔴 포털이 뒤로 부르는 자리"],
  ["/API/AUTH/sso/start", "🔴 대소문자를 바꿔도 로그인 통로다 — Next 는 matcher 를 대소문자 없이 본다"],
  ["/login", "로그인이 거절된 까닭을 보여주는 화면"],
  ["/login/", "같은 화면(끝 슬래시)"],
  ["/_next/static/chunks/main.js", "Next 내부 자산"],
  ["/_next/image", "이미지 최적화"],
  ["/_next/webpack-hmr", "개발 서버의 새로고침 통로"],
  ["/favicon.ico", "정적 파일"],
  ["/robots.txt", "정적 파일"],
  ["/sitemap.xml", "정적 파일"],
  ["/images/logo.png", "정적 파일(아래 칸에 있어도)"],
];

/* ── 1. 잡아야 하는 주소 ──────────────────────────────────────────────── */

test("사람이 보는 화면 주소는 잡는다", () => {
  for (const [pathname, why] of GUARDED) {
    assert.equal(isGuardedPath(pathname), true, `${pathname} — ${why}`);
  }
});

/* ── 2. 🔴 잡으면 안 되는 주소 ───────────────────────────────────────── */

test("🔴 로그인 통로(/api/auth/…)는 잡지 않는다 — 잡으면 무한 되돌기다", () => {
  // 이 묶음이 이 파일에서 가장 중요하다. 여기가 깨지면 로그인하러 가는 요청이
  // 다시 로그인으로 가고, 사이트에 아무도 들어오지 못한다.
  for (const [pathname, why] of UNGUARDED.filter(([p]) => p.toLowerCase().includes("/api/auth"))) {
    assert.equal(isGuardedPath(pathname), false, `${pathname} — ${why}`);
  }
});

test("로그인 화면과 정적 파일도 잡지 않는다", () => {
  for (const [pathname, why] of UNGUARDED) {
    assert.equal(isGuardedPath(pathname), false, `${pathname} — ${why}`);
  }
});

test("주소로 보이지 않는 값에는 손대지 않는다", () => {
  assert.equal(isGuardedPath(""), false);
  assert.equal(isGuardedPath("quotes/test-123"), false);
  assert.equal(isGuardedPath("https://evil.example/x"), false);
});

/* ── 3. 🔴 matcher 글자와 판정이 어긋나지 않는다 ─────────────────────── */

/**
 * src/proxy.ts 에 **글자로** 적힌 matcher 를 읽어 정규식으로 만든다.
 *
 * 왜 글자를 읽는가: Next 는 matcher 를 빌드 때 정적으로 읽는다. 상수를 들여와
 * 쓰면 무시되므로 이 판정만은 중복이 강제된다 — 그 중복이 갈라지지 않는지를
 * 보는 것이 이 시험이다.
 *
 * 정규식으로 만드는 모양은 Next 가 실제로 만드는 것과 같다. 실측으로 확인했다
 * (node_modules/next/dist/lib/try-to-parse-path.js 에 위 matcher 를 넣으면
 *  ^(?:\/((?!api\/auth$|…|.*\.).*))[\/#\?]?$ 가 나오고, 대소문자를 가리지 않는다).
 */
function matcherFromSource(): RegExp {
  const source = read("src/proxy.ts");
  const found = source.match(/matcher:\s*\[\s*("(?:[^"\\]|\\.)*")/);
  assert.ok(found, "src/proxy.ts 에서 config.matcher 를 찾지 못했습니다");
  // 큰따옴표 문자열이라 JSON 으로 그대로 풀린다. 역슬래시가 한 겹 삼켜졌다면
  // 여기서 바로 터진다 — 그 편이 조용히 다른 정규식이 되는 것보다 낫다.
  const pattern: string = JSON.parse(found[1]);
  return new RegExp(`^${pattern}[/#?]?$`, "i");
}

test("🔴 config.matcher 와 isGuardedPath 가 같은 답을 낸다", () => {
  const matcher = matcherFromSource();
  for (const [pathname, why] of [...GUARDED, ...UNGUARDED]) {
    assert.equal(
      matcher.test(pathname),
      isGuardedPath(pathname),
      `${pathname} — ${why}\n  matcher 와 isGuardedPath 가 갈렸습니다. 한쪽만 고친 것이 아닌지 보세요.`,
    );
  }
});

/* ── 4. 가려던 주소를 어떻게 싣는가 ─────────────────────────────────── */

test("경로와 질의문자열이 그대로 살아서 실린다", () => {
  assert.equal(currentAddress("/", ""), "/");
  assert.equal(currentAddress("/", "?x=1"), "/?x=1");
  assert.equal(currentAddress("/quotes/test-123", ""), "/quotes/test-123");
  assert.equal(currentAddress("/quotes/test-123", "?tab=items"), "/quotes/test-123?tab=items");
});

test("🔴 로그인 통로를 가리키는 주소는 되돌아갈 곳이 되지 못한다", () => {
  // matcher 와 isGuardedPath 가 둘 다 뚫린 최악의 경우에도 되돌기가 생기지
  // 않는다 — safeReturnTo 가 세 번째 겹이다.
  assert.equal(currentAddress("/api/auth/sso/start", "?returnTo=%2F"), "/");
  assert.equal(currentAddress("/api/auth/sso/callback", "?code=x"), "/");
});

test("🔴 머리말에 그대로 실을 수 있는 형태로만 돌려준다", () => {
  // 한글이 든 주소를 날것으로 Headers 에 넣으면 그 자리에서 TypeError 가 난다
  // (ByteString). proxy 가 그 값을 머리말에 싣기 때문에 실제로 일어나는 일이다.
  const raw = "/검색?q=결과";
  assert.throws(() => new Headers().set(RETURN_TO_HEADER, raw), TypeError);

  const value = currentAddress("/검색", "?q=결과");
  assert.doesNotThrow(() => new Headers().set(RETURN_TO_HEADER, value));
  assert.equal(value, "/%EA%B2%80%EC%83%89?q=%EA%B2%B0%EA%B3%BC");
});

test("🔴 밖을 가리키는 값은 첫 화면으로 떨군다", () => {
  // 판정 자체는 return-to.ts 가 시험 열셋으로 못 박았다. 여기서는 proxy 가
  // 그 판정을 **거치기는 하는지**만 한 줄로 확인한다.
  assert.equal(currentAddress("//evil.example", ""), "/");
  assert.equal(loginStartTarget("//evil.example"), LOGIN_START_PATH);
});

test("로그인 통로로 보내는 주소의 모양", () => {
  assert.equal(loginStartTarget("/"), LOGIN_START_PATH);
  assert.equal(
    loginStartTarget("/quotes/test-123"),
    `${LOGIN_START_PATH}?returnTo=%2Fquotes%2Ftest-123`,
  );
  assert.equal(
    loginStartTarget(currentAddress("/quotes/test-123", "?tab=items")),
    `${LOGIN_START_PATH}?returnTo=%2Fquotes%2Ftest-123%3Ftab%3Ditems`,
  );
  // 🔴 로그인 통로를 그대로 열면 returnTo 가 붙지 않는다 — 되돌기가 생기지 않는다.
  assert.equal(loginStartTarget(LOGIN_START_PATH), LOGIN_START_PATH);
});

/* ── 5. 구조 — 무엇이 어디에 있고 무엇에 닿지 않는가 ────────────────── */

const proxySource = read("src/proxy.ts");
const proxyCode = withoutComments(proxySource);
const layoutCode = withoutComments(read("src/app/(app)/layout.tsx"));
const guardsCode = withoutComments(read("src/lib/auth/guards.ts"));
const sessionCode = withoutComments(read("src/lib/auth/session.ts"));

test("🔴 Next 16 의 이름으로 놓여 있다 — src/proxy.ts 의 proxy 함수", () => {
  // Next 16 에서 middleware 가 proxy 로 바뀌었다. 옛 이름으로 둔 파일은
  // **조용히 안 돈다** — 그러면 로그인 없이 연 주소가 전부 첫 화면으로 떨어지고
  // 아무도 그 까닭을 모른다.
  assert.ok(fs.existsSync(path.resolve(ROOT, "src/proxy.ts")), "src/proxy.ts 가 없습니다");
  assert.equal(
    fs.existsSync(path.resolve(ROOT, "src/middleware.ts")),
    false,
    "src/middleware.ts 는 Next 16 에서 더 이상 그 이름으로 불리지 않습니다",
  );
  assert.match(proxyCode, /export function proxy\(request: NextRequest\)/);
});

test("🔴 proxy 는 쿠키가 있는지만 본다 — DB·세션 해석에 닿지 않는다", () => {
  // 이 자리는 미리 가져오는 요청까지 포함해 모든 요청마다 돈다. 여기에 DB 조회나
  // 서명 검증이 들어오면 사이트 전체가 느려지고, 실행 환경 문제를 새로 떠안는다.
  // 진짜 판정은 화면 틀의 requireSession 이 그대로 한다.
  assert.match(proxyCode, /request\.cookies\.has\(SESSION_COOKIE_NAME\)/);
  for (const forbidden of [
    "@/lib/db",
    "@/lib/env",
    "auth/session",
    "getSessionUser",
    "parseSessionToken",
    "drizzle",
    "@dss/core",
  ]) {
    assert.equal(
      proxyCode.includes(forbidden),
      false,
      `src/proxy.ts 가 ${forbidden} 에 닿습니다 — proxy 에서 인증을 판정하지 않습니다`,
    );
  }
});

test("🔴 쿠키 이름이 session.ts 와 같다", () => {
  // proxy 는 session.ts 를 부를 수 없어(그 파일이 DB 를 끌고 온다) 이름을 한 번
  // 더 적는다. 두 값이 갈라지면 proxy 가 늘 「쿠키 없음」으로 보고 로그인한
  // 사람까지 로그인 통로로 되돌린다.
  assert.equal(SESSION_COOKIE_NAME, "po_session");
  assert.match(sessionCode, new RegExp(`export const SESSION_COOKIE = "${SESSION_COOKIE_NAME}";`));
});

test("가려던 주소가 화면 틀까지 가는 길", () => {
  // proxy 가 **요청** 머리말에 싣고(응답 머리말이 아니다 — 그것은 브라우저로
  // 나간다), 화면 틀이 그것을 읽어 requireSession 으로 넘긴다.
  assert.match(proxyCode, /NextResponse\.next\(\{\s*request:\s*\{\s*headers\s*\}\s*\}\)/);
  assert.match(proxyCode, /headers\.set\(RETURN_TO_HEADER, returnTo\)/);

  assert.match(layoutCode, /headers\(\)\)\.get\(RETURN_TO_HEADER\)/);
  assert.match(layoutCode, /requireSession\(requestedAddress\)/);

  // 🔴 머리말에서 읽은 값도 반드시 safeReturnTo 를 거친다. 그 한 곳이
  // requireSession 이다.
  assert.match(guardsCode, /const target = safeReturnTo\(returnTo\);/);
});

test("proxy 와 requireSession 이 같은 곳으로 보낸다", () => {
  // 두 길(쿠키가 없다 / 쿠키는 있는데 무효다)이 서로 다른 주소로 보내면
  // 한쪽만 고쳐졌을 때 알아채기 어렵다.
  assert.equal(LOGIN_START_PATH, "/api/auth/sso/start");
  assert.ok(
    guardsCode.includes(`"${LOGIN_START_PATH}"`),
    "auth/guards.ts 가 다른 곳으로 보냅니다",
  );
  // 여기만 보통 문자열이다 — guards.ts 가 쓰는 템플릿 리터럴의 글자를 그대로
  // 견주려면 "${…}" 가 값으로 바뀌지 않아야 한다.
  assert.ok(
    guardsCode.includes(LOGIN_START_PATH + "?returnTo=" + "${encodeURIComponent(target)}"),
    "auth/guards.ts 가 returnTo 를 다른 모양으로 붙입니다",
  );
});
