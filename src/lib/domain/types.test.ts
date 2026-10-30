import { test } from "node:test";
import assert from "node:assert/strict";

import { repairStatusEnum } from "@dss/core/schema";
import { REPAIR_STATUS_CODES } from "./types";

/**
 * ============================================================================
 * 접수 건 상태 축이 **DB 와 같은 글자인가** (2026-10-30)
 * ============================================================================
 * `domain/types.ts` 는 A/S 의 같은 이름 파일에서 이 축만 떼어 온 사본이다(그 파일
 * 머리말). 사본인 이상 **언젠가 한쪽만 고쳐지는 날**이 오고, 그때 이 사이트는
 * 오류 하나 없이 조용히 틀린다 — 「납기 역전」은 `"SHIPMENT_COMPLETED"` 글자
 * 하나로 이미 나간 건을 거르므로(domain/due-date-inversion.ts), 글자가 어긋나면
 * 비교가 영영 거짓이 되어 **지난 건에까지 붉은 글이 남는다.** 타입은 그것을
 * 잡아 주지 못한다(양쪽 다 제 사본을 믿는다).
 *
 * 🔴 그래서 **DB 의 이넘과 맞대어 본다.** 두 사이트가 같은 `dss_as` 를 보고 표
 * 정의는 공용 묶음 한 벌이므로(vendor/dss-core), 그쪽 `repair_status` 가 이
 * 축의 유일한 기준이다. A/S 쪽에도 같은 일을 하는 시험이 있다
 * (저쪽 workflow-rules-parity.test.ts). 이 사이트가 쓰는 대조 방법은
 * attachment-category.test.ts · quote-approval-rules.test.ts 와 같다.
 *
 * ⚠️ **차례까지 본다.** 집합만 맞추면 되는 것 아니냐고 할 수 있지만, 차례가
 * 어긋났다는 것은 곧 **한쪽이 손으로 고쳐졌다**는 뜻이고 그런 사본은 다음 번에
 * 값까지 어긋난다. 여기서 막는 것은 어긋남 자체가 아니라 사본이 따로 노는 일이다.
 * ============================================================================
 */

test("🔴 접수 건 상태 축이 DB 의 repair_status 와 글자도 차례도 같다", () => {
  // 표본 확인 — 양쪽이 비어 있어서 공짜로 통과하는 일을 막는다.
  assert.ok(REPAIR_STATUS_CODES.length > 0, "이쪽 축이 비어 있다");
  assert.ok(repairStatusEnum.enumValues.length > 0, "DB 이넘이 비어 있다");

  assert.deepEqual([...REPAIR_STATUS_CODES], [...repairStatusEnum.enumValues]);
});

test("🔴 「이미 나갔다」를 가르는 그 글자가 양쪽에 실제로 있다", () => {
  // 이 한 글자가 「납기 역전」의 출하 거르기 전부다(domain/notifications.ts 의
  // isRepairCaseShipmentFinished). 위 대조가 통과해도 **양쪽이 함께 틀렸다면**
  // 알 수 없으므로, 글자 자체를 여기 한 번 적어 둔다.
  assert.ok(REPAIR_STATUS_CODES.includes("SHIPMENT_COMPLETED"));
  assert.ok(repairStatusEnum.enumValues.includes("SHIPMENT_COMPLETED"));
});
