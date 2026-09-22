import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";

import { readAllQuoteWorkSectionDefaults } from "@/lib/storage/quote-template";
import { CABLE_QUOTE_ITEM_ROWS, CABLE_QUOTE_MAX_LINES } from "@/lib/xlsx/cable-quote-template";

/**
 * ============================================================================
 * 양식에서 읽어 오는 작업 내역 기본값 — **정말로 읽히는가** (조각 3c-1)
 * ============================================================================
 * 종류 · 장비 종류를 바꾸면 조사 · 통전 칸이 그 양식의 기본 목록으로 채워진다.
 * 그 목록은 표도 상수도 아니고 **양식 `.xlsx` 파일 그 자체**에서 온다
 * (storage/quote-template.ts 의 scanWorkScope).
 *
 * ── 🔴 이 시험이 없으면 무엇이 조용히 깨지는가 ──────────────────────────
 * `readAllQuoteWorkSectionDefaults` 는 **못 읽어도 던지지 않고 빈 목록을 준다**
 * (일부러 그렇게 만들었다 — 양식 하나 때문에 견적서를 못 쓰게 되면 안 된다).
 * 그래서 양식 경로가 빠진 날에도 화면은 멀쩡히 열리고, 달라지는 것은 「종류를
 * 바꿔도 칸이 안 채워진다」 하나뿐이다. **아무도 오류를 못 본다.**
 *
 * 그 조용한 실패를 여기서 잡는다: 아래 첫 묶음은 **빈 목록이 아님**을 단언한다.
 *
 * ── 🔴 양식 경로는 환경변수로 온다 ─────────────────────────────────────
 * 양식에는 법인 직인 이미지 · 계좌번호 · 사업자등록번호가 들어 있어 저장소에
 * 커밋하지 않는다. `npm test` 는 `scripts/test-template-bootstrap.ts` 로 그
 * 경로 다섯을 넣어 준다(package.json 의 `"test"`).
 *
 * 🔴 경로가 없는 환경(NAS · CI · 새 체크아웃)에서는 **`skip` 으로 건너뛴다** —
 * 조용히 통과시키지 않는다. `npm test` 끝의 `ℹ skipped` 가 0 이 아니면 그것이
 * 「이 PC 에서 양식을 못 찾았다」는 뜻이다. 통과로 위장하는 것보다 낫다.
 * ============================================================================
 */

/** 견적서 양식 다섯 키. `scripts/load-template-env.ts` 의 허용 목록과 같은 다섯이다. */
const TEMPLATE_PATH_KEYS = [
  "QUOTE_TEMPLATE_PATH",
  "OH_QUOTE_TEMPLATE_PATH",
  "MATCHER_QUOTE_TEMPLATE_PATH",
  "MATCHER_OH_QUOTE_TEMPLATE_PATH",
  "CABLE_QUOTE_TEMPLATE_PATH",
] as const;

/**
 * 다섯 경로가 다 설정되어 있고 그 파일이 실재하는가. 🔴 **경로만 보지 않고 파일까지
 * 본다** — 경로가 적혀 있는데 파일이 없으면 읽기가 실패해 빈 목록이 오고, 그러면
 * 아래 단언이 「양식이 바뀌었다」가 아니라 「설정이 틀렸다」로 실패한다. 그 둘을
 * 가려 주는 것이 이 판정이다.
 */
function missingTemplates(): string[] {
  return TEMPLATE_PATH_KEYS.filter((key) => {
    const configured = process.env[key];
    if (!configured || configured.trim().length === 0) return true;
    return !existsSync(configured.trim());
  });
}

const absent = missingTemplates();
const skipReason =
  absent.length === 0
    ? false
    : `견적서 양식을 찾지 못했다(${absent.join(" · ")}) — .env.local 의 경로를 확인할 것`;

