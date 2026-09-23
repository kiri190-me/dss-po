import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  ATTACHMENT_MODEL_STORED_PATH_PREFIX,
  ATTACHMENT_QUOTE_STORED_PATH_PREFIX,
  ATTACHMENT_STORED_PATH_PREFIX,
  AttachmentPathError,
  assertPortableStoredPath,
  buildQuoteAttachmentPreviewPath,
  buildQuoteAttachmentStoredPath,
  buildQuoteAttachmentStoredPathFromFileName,
  isPortableStoredPath,
  resolveAttachmentAbsolutePath,
} from "./attachment-path";

/**
 * ============================================================================
 * 🔴 조각 3d-1b 로 A/S 에서 가져온 시험이다 (2026-09-23) — **뺀 함수의 시험을 뺐다**
 * ============================================================================
 * 원본은 A/S 의 같은 이름 · 같은 경로 파일
 * (`RF_Service_System/src/lib/domain/attachment-path.test.ts`, 578줄 · 시험 32개)이다.
 * 남은 시험 **13개**의 단언은 **글자 그대로** 왔고, 고친 곳은 아래 ②뿐이다.
 *
 * ── 🔴 ① 뺀 것 — 이 사이트에 오지 않은 일곱 함수의 시험 15개 ────────────
 * 구현 파일이 접수 건 넷 · 제품 모델 셋을 빼고 왔다(그 파일 머리말의 「뺀 것」).
 * 그 함수를 **부르는** 시험은 함께 뺐다 — 남겨 두면 컴파일이 안 된다.
 *   접수 건 아홉  구분자 · `path.sep` · 대문자 UUID · 대문자 확장자 · 한글 파일명 ·
 *                 상대경로 · 허용목록 밖 확장자 · UUID 아닌 ID · 확장자 없는 이름
 *   제품 모델 여섯 모양 · 소문자 · 원본 파일명 · 미리보기 · UUID 아닌 모델 ID ·
 *                 허용목록 밖 확장자
 * 🔴 **되찾을 시험이 아니다.** 그 함수들은 A/S 것이고 그쪽 원본이 계속 갖는다.
 * 🔴 **남은 견적서 벌이 같은 규칙을 글자 하나까지 똑같이 검사한다** — 규칙 1(`/` 뿐) ·
 * 2(소문자) · 3(상대경로) · UUID · 허용목록 · 원본 파일명 가리기 · 미리보기 `.preview.jpg`
 * 가 아래 견적서 시험 다섯에 그대로 있다. **잃은 규칙은 없다.**
 *
 * ── 🔴 ② 함께 뺀 시험 넷과, 그것이 지키던 값을 지금 지키는 자리 ──────────
 * 아래 넷은 **남은 함수**(`assertPortableStoredPath` · `resolveAttachmentAbsolutePath`)를
 * 보는 시험인데, 검사할 경로를 **뺀 함수로 만들고 있었다.** 원본 그대로는 돌지 않아
 * 함께 뺐고, 각각을 지금 지키는 자리를 여기 적어 둔다.
 *   · "스스로 만든 경로는 언제나 검사를 통과한다"
 *       → 「견적서 첨부의 stored_path는 …」가 확장자 셋에 대해 `doesNotThrow` ·
 *         `isPortableStoredPath === true` 를 그대로 본다.
 *   · "정상 경로는 저장 루트 아래의 절대 경로로 해석된다"
 *       → 「견적서 경로도 저장 루트 아래로만 해석된다」가 같은 단언을 갖는다.
 *   · "assertPortableStoredPath는 두 접두어를 모두 받는다"
 *       → 「assertPortableStoredPath는 세 접두어를 모두 받는다」가 **셋을 다** 본다.
 *   · "모델 경로도 저장 루트 아래로만 해석되고 '..'로 루트를 벗어나지 못한다"
 *       → 「'..'가 들어간 경로는 절대 경로 해석 단계에서도 …」와 「견적서 경로도 저장
 *         루트 아래로만 …」의 마지막 줄이 같은 갈래를 본다.
 *
 * 🔴 그 가운데 **둘은 뺄 수 없어 경로를 상수로 적었다.** 지키는 것이 그 자리뿐이라서다:
 *   · "저장 루트가 비어 있으면 …" — 빈 루트를 던지는지 보는 **하나뿐인 시험**
 *   · "assertPortableStoredPath는 세 접두어를 모두 받는다" — 🔴 **이 조각에서 가장
 *     중요한 시험**. 두 사이트가 같은 `attachments` 표를 보므로, A/S 가 넣은
 *     `repair-cases/…` · `product-models/…` 행을 이 사이트가 읽다 던지면 안 된다.
 * 고친 것은 **경로를 만드는 줄뿐**이고(뺀 함수가 내놓던 바로 그 문자열을 접두어 상수로
 * 적었다) 단언은 한 줄도 바꾸지 않았다. 두 자리 모두 곁에 까닭을 적어 두었다.
 *
 * ── OS 갈림은 원본이 이미 다룬다 — 손대지 않았다 ─────────────────────────
 * `if (path.sep !== "/")` · `path.sep === "/" ? "/srv/…" : "C:\\DSS-AS-DATA\\uploads"` 가
 * 남은 시험 안에 그대로 있다. 이 시험은 디스크를 만지지 않는다.
 *
 * ── 구역 표시와 아래 머리말은 원본 글자 그대로다 ─────────────────────────
 * 🔴 조각 4 가 두 벌을 글자로 대조하므로, 남은 것은 이름도 차례도 원본을 따른다.
 * 그래서 아래 A/S 원본 머리말과 「제품 모델 첨부」 구역 머리말이 이 사이트에 없는
 * 함수를 예로 드는 대목이 있다 — 그 이름들은 **A/S 쪽 자리**를 가리킨다.
 * ============================================================================
 */

