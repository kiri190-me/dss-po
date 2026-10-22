import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * ============================================================================
 * 좁은 화면의 머리말 — ☰ 서랍 (2026-10-22, 쓰는 분이 정한 기준 다섯)
 * ============================================================================
 * 쓰는 분이 「다 됐는가」의 기준을 직접 알려 주셨다. **768px 미만에서**
 *
 *   1. 알림 종이 머리말에 있다(맨 오른쪽)
 *   2. 시스템을 넘나드는 드롭다운(오가기 메뉴바)이 머리말에 있다
 *   3. 시스템 이름이 **눈으로 보이게** 적혀 있다
 *   4. **☰ 가 머리말 왼쪽**에 있다
 *   5. **화면 메뉴들이 그 ☰ 서랍 안**에 있다
 *
 * 1·2 는 2026-09-21 부터 그랬고(service-menu-wiring.test.ts ·
 * notification-bell-wiring.test.ts 가 지킨다), 3·4·5 가 2026-10-22 에 더해졌다.
 * 3 은 **그 전의 반대 결정을 뒤집은 것**이라 그쪽 시험도 함께 고쳤다 —
 * 까닭은 거기 주석에 적어 두었다.
 *
 * 덤으로 머리말이 굴러도 화면 위에 남는다(sticky). 넓은 화면(768px 이상)에
 * 더해지는 것은 그 하나뿐이다.
 *
 * ── 🔴 왜 소스 글자로 재는가 ───────────────────────────────────────────
 * 이 머리말은 `logoutAction`(서버 액션)을 가져오는 **서버 컴포넌트**라 시험에서
 * import 조차 되지 않는다. 이 저장소의 관례대로 **원본을 글자로** 읽는다
 * (…-source.test.ts · service-menu-wiring.test.ts 와 같은 처방).
 *
 * 🔴 **주석은 걷어내고 잰다.** 고친 파일들의 주석에는 「클라이언트 지시문이 없다」
 * 「768px 미만에서 접는다」 같은 말이 일부러 길게 적혀 있다. 주석이 코드 대신
 * 걸리면 다음 사람이 **까닭이 적힌 주석을 지우는 쪽으로** 움직인다.
 *
 * 🔵 재는 것은 **배치뿐**이다 — 누가 무엇을 보는지(filterNavItemsForAccess)와 가는
 * 곳(navItems)은 navigation.test.ts 가 따로 지킨다. 여기서는 그 규칙이 **한 벌로
 * 남아 있는지**(폰용으로 베껴 적지 않았는지)만 본다.
 * ============================================================================
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** 주석을 걷어낸 코드만. 🔵 떼고 나서 빈 글자가 아닌 것을 함께 확인한다(떼는 규칙이 낡으면 전부 조용히 통과한다). */
function codeOnly(source: string): string {
  const out = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(out.trim().length > 0, "주석을 떼고 나니 아무것도 안 남았다 — 떼는 규칙이 더는 안 맞는다");
  return out;
}

const HEADER = "src/components/AppHeader.tsx";
const code = codeOnly(read(HEADER));
const navCode = codeOnly(read("src/components/AppNav.tsx"));
const layoutCode = codeOnly(read("src/app/(app)/layout.tsx"));

const count = (needle: string): number => code.split(needle).length - 1;

/** `<details> … </details>` 안쪽. 🔴 못 찾으면 멈춘다 — 빈 글자로 흘러가면 아래 단언이 전부 통과한다. */
function drawer(): string {
  const start = code.indexOf("<details");
  const end = code.indexOf("</details>");
  assert.ok(start > 0 && end > start, "☰ 의 <details> 를 찾지 못했다 — 모양이 바뀌었으면 시험도 함께 고쳐라");
  return code.slice(start, end);
}

