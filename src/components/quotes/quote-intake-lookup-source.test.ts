import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ============================================================================
 * 인수번호로 불러오기 — 조각 3b-3 **앞쪽 절반**이 지켜야 하는 것
 * ============================================================================
 * 이 조각이 한 일은 셋이다: 조회(`lookupIntakeForQuote`) · 서버 액션
 * (`lookupIntakeForQuoteAction`, 문턱 READ) · 폼의 [불러오기] 단추와 `handleLookup`.
 *
 * 🔴 **가장 큰 값은 여섯 칸 자동 채우기가 아니다.** `repairCaseId`(이 견적서가 어느
 * 수리 건의 것인가)를 채우는 자리가 `handleLookup` **하나**이고, 그 값이 비면 저장된
 * 견적서가 수리 건 상세의 「견적서」 탭에 **영영 나타나지 않는다.** 아래 첫 묶음이
 * 그 한 자리를 못 박는다.
 *
 * ── 여기서 지키는 것 ────────────────────────────────────────────────────
 *  1. 조회를 **쪼개지 않았다** — 출고 부품 · O/H 템플릿까지 한 함수가 함께 준다.
 *  2. 못 찾은 것은 **오류가 아니다**(`found: null`), 빈 문자열은 **DB 를 열지 않는다**.
 *  3. 문턱은 **READ** 하나이고, 저장하는 액션들의 문턱은 그대로다.
 *  4. 🔴 로그에 **인수번호를 담지 않는다**.
 *  5. `handleLookup` 이 **종류 · 엑셀 전용 · 부품 줄 · 작업 내역 · 고른 작업**을
 *     건드리지 않는다(A/S 의 quote-new-start.test.ts 가 같은 것을 못 박는다).
 *  6. 품명은 **비어 있을 때만**, 고객사명은 **값이 있을 때만** 채운다.
 *  7. 🔴 **뒤쪽 절반이 2026-09-22 에 들어왔다** — 참고 목록 둘 · 부품 고르개 · 담기.
 *     그 세 항목은 울타리에서 **「있어야 하는 것」으로 뒤집혔다**(아래 그 묶음의
 *     머리말에 까닭을 적었다). 남은 울타리는 **자동 불러오기 effect** 하나다(조각 4·5).
 *  8. 🔴 **못 찾음 · 오류 갈래가 받아 온 목록 셋을 비운다** — 사본에는 어느 인수번호의
 *     것인지가 적혀 있지 않아, 근거가 없어지면 함께 없어져야 한다. 🔴 그러면서
 *     **사람이 칠 수 있는 칸은 하나도 건드리지 않는다**(위 5번의 그 단언을 약하게
 *     만들지 않고 따로 더했다).
 *
 * ── 왜 렌더하지 않고 원본을 읽는가 ──────────────────────────────────────
 * QuoteEditForm 은 **서버 액션을 직접 import 하는 클라이언트 컴포넌트**라, 그 사슬
 * 끝의 `server-only` 때문에 react-server 조건 없이 도는 `npm test` 에서는 import
 * 자체가 던진다(react-server 조건으로 돌리면 이번에는 useState 가 없다). 이웃 시험
 * (quote-edit-work-scope-suppression.test.ts · quote-list-screen-source.test.ts)과
 * 같은 방법으로 원본을 글자로 읽는다.
 *
 * 🔴 **자료의 규칙은 진짜 DB 가 본다** — lib/db/queries/quote-intake-lookup.integration.test.ts
 * (출고된 것만 센다 · 소유구분 짝 · 단가 null 과 0 의 구분). 여기서 보는 것은
 * **층과 화면의 약속**이다.
 * ============================================================================
 */

const repoUrl = new URL("../../../", import.meta.url);
/** CRLF 로 받아 둔 저장소에서도 표지가 맞도록 LF 로 맞춘다. */
const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, repoUrl), "utf8").replace(/\r\n/g, "\n");
/** 줄바꿈·들여쓰기 차이로 시험이 깨지지 않도록 공백을 하나로 접는다. */
const flat = (source: string) => source.replace(/\s+/g, " ");

