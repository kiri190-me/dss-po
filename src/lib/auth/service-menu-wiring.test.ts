import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ServiceMenuBar } from "@dss/ui";

/**
 * ============================================================================
 * 🔴 로그인 통로의 구조 — 쿠키 이름 · 목록이 흐르는 길 · 읽기만 하는 경계
 * ============================================================================
 * 서비스 메뉴 목록은 이렇게 흐른다:
 *
 *   포털이 ID 토큰에 싣는 dss_services 클레임
 *     → verifyIdToken 이 검증된 payload 에서 꺼내 SsoIdentity.services 로
 *     → 콜백이 writeServiceMenuCookie 로 별도 서명 쿠키에 굽고
 *     → (app)/layout.tsx 가 readServiceMenu 로 풀어 prop 으로 내리고
 *     → AppHeader 가 그것을 제 줄 **안**에 그린다(@dss/ui 의 ServiceMenuBar)
 *
 * ── 왜 파일의 글자를 읽는가 ─────────────────────────────────────────────
 * 이 자리들은 실제로 불러 볼 수 없다. 콜백과 시작 통로는 포털의 JWKS·요청
 * 맥락(쿠키)이 있어야 하고, 레이아웃은 세션과 DB 가 있어야 한다. 이 목록의
 * 시험은 DB 에 닿을 길이 없어야 하므로(scripts/test-lists/unit.txt) **구조**를
 * 못 박는다. 서명·거르기 판단 자체는 service-menu-cookie.test.ts 가 실제로
 * 돌려 보고, 메뉴바가 그리는 마크업은 dss-ui 저장소의 시험이 본다.
 *
 * 여기서 지키는 것 일곱:
 *  0. 🔴 쿠키 이름이 A/S 와 갈려 있다 — 쿠키는 포트를 가리지 않는다.
 *  1. 🔴 이 사이트는 A/S 와 같은 users 표를 **읽기만** 한다.
 *  2. 목록은 **검증이 끝난** ID 토큰에서만 온다 — 인가 판정에는 쓰이지 않는다.
 *  3. 🔴 로그인이 시작되는 자리와 로그아웃에서 그 쿠키를 **지운다**
 *     (공용 PC 에서 앞사람 목록이 뒷사람 화면에 뜨지 않게).
 *  4. 메뉴바는 머리말 **안**에 앉고, 목록은 서버에서 풀어 내린다. 폰에서는
 *     남는 자리만 쓰고 나가는 단추를 밀어내지 않는다.
 *  5. 생김새(CSS)를 사이트가 한 번 부른다. 다크는 @dss/ui 의 기본값에 맡긴다.
 *  6. 목록이 없으면 **아무것도 그리지 않는다** — 포털 등록 전인 지금 머리말은
 *     한 줄 그대로여야 한다.
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

const oidc = withoutComments(read("src/lib/auth/oidc.ts"));
const session = withoutComments(read("src/lib/auth/session.ts"));
const serviceMenuCookie = withoutComments(read("src/lib/auth/service-menu-cookie.ts"));
const callback = withoutComments(read("src/app/api/auth/sso/callback/route.ts"));
const start = withoutComments(read("src/app/api/auth/sso/start/route.ts"));
const logout = withoutComments(read("src/app/actions/auth.ts"));
const ssoLogin = withoutComments(read("src/lib/auth/sso-login.ts"));
const appLayout = withoutComments(read("src/app/(app)/layout.tsx"));
const rootLayout = read("src/app/layout.tsx");
const appHeader = read("src/components/AppHeader.tsx");
const appHeaderBare = withoutComments(appHeader);
const globalsCss = read("src/app/globals.css");
/* 서브모듈(vendor/dss-ui)이 실제로 실려 있는 CSS. 이 저장소가 기대는 규칙이
   그 판에 있는지 본다 — 포인터가 옛 커밋이면 여기서 걸린다. */
const menuCss = read("vendor/dss-ui/src/service-menu/service-menu.css");

/**
 * 🔴 2026-10-22 — 머리말이 **두 구역**이 됐다. 좁은 화면용 ☰ 서랍이 머리말 줄의
 * 첫 자식으로 들어오면서, **같은 글자가 두 곳에** 나온다(화면 메뉴 · 사용자명).
 *
 * 그래서 글 전체에 `indexOf` 를 거는 옛 단언들은 **서랍 쪽을 먼저 집는다** — 「머리말
 * 줄에서 이름 다음, 사용자명 앞」 같은 차례를 재던 것이 조용히 딴 것을 재게 된다.
 * 아래 두 함수로 구역을 갈라 **재려는 쪽만** 본다.
 */
