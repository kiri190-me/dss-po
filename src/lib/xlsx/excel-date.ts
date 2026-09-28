/**
 * ============================================================================
 * Excel 날짜 일련번호 → `YYYY-MM-DD`
 * ============================================================================
 * 🔴 조각 3e-1 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/xlsx/excel-date.ts`)에서 가져왔다. 머리말 아래 코드는
 * 저쪽과 **한 바이트도 다르지 않다.**
 *
 * 저쪽 머리말은 이 함수가 `scripts/lib/xlsx/repair-case-list-import.ts` 에서 옮겨 온
 * 것이고 그 파일이 다시 내보내기만 한다고 적어 두었다. **이 사이트에는 `scripts/lib/`
 * 가 없다** — 교산 인수품 가져오기는 A/S 것이다. 그래서 여기서는 이 파일이 원본이고
 * 다시 내보내는 곳도 없다.
 *
 * 🔴 지금 이 함수를 부르는 곳은 `handwritten-quote-reader.ts` 하나다(발행일자 칸의
 * 날짜 일련번호를 푼다).
 *
 *  · 1900 체계(기본) — Excel 이 1900 년을 윤년으로 잘못 세는 탓에 생긴 가짜
 *    1900-02-29(일련번호 60)는 null 이다.
 *  · 1904 체계 — workbook.xml 에 `<workbookPr date1904="1"/>` 이 걸린 통합문서.
 *    같은 날짜가 1462 만큼 작은 번호로 적힌다.
 *
 * 소수 부분(시각)은 버린다 — 이 저장소가 다루는 것은 날짜뿐이다.
 * ============================================================================
 */

export type ExcelDateSystem = "1900" | "1904";

export function excelSerialToDateOnly(
  serial: number,
  dateSystem: ExcelDateSystem
): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const wholeDays = Math.floor(serial);
  if (dateSystem === "1900" && wholeDays === 60) return null; // Excel's fictional 1900-02-29.
  const epoch = dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1900, 0, 1);
  const dayOffset = dateSystem === "1904" ? wholeDays : wholeDays - (wholeDays > 60 ? 2 : 1);
  const date = new Date(epoch + dayOffset * 86_400_000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