/** 원본에서 **한 갈래만** 잘라낸다 — 파일 전체에 걸면 이웃 갈래에 걸린다. */
const sliceBetween = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `원본에서 '${startMarker}' 를 찾지 못했다`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `원본에서 '${endMarker}' 를 찾지 못했다`);
  return source.slice(start, end);
};

const indexOrFail = (source: string, marker: string) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `원본에서 '${marker}' 를 찾지 못했다`);
  return at;
};

const querySource = read("src/lib/db/queries/quotes.ts");
const actionSource = read("src/lib/server/actions/quotes.ts");
const formSource = read("src/components/quotes/QuoteEditForm.tsx");
const form = flat(formSource);

/** 조회 한 함수. 이 파일의 마지막 함수라 시작 표지부터 끝까지다. */
const lookupQuery = flat(
  querySource.slice(indexOrFail(querySource, "export async function lookupIntakeForQuote("))
);
/** 액션 한 함수. 다음 머리말(휴지통 묶음)이 끝 표지다. */
const lookupAction = flat(
  sliceBetween(actionSource, "export async function lookupIntakeForQuoteAction(", "\n/**\n * 휴지통의 관문")
);
const readingUserHelper = flat(
  sliceBetween(actionSource, "async function resolveReadingUser()", "\n/**")
);
/**
 * 폼의 [불러오기] 한 덩이.
 *
 * 🔴 끝 표지가 **그 함수의 닫는 괄호**다(`\n  }\n` — 두 칸 들여쓴 `}`). 함수 안의
 * 블록들은 전부 네 칸 이상이라 이것이 처음 나오는 자리가 곧 함수의 끝이다.
 * 예전에는 `function updateItem(` 을 끝으로 삼았는데, 조각 3b-3 뒤쪽 절반이 그 사이에
 * **담기 함수 둘**을 넣자 슬라이스가 그것까지 삼켜 「불러오기가 setItems 를 부른다」는
 * 거짓 실패가 났다. 이웃 함수의 이름에 매달지 않는다.
 */
const handleLookup = flat(sliceBetween(formSource, "async function handleLookup() {", "\n  }\n"));

describe("조회 — lookupIntakeForQuote 를 쪼개지 않고 옮겼다", () => {
  test("🔴 한 함수가 출고 부품 · O/H 템플릿 · 기종 코드까지 함께 돌려준다", () => {
    // 쪼개면 A/S 와 두 벌이 되고, 뒤쪽 절반(참고 목록 화면)이 올 때 또 고쳐야 한다.
    for (const marker of [
      "usedParts: [...byPartAndOwner.values()],",
      "ohTemplateCode: row.ohTemplateCode,",
      "ohTemplateParts,",
    ]) {
      assert.ok(lookupQuery.includes(marker), `조회가 ${marker} 를 돌려주지 않는다`);
    }
    assert.ok(
      querySource.includes("export type QuoteIntakeLookup = {"),
      "반환 타입이 없다 — 액션과 폼이 같은 모양을 봐야 한다"
    );
  });

  test("없는 인수번호는 오류가 아니라 null 이다 — 접수 전에 견적을 내는 일이 있다", () => {
    assert.ok(lookupQuery.includes("if (!row) return null;"), lookupQuery.slice(0, 400));
  });

  test("🔴 휴지통의 접수 건도 찾는다 — is_deleted 로 좁히지 않는다", () => {
    assert.ok(lookupQuery.includes(".where(eq(repairCases.intakeNumber, intakeNumber))"));
    assert.equal(
      lookupQuery.includes("repairCases.isDeleted"),
      false,
      "지워진 접수 건을 빼고 있다 — 그러면 사람이 같은 값을 손으로 다시 적는다"
    );
  });

  test("출고된 것만 센다 — 요청만 하고 안 나간 부품을 청구하지 않는다", () => {
    assert.ok(lookupQuery.includes("gt(inventoryPartRequestItems.issuedQuantity, 0)"));
  });

  test("🔴 권한 검사가 조회에 없다 — 세션과 문턱은 액션 층의 일이다", () => {
    for (const marker of ["hasPermission", "getSessionUser"]) {
      assert.equal(
        querySource.includes(marker),
        false,
        `읽는 층에 ${marker} 가 들어왔다 — 층이 섞이면 어디가 관문인지 알 수 없다`
      );
    }
  });
});