/**
 * ============================================================================
 * 이 파일이 지키려는 것 — NAS로 옮긴 다음 날 알게 되는 종류의 고장
 * ============================================================================
 * 이 시스템은 나중에 사내 NAS(Docker, 컨테이너 안은 Linux)로 옮긴다. 개발은
 * Windows에서 한다. 아래 세 가지는 **Windows에서는 아무 문제 없이 돌아가다가
 * 옮긴 뒤에야 터지는** 종류라, 옮기기 전에 테스트로 못박아 둔다.
 *
 *   1. DB에 적는 구분자는 `/` 하나뿐이다. `repair-cases\abc\1.jpg`는 Linux에서
 *      폴더 하나의 이름이 되어 파일을 못 찾는다.
 *   2. 경로는 전부 소문자다. Windows는 대소문자를 같게 보지만 Linux는 다른
 *      파일로 본다 — 옮긴 뒤 일부만 안 열린다.
 *   3. 절대경로·드라이브 문자는 DB에 들어가지 않는다. `C:\DSS-AS-DATA`는
 *      컨테이너 안에 존재하지 않는다.
 *
 * 여기에 하나 더 — `..`가 어떤 경로로 들어와도 저장 루트를 벗어나지 못한다.
 *
 * 전부 **실제 파일 없이** 검증된다. 이 테스트는 디스크를 만지지 않는다.
 * ============================================================================
 */

const CASE_ID = "3f6c1b2a-7d4e-4a1b-9c8d-0e1f2a3b4c5d";
const ATTACHMENT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e";

// ──────────────────────────────── DB에서 읽은 값도 그대로 믿지 않는다

test("옮길 수 없는 경로는 전부 거부된다", () => {
  const rejected = [
    "", // 빈 값
    "repair-cases\\case\\file.jpg", // 규칙 1 — 역슬래시
    "REPAIR-CASES/CASE/FILE.JPG", // 규칙 2 — 대문자
    `repair-cases/${CASE_ID}/${ATTACHMENT_ID}.JPG`, // 규칙 2 — 확장자만 대문자
    "/repair-cases/case/file.jpg", // 규칙 3 — 절대경로
    "c:/dss-as-data/uploads/x.jpg", // 규칙 3 — 드라이브 문자
    "repair-cases/../../windows/system32/config", // 상위 이동
    "repair-cases//double.jpg", // 빈 마디
    "repair-cases/./x.jpg", // 현재 디렉터리 마디
    "other-root/case/file.jpg", // 접두사 밖
  ];
  for (const value of rejected) {
    assert.equal(isPortableStoredPath(value), false, `거부돼야 한다: ${JSON.stringify(value)}`);
    assert.throws(() => assertPortableStoredPath(value), AttachmentPathError, value);
  }
});

// ─────────────────────────────────────────── 절대 경로 해석은 루트를 벗어나지 않는다

