/**
 * proxy(src/proxy.ts)가 「어떤 주소를 잡고, 로그인 통로로 무엇을 실어 보내는가」를
 * 정하는 한 곳.
 *
 * ── 왜 파일을 따로 두는가 ───────────────────────────────────────────────
 * 옆의 return-to.ts 와 같은 이유다. src/proxy.ts 는 next/server 를 끌고 오고
 * **모든 요청마다** 도는 자리라, 판정 하나를 보려고 그 파일을 통째로 부를 수
 * 없다. 그래서 판정만 여기 순수 함수로 둔다 — 이 파일이 부르는 것은 같은 폴더의
 * return-to.ts 하나뿐이고 그 파일에는 import 가 아예 없다. 즉 이 파일도 DB·
 * 환경변수에 닿을 길이 없다(scripts/test-lists/unit.txt 가 요구하는 것).
 *
 * ── proxy 가 하는 일은 「주워 담기」뿐이다 ──────────────────────────────
 * 🔴 **여기서도 proxy 에서도 인증을 판정하지 않는다.** 보는 것은 세션 쿠키가
 * 있는지 **없는지**뿐이다. 서명 검증도, DB 조회도, 세션 해석도 하지 않는다.
 * Next 문서가 이것을 optimistic check(낙관적 확인)라 부르고, 그 자리에서
 * DB 를 보지 말라고 못 박는다 — proxy 는 **미리 가져오는(prefetch) 요청까지
 * 포함해 모든 경로에서** 돌기 때문이다
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md,
 *  "Optimistic checks with Proxy (Optional)").
 *
 * 진짜 인증 판정은 지금까지처럼 화면 틀의 requireSession(auth/guards.ts)이
 * 그대로 한다. proxy 는 그 방어선을 **옮기는 것이 아니라**, 그 앞에 「가려던
 * 주소를 주워 담는 자리」를 하나 더 두는 것이다. 그래서 둘 다 필요하다:
 *
 *   쿠키가 아예 없다  → proxy 가 곧바로 로그인 통로로 보낸다(주소를 싣고)
 *   쿠키는 있으나 무효 → proxy 는 통과시키고, 대신 지금 주소를 요청 머리말에
 *                       실어 보낸다. requireSession 이 그 머리말을 받아 같은
 *                       주소를 싣고 로그인 통로로 보낸다.
 *
 * 두 번째 길이 없으면 만료·위조된 쿠키를 든 사람은 여전히 주소를 잃는다.
 */
import { RETURN_TO_FALLBACK, safeReturnTo } from "./return-to";

/**
 * proxy 가 지금 주소를 실어 보내는 **요청** 머리말의 이름.
 *
 * Next 서버 레이아웃은 지금 주소가 무엇인지 알 방법이 없다 — 그래서 이 머리말이
 * 있다. proxy 가 NextResponse.next({ request: { headers } }) 로 더하고
 * (app)/layout.tsx 가 headers() 로 읽는다. 응답 머리말이 아니라 **요청**
 * 머리말이다: 브라우저로 나가지 않는다.
 *
 * 🔴 그래도 이 값은 믿지 않는다. proxy 가 잡지 않는 주소(아래 UNGUARDED_PREFIXES)
 * 에서는 브라우저가 보낸 같은 이름의 머리말이 그대로 서버에 닿을 수 있다.
 * 읽는 쪽은 반드시 safeReturnTo 를 거친다(requireSession 이 한다).
 */
export const RETURN_TO_HEADER = "x-po-return-to";

/**
 * 세션 쿠키의 이름. **있는지 없는지만** 보는 데 쓴다.
 *
 * 🔴 auth/session.ts 의 SESSION_COOKIE 와 같은 값을 여기 한 번 더 적은 이유:
 * 그 파일은 node:crypto · drizzle · env 를 끌고 오므로, proxy 가 그것을
 * import 하면 **모든 요청이 지나가는 자리**에 DB 드라이버와 환경변수 검증이
 * 딸려 온다(그리고 이 파일은 순수할 수 없게 된다). 이름 하나를 베끼는 편이
 * 싸다. 두 값이 갈라지지 않게 proxy-rules.test.ts 가 session.ts 의 글자를
 * 읽어 대조한다.
 */
export const SESSION_COOKIE_NAME = "po_session";

/** 로그인 왕복이 시작되는 자리. auth/guards.ts 가 보내는 곳과 같아야 한다. */
export const LOGIN_START_PATH = "/api/auth/sso/start";