function headerDrawer(): string {
  const open = appHeaderBare.indexOf("<details");
  const close = appHeaderBare.indexOf("</details>");
  assert.ok(open > 0 && close > open, "☰ 서랍(<details>)을 찾지 못했다 — 모양이 바뀌었으면 시험도 함께 고쳐라");
  return appHeaderBare.slice(open, close);
}

/** 서랍을 들어낸 **머리말 줄**. 넓은 화면에서 눈에 보이는 바로 그 줄이다. */
function headerRow(): string {
  const close = appHeaderBare.indexOf("</details>");
  assert.ok(close > 0, "☰ 서랍의 닫는 태그를 찾지 못했다");
  return appHeaderBare.slice(close);
}

/* ── 0. 🔴 쿠키 이름 ──────────────────────────────────────────────────── */

test("🔴 쿠키 셋이 모두 po_ 다 — A/S 이름을 쓰면 한쪽 로그인이 다른 쪽을 덮는다", () => {
  // 쿠키는 포트를 가리지 않는다. 호스트가 같으면 3000(A/S)과 3600(여기)이
  // **같은 쿠키 항아리**를 쓴다. A/S 에서 실제로 났던 구멍이고, 설계서 E-3절이
  // 그래서 po_ 접두사를 못 박았다.
  assert.match(session, /export const SESSION_COOKIE = "po_session";/);
  assert.match(oidc, /export const SSO_TX_COOKIE = "po_sso_tx";/);
  assert.match(serviceMenuCookie, /export const SERVICE_MENU_COOKIE = "po_service_menu";/);

  // A/S(RF_Service_System)와 포털(dss-auth)이 쓰는 이름은 하나도 없어야 한다.
  for (const [name, source] of [
    ["session.ts", session],
    ["oidc.ts", oidc],
    ["service-menu-cookie.ts", serviceMenuCookie],
  ] as const) {
    for (const foreign of ["dss_session", "dss_sso_tx", "dss_service_menu", "dss_sso"]) {
      assert.equal(
        new RegExp(`"${foreign}"`).test(source),
        false,
        `${name} 이 A/S · 포털의 쿠키 이름 "${foreign}" 을 쓴다`,
      );
    }
  }
});

/* ── 1. 🔴 읽기만 하는 경계 ───────────────────────────────────────────── */

/** src 아래의 모든 .ts/.tsx, 저장소 뿌리 기준 슬래시 경로로. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        found.push(path.relative(ROOT, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, "src"));
  return found.sort();
}

test("🔴 로그인이 A/S 의 users 표를 고치지 않는다 — 역할 클레임은 시스템마다 다르다", () => {
  // 포털은 사람에게 **클라이언트별로** 역할을 준다. dss-po 의 역할을
  // users.role 에 적으면 A/S 의 역할을 덮어쓴다 — 같은 칸 하나를 두 시스템이
  // 서로 다른 뜻으로 적는 셈이다(lib/auth/sso-login.ts 머리말).
  assert.equal(
    /\bdb\s*\.(insert|update|delete)\b/.test(ssoLogin),
    false,
    "sso-login.ts 가 DB 에 쓴다 — 이 사이트는 users 표를 읽기만 한다",
  );
  assert.equal(
    /\brole\s*:/.test(ssoLogin),
    false,
    "sso-login.ts 가 역할을 정하고 있다 — 역할은 A/S 가 소유한다",
  );
});

test("🔴 DB 에 쓰는 곳은 세션 끊기 한 곳뿐이다 — 늘어나면 여기서 걸린다", () => {
  const writers = sourceFiles()
    // 🔴 이 시험이 지키는 것은 **앱 코드**다 — 화면·서버가 실제 업무 DB(dss_as)에
    // 무엇을 쓰는지. 시험 파일은 다른 관문이 지킨다: DB 에 쓰는 시험은
    // DATABASE_URL 이 dss_as_test 로 바뀐 뒤에만 돌고(scripts/load-test-env.ts),
    // 바뀌지 않으면 src/lib/db/index.ts 의 관문이 접속 자체를 막는다
    // (docs/DB_TESTS.md). 그래서 여기서는 시험 파일을 세지 않는다.
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => /\bdb\s*\.(insert|update|delete)\b/.test(withoutComments(read(file))));
  assert.deepEqual(
    writers,
    ["src/lib/auth/session.ts"],
    "이 조각(0b)에서 DB 에 쓰는 곳은 백채널 로그아웃이 부르는 " +
      "revokeSessionsForSubject 하나뿐이다. 늘었다면 무엇을 쓰는지 · A/S 와 " +
      "같은 칸인지 먼저 확인하고 이 시험을 고쳐라",
  );

  // 그 한 곳이 무엇을 쓰는지도 못 박는다. sessions_valid_from 은 A/S 와 **함께
  // 쓰는 칸**이라, 여기서 선을 올리면 그 사람의 A/S 세션도 함께 끊긴다.
  // 포털 로그아웃은 두 사이트 모두에서 나가는 것이 맞으므로 그대로 둔다.
  assert.match(session, /\.set\(\{ sessionsValidFrom: now, updatedAt: now \}\)/);
});

/* ── 2. 목록은 어디서 오는가 ──────────────────────────────────────────── */