test("'..'가 들어간 경로는 절대 경로 해석 단계에서도 루트를 벗어나지 못한다", () => {
  const root = path.resolve(path.sep === "/" ? "/srv/dss-as-data/uploads" : "C:\\DSS-AS-DATA\\uploads");
  for (const evil of [
    "repair-cases/../../secrets.txt",
    "repair-cases/case/../../../secrets.txt",
    "../uploads-shadow/x.jpg",
    "..",
  ]) {
    assert.throws(() => resolveAttachmentAbsolutePath(root, evil), AttachmentPathError, evil);
  }
});

test("저장 루트가 비어 있으면 조용히 기본값으로 넘어가지 않고 던진다", () => {
  // 🔴 원본은 이 값을 buildAttachmentStoredPath 로 만들었다. 그 함수는 이 사이트에
  // 오지 않았으므로(구현 파일 머리말의 「뺀 것」) 그 함수가 내놓던 바로 그 문자열을
  // 접두어 상수로 적는다 — 보는 것은 resolveAttachmentAbsolutePath 이고, 이 시험은
  // 「저장 루트가 비면 던진다」를 못 박는 **하나뿐인 자리**라 뺄 수 없었다.
  const stored = `${ATTACHMENT_STORED_PATH_PREFIX}/${CASE_ID}/${ATTACHMENT_ID}.txt`;
  assert.throws(() => resolveAttachmentAbsolutePath("", stored), AttachmentPathError);
  assert.throws(() => resolveAttachmentAbsolutePath("   ", stored), AttachmentPathError);
});

/**
 * ============================================================================
 * 제품 모델 첨부 — 두 번째 접두어가 생겨도 규칙은 하나다
 * ============================================================================
 * 모델(장비 종류)에 외형 사진·회로도를 붙이면서 stored_path의 첫 마디가 둘이
 * 됐다. 아래 시험이 못박는 것은 두 가지다.
 *
 *   1. 모델 쪽 경로도 위의 규칙 1·2·3을 **똑같이** 지킨다 — 접두어만 다르고
 *      느슨해진 검사는 하나도 없다.
 *   2. 검사를 "넓혔다"는 것이 "아무거나 받는다"가 되지 않았다 — 알려진 접두어
 *      둘 말고 제3의 첫 마디는 여전히 거부된다.
 * ============================================================================
 */

const MODEL_ID = "b7e4d3c2-1a09-4f8e-8b7a-6c5d4e3f2a1b";

// ──────────────── 검사는 두 접두어를 받고, 그 둘 말고는 여전히 거부한다

test("접두어를 넓힌 것이 '아무거나 받는다'가 되지 않았다 — 제3의 접두어는 거부된다", () => {
  const rejectedPrefixes = [
    `customers/${MODEL_ID}/${ATTACHMENT_ID}.jpg`,
    `products/${MODEL_ID}/${ATTACHMENT_ID}.jpg`,
    `product-model/${MODEL_ID}/${ATTACHMENT_ID}.jpg`, // 단수형 오타
    `product-models-old/${MODEL_ID}/${ATTACHMENT_ID}.jpg`,
    `repair-case/${CASE_ID}/${ATTACHMENT_ID}.jpg`, // 단수형 오타
    `${ATTACHMENT_ID}.jpg`, // 접두어 없음
  ];
  for (const value of rejectedPrefixes) {
    assert.equal(isPortableStoredPath(value), false, `거부돼야 한다: ${value}`);
    assert.throws(() => assertPortableStoredPath(value), AttachmentPathError, value);
  }
});

test("모델 접두어에서도 역슬래시·절대경로·'..'·대문자는 여전히 거부된다", () => {
  const rejected = [
    "product-models\\model\\file.jpg", // 규칙 1 — 역슬래시
    `product-models\\${MODEL_ID}\\${ATTACHMENT_ID}.jpg`,
    "PRODUCT-MODELS/MODEL/FILE.JPG", // 규칙 2 — 대문자
    `product-models/${MODEL_ID}/${ATTACHMENT_ID}.JPG`, // 규칙 2 — 확장자만 대문자
    "/product-models/model/file.jpg", // 규칙 3 — 절대경로
    "c:/product-models/model/file.jpg", // 규칙 3 — 드라이브 문자
    "product-models/../../windows/system32/config", // 상위 이동
    `product-models/${MODEL_ID}/../../secrets.txt`,
    "product-models//double.jpg", // 빈 마디
    "product-models/./x.jpg", // 현재 디렉터리 마디
  ];
  for (const value of rejected) {
    assert.equal(isPortableStoredPath(value), false, `거부돼야 한다: ${JSON.stringify(value)}`);
    assert.throws(() => assertPortableStoredPath(value), AttachmentPathError, value);
  }
});