describe("서버 액션 — 문턱은 READ 하나다", () => {
  test("🔴 문턱이 READ 다 — 저장하지 않지만 접수 건 정보가 새므로 세션은 확인한다", () => {
    assert.ok(readingUserHelper.includes("const actingUser = await getSessionUser();"), readingUserHelper);
    assert.ok(
      readingUserHelper.includes('if (!(await hasPermission(actingUser, "quotes", "READ")))'),
      readingUserHelper
    );
  });

  test("🔴 세션 확인이 맨 앞이다 — 그 뒤에 입력을 본다", () => {
    assert.ok(
      indexOrFail(lookupAction, "const auth = await resolveReadingUser();") <
        indexOrFail(lookupAction, "input?.intakeNumber"),
      "입력을 먼저 보고 있다 — 로그인하지 않은 요청이 무엇이 유효한지 알아낼 수 있게 된다"
    );
  });

  test("🔴 저장하는 액션의 문턱은 그대로다 — READ 헬퍼는 불러오기 하나만 쓴다", () => {
    // 새 헬퍼가 저장 통로에 잘못 걸리면 WRITE 로 막혀 있던 조작이 READ 로 열린다.
    assert.equal(
      actionSource.split("await resolveReadingUser();").length - 1,
      1,
      "READ 헬퍼를 부르는 곳이 불러오기 하나가 아니다"
    );
    assert.ok(actionSource.includes('hasPermission(actingUser, "quotes", "WRITE")'));
    assert.ok(actionSource.includes('hasPermission(actingUser, "quotes", "MANAGE")'));
    for (const action of ["createQuoteAction", "updateQuoteAction"]) {
      // 끝 표지가 `\n}\n` 이다 — `\n}` 로 끊으면 여러 줄 입력 타입을 닫는
      // `}): Promise<…> {` 줄에 걸려 함수 몸통 앞에서 잘린다.
      const slice = flat(sliceBetween(actionSource, `export async function ${action}(`, "\n}\n"));
      assert.ok(slice.includes("await resolveWritingUser();"), `${action} 의 문턱이 WRITE 가 아니다`);
    }
    for (const action of ["deleteQuoteAction", "restoreQuoteAction", "permanentlyDeleteQuoteAction"]) {
      // 끝 표지가 `\n}\n` 이다 — `\n}` 로 끊으면 여러 줄 입력 타입을 닫는
      // `}): Promise<…> {` 줄에 걸려 함수 몸통 앞에서 잘린다.
      const slice = flat(sliceBetween(actionSource, `export async function ${action}(`, "\n}\n"));
      assert.ok(slice.includes("await resolveDeletingUser();"), `${action} 의 문턱이 MANAGE 가 아니다`);
    }
  });

  test("빈 문자열은 DB 를 열지 않는다", () => {
    assert.ok(
      indexOrFail(lookupAction, 'if (intakeNumber === "") return { ok: true, found: null };') <
        indexOrFail(lookupAction, "await lookupIntakeForQuote(intakeNumber)"),
      "빈 값으로도 조회를 부르고 있다"
    );
  });

  test("못 찾은 것은 ok:false 가 아니다 — found: null 로 돌려준다", () => {
    assert.ok(lookupAction.includes("return { ok: true, found: await lookupIntakeForQuote(intakeNumber) };"));
  });

  test("🔴 로그에 인수번호를 담지 않는다 — 어느 고객사의 어느 장비인지를 가리키는 글자다", () => {
    assert.ok(
      lookupAction.includes('console.error("lookupIntakeForQuoteAction: unexpected DB error", err);'),
      lookupAction
    );
    for (const logLine of actionSource.split("\n").filter((line) => line.includes("console.error("))) {
      assert.equal(
        logLine.includes("intakeNumber"),
        false,
        `로그에 인수번호가 섞였다: ${logLine.trim()}`
      );
    }
  });
});