/**
 * `src/` 아래의 소스 파일 전부(절대 경로). ⑦ 의 z 실측이 쓴다.
 *
 * 🔴 `new URL(…)` 로 폴더를 이어 붙이지 않는다 — 이 저장소에는 `(app)`·`[id]` 같은
 *    폴더가 있어 대괄호·괄호가 퍼센트로 둔갑하면 **읽기가 조용히 실패한다.**
 * 🔵 `readdirSync` 의 `recursive` 옵션도 쓰지 않는다 — Node 판에 따라 없다
 *    (개발 24 · 운영 22 · 타입 검사 20). 손으로 내려간다.
 */
function srcFiles(dir = path.join(ROOT, "src")): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...srcFiles(child));
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(child);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ① 머리말은 **서버 컴포넌트**로 남는다
 * ═════════════════════════════════════════════════════════════════════════ */

describe("① 🔴 머리말은 서버 컴포넌트로 남는다 — ☰ 를 자바스크립트로 여닫지 않았다", () => {
  /** 클라이언트 지시문. 🔴 **낱말로 적지 않고 값으로 둔다** — 주석에 그대로 쓰면 글자로 세는 시험이 뒤집힌다. */
  const CLIENT_DIRECTIVE = '"use client"';

  it("🔴 클라이언트 지시문이 없다", () => {
    assert.equal(
      count(CLIENT_DIRECTIVE),
      0,
      "머리말이 클라이언트 컴포넌트가 됐다 — 경계가 깨지면 시험이 다 통과해도 화면이 안 열리고 build 에서만 드러난다",
    );
    assert.equal(count("'use client'"), 0, "따옴표만 바꾼 지시문이 들어왔다");
  });

  it("🔴 여닫는 일은 **브라우저**가 한다 — 상태도 이벤트도 쓰지 않는다", () => {
    for (const bad of ["useState", "useEffect", "useRef", "usePathname", "onClick", "onChange"]) {
      assert.equal(count(bad), 0, `${bad} 가 생겼다 — 서버 컴포넌트에서 쓸 수 없고, 쓰려면 파일 전체가 클라이언트로 내려간다`);
    }
  });

  it("🔴 ☰ 는 `<details>`/`<summary>` 다 — 하나씩", () => {
    assert.equal(count("<details"), 1, "☰ 의 <details> 가 없거나 둘이 됐다");
    assert.equal(count("<summary"), 1, "<summary> 가 없거나 둘이 됐다");
  });

  it("🔵 `<summary>` 앞의 ▶ 삼각형을 **둘 다** 끈다 — 하나만 끄면 사파리에서만 남는다", () => {
    const summary = drawer();
    assert.ok(summary.includes("list-none"), "list-none 이 없다 — 크롬·파이어폭스에 ▶ 가 남는다");
    assert.ok(
      summary.includes("[&::-webkit-details-marker]:hidden"),
      "웹킷 표식을 안 껐다 — 사파리에 ▶ 가 남는다",
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ② 접는 경계는 768px 하나다
 * ═════════════════════════════════════════════════════════════════════════ */

describe("② 🔴 접는 경계는 `md`(768px) 하나다 — 오가기 단추가 이름을 감추는 폭과 같은 값", () => {
  it("☰ 는 `md` 미만에서만 선다", () => {
    assert.match(code, /<details className="[^"]*md:hidden/, "☰ 가 넓은 화면에서도 보인다");
  });

  it("머리말 줄의 화면 메뉴는 `md` 이상에서만 선다", () => {
    assert.match(
      code,
      /<div className="hidden md:block">\{screenNav\}<\/div>/,
      "화면 메뉴가 폰에서도 머리말 줄에 선다 — ☰ 서랍과 함께 두 벌이 보인다",
    );
  });

  it("사용자명도 `md` 이상에서만 머리말 줄에 선다", () => {
    assert.match(code, /<span className="hidden text-slate-600 md:inline">\{user\.name\}<\/span>/);
  });

  it("🔴 경계가 **그 셋에만** 쓰인다 — 늘면 넓은 화면이 예전과 달라진다", () => {
    assert.equal(count("md:hidden"), 1, "md:hidden 이 늘었다");
    assert.equal(count("md:block"), 1, "md:block 이 늘거나 줄었다");
    assert.equal(count("md:inline"), 1, "md:inline 이 늘거나 줄었다");
    // 🔵 `md:px-6` 은 2026-09-21 부터 있던 좌우 여백이다 — 접는 것과 무관하다.
    assert.equal(count("md:px-6"), 1);
  });

  it("🔴 화면 메뉴는 **폭으로** 세로·가로를 가른다 — 같은 노드가 두 자리에 놓이기 때문", () => {
    assert.match(
      navCode,
      /className="flex flex-col items-stretch gap-0\.5 md:flex-row md:flex-wrap md:items-center md:gap-1"/,
      "AppNav 가 서랍에서 세로로 서지 않는다 — 서랍 폭(w-64)에서 알약 셋이 접혀 쌓인다",
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ③ ☰ 는 맨 왼쪽, 종은 맨 오른쪽
 * ═════════════════════════════════════════════════════════════════════════ */

describe("③ 🔴 여닫는 손잡이 둘이 줄의 양 끝에 선다", () => {
  it("🔴 ☰ 는 머리말 **맨 왼쪽**이다 — 시스템 이름보다도 앞 (기준 4)", () => {
    const hamburger = code.indexOf("<details");
    const title = code.indexOf("DSS PO / 내자");
    const menu = code.indexOf("{serviceMenu}");
    const right = code.indexOf('className="ml-auto flex');

    assert.ok(hamburger > 0, "☰ 를 찾지 못했다");
    assert.ok(title > hamburger, "☰ 가 시스템 이름보다 뒤에 적혀 있다 — 맨 왼쪽이 아니다");
    assert.ok(menu > hamburger, "☰ 가 오가기 메뉴 단추보다 뒤에 적혀 있다 — 맨 왼쪽이 아니다");
    assert.ok(right > 0 && hamburger < right, "☰ 가 오른쪽 묶음(ml-auto) 안에 들어가 있다");
  });

  it("🔴 종은 머리말 **맨 오른쪽**이다 — 펼친 목록이 종에 오른쪽 끝을 맞춰 열린다", () => {
    const bell = code.indexOf("{notificationBell}");
    assert.ok(bell > 0, "종을 찾지 못했다");
    // 🔴 「☰ 보다 오른쪽」으로는 부족하다(이제 거의 모든 자리가 그렇다). 종 **뒤에
    //    아무 요소도 서지 않는가**를 본다 — 하나라도 서면 그만큼 목록이 왼쪽으로 밀려 잘린다.
    const tail = code.slice(bell + "{notificationBell}".length);
    assert.ok(!/<[A-Za-z]/.test(tail), "종 오른쪽에 무언가가 더 섰다 — 폰에서 알림 목록 왼쪽이 화면 밖으로 나간다");
  });

  it("🔴 오가기 메뉴 단추와 종은 ☰ 서랍 **밖**에서 늘 보인다 (기준 1·2)", () => {
    const panel = drawer();
    assert.ok(!panel.includes("{serviceMenu}"), "오가기 단추가 서랍 안으로 들어갔다 — 접으면 다른 시스템으로 갈 길이 함께 사라진다");
    assert.ok(!panel.includes("{notificationBell}"), "종이 서랍 안으로 들어갔다 — 알림은 접힌 서랍에서 기다리면 안 된다");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ④ 화면 메뉴는 **한 벌**이다
 * ═════════════════════════════════════════════════════════════════════════ */

describe("④ 🔴 화면 메뉴는 한 벌 — 폰용으로 베껴 적지 않았다 (기준 5)", () => {
  it("🔴 머리말은 **받은 노드 하나**를 두 자리에 놓는다", () => {
    assert.equal(count("{screenNav}"), 2, "화면 메뉴가 한 자리에만 있거나 셋이 됐다");
    assert.ok(drawer().includes("{screenNav}"), "서랍 안에 화면 메뉴가 없다 — 폰에서 다른 화면으로 갈 길이 사라진다");
  });

  it("🔴 머리말은 메뉴 목록도 권한도 **모른다** — 두 벌이 생길 자리가 아예 없다", () => {
    for (const forbidden of ["navItems", "AppNav", "filterNavItemsForAccess", "NavLink"]) {
      assert.equal(
        count(forbidden),
        0,
        `머리말이 ${forbidden} 를 직접 안다 — 서랍용 메뉴를 따로 만들 수 있게 되고, 갈리면 폰과 컴퓨터가 다른 메뉴를 그린다`,
      );
    }
  });

  it("🔴 레이아웃도 메뉴를 **한 번만** 만든다", () => {
    assert.equal(
      layoutCode.split("<AppNav").length - 1,
      1,
      "레이아웃이 메뉴를 두 벌 만든다 — 거르는 규칙이 갈리면 「보이는데 막힌다」가 생긴다",
    );
    assert.equal(layoutCode.split("filterNavItemsForAccess(").length - 1, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ⑤ 서랍의 모양
 * ═════════════════════════════════════════════════════════════════════════ */

describe("⑤ 🔴 서랍은 **화면에 매달려** 왼쪽에서 나온다", () => {
  it("바깥이 화면을 꽉 채운다 — 안 채우면 가려지지 않은 곳이 「바깥」이 되어 닫는 길이 둘로 갈린다", () => {
    assert.match(
      code,
      /<div className="fixed inset-0 z-\[60\] flex">/,
      "서랍 바깥이 화면을 꽉 채우지 않는다 — 검은 바탕이 화면 일부만 덮는다",
    );
  });

  it("본체는 왼쪽에 선 고정폭 기둥이다 — 세로 flex 이고 길어지면 제 안에서 구른다", () => {
    const body = /className="(relative z-50 [^"]*)"/.exec(drawer());
    assert.ok(body, "서랍 본체의 className 을 찾지 못했다 — 모양이 바뀌었으면 시험도 함께 고쳐라");

    const classes = body[1].split(/\s+/).filter(Boolean);
    for (const needed of ["flex", "flex-col", "w-64", "min-h-0", "overflow-y-auto", "overscroll-contain"]) {
      assert.ok(classes.includes(needed), `서랍 본체에 ${needed} 가 없다 (class: ${body[1]})`);
    }
  });

  it("🔴 검은 바탕은 `<button type=\"button\">` 이다 — 눌러서 닫히게 하는 유일한 길", () => {
    // 🔴 바탕이 <details> **안**이라 「바깥 누르기」(pointerdown)로는 안 접힌다.
    //    접히는 길은 「서랍 안의 a·button 을 눌렀을 때」 하나뿐이다 — 평범한 <div> 면
    //    **눌러도 아무 일이 없는데 오류도 안 난다.** 짝이 맞는지는
    //    header-menu-dismiss.test.ts 가 두 파일을 맞대어 본다.
    const panel = drawer();
    const at = panel.indexOf('aria-label="메뉴 닫기"');
    assert.ok(at > 0, "검은 바탕이 서랍 안에 없다 — 눌러 닫을 길이 사라졌다");
    const open = panel.lastIndexOf("<", at);
    const tag = panel.slice(open, panel.indexOf(">", at) + 1);
    assert.match(tag, /^<button\b/, "검은 바탕이 <button> 이 아니다");
    assert.match(tag, /\stype="button"/, '기본값이 submit 이다 — 서랍에 폼이 들어오는 날 누를 때마다 보내진다');
    assert.match(tag, /className="absolute inset-0 /, "검은 바탕이 서랍 바깥 상자를 다 덮지 않는다");
  });

  it("🔴 계정 묶음을 바닥에 붙이는 것은 **늘어나는 빈 칸막이**다 — `mt-auto` 가 아니다", () => {
    const panel = drawer();
    const nav = panel.indexOf("{screenNav}");
    const group = panel.indexOf("border-t");
    assert.ok(nav > 0, "서랍의 화면 메뉴를 찾지 못했다");
    assert.ok(group > nav, "구분선(border-t)으로 시작하는 계정 묶음을 메뉴 뒤에서 찾지 못했다");

    const between = panel.slice(nav, group);
    const spacer = /<div ([^>]*)\/>/.exec(between);
    assert.ok(spacer, "메뉴와 계정 묶음 **사이**에 빈 칸막이가 없다 — 받치는 것이 그 칸 하나다");

    const classes = (/className="([^"]*)"/.exec(spacer[1])?.[1] ?? "").split(/\s+/).filter(Boolean);
    assert.ok(
      classes.includes("grow"),
      `칸막이가 남는 자리를 안 먹는다(class: ${classes.join(" ") || "(없음)"}) — grow 가 빠지면 높이 0 인 빈 칸이 되어 묶음이 다시 메뉴 바로 밑으로 올라붙는다`,
    );
    assert.match(spacer[1], /aria-hidden="true"/, "칸막이가 화면 낭독기에 읽힌다 — 아무것도 그리지 않는 칸이라 알릴 것이 없다");

    // 🔴 margin-top:auto 는 **남는 자리가 있을 때만** 내려 준다. 메뉴가 서랍보다 길어지는
    //    순간 0 으로 풀려 구분선이 마지막 링크에 바짝 달라붙는다 — 간격이 가장 필요한 때다.
    assert.ok(!panel.includes("mt-auto"), "서랍에 mt-auto 가 들어왔다 — 길어지는 날 구분선 위 간격이 사라진다");
    assert.match(/<div className="(mt-3[^"]*border-t[^"]*)">/.exec(panel)?.[1] ?? "", /\bmt-3\b/, "구분선 위 12px 간격이 사라졌다");
  });

  it("🔵 폰에서 사용자명이 글자로 보이는 자리는 서랍 안 **하나**다", () => {
    assert.equal(count("{user.name}"), 2, "사용자명이 한 자리에만 있거나 셋이 됐다");
    assert.ok(drawer().includes("{user.name}"), "서랍에 사용자명이 없다 — 폰에서 누구로 들어와 있는지 알 길이 없다");
  });

  it("🔴 나가는 단추 둘은 서랍에 넣지 않았다 — 접힌 뒤에 있으면 나갈 길이 가려진다", () => {
    const panel = drawer();
    assert.ok(!panel.includes("통합 로그인으로"), "「통합 로그인으로」가 서랍 안으로 들어갔다");
    assert.ok(!panel.includes("logoutAction"), "로그아웃 폼이 서랍 안으로 들어갔다");
  });

  it("🔴 인쇄물에는 ☰ 도 서랍도 나오지 않는다 — 바깥 <details> 하나로 통째로", () => {
    assert.match(code, /<details className="[^"]*print:hidden/, "☰ 가 인쇄물에 찍힌다");
    // 🔵 서랍 안쪽에는 또 적지 않는다 — 바깥 <details> 가 통째로 사라지므로 두 벌이면
    //    한쪽만 고치는 날이 온다. 그래서 머리말 전체에서 **한 번**이어야 한다.
    assert.equal(count("print:hidden"), 1, "인쇄 숨김이 늘거나 줄었다");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ⑥ 머리말이 굴러도 화면 위에 남는다
 * ═════════════════════════════════════════════════════════════════════════ */

describe("⑥ 🔴 머리말 고정 — sticky, 인쇄에서는 되돌린다", () => {
  it("굴러도 위에 남는다", () => {
    assert.match(code, /<header className="sticky top-0 z-\d+ /, "머리말이 고정되지 않는다");
    assert.match(code, /<header className="[^"]*print:static/, "인쇄에서 고정을 안 되돌린다 — 쪽마다 겹쳐 찍히거나 첫 쪽 본문을 가린다");
  });

  it("🔴 position 은 **하나**다 — 둘이 적히면 찍는 차례에 따라 한쪽이 조용히 이긴다", () => {
    const header = /<header className="([^"]*)"/.exec(code);
    assert.ok(header, "머리말의 className 을 찾지 못했다");
    const positions = header[1]
      .split(/\s+/)
      .filter((one) => ["static", "relative", "absolute", "fixed", "sticky"].includes(one));
    assert.deepEqual(positions, ["sticky"], `머리말에 position 이 둘 이상 적혔다: ${positions.join(" ")}`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ⑦ 🔴 쌓임 순서 — 머리말이 본문보다 **위**인가 (실측)
 * ═════════════════════════════════════════════════════════════════════════ */

describe("⑦ 🔴 머리말의 z 가 본문 쪽 최대보다 위다", () => {
  /**
   * 🔴 `sticky` + `z` 는 **쌓임 맥락**을 만든다. 그 뒤로 머리말 **안**의 z(종의 펼친
   *    목록 50 · 오가기 목록 50 — 둘 다 @dss/ui 의 CSS · 서랍 60)는 그 맥락 안에서만
   *    겨루고, 바깥과는 머리말의 z **하나**로만 겨룬다. 그래서 본문 어딘가에 머리말과
   *    같거나 큰 z 가 생기면 **머리말이 통째로 덮이는데 오류는 한 줄도 안 난다** —
   *    그 날을 잡으려고 src/ 전체를 훑어 실제로 센다.
   * 🔵 2026-10-22 실측: 머리말 밖에서 가장 큰 것은 10 둘뿐이다(FileDropZone 의
   *    끌어놓기 덮개 · 내자 정리 표의 머리글).
   */
  it("🔴 src/ 안에서 머리말 밖의 z 가 머리말보다 작다", () => {
    const headerZ = /<header className="[^"]*\bz-(\d+)\b/.exec(code);
    assert.ok(headerZ, "머리말의 z 를 찾지 못했다");

    const files = srcFiles();
    // 🔵 훑는 규칙이 낡으면 **아무것도 못 찾아 조용히 통과한다** — 그래서 먼저 센다.
    assert.ok(files.length > 50, `src/ 를 제대로 훑지 못했다(${files.length}개) — 이 시험은 찾은 것이 없으면 그냥 통과한다`);
    assert.ok(
      files.some((f) => f.endsWith("FileDropZone.tsx")),
      "z 가 실제로 쓰인 파일(FileDropZone.tsx)에 닿지 못했다",
    );

    const top = { z: 0, file: "(없음)" };
    for (const file of files) {
      // 머리말 **안**의 z 는 제 맥락 안에서만 겨룬다.
      if (file.endsWith("AppHeader.tsx")) continue;
      // 🔴 시험 파일은 세지 않는다 — 이 파일만 해도 서랍의 z 를 글자로 적고 있어서,
      //    세면 「본문에 60 이 있다」로 읽혀 **제가 저를 깨뜨린다.** 시험은 화면을
      //    그리지 않으므로 거기 적힌 z 는 아무것도 덮지 않는다.
      if (/\.test\.tsx?$/.test(file)) continue;
      const body = read(path.relative(ROOT, file))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const hit of body.matchAll(/\bz-(?:\[(\d+)\]|(\d+))\b/g)) {
        const z = Number(hit[1] ?? hit[2]);
        if (z > top.z) {
          top.z = z;
          top.file = path.relative(ROOT, file).split(path.sep).join("/");
        }
      }
    }

    assert.ok(
      top.z < Number(headerZ[1]),
      `머리말(z-${headerZ[1]})보다 크거나 같은 z 가 본문에 있다 — ${top.file} 의 z-${top.z}. 머리말의 z 도 함께 올려라`,
    );
  });
});
