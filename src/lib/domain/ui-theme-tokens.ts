/**
 * ============================================================================
 * 🔴 여기 있는 것은 **대비를 재는 자(尺)** 하나뿐이다 — 앱 색 등록부는 안 왔다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(1,376줄)은 **앱 전체 색·모서리·글자 크기의
 * 등록부**다 — 토큰 목록, 기본값, 검증, 재정의 셈, 대비 경고 짝 목록까지. 그
 * 등록부를 움직이는 화면([시스템 설정 → 색상 톤])은 A/S 에 있고 이 사이트로 오지
 * 않는다. 통째로 베끼면 **여기서 아무도 묻지 않는 값**이 1,300줄 남고, 저쪽에서
 * 토큰이 바뀌어도 여기서는 알 길이 없다(permission-areas.ts 와 같은 판단).
 *
 * 내자 정리가 저 파일에서 실제로 쓰는 것은 둘이다 — 고객사 줄 색이 「만든 색조가
 * 글자와 충분히 대비되는가」를 스스로 재는 데 쓴다(domain/customer-row-color.ts
 * 머리말 ④). 그 둘만 **글자 그대로** 가져왔다.
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 옮겨 온
 * `customer-row-color.ts` 599줄을 한 글자도 고치지 않아도 되고, 조각 4 에서
 * 저쪽을 걷어낼 때 두 벌을 글자로 대조할 수 있다.
 *
 * 🔴 계산식을 고치지 마라 — 같은 색이 두 사이트에서 다른 대비로 읽히면,
 * 한쪽에서 보정이 돌고 다른 쪽에서는 안 돌아 **같은 고객사의 줄 색이 갈린다.**
 * ============================================================================
 */

/** 색: `#` + hex 6자리. 이 좁음이 곧 주입 차단이다(A/S 쪽 파일 머리말). */
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/**
 * WCAG 상대휘도로 잰 두 색의 대비비(1 ~ 21).
 *
 * 색 라이브러리를 쓰지 않는다 — 이 저장소는 clsx조차 안 쓴다. 계산식은
 * WCAG 2.1의 relative luminance 정의 그대로다.
 *
 * 소수 두 자리에서 반올림해 돌려준다. 부동소수 찌꺼기가 남으면 검은색/흰색이
 * 21이 아니라 21.000000000000004가 되어, 화면에 그대로 찍히고 시험도 어림수로만
 * 쓸 수 있게 된다. 대비비는 사람이 읽는 숫자이고 임계값도 4.5·3처럼 두 자리다.
 *
 * 형식이 어긋난 색은 던진다 — 여기 오는 값은 이미 정리된 `#rrggbb` 여야 하고,
 * 아니라면 그것은 판정할 대상이 아니라 고쳐야 할 버그다.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function relativeLuminance(hex: string): number {
  const lowered = hex.trim().toLowerCase();
  if (!COLOR_PATTERN.test(lowered)) {
    throw new Error(`대비를 잴 수 없는 색이다(#rrggbb 여섯 자리만 받는다): ${hex}`);
  }
  const channels = [
    Number.parseInt(lowered.slice(1, 3), 16),
    Number.parseInt(lowered.slice(3, 5), 16),
    Number.parseInt(lowered.slice(5, 7), 16),
  ].map((raw) => {
    const value = raw / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** 미만이면 화면이 경고한다. WCAG AA 본문 기준. */
export const UI_THEME_CONTRAST_WARN = 4.5;