describe("폼 — [불러오기] 한 자리", () => {
  test("🔴 repairCaseId 를 채우는 곳은 handleLookup 하나다 — 그 값이 비면 수리 건 탭에서 사라진다", () => {
    assert.equal(
      form.split("setRepairCaseId(").length - 1,
      1,
      "repairCaseId 를 채우는 곳이 둘 이상이다 — 폼을 채우는 길이 둘이 되면 서로 다른 값이 들어온다"
    );
    assert.ok(handleLookup.includes("setRepairCaseId(found.repairCaseId);"), handleLookup);
    // 설정 함수를 꺼냈다 — 3b-1 에서는 getter 만 있어 이 값이 영영 null 이었다.
    assert.ok(form.includes("const [repairCaseId, setRepairCaseId] = useState<string | null>("));
  });

  test("🔴 종류 · 엑셀 전용 · 부품 줄 · 작업 내역 · 고른 작업을 건드리지 않는다", () => {
    for (const setter of [
      "setKind(",
      "setIsExcelOnly(",
      "setExcelOnlyStash(",
      "setItems(",
      "setScopeLines(",
      "setScopeTouched(",
      "setTaskQuantities(",
    ]) {
      assert.equal(handleLookup.includes(setter), false, `불러오기가 ${setter} 를 부른다`);
    }
    // 종류 · 엑셀 전용을 바꾸는 곳은 사람의 칸 하나씩이다 — 몰래 바꾸는 길이 없다.
    assert.equal(form.split("setKind(").length - 1, 1, "종류를 바꾸는 곳이 select 하나가 아니다");
    assert.equal(
      form.split("setIsExcelOnly(").length - 1,
      1,
      "엑셀 전용을 바꾸는 곳이 스위치 판정 하나가 아니다"
    );
  });

  test("품명은 **비어 있을 때만** 짓고, 지을 때 지금 종류를 쓴다", () => {
    assert.ok(handleLookup.includes('if (subject.trim() === "") {'), handleLookup);
    assert.ok(
      handleLookup.includes(
        "buildQuoteSubject({ modelName: found.modelName, faultDescription: found.faultDescription, kind, })"
      ),
      handleLookup
    );
  });

  test("고객사명은 **값이 있을 때만**, 모델 · L/N · S/N · 신고증상은 무조건 덮는다", () => {
    assert.ok(handleLookup.includes("if (found.customerName) setCustomerNameText(found.customerName);"));
    for (const line of [
      'setModelNameText(found.modelName ?? "");',
      'setLotNumberText(found.lotNumber ?? "");',
      'setSerialNumberText(found.serialNumber ?? "");',
      'setFaultDescriptionText(found.faultDescription ?? "");',
    ]) {
      assert.ok(handleLookup.includes(line), `${line} 가 없다`);
    }
  });

  test("못 찾으면 회색 안내만 — 다른 칸은 한 개도 건드리지 않는다", () => {
    const notFound = sliceBetween(handleLookup, "if (!result.found) {", "const found = result.found;");
    for (const setter of [
      "setRepairCaseId(",
      "setCustomerId(",
      "setCustomerNameText(",
      "setModelNameText(",
      "setLotNumberText(",
      "setSerialNumberText(",
      "setFaultDescriptionText(",
      "setSubject(",
    ]) {
      assert.equal(notFound.includes(setter), false, `못 찾았는데 ${setter} 를 부른다`);
    }
  });

  test("🔴 불러온 값 셋을 상태에 담는다 — 조회를 쪼개지 않았으므로 버리지도 않는다", () => {
    for (const line of [
      "setUsedParts(found.usedParts);",
      "setOhTemplateCode(found.ohTemplateCode);",
      "setOhTemplateParts(found.ohTemplateParts);",
    ]) {
      assert.ok(handleLookup.includes(line), `${line} 가 없다 — 뒤쪽 절반이 쓸 값을 버리고 있다`);
    }
  });

  test("🔴 단추가 케이블 견적서에는 없다 — 고칠 물건이 없는 별도 견적서다", () => {
    const section = sliceBetween(form, "{!isCable && ( <section", "{/* ── 상단 정보");
    assert.ok(section.includes("인수번호로 불러오기</h2>"), "구역 제목이 케이블 갈래 안에 없다");
    assert.ok(section.includes("onClick={handleLookup}"), "단추가 케이블 갈래 안에 없다");
  });

  test("저장 중 · 불러오는 중에는 단추가 잠긴다", () => {
    assert.ok(form.includes("disabled={disabled || isLookingUp}"));
    assert.ok(form.includes('{isLookingUp ? "불러오는 중…" : "불러오기"}'));
  });
});

