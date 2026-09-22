import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
 *  7. 🔴 **뒤쪽 절반의 것을 앞당기지 않았다** — 참고 목록 둘 · 부품 고르개 · 담기 ·
 *     자동 불러오기 effect 가 없고, 안내 문장이 **없는 화면을 가리키지 않는다.**
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
/** 폼의 [불러오기] 한 덩이. */
const handleLookup = flat(sliceBetween(formSource, "async function handleLookup() {", "\n  function updateItem("));

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

describe("🔴 뒤쪽 절반의 것을 앞당기지 않았다", () => {
  test("불러온 값을 **읽는 쪽을 꺼내지 않았다** — 화면이 그릴 수 없다", () => {
    // 참고 목록 둘(출고된 부품 · O/H 부품 템플릿)이 뒤쪽 절반이라, 지금 이 값을
    // 읽을 곳이 한 군데도 없다. 읽는 쪽이 없으면 실수로 그려질 수도 없다.
    for (const declaration of [
      'const [, setUsedParts] = useState<QuoteIntakeLookup["usedParts"]>([]);',
      "const [, setOhTemplateCode] = useState<string | null>(null);",
      'const [, setOhTemplateParts] = useState<QuoteIntakeLookup["ohTemplateParts"]>([]);',
    ]) {
      assert.ok(form.includes(declaration), `${declaration} 가 없다`);
    }
    for (const reader of [
      // 🔴 `found.usedParts.length` 는 안내 문장이 쓰는 값이라 「상태를 읽는 것」이
      // 아니다. 여기서 막는 것은 **JSX 가 상태를 읽는 자리**다.
      "{usedParts",
      "{ohTemplateCode",
      "{ohTemplateParts",
      "usedParts.map(",
      "ohTemplateParts.map(",
      "const unaddedUsedParts",
      "const unaddedOhTemplateParts",
      "const addedSourceKeys",
    ]) {
      assert.equal(form.includes(reader), false, `${reader} — 뒤쪽 절반의 화면이 앞당겨졌다`);
    }
  });

  test("담기 · 부품 고르개 · 단가 규칙 파일이 없다", () => {
    for (const marker of [
      "function addUsedParts(",
      "function addOhTemplateParts(",
      // 🔴 `<QuotePartSuggestionList>` 는 **주석에 남아 있다**(그 자리를 가리키는
      // 표지다) — 그래서 그리는 자리가 아니라 **들여오는 줄**로 막는다.
      'from "@/components/quotes/quote-part-picker"',
      "<QuotePartSuggestionList ",
      "const [partPickerKey",
      "partOptions:",
      "partPrices:",
    ]) {
      assert.equal(form.includes(marker), false, `${marker} — 뒤쪽 절반의 것이다`);
    }
    for (const file of [
      "src/components/quotes/quote-part-picker.tsx",
      "src/lib/domain/quote-part-price.ts",
    ]) {
      assert.equal(
        existsSync(fileURLToPath(new URL(file, repoUrl))),
        false,
        `${file} — 뒤쪽 절반의 파일이 앞당겨졌다(설계서 F-3: A/S 로 옮기고 이름을 바꾸는 것이 먼저다)`
      );
    }
  });

  test("🔴 자동 불러오기 effect 가 없다 — initialIntakeNumber prop 은 조각 4·5 의 것이다", () => {
    assert.ok(
      formSource.includes('import { useMemo, useState, type FormEvent } from "react";'),
      "react import 가 늘었다 — useEffect · useRef 는 조각 4·5 · 3d 의 것이다"
    );
    for (const marker of ["useEffect(", "useRef(", "didAutoLookup", "initialIntakeNumber =", "initialIntakeNumber?:"]) {
      assert.equal(form.includes(marker), false, `${marker} — 자동 불러오기는 조각 4·5 의 것이다`);
    }
  });

  test("🔴 안내 문장이 **없는 화면**을 가리키지 않는다", () => {
    // A/S 문구는 「…부품 N종이 **아래 참고 목록에 있습니다**」다. 목록을 그리지 않는
    // 여기서 그 말을 쓰면 사람이 없는 화면을 찾게 된다.
    const messages = [...handleLookup.matchAll(/setLookupMessage\(([\s\S]*?)\);/g)].map((match) => match[1]);
    assert.ok(messages.length >= 4, `안내 문장을 찾지 못했다: ${messages.length}`);
    for (const message of messages) {
      assert.equal(
        /아래 참고 목록|참고 목록|아래 목록/.test(message),
        false,
        `없는 화면을 가리키는 안내다: ${message}`
      );
    }
    assert.equal(
      form.includes("참고용으로 보여 줍니다"),
      false,
      "구역 설명이 아직 없는 참고 목록을 약속한다"
    );
  });
});
