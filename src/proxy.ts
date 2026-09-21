/**
 * 로그인하지 않은 채 어떤 주소를 열어도, 로그인을 마치면 **그 주소로** 도착하게
 * 하는 자리.
 *
 * ── 🔴 Next.js 16 에서 middleware 가 proxy 로 바뀌었다 ──────────────────
 * 파일 이름은 `src/proxy.ts`(app 과 같은 층), 내보내는 함수 이름은 `proxy`,
 * 기본 실행 환경은 **Node.js** 다. 옛 자료의 `middleware.ts` / `export function
 * middleware` 는 이 판에서 더 이상 그 이름으로 불리지 않는다. 근거는 저장소
 * 안에 실려 있는 공식 문서다:
 *   node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 *   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * ── 여기서 하는 일은 하나뿐이다 ────────────────────────────────────────
 * 세션 쿠키가 **있는지만** 본다. 없으면 로그인 통로로 보내되 가려던 주소를
 * 싣고, 있으면 그냥 통과시키되 가려던 주소를 요청 머리말에 실어 준다.
 *
 * 🔴 인증을 판정하지 않는다. 서명 검증도, DB 조회도, 세션 해석도 없다. 까닭은
 * 셋이고 auth/proxy-rules.ts 머리말에 적어 두었다 — 요약하면 (1) 이 자리는 미리
 * 가져오는 요청까지 포함해 모든 요청마다 돈다 (2) 실행 환경 문제를 새로 떠안는다
 * (3) **진짜 판정은 화면 틀의 requireSession 이 그대로 한다.** 이것은 그 방어선을
 * 옮기는 것이 아니라 그 앞에 자리를 하나 더 두는 것이다. Next 문서는 이 쓰임을
 * optimistic check(낙관적 확인)라 부른다.
 *
 * 판정 자체는 전부 auth/proxy-rules.ts 의 순수 함수에 있다 — 이 파일은 그것을
 * 요청·응답에 붙이는 배관일 뿐이다. 문서도 "proxy 에 로직을 쌓지 말고 모듈로
 * 쪼개 두라" 고 권한다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  currentAddress,
  isGuardedPath,
  loginStartTarget,
  RETURN_TO_HEADER,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/proxy-rules";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // matcher 가 이미 걸러 주지만 한 겹 더 본다. 여기서 틀어질 때 나는 사고가
  // 하필 **무한 되돌기**(로그인하러 가는 요청을 다시 로그인으로 보냄)라
  // 두 겹으로 막는다. 둘이 어긋나지 않는지는 proxy-rules.test.ts 가 본다.
  if (!isGuardedPath(pathname)) return NextResponse.next();

  // 가려던 주소. 🔴 이 값은 이미 safeReturnTo 를 거쳤다 — 이 사이트 안의
  // 경로이고, 머리말에 그대로 실을 수 있는 형태다.
  const returnTo = currentAddress(pathname, search);

  // ── 쿠키가 아예 없다 ────────────────────────────────────────────────
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL(loginStartTarget(returnTo), request.nextUrl), {
      // 🔴 307(메서드 보존)이 아니라 303 이다. 307 이면 세션이 끊긴 채 보낸
      // POST(서버 액션)가 GET 만 받는 로그인 통로로 그대로 POST 되어 405 가
      // 된다. 303 은 무엇으로 왔든 다음 요청을 GET 으로 만든다 —
      // /api/auth/sso/start 자신이 포털로 보낼 때 쓰는 것과 같은 값이다.
      status: 303,
      // 이 응답은 쿠키가 있고 없고에 따라 갈리는데 주소만 보면 같다. 어딘가
      // 캐시되면 이미 로그인한 사람에게도 이 되돌기가 나간다.
      headers: { "cache-control": "no-store" },
    });
  }

  // ── 쿠키는 있다 ─────────────────────────────────────────────────────
  // 통과시킨다. 다만 그 세션이 만료·위조된 것일 수 있고, 그때 잡아내는 것은
  // 화면 틀의 requireSession 이다. 🔴 서버 레이아웃은 지금 주소를 알 방법이
  // 없으므로 여기서 요청 머리말에 실어 준다. 없으면 그 경우에 또 주소를 잃는다.
  //
  // 🔴 `NextResponse.next({ request: { headers } })` 여야 한다.
  // `NextResponse.next({ headers })` 는 **브라우저로 나가는** 응답 머리말이다
  // (문서 "Setting Headers" 가 굵게 구분해 둔 대목).
  //
  // set 이라 브라우저가 같은 이름으로 보낸 값이 있어도 덮어쓴다. 그래도 읽는
  // 쪽은 믿지 않고 safeReturnTo 를 한 번 더 거친다(requireSession).
  const headers = new Headers(request.headers);
  headers.set(RETURN_TO_HEADER, returnTo);
  return NextResponse.next({ request: { headers } });
}

/**
 * 🔴 matcher 는 **글자 그대로** 적어야 한다.
 *
 * "The `matcher` values need to be constants so they can be statically analyzed
 *  at build-time. Dynamic values such as variables will be ignored."
 * (proxy API 문서). 즉 auth/proxy-rules.ts 에서 상수를 들여와 쓰면 **조용히
 * 무시되어** proxy 가 모든 요청에서 돌게 된다. 그래서 여기에만 중복으로 적고,
 * 같은 판정을 하는 isGuardedPath 와 어긋나지 않는지는 시험이 본다.
 *
 * 읽는 법: 「'/' 로 시작하는 모든 주소. 단 바로 뒤가 아래 가운데 하나면 뺀다」
 *
 *   api/auth$ · api/auth/ — 🔴 로그인 통로. 빼지 않으면 로그인하러 가는 요청을
 *                           다시 로그인으로 보내 **무한 되돌기**가 된다.
 *                           "/api/authorize" 같은 이웃 주소까지 빼지 않도록
 *                           토막 끝($ 또는 /)까지 함께 본다.
 *   login$ · login/       — 로그인이 거절된 까닭을 보여주는 화면.
 *   _next$ · _next/       — Next 내부 자산(정적 파일·이미지·개발 서버 HMR).
 *   .*\.                  — 마침표가 든 주소 = 정적 파일(/favicon.ico ·
 *                           /robots.txt · /images/logo.png). 잡아 봐야 느려질
 *                           뿐이다. 문서의 예제도 같은 결로 적혀 있다.
 *
 * matcher 를 아예 두지 않으면 정적 파일과 이미지까지 전부 이 함수를 지난다 —
 * 문서가 그 경우 "auth logic or redirects can unintentionally block CSS, JS, or
 * images" 라고 경고한다.
 *
 * 🔴 /api 가운데 /api/auth 가 **아닌** 것은 일부러 남겨 두었다(지금은 하나도
 * 없다). 새 API 를 만들 때 아무도 손대지 않으면 「로그인 필요」가 기본이 되는
 * 쪽이, 조용히 열려 있는 쪽보다 안전하다.
 */
export const config = {
  matcher: ["/((?!api/auth$|api/auth/|login$|login/|_next$|_next/|.*\\.).*)"],
};