/**
 * ============================================================================
 * 🔴 2026-09-22 — 이 묶음의 이름과 뜻을 다시 정했다 (조각 3b-3 뒤쪽 절반)
 * ============================================================================
 * 예전 이름은 「뒤쪽 절반의 것을 앞당기지 않았다」였고, 셋을 울타리로 막고 있었다:
 * 참고 목록 둘 · 부품 고르개 · 담기. **그 셋이 다 들어왔으므로** 울타리는 이제 막아야
 * 할 것이 아니다 — 단언을 지우지 않고 **있어야 하는 것**으로 뒤집어 같은 무게로
 * 못 박는다. 남은 울타리 하나는 그대로다: **자동 불러오기 effect**(조각 4·5).
 * ============================================================================
 */
describe("🔴 뒤쪽 절반이 들어왔다 · 조각 4·5 의 것은 아직 아니다", () => {
  test("🔴 불러온 값 셋을 **읽는 쪽이 열렸다** — 참고 목록 둘이 그것을 그린다", () => {
    for (const declaration of [
      'const [usedParts, setUsedParts] = useState<QuoteIntakeLookup["usedParts"]>([]);',
      "const [ohTemplateCode, setOhTemplateCode] = useState<string | null>(null);",
      'const [ohTemplateParts, setOhTemplateParts] = useState<QuoteIntakeLookup["ohTemplateParts"]>([]);',
    ]) {
      assert.ok(form.includes(declaration), `${declaration} 가 없다`);
    }
    // 🔴 화면이 실제로 **상태를 읽어** 그리는 자리들. 예전에는 이 목록이 「없어야
    // 하는 것」이었다(값을 담아 두고 그리지 않던 때).
    for (const reader of [
      "{usedParts.map((part) => {",
      "{ohTemplateParts.map((part, index) => {",
      "{ohTemplateCode && (",
      "const unaddedUsedParts = useMemo(",
      "const unaddedOhTemplateParts = useMemo(",
      "const addedSourceKeys = useMemo(",
    ]) {
      assert.ok(form.includes(reader), `${reader} 가 없다 — 참고 목록이 상태를 읽지 않는다`);
    }
  });

  test("🔴 담기는 함수 **하나**다 — 일괄 담기가 하나씩을 여러 번 부르지 않는다", () => {
    // 하나씩 담기를 여러 번 부르면 setItems 가 여러 번 돌아 「빈 첫 줄」 처리가
    // 중간 상태에 걸린다(A/S 그 함수의 머리말이 적어 둔 함정).
    for (const call of [
      "onClick={() => addUsedParts(unaddedUsedParts)}",
      "onClick={() => addUsedParts([part])}",
      "onClick={() => addOhTemplateParts(unaddedOhTemplateParts)}",
      "onClick={() => addOhTemplateParts([{ part, index }])}",
    ]) {
      assert.ok(form.includes(call), `${call} 가 없다`);
    }
    for (const loop of [".forEach((part) => addUsedParts", ".map((part) => addUsedParts"]) {
      assert.equal(form.includes(loop), false, `${loop} — 일괄 담기가 하나씩을 여러 번 부른다`);
    }
    // 담는 함수 둘 다 **목록을 받아 한 번의 setItems 로** 끝낸다.
    for (const body of [
      "function addUsedParts(list: readonly QuoteIntakeLookup[\"usedParts\"][number][]) { if (list.length === 0) return; setItems((prev) => {",
      "if (list.length === 0) return; setItems((prev) => {",
    ]) {
      assert.ok(form.includes(body), `${body} 가 없다`);
    }
  });

  test("🔴 같은 것을 두 번 담지 않는다 — sourceKey 로 판정한다", () => {
    // 두 번 담기면 같은 부품이 두 줄이 되어 **청구가 두 배**가 되는데, 화면만 보고는
    // 실수인지 뜻인지 구별되지 않는다.
    assert.ok(form.includes('return `issued:${part.partId}|${part.owner ?? ""}`;'), "출고 줄 열쇠가 (부품, 소유구분) 이 아니다");
    assert.ok(form.includes("return `ohtpl:${index}`;"), "템플릿 줄 열쇠가 접두사로 갈라져 있지 않다");
    assert.ok(
      form.includes(
        "new Set(items.map((row) => row.sourceKey).filter((key): key is string => key !== null))"
      ),
      "이미 담은 것을 세지 않는다"
    );
    for (const skip of [
      "const added = addedSourceKeys.has(usedPartKey(part));",
      "const added = addedSourceKeys.has(ohTemplatePartKey(index));",
      "!addedSourceKeys.has(usedPartKey(part))",
      "!addedSourceKeys.has(ohTemplatePartKey(index))",
    ]) {
      assert.ok(form.includes(skip), `${skip} 가 없다`);
    }
    // 🔴 담긴 줄은 단추를 **없앤다** — 잠가 두기만 하면 「왜 안 눌리지」가 된다.
    assert.ok(form.includes("담김 ✓"), "담긴 줄을 표시하지 않는다");
  });

  test("🔴 담은 줄의 출처가 단가와 갈 칸을 정한다 — 견적서 종류가 아니다", () => {
    const used = sliceBetween(formSource, "function usedPartToItem(", "\n/**");
    const ohTemplate = sliceBetween(formSource, "function ohTemplatePartToItem(", "\n/**");
    // 출고 줄 → 일반 단가 · `1) 부품 비용`
    assert.ok(flat(used).includes("isOverhaulPart: false,"), used);
    assert.ok(flat(used).includes("unitPrice: toPriceFieldValue(part.unitPrice),"), used);
    // 템플릿 줄 → O/H 단가 · `2) OH 부품 비용`
    assert.ok(flat(ohTemplate).includes("isOverhaulPart: true,"), ohTemplate);
    assert.ok(
      flat(ohTemplate).includes("unitPrice: toPriceFieldValue(part.overhaulUnitPrice),"),
      ohTemplate
    );
    // 🔴 규칙 자체는 공용 묶음에서 가져온다 — 이 폼에 다시 적지 않는다.
    assert.ok(
      formSource.includes(
        'import { isPriceUnset, toPriceFieldValue } from "@dss/core/ui/inventory/part-price-field";'
      ),
      "단가 규약을 폼이 스스로 적고 있다"
    );
  });

  /**
   * ── 🔴 2026-09-22 — 이 단언들의 뜻을 다시 정했다 (조각 3b-3 뒤쪽 절반) ──────
   * 예전 이름은 「담기 · 부품 고르개 · 단가 규칙 파일이 **없다**」였고, 셋 다 아직
   * 오지 않았다는 울타리였다. **셋 다 들어왔으므로** 이제 막아야 할 것이 아니다 —
   * 지우지 않고 **있어야 하는 것**으로 뒤집어 같은 무게로 못 박는다. 담기
   * (addUsedParts · addOhTemplateParts)는 위 두 시험이 「함수 하나로 담는다」와
   * 「두 번 담지 않는다」로 더 촘촘히 본다.
   *
   * 🔴 **함께 걷어낸 죽은 단언 셋** — 막고 있다고 믿는데 아무것도 막지 않던 줄들이다:
   *
   *   · `src/components/quotes/quote-part-picker.tsx` 가 없어야 한다
   *   · `src/lib/domain/quote-part-price.ts` 가 없어야 한다
   *   · `<QuotePartSuggestionList ` 가 없어야 한다
   *
   * F-3(A/S `a05ac46` · dss-core `d805b39`)이 **A/S 에서도 그 두 경로를 없애고**
   * 컴포넌트 이름을 `PartSuggestionList` 로 고쳤다. 그러니 그 경로와 그 이름은 이
   * 사이트에 **영영 생기지 않는다** — 세 단언은 말없이 통과하기만 한다. 막으려던 것
   * (「사본을 만들지 않았다」)은 **경로 · 이름이 아니라 사본 자체**로 재야 한다. 그
   * 일은 components/quotes/quote-part-picker-wiring.test.ts 가 한다 — 이 저장소의
   * 어느 경로에서든 고르개의 이름 셋을 **선언**하는 파일이 있으면 붉어지고,
   * import 경로가 공용 묶음을 가리키는지도 함께 본다.
   */
  test("🔴 부품 고르개는 **공용 묶음에서** 들어왔다 — 사본이 아니다", () => {
    // 🔴 이제 **있어야 하는 것**. 베낀 사본이 아니라 묶음에서 가져온다는 것이 요점이다.
    assert.ok(
      formSource.includes('} from "@dss/core/ui/inventory/part-picker";'),
      "고르개를 공용 묶음에서 들여오지 않는다 — 사본을 만들면 F-3 의 뜻이 사라진다"
    );
    for (const marker of [
      "const [partPickerKey, setPartPickerKey] = useState<string | null>(null);",
      "<PartSuggestionList ",
      "options={filterPartOptions(partOptions, row.partNameText)}",
      "partOptions: PartPickerRow[];",
      "partPrices: PartPickerPriceRow[];",
    ]) {
      assert.ok(form.includes(marker), `${marker} 가 없다 — 고르개가 폼에 붙지 않았다`);
    }
  });

  /**
   * 🔴 **남은 울타리 하나.** 뒤집지 않는 까닭: `initialIntakeNumber` prop 이 있어야
   * 뜻이 있고, 건너올 A/S 의 수리 건 상세가 **조각 4·5** 에서 정해진다.
   */
  test("🔴 자동 불러오기 effect 가 없다 — initialIntakeNumber prop 은 조각 4·5 의 것이다", () => {
    assert.ok(
      formSource.includes('import { useMemo, useState, type FormEvent } from "react";'),
      "react import 가 늘었다 — useEffect · useRef 는 조각 4·5 · 3d 의 것이다"
    );
    for (const marker of ["useEffect(", "useRef(", "didAutoLookup", "initialIntakeNumber =", "initialIntakeNumber?:"]) {
      assert.equal(form.includes(marker), false, `${marker} — 자동 불러오기는 조각 4·5 의 것이다`);
    }
  });

  /**
   * 🔴 뒤집힌 단언이다. 참고 목록을 그리지 않던 때에는 「…부품 N종이 **아래 참고
   * 목록에 있습니다**」가 **없는 화면을 가리키는 거짓말**이라 막고 있었다. 목록이
   * 실제로 생겼으므로 이제 **그 말을 해야** 한다 — A/S 판 문구로 되돌렸다.
   */
  test("🔴 안내 문장이 **있는 화면**을 가리킨다 — A/S 판 문구로 되돌렸다", () => {
    assert.ok(
      handleLookup.includes(
        "`불러왔습니다. 이 건에 출고된 부품 ${found.usedParts.length}종이 아래 참고 목록에 있습니다.`"
      ),
      handleLookup
    );
    assert.ok(
      form.includes("그 건에 출고된 부품도 아래에 참고용으로 보여 줍니다."),
      "구역 설명이 참고 목록을 알리지 않는다"
    );
    // 목록을 그리지 않던 때의 문구는 사라져야 한다 — 두 말이 함께 남으면 어느 것이
    // 지금 화면인지 알 수 없다.
    assert.equal(
      form.includes("청구할 부품은 아래 부품 칸에 직접 적어 주세요"),
      false,
      "참고 목록이 없던 때의 문구가 남아 있다"
    );
  });

});