test("🔴 목록은 jwtVerify 가 끝난 payload 에서 온다 — sub 와 같은 보증을 받는다", () => {
  const verifyAt = oidc.indexOf("const { payload } = await jwtVerify(");
  const claimAt = oidc.indexOf("services: payload.dss_services");
  const subjectAt = oidc.indexOf("subject: payload.sub");
  assert.ok(verifyAt > 0, "검증하는 자리를 찾지 못했다");
  assert.ok(claimAt > verifyAt, "검증보다 먼저 클레임을 읽는다");
  assert.ok(claimAt > subjectAt, "sub 를 확인하기 전에 클레임을 읽는다");
  // 검증에 실패하면 그 try 는 null 을 내보낸다 — 콜백은 거기서 멈춘다.
  assert.match(oidc, /catch \(error\) \{[\s\S]*?return null;/);
});

test("🔴 이 목록으로 권한을 판정하지 않는다 — 들어올 수 있는지는 users 한 행으로 정한다", () => {
  assert.equal(
    /services/i.test(ssoLogin),
    false,
    "로그인 판정(sso-login.ts)이 서비스 목록을 보고 있다 — 판정은 그 행 하나만 본다",
  );
});

/* ── 3. 굽는 자리 · 지우는 자리 ───────────────────────────────────────── */

test("콜백이 세션을 준 뒤 목록을 굽는다 — 목록 때문에 로그인이 거절되는 길은 없다", () => {
  const sessionAt = callback.indexOf("await createSession(result.user);");
  const cookieAt = callback.indexOf("await writeServiceMenuCookie(identity.services);");
  assert.ok(sessionAt > 0, "세션을 만드는 자리를 찾지 못했다");
  assert.ok(cookieAt > sessionAt, "콜백이 목록을 굽지 않거나 세션보다 먼저 굽는다");

  const tail = callback.slice(cookieAt);
  assert.equal(tail.includes("fail("), false, "목록 때문에 로그인이 거절되는 길이 생겼다");
  assert.match(tail, /return redirectTo\(transaction\.returnTo\);/);
});

test("🔴 로그인이 시작되는 자리에서 앞사람의 목록을 지운다 — 이미 들어와 있는 사람 것은 그대로", () => {
  const sessionGuardAt = start.indexOf("if (await getSessionUser())");
  const clearAt = start.indexOf("await clearServiceMenuCookie();");
  const beginAt = start.indexOf("beginLogin(returnTo)");
  assert.ok(sessionGuardAt > 0, "이미 들어와 있는 사람을 돌려보내는 자리를 찾지 못했다");
  assert.ok(clearAt > 0, "🔴 로그인 시작 통로가 메뉴 쿠키를 지우지 않는다");
  assert.ok(clearAt > sessionGuardAt, "들어와 있는 사람의 목록까지 지운다");
  assert.ok(clearAt < beginAt, "포털로 보낸 뒤에 지운다 — 그 사이가 비어 있다");
});

test("🔴 로그아웃이 세션과 함께 목록도 지운다 — redirect 앞이어야 실제로 지워진다", () => {
  const destroyAt = logout.indexOf("await destroySession();");
  const clearAt = logout.indexOf("await clearServiceMenuCookie();");
  const redirectAt = logout.indexOf("redirect(endSessionUrl());");
  assert.ok(destroyAt > 0 && redirectAt > 0);
  assert.ok(clearAt > 0, "🔴 로그아웃이 메뉴 쿠키를 지우지 않는다");
  assert.ok(clearAt < redirectAt, "redirect 뒤에 지운다 — 그 줄은 돌지 않는다");
});

/* ── 4. 그리는 자리 ───────────────────────────────────────────────────── */

test("🔴 메뉴바는 머리말 **안**에 앉는다 — 레이아웃이 머리말에 내려보낸다", () => {
  const headerAt = appLayout.indexOf("<AppHeader");
  const barAt = appLayout.indexOf("<ServiceMenuBar");
  assert.ok(headerAt > 0, "레이아웃이 머리말을 그리지 않는다");
  assert.ok(barAt > 0, "레이아웃이 메뉴바를 만들지 않는다");
  assert.ok(barAt > headerAt, "메뉴바가 머리말 **밖(위)** 에 있다 — 안으로 들어가야 한다");
  assert.match(appLayout, /serviceMenu=\{/, "머리말에 내려보내지 않는다");

  // 머리말 **위**의 회색 띠가 아니라 머리말 바탕에 그대로 얹히는 모습이어야 한다.
  assert.match(appLayout.slice(barAt), /variant="inline"/);

  // 🔴 폭을 정하는 장치는 **머리말 쪽의 래퍼 div** 하나다(아래 시험). 여기서
  // className 을 넘기면 그것은 조각의 <nav> 에 붙는데, 머리말의 flex 항목은
  // 그 바깥의 래퍼라 아무 일도 하지 않으면서 읽는 사람만 헷갈리게 한다.
  assert.equal(
    appLayout.includes("shrink-0"),
    false,
    "폭을 정하는 유틸리티가 두 군데로 갈렸다 — 머리말 쪽 래퍼 하나만 갖는다",
  );

  assert.equal(
    /<header[\s>]/.test(appLayout),
    false,
    "머리말을 레이아웃이 직접 그리고 있다 — 머리말은 AppHeader 것이다",
  );
});

test("🔴 목록과 「지금 여기」는 서버에서 풀어 내린다", () => {
  assert.match(appLayout, /const services = await readServiceMenu\(\);/);
  assert.match(appLayout, /services\.length > 0 \? thisServiceId\(\) : null/);

  const bar = appLayout.slice(appLayout.indexOf("<ServiceMenuBar"));
  assert.match(bar, /services=\{services\}/);
  assert.match(bar, /currentServiceId=\{currentServiceId\}/);
});

test("🔴 머리말이 그리는 자리 — 시스템 이름 다음, 사용자명 앞", () => {
  // 🔴 2026-10-22: **머리말 줄만** 본다(위 headerRow). 그 전에는 글 전체에서 쟀는데,
  //    ☰ 서랍이 줄의 첫 자식으로 들어오면서 서랍 안의 사용자명이 먼저 걸려 이 차례가
  //    조용히 거짓이 됐다. 재려는 것은 예나 지금이나 **넓은 화면에 보이는 그 줄**의
  //    차례다 — 뜻은 그대로 두고 재는 범위만 좁혔다.
  const row = headerRow();
  const nameAt = row.indexOf("DSS PO / 내자");
  const menuAt = row.indexOf("{serviceMenu}");
  const userAt = row.indexOf("{user.name}");
  assert.ok(menuAt > 0, "머리말이 메뉴바를 그리지 않는다");
  assert.ok(nameAt > 0 && nameAt < menuAt, "시스템 이름보다 앞에 그린다");
  assert.ok(menuAt < userAt, "사용자명보다 뒤에 그린다 — 가운데 빈 자리가 메뉴바 몫이다");

  // 🔴 ☰ 는 그 모두보다 **앞**이다 — 머리말 맨 왼쪽(2026-10-22 쓰는 분 기준 4).
  assert.ok(
    appHeaderBare.indexOf("<details") < appHeaderBare.indexOf("DSS PO / 내자"),
    "☰ 가 시스템 이름보다 뒤에 적혀 있다 — 맨 왼쪽이 아니다",
  );

  // 받는 것은 다 그려진 노드다 — 이 파일이 @dss/ui 를 몰라야 한다.
  assert.equal(
    appHeaderBare.includes("@dss/ui"),
    false,
    "머리말이 @dss/ui 를 직접 부른다 — 그리는 자리만 정하고 조각은 받아야 한다",
  );
});

test("🔴 메뉴 단추는 제 폭만 쓴다 — shrink-0", () => {
  // 그리는 것은 `white-space: nowrap` 인 **단추 하나**라 줄어들지 못한다 —
  // 기준 폭 0 인 칸(`min-w-0 flex-1`)에 두면 자리가 모자랄 때 단추가 칸 밖으로
  // 삐져나와 사용자명·나가는 단추와 겹친다.
  assert.match(appHeaderBare, /<div className="shrink-0">\{serviceMenu\}<\/div>/);

  // 되돌아가는 것을 막는다 — 단추에는 뜻이 어긋난다.
  assert.equal(
    /className="[^"]*\bflex-(1|auto)\b/.test(appHeaderBare),
    false,
    "메뉴 칸에 flex-1/flex-auto 가 돌아왔다 — 단추는 줄어들지 못해 글자와 겹친다",
  );

  // 🔴 이 칸에 `mr-auto` 가 돌아오면 안 된다(2026-09-21 에 뺐다). 그때는 이 줄이
  // justify-between 이라 단추가 줄 한가운데로 밀리는 것을 막는 장치였는데, 지금은
  // 남는 자리를 **나가는 묶음의 ml-auto** 하나가 가져간다. 여기 자동 여백이 다시
  // 생기면 그쪽보다 먼저 남는 자리를 다 먹어, 사이에 있는 **화면 메뉴가 오른쪽
  // 끝의 나가는 단추에 가서 붙는다.**
  const menuCell = appHeaderBare.match(/<div className="([^"]*)">\{serviceMenu\}/);
  assert.ok(menuCell, "메뉴 칸을 찾지 못했다");
  assert.equal(
    /\bmr-auto\b/.test(menuCell[1]),
    false,
    "메뉴 칸에 mr-auto 가 돌아왔다 — 화면 메뉴가 나가는 단추 쪽으로 딸려 간다",
  );
});

