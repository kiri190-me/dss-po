/**
 * ============================================================================
 * 🔴 여기 있는 것은 **색 하나를 읽는 두 함수**뿐이다 — 램프 생성기는 안 왔다
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일(768줄)은 **메인 컬러 램프 생성기**다 — 씨앗
 * 색 하나에서 primary-50 ~ primary-950 열한 단계를 만들고, 대비를 맞추고, 중립색
 * 까지 물들인다. 그 램프를 움직이는 화면([시스템 설정 → 메인 컬러])은 A/S 에
 * 있고 이 사이트로 오지 않는다(이 사이트의 강조색은 globals.css 의 hex 열한 줄로
 * 고정이다).
 *
 * 내자 정리가 저 파일에서 실제로 쓰는 것은 둘이다 — 고객사가 「직접 고른 색」을
 * 읽을 때 ① 색 코드를 한 가지 표기로 모으고(normalizeUiThemePrimarySeed)
 * ② 색상·채도만 뽑는다(uiThemeTintOf). 둘 다 램프와 무관한 색 변환이다.
 *
 * 🔴 **파일 이름과 경로를 A/S 와 똑같이 둔다.** 그래야 옮겨 온
 * `customer-row-color.ts` 599줄을 한 글자도 고치지 않아도 되고, 조각 4 에서
 * 저쪽을 걷어낼 때 두 벌을 글자로 대조할 수 있다.
 *
 * ── 🔴 normalizeUiThemePrimarySeed 는 저쪽에서 한 겹 돌아간다 ────────────
 * A/S 에서는 등록부의 `primary-900` 토큰을 찾아 `normalizeUiThemeValue(token, raw)`
 * 를 부른다. 그 토큰의 종류가 `"color"` 라, 실제로 하는 일은 **trim → 소문자 →
 * `#rrggbb` 여섯 자리인가**가 전부다(저쪽 ui-theme-tokens.ts 의
 * normalizeColorValue). 등록부를 끌고 오지 않으려고 그 결과를 여기 그대로 적었다 —
 * 🔴 저쪽 normalizeColorValue 가 바뀌면 이쪽도 함께 고쳐야 한다. 바뀌면 고객사가
 * 저장해 둔 색을 한쪽만 「모르는 값」으로 읽어 줄 색이 조용히 사라진다.
 * ============================================================================
 */

/** 색: `#` + hex 6자리. 저쪽 등록부의 COLOR_PATTERN 과 같은 글자다. */
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

/**
 * 씨앗 색을 정규화한다. 사람이 친 글자를 그대로 받으므로 쓰기 전에 한 번 거른다.
 *
 * 대소문자를 모으는 것이 핵심이다 — `#FFE4B5` 와 `#ffe4b5` 가 다른 값으로 저장되면
 * "기본값으로 되돌렸는데 행이 안 지워지는" 상태가 생긴다(저쪽 파일의 같은 주석).
 */
export function normalizeUiThemePrimarySeed(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return null;
  return HEX_PATTERN.test(value) ? value : null;
}

/** 색 하나가 갖는 색조 — 색상(0~360)과 채도(0~1). 밝기는 들어 있지 않다. */
export type UiThemeTint = { hue: number; saturation: number };

/** 이미 정리된 `#rrggbb` 를 0~1 채널 셋으로. */
function channelsOf(hex: string): [number, number, number] {
  const lowered = hex.trim().toLowerCase();
  if (!HEX_PATTERN.test(lowered)) {
    throw new Error(`색조를 읽을 수 없는 색이다(#rrggbb 여섯 자리만 받는다): ${hex}`);
  }
  return [
    Number.parseInt(lowered.slice(1, 3), 16) / 255,
    Number.parseInt(lowered.slice(3, 5), 16) / 255,
    Number.parseInt(lowered.slice(5, 7), 16) / 255,
  ];
}

/**
 * 색 하나에서 색조만 읽는다. 밝기는 버린다 — A/S 가 램프를 만들 때와 같은 규칙이고,
 * 여기서는 고객사가 직접 고른 색의 밝기를 버리는 데 쓴다
 * (customer-row-color.ts 머리말 ①).
 *
 * 표준 sRGB → HSL 변환 그대로다. 🔴 저쪽 hueAndSaturationOf 와 글자가 같아야 한다.
 */
export function uiThemeTintOf(hex: string): UiThemeTint {
  const [r, g, b] = channelsOf(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };

  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;

  return { hue, saturation };
}