/**
 * ============================================================================
 * 🔴 받아 온 목록은 사본이다 — 근거가 없어지면 함께 없어진다
 * ============================================================================
 * A/S 의 실사용 결함이었다(2026-09-22 · `adb4e7e` · `85d21d3`). D111 을 불러온 뒤
 * 인수번호를 D999 로 고쳐 다시 누르면, 출고 부품 구역은 사라지는데 **O/H 부품 템플릿
 * 구역은 앞 건 기종의 부품 줄과 [담기] 단추가 그대로 살아 있었다.** 담으면 지금 화면의
 * 인수번호와 무관한 부품이 **O/H 템플릿 단가까지 달고** 청구 줄로 들어갔다.
 *
 * 왜 눈에 다르게 보였나: 출고 부품 구역은 `usedParts.length > 0` 일 때만 그리는데,
 * O/H 구역은 `kind === "OVERHAUL"` 이기만 하면 값과 무관하게 그린다.
 *
 * 🔴 **비우는 것은 조회가 받아 온 세 사본뿐이다.** 사람이 칠 수 있는 칸은 하나도
 * 건드리지 않는다 — 위 「못 찾으면 회색 안내만」 시험이 그 여덟을 못 박고 있고,
 * 이 묶음은 그것을 **약하게 만들지 않는다**(따로 더한 단언들이다).
 * ============================================================================
 */
