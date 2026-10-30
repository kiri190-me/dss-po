/**
 * ============================================================================
 * 🔴 이 사이트(PO/내자)에서 이 파일이 무엇인가 — 먼저 읽을 것
 * ============================================================================
 * A/S 관리 시스템의 `src/lib/domain/types.ts` 에서 **접수 건 상태 축 하나만**
 * 떼어 왔다(2026-10-30, 「납기 역전」 조각). 저쪽 파일은 405줄짜리 워크플로 사전이고
 * — 단계 key · 전이 규칙 · 상세 화면이 쓰는 행 타입 · 납기 지연 판정까지 —
 * 그 대부분은 **A/S 접수와 수리 건 상세**의 것이라 이 사이트에는 쓰는 화면이 없다.
 * `domain/workflow-kind.ts` 가 같은 파일에서 종류 축만 떼어 온 것과 같은 판단이고
 * 같은 까닭이다(그 파일 머리말).
 *
 * 🔴 **이름도 자리도 저쪽과 같게 둔다.** 「납기 역전」 판정이 저쪽에서 이 타입을
 * `./types` 로 들여오는데(domain/due-date-inversion.ts), 여기서 이름이나 경로를
 * 바꾸면 그 파일이 더는 **머리말 아래 바이트 동일**일 수 없다. 두 저장소를 맞대어
 * 보는 일이 이 사이트의 유일한 보증이라(이 저장소의 여러 파일 머리말), 한쪽에서만
 * 바뀐 곳을 찾기 어려워지는 쪽이 「파일 하나에 상수 둘」보다 비싸다.
 *
 * 🔴 **값은 DB 의 `repair_status` 축 그대로다.** 글자를 여기서 바꾸면 조회가
 * 내려보내는 값과 어긋나는데 **오류는 나지 않는다** — 비교가 영영 거짓이 될 뿐이고,
 * 그날 「납기 역전」 경보는 조용히 꺼진다(아무도 신고하지 않는 종류의 결함이다).
 * 그래서 공용 묶음의 이넘과 **맞대어 보는 시험**을 곁에 둔다(types.test.ts —
 * `@dss/core/schema` 의 repairStatusEnum). A/S 에는 같은 일을 하는 시험이 따로 있다
 * (저쪽 workflow-rules-parity.test.ts).
 *
 * ⚠️ **이 파일에서 그 이넘을 직접 들여오지는 않는다.** 이 타입을 쓰는 판정이
 * `"use client"` 화면까지 닿으므로(components/domestic-orders/DomesticOrderListScreen),
 * 여기서 `@dss/core/schema` 를 끌어들이면 drizzle 한 벌이 브라우저 묶음에 실린다.
 * 들여오는 것은 **시험뿐**이다 — 시험은 브라우저에서 돌지 않는다.
 * ============================================================================
 */

// 데모 전용 단순화 상태 값이다. 실제 스키마는 workflow_version/current_step +
// nullable exception_status 조합으로 표현되며(DATABASE_DESIGN.md 13번),
// 이 평탄화된 상태는 Phase 2/3의 정규 모델로 대체될 예정이다.
export const REPAIR_STATUS_CODES = [
  "WAITING_INTAKE_INSPECTION",
  "INTAKE_INSPECTION_IN_PROGRESS",
  "INTAKE_INSPECTION_COMPLETED",
  "WAITING_KYOSAN_REPLY",
  "WAITING_PO",
  "WAITING_PARTS_SUPPLY",
  "WAITING_REPAIR",
  "IN_REPAIR",
  "REPAIR_COMPLETED",
  "WAITING_SHIPMENT_APPROVAL",
  "WAITING_SHIPMENT",
  "SHIPMENT_COMPLETED",
] as const;
export type RepairStatus = (typeof REPAIR_STATUS_CODES)[number];
