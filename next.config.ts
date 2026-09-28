import type { NextConfig } from "next";

/**
 * 모든 응답에 붙는 보안 헤더. dss-auth의 같은 목록과 맞춰 둔다 — 두 시스템이
 * 한 브라우저 안에서 오가므로 한쪽만 잠그면 의미가 반으로 준다.
 *
 * 리버스 프록시가 아니라 여기 두는 이유: 프록시 설정은 저장소 밖에 있어
 * 배포마다 다시 맞춰야 하고, 개발 서버에는 아예 없어서 개발 중에 확인할 수
 * 없다. 프록시에서 한 번 더 붙어도 해롭지 않다.
 *
 * CSP는 frame-ancestors 하나만 둔다. 전체 CSP는 Next의 인라인 스크립트·
 * 스타일과 부딪혀 화면이 조용히 깨지기 쉬운데, 검증 없이 넣는 것은
 * 안전장치가 아니라 시한폭탄이다.
 *
 * ── 🔴 어디서 왔나 (2026-09-28 · 조각 PO 3h) ─────────────────────────────
 * 위 세 문단과 아래 목록은 **A/S(RF_Service_System)의 next.config.ts 에서 값도
 * 곁말도 그대로** 옮겨 왔다. 이 사이트 사정에 맞춰 값을 손보지 않았다 — 두
 * 목록이 갈라지면 어느 쪽이 맞는지 아무도 모르게 된다. 이 사이트와 저쪽의
 * 사정이 실제로 다른 자리는 Permissions-Policy 하나뿐이고, 그 곁말에 적어 두었다.
 *
 * ── 🔴 이 목록에 이름이 있으면 라우트는 그 이름을 스스로 낼 수 없다 ───────
 * 전역 headers() 가 **먼저** 붙고, 그 뒤 라우트 응답의 헤더는 그 이름이 이미
 * 있으면 Next 가 **조용히 버린다**(node_modules/next/dist/server/send-response.js —
 * 여럿 허용은 set-cookie · www-authenticate · proxy-authenticate · vary 넷뿐).
 * 오류도 경고도 없어서 코드에는 있고 응답에는 없는 상태가 된다.
 *
 * 지금 이 저장소에서 겹치는 자리는 둘이고, **값이 `nosniff` 로 똑같아** 나가는
 * 것은 달라지지 않는다(2026-09-28 실측 — 응답 헤더를 직접 확인했다):
 *   · src/app/api/attachments/[id]/download/route.ts
 *   · src/app/api/quotes/[id]/xlsx/route.ts
 * 저쪽도 같은 두 자리에서 같은 값을 겹쳐 둔 채 **지우지 않는다** — 전역 목록이
 * 바뀌거나 그 통로가 다른 앞단 뒤로 옮겨지는 날을 위한 선언이다(그 두 파일의
 * 곁말). 정말 그 경로만 **다른 값**이 필요해지면 아래 headers() 에 전역 규칙
 * **뒤에** 그 경로만의 규칙을 하나 더 두는 것이 유일한 길이다.
 */
const SECURITY_HEADERS = [
  // 이 시스템의 화면이 남의 페이지 안에 실려 클릭을 가로채이는 것을 막는다.
  // 결재·출하 승인처럼 되돌리기 어려운 버튼이 있는 화면이 특히 그렇다.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 통합 로그인으로 나갈 때 우리 주소를 넘기지 않는다.
  { key: "Referrer-Policy", value: "same-origin" },
  // ⚠️ camera=(self) — 저쪽에서는 닫으면 안 되는 칸이다. A/S 의 InAppCamera.tsx가
  // getUserMedia로 그 화면 안에서 직접 촬영한다(수리 사진). ()로 두면 촬영이
  // 통째로 막히고, 증상은 "카메라가 안 켜진다"뿐이라 헤더를 의심하기까지 오래
  // 걸린다.
  // 🔴 **이 사이트에는 getUserMedia 를 부르는 곳이 한 군데도 없다**(2026-09-28
  // 실측). 그런데도 값을 저쪽과 같게 둔다 — 목록을 갈라 놓지 않으려는 것이다.
  // 닫으려면(`camera=()`) 따로 결정할 일이고, 그때 저쪽 목록도 함께 봐야 한다.
  // 마이크와 위치는 쓰지 않으므로 닫아 둔다 — 쓰게 되면 여기서 막히고,
  // 그때 왜 열어야 하는지 한 번 생각하게 된다.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  // http 응답에서는 브라우저가 무시하므로 지금 붙여도 해롭지 않고, HTTPS로
  // 옮기는 날 따로 기억해 낼 필요가 없어진다. preload는 넣지 않는다 —
  // 사내망 도메인을 브라우저 내장 목록에 올리면 되돌리는 데 몇 달이 걸린다.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // NAS(Synology DS218+)의 Docker 컨테이너로 옮기기 위한 설정.
  // 빌드 결과가 .next/standalone 아래에 자립 실행 가능한 형태로 나온다.
  // 이 저장소는 첫 줄부터 NAS 이식을 전제로 쓴다 — 이웃 저장소 다섯이 이미
  // 그렇게 돌고 있고(dss-deploy/CLAUDE.md), 나중에 붙이면 설정이 흩어진다.
  output: "standalone",

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  /**
   * 개발 서버를 localhost 가 아닌 주소로 열 때 허용할 곳.
   *
   * 이것이 없으면 Next 가 개발 전용 리소스(HMR 웹소켓·폰트)를 막는다. 그러면
   * 화면은 멀쩡히 뜨는데 **React 가 붙지 않아** 버튼이 죽는다. 계측기 시스템
   * (njlee)에서 실제로 겪었고, "인쇄 버튼만 안 되는" 것처럼 보여 원인을 찾는 데
   * 시간이 걸렸다. 같은 일을 다시 겪지 않으려고 처음부터 넣어 둔다.
   *
   * 사내망 대역을 통째로 적어 둔다. 이 PC 의 Wi-Fi 주소는 자주 바뀌는데,
   * 바뀔 때마다 여기까지 고치게 하면 결국 또 빠뜨린다.
   *
   * 🔴 칸마다 별표 하나씩 **네 칸**(192.168.*.*)이어야 한다. Next 의 대조기는
   * 칸을 뒤에서부터 하나씩 맞추고 마지막에 남은 칸이 없어야 통과시키므로
   * (node_modules/next/dist/server/app-render/csrf-protection.js),
   * "192.168.*" 나 "192.168.**" 는 칸 수가 모자라 오히려 막힌다 — 이웃
   * 저장소에서 실측으로 확인했다. 줄여 쓰고 싶어지더라도 그대로 둘 것.
   * (개발 서버에만 적용된다. next build 결과에는 영향이 없다.)
   */
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