test("🔴 남는 자리를 가져가는 자동 여백은 나가는 묶음 **하나**다 — ml-auto", () => {
  // 항목이 다섯인 줄에서 justify-between 은 남는 자리를 **항목 사이마다** 고르게
  // 나눈다 — 이름 · 메뉴 단추 · 화면 메뉴가 줄 전체에 흩뿌려진다. 자동 여백은 한
  // 자리에만 걸리므로 「왼쪽에 붙은 셋 + 오른쪽 끝의 나가는 묶음」이 된다.
  assert.equal(
    /\bjustify-between\b/.test(appHeaderBare),
    false,
    "머리말에 justify-between 이 돌아왔다 — 왼쪽 셋이 줄 전체에 흩어진다",
  );

  assert.match(
    appHeaderBare,
    /<div className="ml-auto flex flex-wrap items-center justify-end gap-3 text-sm">/,
    "나가는 묶음이 ml-auto 로 오른쪽 끝에 서지 않는다",
  );

  // 자동 여백이 여럿이면 남는 자리를 나눠 갖게 되어 「오른쪽 끝」이 흔들린다.
  assert.equal(
    (appHeaderBare.match(/\bm[lr]-auto\b/g) ?? []).length,
    1,
    "머리말에 자동 여백이 둘 이상이다 — 남는 자리를 나눠 먹어 자리가 흔들린다",
  );
});

