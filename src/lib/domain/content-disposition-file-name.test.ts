import { test } from "node:test";
import assert from "node:assert/strict";
import { fileNameFromContentDisposition } from "./content-disposition-file-name";
import { buildQuoteFileName, quoteContentDisposition } from "./quote-file-name";

/**
 * ============================================================================
 * 🔴 A/S 에서 가져온 시험이다 — **바이트 동일**이다 (조각 PO 3c-3, 2026-09-28)
 * ============================================================================
 * 원본은 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/domain/content-disposition-file-name.test.ts` —
 * 2026-09-28 실측 46줄). 곁 파일과 함께 왔다(그 파일 머리말의 까닭).
 *
 * 🔴 아래 머리말의 **ServiceReportForm(검사·수리 보고서)은 이 사이트에 없다** —
 * 보고서 기능이 아예 없다. 그래도 재는 것은 그대로다: 이 사이트에서도 견적서
 * 발행 통로가 싣는 헤더를 끝까지 되읽어야 한다.
 * ============================================================================
 */

/**
 * ============================================================================
 * Content-Disposition 에서 파일 이름 꺼내기 — ServiceReportForm 에서 옮긴 함수 그대로
 * ============================================================================
 * 옮기기 전과 **같은 답**이어야 한다(검사·수리 보고서 내려받기가 그대로 이것을 쓴다). 그리고
 * 견적서 발행 통로가 싣는 헤더(quoteContentDisposition)를 끝까지 되읽어야 한다.
 * ============================================================================
 */

test("헤더가 없거나 비었으면 null", () => {
  assert.equal(fileNameFromContentDisposition(null), null);
  assert.equal(fileNameFromContentDisposition(""), null);
  assert.equal(fileNameFromContentDisposition("attachment"), null);
});

test("🔴 견적서 발행 통로가 싣는 헤더를 한글 이름 그대로 되읽는다", () => {
  const fileName = buildQuoteFileName({ quoteNumber: "DSS 2026-077", customerName: "㈜아이씨디" });
  assert.equal(fileNameFromContentDisposition(quoteContentDisposition(fileName)), fileName);
  assert.equal(fileName, "견적서_DSS 2026-077_㈜아이씨디.xlsx");
});

test("두 벌이 다 있으면 UTF-8 쪽이 이긴다 — ASCII 쪽은 한글이 `_` 로 바뀌어 있다", () => {
  const header = "attachment; filename=\"_____.xlsx\"; filename*=UTF-8''%EA%B2%AC%EC%A0%81%EC%84%9C.xlsx";
  assert.equal(fileNameFromContentDisposition(header), "견적서.xlsx");
});

test("UTF-8 쪽만 있어도 읽고, 대소문자와 앞뒤 공백을 가리지 않는다", () => {
  assert.equal(fileNameFromContentDisposition("attachment; FILENAME*=utf-8''%ED%95%9C.xlsx"), "한.xlsx");
  assert.equal(fileNameFromContentDisposition("attachment; filename*=UTF-8''%ED%95%9C.xlsx ; size=3"), "한.xlsx");
});

test("🔴 UTF-8 쪽이 깨졌으면 던지지 않고 ASCII 쪽으로 물러선다", () => {
  const header = "attachment; filename=\"report.xlsx\"; filename*=UTF-8''%E0%A4%A";
  assert.equal(fileNameFromContentDisposition(header), "report.xlsx");
});

test("ASCII 쪽만 있으면 그것, 빈 이름이면 null", () => {
  assert.equal(fileNameFromContentDisposition('attachment; filename="report.xlsx"'), "report.xlsx");
  assert.equal(fileNameFromContentDisposition('attachment; filename=""'), null);
  assert.equal(fileNameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A"), null);
});