describe("🔴 못 찾음 · 오류 갈래가 받아 온 목록을 비운다", () => {
  const errorBranch = sliceBetween(handleLookup, "if (!result.ok) {", "if (!result.found) {");
  const notFoundBranch = sliceBetween(handleLookup, "if (!result.found) {", "const found = result.found;");

  for (const [label, branch] of [
    ["오류", errorBranch],
    ["못 찾음", notFoundBranch],
  ] as const) {
    test(`${label} 갈래가 세 사본을 비우고 깃발을 세운다`, () => {
      for (const line of [
        "setUsedParts([]);",
        "setOhTemplateCode(null);",
        "setOhTemplateParts([]);",
        "setLookupMissed(true);",
      ]) {
        assert.ok(branch.includes(line), `${label} 갈래에 ${line} 가 없다`);
      }
    });

    test(`🔴 ${label} 갈래가 사람이 칠 수 있는 칸을 건드리지 않는다`, () => {
      for (const setter of [
        "setRepairCaseId(",
        "setCustomerId(",
        "setCustomerNameText(",
        "setModelNameText(",
        "setLotNumberText(",
        "setSerialNumberText(",
        "setFaultDescriptionText(",
        "setSubject(",
        "setKind(",
        "setItems(",
      ]) {
        assert.equal(branch.includes(setter), false, `${label} 갈래가 ${setter} 를 부른다`);
      }
    });
  }

  test("🔴 찾았을 때는 깃발을 내린다 — 안 내리면 제대로 찾았는데도 못 찾았다고 말한다", () => {
    const foundBranch = handleLookup.slice(handleLookup.indexOf("const found = result.found;"));
    assert.ok(foundBranch.includes("setLookupMissed(false);"), foundBranch);
  });

  test("🔴 **시작할 때는 깃발을 손대지 않는다** — 기다리는 동안 문구가 깜빡인다", () => {
    const beforeCall = handleLookup.slice(0, handleLookup.indexOf("const result = await"));
    assert.equal(
      beforeCall.includes("setLookupMissed("),
      false,
      "시작할 때 깃발을 움직인다 — 세 사본은 아직 앞 건의 것이라 문구가 되돌아간다"
    );
  });

  test("🔴 빈 상태 문구를 갈래로 가른다 — 「모델에 템플릿이 없다」는 거짓 안내였다", () => {
    // 🔴 이 사이트에도 같은 갈래가 필요하다. `repairCaseId` 는 사람이 칠 수 있는
    // 칸이라 비우지 않으므로 앞 건의 값이 남고, 그러면 「모델에 템플릿이 이어져
    // 있지 않습니다」가 열려 사람을 **A/S 의 재고 관리 화면**으로 보낸다. 이 사이트에는
    // 그 화면조차 없어(재고는 A/S 에 남는다) 헛걸음이 저쪽보다 더 멀다.
    assert.ok(
      form.includes(
        '{lookupMissed ? "인수번호를 불러오지 못해 O/H 부품을 가져오지 못했습니다'
      ),
      "빈 상태 문구가 「못 불러왔다」 갈래를 맨 앞에서 보지 않는다"
    );
    // 갈래 넷이 다 있어야 한다 — 고쳐야 할 자리가 다 다르다.
    for (const branch of [
      "인수번호를 먼저 불러오면",
      "O/H 부품 템플릿이 이어져 있지 않습니다",
      "템플릿에 담긴 부품이 없습니다",
    ]) {
      assert.ok(form.includes(branch), `${branch} 갈래가 없다`);
    }
    // 🔴 상태로 가른다 — 문구를 견주면 한 자 고치는 순간 조용히 틀린 안내가 뜬다.
    assert.equal(
      form.includes("lookupMessage ==="),
      false,
      "안내 문구를 글자로 견주고 있다"
    );
  });
});