test("🔴 이 줄은 flex-wrap 이다 — 없으면 폰에서 단추 안 글자가 접힌다", () => {
  // 2026-09-21 에 화면 메뉴(알약 단추 셋 ~242px)가 이 줄로 들어오면서 켰다.
  // 줄바꿈이 없으면 넘칠 때 flex 가 칸을 min-content 까지 눌러 단추 안에서
  // 글자를 접는다 — "통합 / 로그인으로", "내자 / 정리".
  assert.match(
    appHeaderBare,
    /<div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-6">/,
  );

  // 🔴 **2026-10-22 에 이 셈이 통째로 바뀌었다.** 그 전의 폰 윗줄은 「메뉴 단추 +
  //    화면 메뉴 셋」(59+12+242=313)이었고 이름·사용자명은 sr-only 로 빠져 있었다.
  //    쓰는 분이 ☰ 서랍을 쓰기로 정하면서(AppHeader.tsx 머리말의 기준 다섯)
  //    **화면 메뉴 셋이 서랍으로 들어가고 시스템 이름이 눈에 돌아왔다.**
  //    숫자를 고치지 않고 두면 단언은 그대로 통과하면서 **없는 모양을 재게 된다.**
  const INNER = 360 - 16 * 2;
  const GAP = 12; // gap-x-3
  const HAMBURGER = 36; // ☰ 단추, h-9 w-9
  const TITLE = 104; // "DSS PO / 내자" 16px semibold
  const BUTTON = 24 + 19 + 6 + 8 + 2; // @dss/ui .dss-menu__summary, pointer: coarse
  const EXITS = 128 + 12 + 82; // 통합 로그인으로 + gap-3 + 로그아웃
  const BELL = 40; // @dss/ui 는 손가락 화면에서 36 → 40 으로 키운다

  // ① 윗줄 — ☰ · 시스템 이름 · 오가기 메뉴 단추.
  const TOP = HAMBURGER + GAP + TITLE + GAP + BUTTON;
  assert.ok(TOP <= INNER, `폰 윗줄이 ${TOP}px 이라 속폭 ${INNER}px 을 넘는다`);

  // ② 아랫줄 — 나가는 단추 둘과 알림 종. (사용자명은 폰에서 서랍 안이라 빠진다.)
  const BOTTOM = EXITS + GAP + BELL;
  assert.ok(BOTTOM <= INNER, `나가는 묶음과 종이 ${BOTTOM}px 이라 한 줄에 못 들어간다`);

  // ③ 둘이 한 줄에 다 들어가지는 않는다 — 그래서 flex-wrap 이 **여전히** 필요하다.
  //    들어가게 되는 날이 오면 이 시험이 알려 준다.
  assert.ok(
    TOP + GAP + BOTTOM > INNER,
    "폰에서 한 줄에 다 들어간다 — flex-wrap 이 필요한 까닭을 다시 적어라",
  );
});

