import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { quoteKindEnum } from "@dss/core/schema";

import { STORED_QUOTE_KINDS, quoteKindLabels } from "./quote-input";

/**
 * ============================================================================
 * 🔴 목록의 종류 딱지가 **DB 가 내줄 수 있는 값을 전부 덮는가**
 * ============================================================================
 * 견적서 목록 화면(한 벌 — `vendor/dss-core/src/ui/quotes/`)은 브라우저 묶음에
 * 실린다. 거기서 `quotes.kind` 이넘을 직접 읽으면 표 정의와 drizzle 이 통째로
 * 따라 실리므로, 그쪽 파일은 종류 목록을 **글자로 다시 적어 두었다**
 * (quote-list-rows.ts 의 STORED_QUOTE_KINDS 머리말).
 *
 * 그래서 값이 갈라질 수 있다. 🔴 **갈라지지 않게 지키는 자리가 여기다.**
 * 스키마에 종류가 하나 더 생기면(2026-09-16 의 `CABLE` 이 그랬다) 이 시험이 먼저
 * 깨진다 — 그러지 않으면 새 종류의 견적서가 목록에서 **이름표 없이**(또는 남의
 * 딱지를 달고) 그려진다.
 *
 * 화면은 `Record<StoredQuoteKind, string>` 이라 컴파일러가 이름표 빠짐을 잡지만,
 * 그건 **두 목록이 같다는 전제** 위에서의 이야기다. 그 전제를 여기서 본다.
 * ============================================================================
 */

describe("견적서 종류", () => {
  test("🔴 스키마의 quote_kind 이넘과 같은 셋이다", () => {
    assert.deepEqual([...STORED_QUOTE_KINDS].sort(), [...quoteKindEnum.enumValues].sort());
  });

  test("🔴 DB 가 내줄 수 있는 값마다 이름표가 있다 — 목록은 읽어 온 값을 그대로 그린다", () => {
    for (const kind of quoteKindEnum.enumValues) {
      const label = (quoteKindLabels as Record<string, string | undefined>)[kind];
      assert.ok(label && label.trim() !== "", `${kind} 의 이름표가 없다`);
    }
  });

  test("이름표가 A/S 와 같은 글자다 — 같은 견적서가 두 화면에서 다른 이름으로 보이지 않게", () => {
    assert.deepEqual(quoteKindLabels, {
      DOMESTIC: "내자 견적서",
      OVERHAUL: "OH 견적서",
      CABLE: "케이블 견적서",
    });
  });
});