/**
 * 🔴 proxy 가 **잡지 말아야 할** 자리.
 *
 * · /api/auth/… — 로그인 통로 그 자체다. 잡으면 로그인하러 가는 요청을 다시
 *   로그인으로 보내 **무한 되돌기**가 된다. 사이트에 아무도 못 들어온다.
 * · /login — 로그인이 거절된 **까닭을 보여주는** 화면이다. 거기서 또 로그인으로
 *   보내면 사람은 이유를 영영 볼 수 없다(guards.ts 의 같은 설명).
 * · /_next/… — 개발 서버의 HMR 까지 포함한 Next 내부 자산. 잡을 이유가 없다.
 *
 * 마침표가 든 주소(/favicon.ico · /robots.txt · 이미지)도 뺀다 — 아래
 * isGuardedPath 를 보라.
 *
 * 앞뒤로 토막(segment) 단위로 견준다: "/api/authorize" 는 "/api/auth" 로
 * 시작하지만 다른 주소다.
 */
const UNGUARDED_PREFIXES = ["/api/auth", "/login", "/_next"] as const;

/**
 * proxy 가 이 주소를 잡아야 하는가.
 *
 * 🔴 src/proxy.ts 의 `config.matcher` 와 **같은 판정**이다. matcher 가 이미
 * 걸러 주는데 또 보는 이유: matcher 는 글자로 적은 정규식이라 누군가 한 조각을
 * 고치면 조용히 틀어지고, 그때 나는 사고가 하필 **무한 되돌기**(아무도 못
 * 들어옴)다. 두 겹으로 막아 두고 둘이 어긋나지 않는지를 시험이 본다
 * (proxy-rules.test.ts — matcher 글자를 읽어 이 함수와 대조한다).
 *
 * 대소문자를 내려 견주는 것은 Next 가 matcher 를 대소문자 구분 없이 컴파일하기
 * 때문이다(실측: /API/AUTH/sso/start 도 matcher 에서 빠진다).
 */
export function isGuardedPath(pathname: string): boolean {
  // 주소로 보이지 않는 값은 건드리지 않는다. 모르는 것에 손대지 않는 쪽이 안전하다.
  if (!pathname.startsWith("/")) return false;

  // 끝의 '/' 를 떼고 견준다. Next 는 "/login/" 을 "/login" 으로 되돌리지만,
  // 그 되돌림보다 proxy 가 먼저 도는 경우가 있다.
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const path = trimmed.toLowerCase();

  for (const prefix of UNGUARDED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return false;
  }

  // 🔴 정적 파일. 마침표가 **어디에든** 있으면 뺀다 — matcher 쪽 `.*\.` 와 같은
  // 규칙이다. 화면 주소에 마침표를 쓰지 않는 대신(UUID·번호에는 나오지 않는다)
  // 규칙 하나로 /favicon.ico · /robots.txt · /images/logo.png 를 모두 덮는다.
  // 마침표가 든 화면을 나중에 만들면 그 화면은 proxy 를 지나지 않는다 — 막히는
  // 것이 아니라 **주소만 잃는다**(requireSession 이 그대로 지킨다).
  if (path.includes(".")) return false;

  return true;
}

/**
 * 지금 요청이 가리키던 주소. 로그인을 마치고 돌아올 곳이다.
 *
 * 🔴 여기서 곧바로 safeReturnTo 를 거친다 — 돌려주는 값은 **머리말에 그대로
 * 실을 수 있는 형태**여야 한다. 한글이 든 주소를 날것으로 Headers 에 넣으면
 * 그 자리에서 TypeError 가 난다(return-to.ts 의 toHeaderSafe 설명).
 *
 * `search` 는 '?' 를 포함한 모양이거나 빈 문자열이다(URL.search 그대로).
 * Next 가 제 내부 질의(_rsc)를 미리 떼고 주므로 그것까지 실릴 걱정은 없다
 * (node_modules/next/dist/server/internal-utils.js 의 stripInternalSearchParams).
 */
export function currentAddress(pathname: string, search: string): string {
  return safeReturnTo(`${pathname}${search}`);
}

/**
 * 로그인 통로로 보낼 곳(이 사이트 안의 경로).
 *
 * auth/guards.ts 의 requireSession 이 만드는 것과 **같은 모양**이다. 한쪽만
 * 고치면 두 길의 동작이 갈리므로 시험이 둘을 함께 본다.
 *
 * 못 믿을 값이면 returnTo 를 아예 붙이지 않는다 — 첫 화면으로 간다.
 * 받은 값을 한 번 더 safeReturnTo 에 통과시키는 것은 공짜다(이미 거친 값에
 * 다시 걸어도 결과가 같다). 부르는 쪽이 무엇을 주든 밖으로 나가는 주소는
 * 만들어지지 않는다.
 */
export function loginStartTarget(returnTo: string): string {
  const target = safeReturnTo(returnTo);
  if (target === RETURN_TO_FALLBACK) return LOGIN_START_PATH;
  return `${LOGIN_START_PATH}?returnTo=${encodeURIComponent(target)}`;
}