test("🔴 폰에서도 **시스템 이름은 눈에 보인다** — 사용자명만 ☰ 서랍으로 간다", () => {
  // 🔴 **2026-09-21 의 결정을 뒤집은 자리다.** 그때는 한 줄에 다섯이 안 들어가서
  //    시스템 이름과 사용자명을 **둘 다** sr-only 로 눈에서 감췄다(「눌러서 갈 곳이
  //    없는 정보를 먼저 내준다」). 2026-10-22 에 쓰는 분이 좁은 화면의 기준 다섯을
  //    직접 정하시면서 그 가운데 하나가 **「시스템 이름이 눈으로 보이게 적혀 있다」**
  //    였다. 화면 메뉴 셋(~242px)이 ☰ 서랍으로 들어가 그 자리가 비었으므로 셈도 맞는다
  //    (위 시험의 윗줄 223px ≤ 328px).
  //    🔵 사용자명은 반대 방향으로 갔다 — 머리말에서 사라지고 **서랍 안에 글자로**
  //       선다. 그래서 여기서는 `sr-only` 가 아니라 `hidden` 이 맞다: 같은 글자가
  //       서랍에 있어 낭독기가 거기서 읽는다(마크업에 두 번 남길 까닭이 없다).
  const row = headerRow();

  const title = row.match(/<h1 className="([^"]*)">\s*DSS PO \/ 내자/);
  assert.ok(title, "머리말에서 시스템 이름을 그리는 자리를 찾지 못했다");
  const titleClasses = title[1].split(/\s+/);
  assert.equal(
    titleClasses.includes("sr-only"),
    false,
    "🔴 시스템 이름을 다시 눈에서 감췄다 — 2026-10-22 에 쓰는 분이 보이게 정하셨다",
  );
  assert.equal(
    titleClasses.includes("hidden"),
    false,
    "🔴 시스템 이름을 display:none 으로 지웠다 — 폰에서도 보여야 한다",
  );
  // 🔴 보이게 둔 대신 **세로로 쪼개지지 않게** 막아야 한다. 울타리가 없으면 폭이
  //    모자랄 때 min-content 가 한글 한 자가 되어 "D / S / S" 가 된다.
  assert.ok(
    titleClasses.includes("whitespace-nowrap"),
    "시스템 이름에 줄바꿈 울타리가 없다 — 좁은 폭에서 글자가 세로로 선다",
  );

  const name = row.match(/<span className="([^"]*)">\{user\.name\}/);
  assert.ok(name, "머리말 줄에서 사용자명을 그리는 자리를 찾지 못했다");
  const nameClasses = name[1].split(/\s+/);
  assert.ok(
    nameClasses.includes("hidden"),
    "폰 머리말에 사용자명이 그대로 남아 있다 — 2026-10-22 에 ☰ 서랍으로 옮겼다",
  );
  assert.ok(
    nameClasses.includes("md:inline"),
    "넓은 화면에서 사용자명이 되돌아오지 않는다",
  );

  // 🔴 서랍 안에 **실제로** 있어야 위 `hidden` 이 「감춘 것」이 아니라 「옮긴 것」이 된다.
  assert.ok(
    headerDrawer().includes("{user.name}"),
    "사용자명이 머리말에서도 서랍에서도 사라졌다 — 누구로 들어와 있는지 알 길이 없어진다",
  );

  // 글자 자체는 마크업에 그대로 있다.
  assert.ok(appHeaderBare.includes("DSS PO / 내자"), "이름 글자를 통째로 뺐다");
});

test("🔴 나가는 길(통합 로그인으로 · 로그아웃)은 폰에서도 감추지 않는다", () => {
  // 이 둘 말고 이 사이트를 떠날 길이 없다. 폰에서 가장 넓은 자리(222px)를
  // 먹지만 감추면 나갈 수가 없다 — 메뉴가 단추 하나로 줄어든 쪽이 낫다.
  //
  // 🔴 **2026-10-22 에 다시 확인한 결정이다.** 그날 ☰ 서랍이 생기면서 화면 메뉴와
  //    사용자명은 서랍으로 들어갔지만 이 둘은 **머리말에 남겼다.** 본보기인
  //    재고관리는 둘을 서랍에 넣었는데 저쪽은 머리말 메뉴가 여섯이라 자리 사정이
  //    다르다 — 「본보기와 다르다」는 까닭으로 되돌리지 마라.
  for (const label of ["통합 로그인으로", "로그아웃"] as const) {
    const at = appHeaderBare.indexOf(label);
    assert.ok(at > 0, `머리말에서 「${label}」 이 사라졌다`);
    // 그 글자를 감싼 여는 태그(바로 앞의 `<a …>` 또는 `<button …>`).
    const openTag = appHeaderBare.slice(0, at).lastIndexOf("<");
    const tag = appHeaderBare.slice(openTag, at);
    assert.equal(/\bsr-only\b/.test(tag), false, `「${label}」 을 눈에서 감췄다`);
    assert.equal(/\bhidden\b/.test(tag), false, `「${label}」 을 감췄다`);

    // 🔴 서랍 안으로 옮기면 위 단언이 **서랍 쪽 태그를 재게 되어** 조용히 뜻을
    //    잃는다(거기에는 hidden 이 붙을 일이 없으니 영영 통과한다). 그래서
    //    「서랍에 없다」를 따로 못 박는다 — 이 둘은 접힌 뒤에 있으면 안 된다.
    assert.equal(
      headerDrawer().includes(label),
      false,
      `「${label}」 이 ☰ 서랍 안으로 들어갔다 — 나가려고 메뉴를 먼저 열어야 하게 된다`,
    );
  }
});

