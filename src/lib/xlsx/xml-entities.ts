/**
 * ============================================================================
 * XML 글자 풀기
 * ============================================================================
 * 🔴 조각 3e-1 로 A/S 관리 시스템의 **같은 이름 · 같은 경로** 파일
 * (`RF_Service_System/src/lib/xlsx/xml-entities.ts`)에서 가져왔다. 머리말 아래 코드는
 * 저쪽과 **한 바이트도 다르지 않다.**
 *
 * 저쪽 머리말은 `decodeXmlEntities` 가 `scripts/lib/xlsx/ooxml-parser.ts` 에서 옮겨 온
 * 것이고 그 파일이 다시 내보내기만 한다고 적어 두었다. **이 사이트에는 `scripts/lib/`
 * 가 없다** — 그 읽개는 A/S 것이다. 여기서는 이 파일이 원본이고 다시 내보내는 곳도 없다.
 *
 * ⚠️ `decodeXmlEntities` 는 **이 사이트에서 아직 아무도 부르지 않는다.** 지우지 않은
 * 까닭: 저쪽과 코드를 바이트 동일하게 두는 것이 이 조각의 규칙이고, 두 함수가 같은
 * 자리에 있어야 「왜 한쪽만 숫자 참조를 푸나」라는 아래 설명이 읽힌다. 지금 쓰이는
 * 것은 `decodeXmlCharacterData` 뿐이다(sheet-grid.ts · handwritten-quote-reader.ts).
 *
 * `decodeXmlCharacterData` 는 새 것이다. 위 함수는 숫자 참조(`&#10;`)를 풀지 않는다.
 * 그렇다고 위 함수 **뒤에** 숫자 참조 풀기를 한 번 더 돌리면 `&amp;#10;` 이 줄바꿈이
 * 되어 버린다(두 번 풀린다). 한 정규식으로 한 번에 풀어야 그런 글자가 없다.
 * ============================================================================
 */

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
};

/** 이름 있는 다섯 개와 숫자 참조(`&#10;` · `&#x3042;`)를 **한 번에** 푼다. */
export function decodeXmlCharacterData(s: string): string {
  return s.replace(
    /&(?:(lt|gt|quot|apos|amp)|#([0-9]+)|#[xX]([0-9a-fA-F]+));/g,
    (whole: string, named: string | undefined, decimal: string | undefined, hex: string | undefined) => {
      if (named !== undefined) return NAMED_ENTITIES[named];
      const codePoint =
        decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? "", 16);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return whole;
      return String.fromCodePoint(codePoint);
    }
  );
}