/**
 * ============================================================================
 * 견적서 첨부 — 세 번째 접두어 (2026-09-15)
 * ============================================================================
 * 견적서에 결재 견적서 PDF · 수기 견적서 엑셀을 붙이면서 첫 마디가 셋이 됐다.
 * 앞의 접두어들과 같은 두 가지를 못박는다 — 규칙 1·2·3을 똑같이 지키는가, 그리고
 * 셋 말고 넷째 첫 마디는 여전히 거부되는가. 백업 스크립트(scripts/backup-attachments.ts)가
 * assertPortableStoredPath 로 전 행을 검사하므로, 여기서 quotes/… 가 통과해야 백업이
 * 첫 견적서 파일에서 멈추지 않는다.
 * ============================================================================
 */

const QUOTE_ID = "d9e8f7a6-5b4c-4d3e-8f2a-1b0c9d8e7f6a";

test("견적서 첨부의 stored_path는 quotes/{견적서id}/{첨부id}.{확장자}다", () => {
  assert.equal(ATTACHMENT_QUOTE_STORED_PATH_PREFIX, "quotes");
  for (const extension of ["pdf", "xlsx", "xls"]) {
    const stored = buildQuoteAttachmentStoredPath({ quoteId: QUOTE_ID, attachmentId: ATTACHMENT_ID, extension });
    assert.equal(stored, `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.${extension}`);
    assert.equal(stored.split("/").length, 3);
    assert.equal(stored.includes("\\"), false, "Linux는 역슬래시를 파일명의 일부로 읽는다");
    assert.equal(stored, stored.toLowerCase());
    if (path.sep !== "/") {
      assert.equal(stored.includes(path.sep), false, `OS 구분자(${path.sep})가 DB 값에 들어갔다`);
    }
    // 백업 스크립트가 부르는 바로 그 검사를 통과한다.
    assert.doesNotThrow(() => assertPortableStoredPath(stored), stored);
    assert.equal(isPortableStoredPath(stored), true, stored);
  }
});

test("견적서 경로도 대문자 UUID·대문자 확장자를 소문자로 눕힌다", () => {
  const stored = buildQuoteAttachmentStoredPath({
    quoteId: QUOTE_ID.toUpperCase(),
    attachmentId: ATTACHMENT_ID.toUpperCase(),
    extension: "XLSX",
  });
  assert.equal(stored, `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.xlsx`);
});

test("견적서 경로도 원본 파일명에서 확장자만 뽑아 소문자로 붙인다", () => {
  const stored = buildQuoteAttachmentStoredPathFromFileName({
    quoteId: QUOTE_ID,
    attachmentId: ATTACHMENT_ID,
    originalFileName: "DSS 2026-077 견적서 (결재).PDF",
  });
  assert.equal(stored, `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`);
  assert.equal(stored.includes("견적서"), false, "원본 이름은 디스크 경로에 들어가지 않는다");
  assert.equal(stored.includes(" "), false);
});

test("견적서 첨부의 미리보기 경로는 .preview.jpg로 끝나고 검사를 통과한다", () => {
  const preview = buildQuoteAttachmentPreviewPath({ quoteId: QUOTE_ID, attachmentId: ATTACHMENT_ID });
  assert.equal(preview, `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.preview.jpg`);
  assert.equal(preview, preview.toLowerCase());
  assert.equal(isPortableStoredPath(preview), true);
});

test("UUID가 아닌 견적서 ID·첨부 ID, 목록 밖 확장자로는 견적서 경로를 만들 수 없다", () => {
  // 견적서 번호(발행번호)는 ID 가 아니다 — 사람이 적는 글자라 경로에 쓰지 않는다.
  for (const badId of ["../../etc", "DSS 2026-077", "", "42"]) {
    assert.throws(
      () => buildQuoteAttachmentStoredPath({ quoteId: badId, attachmentId: ATTACHMENT_ID, extension: "pdf" }),
      AttachmentPathError,
      badId
    );
  }
  assert.throws(
    () => buildQuoteAttachmentStoredPath({ quoteId: QUOTE_ID, attachmentId: "local-demo-1", extension: "pdf" }),
    AttachmentPathError
  );
  assert.throws(
    () => buildQuoteAttachmentPreviewPath({ quoteId: "not-a-uuid", attachmentId: ATTACHMENT_ID }),
    AttachmentPathError
  );
  for (const extension of ["exe", "xlsm", "", "p/df"]) {
    assert.throws(
      () => buildQuoteAttachmentStoredPath({ quoteId: QUOTE_ID, attachmentId: ATTACHMENT_ID, extension }),
      AttachmentPathError,
      extension
    );
  }
  for (const name of ["README", "trailing.", ".hidden", "weird.타입"]) {
    assert.throws(
      () =>
        buildQuoteAttachmentStoredPathFromFileName({
          quoteId: QUOTE_ID,
          attachmentId: ATTACHMENT_ID,
          originalFileName: name,
        }),
      AttachmentPathError,
      name
    );
  }
});