test("🔴 폰에서 아이콘만 남는 것은 **단추**다 — 펼친 목록은 이름을 그대로 보인다", () => {
  // 그 동작은 @dss/ui 가 CSS 로 한다(그쪽 시험이 자세히 본다). 여기서는 이
  // 저장소가 기대는 그 규칙이 실제로 실려 있는지만 본다 — 서브모듈 포인터가
  // 옛 커밋이면 드롭다운 규칙이 통째로 없다.
  assert.match(menuCss, /\.dss-menu\.dss-menu--inline \{/);
  assert.match(menuCss, /\.dss-menu--inline \.dss-menu__dropdown \{/);
  assert.match(menuCss, /\.dss-menu--inline \.dss-menu__summary \{/);

  const phoneBlock = menuCss.match(
    /@media not all and \(min-width: 768px\) \{([\s\S]*?)\n\}/,
  );
  assert.ok(phoneBlock, "폰 기준점(768px) 블록을 찾지 못했다");
  assert.match(
    phoneBlock[1],
    /\.dss-menu--inline \.dss-menu__label \{/,
    "폰에서 단추의 이름을 감추는 규칙이 없다 — 단추가 이름까지 싣고 자리를 다툰다",
  );
  // 이름은 눈에서만 감춘다 — 낭독기는 그대로 읽어야 한다.
  assert.match(phoneBlock[1], /clip-path: inset\(50%\)/);
  // 펼친 목록의 이름은 폰에서도 보인다 — 이모지만 늘어선 목록은 고를 수가 없다.
  assert.equal(
    /\.dss-menu__name \{[^}]*clip-path/.test(phoneBlock[1]),
    false,
    "펼친 목록의 이름까지 감췄다",
  );
});

test("🔴 펼친 목록은 머리말 밖으로 **떠서** 그려진다 — 자르는 조상이 없어야 한다", () => {
  // 목록이 position: absolute 라 머리말 높이를 넘어간다. 감싸는 쪽 어딘가에
  // overflow: hidden 이 있으면 목록이 잘려 **아무것도 고를 수 없다.**
  const listRule = menuCss.match(/\.dss-menu--inline \.dss-menu__list \{([\s\S]*?)\n\}/);
  assert.ok(listRule, "펼친 목록 규칙을 찾지 못했다");
  assert.match(listRule[1], /position: absolute;/);
  assert.match(listRule[1], /z-index: 50;/);

  for (const [name, source] of [
    ["AppHeader.tsx", appHeaderBare],
    ["(app)/layout.tsx", appLayout],
    ["layout.tsx", withoutComments(rootLayout)],
  ] as const) {
    assert.equal(
      /\boverflow-hidden\b|\boverflow-(x-|y-)?clip\b/.test(source),
      false,
      `${name} 이 overflow 를 자른다 — 펼친 목록이 잘려 고를 수 없게 된다`,
    );
  }
  assert.equal(
    /\b(html|body)\s*\{[^}]*overflow[^}]*hidden/.test(globalsCss),
    false,
    "globals.css 가 html/body 를 잘라 놓았다",
  );
});

test("🔴 감추는 기준점이 메뉴 단추의 「아이콘만」 기준점과 같다 — 둘 다 768px", () => {
  // 어긋나면 그 사이 폭에서 「이름은 없는데 단추는 글자」인 어정쩡한 상태가
  // 생긴다. 머리말 쪽은 Tailwind 의 `md:`(=min-width: 768px), 메뉴바 쪽은 그
  // 여집합인 `not all and (min-width: 768px)` 이라 둘이 정확히 맞물린다.
  const breakpoint = menuCss.match(/@media not all and \(min-width: (\d+)px\)/);
  assert.ok(breakpoint, "메뉴바의 「아이콘만」 기준점을 찾지 못했다");
  assert.equal(breakpoint[1], "768", "메뉴바 기준점이 768px 이 아니다");

  // 이 저장소가 Tailwind 의 md 기준점을 덮어썼다면 여기서 걸린다.
  assert.equal(
    /--breakpoint-md:\s*(?!768px)/.test(globalsCss),
    false,
    "이 저장소가 md 기준점을 768px 이 아닌 값으로 덮었다",
  );
});

test("생김새를 사이트가 한 번 부른다", () => {
  assert.match(rootLayout, /^import "@dss\/ui\/styles\.css";$/m);
});

test("🔴 다크는 @dss/ui 기본값에 맡긴다 — colorScheme 도 dark: 유틸리티도 손대지 않는다", () => {
  // 이 사이트는 globals.css 에서 color-scheme: light 로 밝은 화면에 고정되어
  // 있고 dark 변형 자체가 없다. 기본값("host")은 조상에 .dark 가 있을 때만
  // 어두워지므로 그대로 두는 것이 맞다. colorScheme 을 넘기거나 dark: 유틸리티를
  // 쓰면 메뉴바만 따로 놀게 된다(@dss/ui README 4절).
  assert.match(globalsCss, /color-scheme: light/);
  assert.equal(appLayout.includes("colorScheme"), false, "colorScheme 을 넘기고 있다");
  assert.equal(/\bdark:/.test(appLayout), false, "메뉴바 자리에 dark: 유틸리티를 썼다");
  assert.equal(/\bdark:/.test(appHeaderBare), false, "머리말에 dark: 유틸리티를 썼다");
});

test("노치 인셋을 가진 요소가 없다 — 생기면 맨 위 요소(머리말)가 **하나만** 가져야 한다", () => {
  // 이 사이트에는 env(safe-area-inset-top) 도 viewport-fit=cover 도 없다.
  // 나중에 인셋을 넣는 사람이 있으면 여기서 걸린다 — 맨 위 요소는 머리말이고,
  // 둘이 가지면 노치 높이만큼 두 번 밀린다(@dss/ui README 3절. inline 모습은
  // 제 padding-top 을 0 으로 못 박아 둔다).
  for (const [name, source] of [
    ["globals.css", globalsCss],
    ["AppHeader.tsx", appHeader],
    ["(app)/layout.tsx", appLayout],
    ["layout.tsx", rootLayout],
  ] as const) {
    assert.equal(
      /safe-area-inset-top/.test(source),
      false,
      `${name} 에 노치 인셋이 생겼다 — 맨 위 요소인 머리말 하나만 갖게 하고 이 시험을 고쳐라`,
    );
  }
});

/* ── 5. 메뉴바가 그리는 것 (실제로 불러 본다) ─────────────────────────── */

/** 이 시스템의 client_id — 포털에 등록할 이름이자 ID 토큰의 aud 다. */
const THIS_SERVICE_ID = "dss-po";

type RenderedElement = { type: unknown; props: Record<string, unknown> };

function isElement(value: unknown): value is RenderedElement {
  return typeof value === "object" && value !== null && "props" in value && "type" in value;
}

/** 나온 나무에서 <a> 만 차례대로 줍는다. */
function links(node: unknown, found: RenderedElement[] = []): RenderedElement[] {
  if (Array.isArray(node)) {
    for (const child of node) links(child, found);
    return found;
  }
  if (!isElement(node)) return found;
  if (node.type === "a") found.push(node);
  links(node.props.children, found);
  return found;
}

test("🔴 목록이 비면 아무것도 그리지 않는다 — 빈 띠도 남기지 않는다(포털 등록 전 상태)", () => {
  assert.equal(ServiceMenuBar({ services: [], currentServiceId: null }), null);
});

test("이 시스템(dss-po) 칸만 눌린 상태로, 받은 차례 그대로 그려진다", () => {
  const anchors = links(
    ServiceMenuBar({
      services: [
        { id: "rf-service-system", name: "A/S 관리", url: "http://10.0.0.5:3000", icon: "🔧" },
        { id: "njlee", name: "계측기", url: "http://10.0.0.5:3300" },
        { id: THIS_SERVICE_ID, name: "PO / 내자", url: "http://10.0.0.5:3600" },
      ],
      currentServiceId: THIS_SERVICE_ID,
    }),
  );

  assert.deepEqual(
    anchors.map((anchor) => anchor.props["data-service-id"]),
    ["rf-service-system", "njlee", THIS_SERVICE_ID],
    "받은 차례 그대로 그리지 않는다",
  );
  assert.deepEqual(
    anchors.map((anchor) => anchor.props["aria-current"]),
    [undefined, undefined, "page"],
    "색 말고 aria-current 로도 「지금 여기」를 알려야 한다",
  );
});