describe("양식의 작업 내역 기본값 — 파일에서 읽어 온다", () => {
  test("🔴 네 양식에서 **실제 항목이 나온다** — 빈 목록이면 양식을 못 읽은 것이다", { skip: skipReason }, async () => {
    const all = await readAllQuoteWorkSectionDefaults();

    // 🔴 다섯 중 **넷**이다. 케이블은 작업 범위 구역이 아예 없어 빈 것이 정상이고,
    //    아래 케이블 묶음이 그것을 따로 못 박는다.
    for (const key of [
      "GENERATOR:DOMESTIC",
      "GENERATOR:OVERHAUL",
      "MATCHER:DOMESTIC",
      "MATCHER:OVERHAUL",
    ]) {
      const sections = all[key];
      assert.ok(sections, `${key} — 양식 구분이 아예 없다`);

      // 조사 · 통전 둘이 화면의 그 두 칸을 채운다(quote-new-start.ts 의
      // TEMPLATE_FILLED_SCOPE_SECTIONS). 🔴 **이 둘이 비면 이 조각은 아무것도 안 한 것이다.**
      assert.ok(
        sections.INVESTIGATION.items.length > 0,
        `${key} — 조사 항목이 비어 있다. 양식을 못 읽었거나 머리글이 바뀌었다`
      );
      assert.ok(
        sections.POWER_TEST.items.length > 0,
        `${key} — 통전 항목이 비어 있다. 양식을 못 읽었거나 머리글이 바뀌었다`
      );

      // 빈 글자가 항목으로 섞여 들지 않는다 — C열이 `-` 인 줄만 담는 규칙이 살아 있는가.
      for (const section of ["INVESTIGATION", "REPAIR", "POWER_TEST"] as const) {
        for (const item of sections[section].items) {
          assert.ok(item.trim().length > 0, `${key}/${section} — 빈 줄이 항목으로 들어왔다`);
        }
      }
    }
  });

  test("🔴 머리글은 **그 파일에 적힌 그대로**다 — 양식마다 다르고, 덧붙은 글자까지 살아 있다", { skip: skipReason }, async () => {
    const all = await readAllQuoteWorkSectionDefaults();

    // 🔴 제너레이터와 매쳐가 **다른 글자**여야 한다. 같게 나오면 한 양식의 문구를
    //    다른 양식에 붙여 쓰고 있는 것이고, 그때 증상은 「매쳐 견적서에 제너레이터
    //    문구가 붙는」 것이다(storage/quote-template.ts 의 readAllQuoteWorkSectionDefaults).
    assert.equal(all["GENERATOR:DOMESTIC"].INVESTIGATION.label, "인수 조사");
    assert.equal(all["MATCHER:DOMESTIC"].INVESTIGATION.label, "조사작업");

    // 🔴 `통전검사[출하검사]` — **찾을 때 쓰는 글자와 보여 주는 글자가 다른** 자리다.
    //    앞부분(`통전검사`)만 보고 찾지만(prefix 매칭), 화면에는 양식에 적힌 통째로
    //    보여야 한다. 이 단언이 깨지면 「찾은 글자를 그대로 되돌려주는」 버그다.
    assert.equal(all["GENERATOR:DOMESTIC"].POWER_TEST.label, "통전검사[출하검사]");

    // O/H 의 ② 는 내자와 다르다 — 양식별 채우개의 라벨을 정말로 가져다 쓰는가.
    assert.equal(all["GENERATOR:DOMESTIC"].REPAIR.label, "수리 작업");
    assert.equal(all["GENERATOR:OVERHAUL"].REPAIR.label, "OH 및 수리 작업");
  });

  test("🔴 행 번호를 박지 않는다 — 매쳐 내자(34행)와 O/H(39행)가 **둘 다** 읽힌다", { skip: skipReason }, async () => {
    const all = await readAllQuoteWorkSectionDefaults();
    const domestic = all["MATCHER:DOMESTIC"];
    const overhaul = all["MATCHER:OVERHAUL"];

    /**
     * 🔴 **이 시험의 요점.** 같은 매쳐 양식인데 부품 줄 수가 달라 아래가 통째로
     * 밀려 있다 — 조사작업 머리글이 내자는 34행, O/H 는 39행이다. 행을 박아 두면
     * 한쪽만 읽히거나 엉뚱한 글자를 읽어 온다.
     *
     * 그래서 **둘의 조사 · 통전 목록이 글자까지 같아야 한다**(같은 문서의 같은
     * 구역이다). 한쪽만 비거나 서로 다르면 행을 박은 것이다.
     *
     * 값을 숫자로 박지 않고 **둘을 견주는** 까닭: 사람이 양식에 한 줄을 더하는 날
     * 「6」을 박아 둔 시험은 규칙이 멀쩡한데도 실패한다. 재려는 것은 개수가 아니라
     * **행에 의존하지 않는다**는 것이다. (2026-09-22 실측은 조사 6줄 · 통전 6줄.)
     */
    assert.deepEqual(
      domestic.INVESTIGATION.items,
      overhaul.INVESTIGATION.items,
      "매쳐 두 양식의 조사 목록이 다르다 — 행 번호를 박았을 때 나는 증상이다"
    );
    assert.deepEqual(
      domestic.POWER_TEST.items,
      overhaul.POWER_TEST.items,
      "매쳐 두 양식의 통전 목록이 다르다 — 행 번호를 박았을 때 나는 증상이다"
    );

    // 🔴 그러면서 **수리작업은 서로 달라야 한다**(내자 2줄 · O/H 3줄, `OH작업` 이 있다).
    //    전부 같게 나오면 두 경로가 같은 파일을 가리키고 있다는 뜻이고, 그때는 위
    //    deepEqual 이 통과해도 아무것도 증명하지 못한다.
    assert.notDeepEqual(
      domestic.REPAIR.items,
      overhaul.REPAIR.items,
      "매쳐 내자와 O/H 의 수리 목록이 같다 — 두 환경변수가 같은 파일을 가리키는지 확인할 것"
    );
  });

  test("🔴 케이블은 작업 범위 구역이 없다 — 파일을 열지도 않고 **머리글까지 빈 채로** 돌려준다", { skip: skipReason }, async () => {
    const all = await readAllQuoteWorkSectionDefaults();
    const cable = all["CABLE"];
    assert.ok(cable, "CABLE 양식 구분이 없다");

    for (const section of ["INVESTIGATION", "REPAIR", "POWER_TEST"] as const) {
      assert.deepEqual(cable[section].items, [], `CABLE/${section} — 없는 구역에서 항목이 나왔다`);

      /**
       * 🔴 **머리글이 빈 글자인 것이 「파일을 열지 않았다」는 증거다.**
       * 경로는 설정돼 있고 파일도 실재한다(위 skip 판정이 그것을 확인했다). 그런데도
       * 빈 글자인 것은 `scanWorkScope` 가 `workScopeLabels` 가 없는 양식이라 보고
       * **읽기 전에 돌아섰기** 때문이다(NO_WORK_SCOPE_LABELS). 만약 다른 양식의
       * 라벨(`조사작업` 등)이 여기 나오면, 케이블 견적서 미리보기에 매쳐 문구가
       * 붙는다 — 없는 구역의 이름이 생기는 것이다.
       */
      assert.equal(
        cable[section].label,
        "",
        `CABLE/${section} — 머리글이 붙었다. 다른 양식의 문구가 새어 들었거나 파일을 열었다`
      );
    }
  });

  test("🔴 경로가 없으면 **던지지 않고 빈 목록**이다 — 양식 하나 때문에 견적서를 못 쓰게 되면 안 된다", async () => {
    // 🔴 이 시험만 skip 이 없다. 양식이 **없는** 상태를 재는 것이므로 양식이 없는
    //    환경에서도 뜻이 있다.
    const saved = new Map<string, string | undefined>();
    for (const key of TEMPLATE_PATH_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }

    try {
      // 던지지 않는다 — 이 한 줄이 이 시험의 전부다.
      const all = await readAllQuoteWorkSectionDefaults();

      // 다섯이 그대로 있고, 항목만 비어 있다. 🔴 구분이 사라지면 화면에서
      // `workScopeDefaults[key]` 가 undefined 가 되고, 그것은 빈 목록과 다른 길이다.
      for (const key of [
        "GENERATOR:DOMESTIC",
        "GENERATOR:OVERHAUL",
        "MATCHER:DOMESTIC",
        "MATCHER:OVERHAUL",
        "CABLE",
      ]) {
        assert.ok(all[key], `${key} — 경로가 없을 때 양식 구분이 사라졌다`);
        for (const section of ["INVESTIGATION", "REPAIR", "POWER_TEST"] as const) {
          assert.deepEqual(all[key][section].items, [], `${key}/${section} — 어디선가 항목이 나왔다`);
        }
      }

      // 🔴 머리글은 **남는다**(채우개가 든 글자다 — 파일을 안 읽어도 안다). 화면이
      //    양식 문구로 칸 이름을 그릴 수 있어야 한다.
      assert.equal(all["MATCHER:DOMESTIC"].INVESTIGATION.label, "조사작업");
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("케이블 견적서 줄 수 상한 — 화면이 미리 막는 숫자", () => {
  test("🔴 CABLE_QUOTE_MAX_LINES 는 품목 자리 수와 같다 — 아홉", () => {
    /**
     * 케이블 양식은 품목 자리가 아홉이고 줄을 늘리지 않는다. 열째를 넣으면 채우개가
     * **자르지 않고 던진다**(validateCableQuoteInput). 그래서 편집 화면이 줄을 더하는
     * 자리에서 미리 막고, 그 숫자를 두 페이지가 프롭(`cableMaxLines`)으로 넘긴다.
     *
     * 🔴 조각 3b-1 때는 이 숫자가 `domain/cable-quote-lines.ts` 에 **손으로 적힌 9**
     * 였다(채우개가 이 저장소에 없었다). 3c-1 이 채우개를 들여오며 그 파일을 지웠고,
     * 이제 숫자가 한 벌이다. 이 시험이 그 한 벌임을 지킨다.
     */
    assert.equal(CABLE_QUOTE_MAX_LINES, CABLE_QUOTE_ITEM_ROWS.length);
    assert.equal(CABLE_QUOTE_MAX_LINES, 9);

    // 자리는 한 줄씩 띄어 있다(품목 줄 사이에 서식 줄이 낀다). 실측값이다.
    assert.deepEqual(CABLE_QUOTE_ITEM_ROWS, [27, 29, 31, 33, 35, 37, 39, 41, 43]);
  });
});