test("assertPortableStoredPath는 세 접두어를 모두 받는다", () => {
  // 🔴 앞의 두 줄은 원본에서 buildAttachmentStoredPath · buildProductModelAttachment-
  // StoredPath 가 만들던 값이다. 두 함수는 이 사이트에 오지 않았으므로(구현 파일
  // 머리말의 「뺀 것」) 그 둘이 내놓던 바로 그 문자열을 접두어 상수로 적는다.
  // 🔴 **이 시험이 이 조각에서 가장 중요하다** — 두 사이트가 같은 attachments 표를
  // 보므로, A/S 가 넣은 repair-cases/… · product-models/… 행을 이 사이트가 읽을 때
  // assertPortableStoredPath 가 던지면 안 된다. 접두어 상수 셋이 다 남아 있고
  // ALLOWED_STORED_PATH_PREFIXES 가 셋을 다 받는지를 여기서 못 박는다.
  const stored = [
    `${ATTACHMENT_STORED_PATH_PREFIX}/${CASE_ID}/${ATTACHMENT_ID}.pdf`,
    `${ATTACHMENT_MODEL_STORED_PATH_PREFIX}/${MODEL_ID}/${ATTACHMENT_ID}.pdf`,
    buildQuoteAttachmentStoredPath({ quoteId: QUOTE_ID, attachmentId: ATTACHMENT_ID, extension: "pdf" }),
  ];
  for (const value of stored) {
    assert.doesNotThrow(() => assertPortableStoredPath(value), value);
  }
  assert.equal(new Set(stored.map((value) => value.split("/")[0])).size, 3, "첫 마디가 셋으로 갈려야 한다");
});

test("셋째 접두어를 더한 것이 '아무거나 받는다'가 되지 않았다 — 목록 밖 접두어와 규칙 위반은 여전히 거부된다", () => {
  const rejected = [
    `quote/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`, // 단수형 오타
    `quotes-old/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`,
    `quote-attachments/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`,
    `QUOTES/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`, // 규칙 2 — 대문자
    `quotes/${QUOTE_ID}/${ATTACHMENT_ID}.PDF`, // 규칙 2 — 확장자만
    `quotes\\${QUOTE_ID}\\${ATTACHMENT_ID}.pdf`, // 규칙 1 — 역슬래시
    `/quotes/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`, // 규칙 3 — 절대경로
    `c:/quotes/${QUOTE_ID}/${ATTACHMENT_ID}.pdf`, // 규칙 3 — 드라이브 문자
    "quotes/../../windows/system32/config", // 상위 이동
    "quotes//double.pdf", // 빈 마디
    "quotes/./x.pdf", // 현재 디렉터리 마디
  ];
  for (const value of rejected) {
    assert.equal(isPortableStoredPath(value), false, `거부돼야 한다: ${JSON.stringify(value)}`);
    assert.throws(() => assertPortableStoredPath(value), AttachmentPathError, value);
  }
});

test("견적서 경로도 저장 루트 아래로만 해석된다", () => {
  const root = path.resolve(path.sep === "/" ? "/srv/dss-as-data/uploads" : "C:\\DSS-AS-DATA\\uploads");
  const stored = buildQuoteAttachmentStoredPath({ quoteId: QUOTE_ID, attachmentId: ATTACHMENT_ID, extension: "xlsx" });
  const absolute = resolveAttachmentAbsolutePath(root, stored);
  assert.ok(path.isAbsolute(absolute));
  assert.equal(path.relative(root, absolute).startsWith(".."), false, "루트 밖으로 나가면 안 된다");
  assert.ok(absolute.includes(`${path.sep}${ATTACHMENT_QUOTE_STORED_PATH_PREFIX}${path.sep}`));
  assert.throws(() => resolveAttachmentAbsolutePath(root, "quotes/../../secrets.txt"), AttachmentPathError);
});
