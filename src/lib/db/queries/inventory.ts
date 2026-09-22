import "server-only";

import { and, eq, isNotNull, or } from "drizzle-orm";

import { partOverhaulUnitPrices, partUnitPrices, parts } from "@dss/core/schema";
import { db } from "@/lib/db";
import type {
  PartPickerPriceRow,
  PartPickerRow,
} from "@dss/core/ui/inventory/part-picker-rows";

/**
 * ============================================================================
 * 재고 — 읽는 쪽. 🔴 **부품을 고르기 위한 조회 둘뿐이다** (조각 3b-3 뒤쪽 절반)
 * ============================================================================
 * A/S 관리 시스템의 같은 이름 파일은 재고 화면 전체의 읽기 쪽이다 — 부품 목록 ·
 * 소유구분별 가용량 · 입출고 이력 · 부품 요청 · 반품 가능 수량까지. 🔴 **그 중
 * 어느 것도 이 사이트로 오지 않는다.** 재고 화면은 A/S 에 남는다(설계서
 * 「A/S 에 남길 것」). 여기 있는 둘은 **견적서 폼의 품명 칸이 부품 마스터에서
 * 골라 쓰기 위한** 것이고, 그것이 이 사이트가 재고를 읽는 유일한 까닭이다.
 *
 * ── 🔴 무거운 형제 `getPartList` 를 가져오지 않았다 ─────────────────────────
 * 저쪽 `getPartList` 는 `part_stock_balances` 를 조인해 **재고 수량**을 싣고, 그
 * 곁의 `getPartOwnerAvailability` 는 **소유구분별 가용량**을 싣는다. 저쪽이 그
 * 둘을 부품 요청 쓰기 권한(inventory.requests WRITE) 뒤에 감춰 둔 까닭이 그것이다 —
 * 재고와 소유구분은 재고 담당의 정보지, 견적서를 쓰는 사람이 보라고 내보내는 값이
 * 아니다. 이 사이트에는 그 권한 자체가 없다.
 *
 * 그래서 아래 둘은 **재고를 읽을 길 자체를 만들지 않는다**:
 *
 *   · `part_stock_balances` 를 아예 건드리지 않는다 — 「화면에서 안 그리면 된다」는
 *     조회가 이미 실어 보낸 뒤다.
 *   · `notes`(내부 비고)를 담지 않는다 — 부품 상세에서만 읽는 내부 메모다.
 *   · 소유구분 칸이 없다 — 위 두 표에만 있고, 그 표를 읽지 않는다.
 *
 * ── 🔴 줄의 모양은 공용 묶음이 갖는다 ──────────────────────────────────────
 * `PartPickerRow` · `PartPickerPriceRow` 는 부품 고르개(한 벌 —
 * `@dss/core/ui/inventory/part-picker.tsx`)와 짝이라 그 곁에 있다. 여기서 다시
 * 적지 않고 **그 곳에서 가져와 반환형으로 쓴다** — 두 사이트의 조회가 각자 제
 * 타입을 들고 있으면 한쪽만 칸이 늘거나 이름이 바뀐 날 컴파일러가 아무 말도 하지
 * 않는다(그 파일 머리말).
 *
 * 🔴 **저쪽처럼 재수출하지는 않는다.** A/S 가 두 형을 이 자리에서 재수출하는 것은
 * 그 사이트 안에 **이미 이 파일에서 형을 가져오던 화면 넷**이 있어서다(F-3 이
 * 고르개를 공용 묶음으로 보낼 때 그 import 들을 안 깨기 위한 것). 이 사이트에는
 * 그런 부르는 쪽이 없어, 폼도 공용 묶음에서 곧바로 가져온다 — 같은 형을 두 길로
 * 가져올 수 있게 두면 어느 길이 참인지 답할 수 없게 된다.
 * ============================================================================
 */

/**
 * 부품 마스터를 **고르기 위해서만** 읽는 목록. 견적서 폼(QuoteEditForm)의
 * 「부품 비용」 품명 칸이 이 목록 위에서 거른다 — 부품 마스터가 백 줄 안쪽이라
 * 통째로 한 번 내려보내고 브라우저에서 거르는 편이 글자마다 서버를 부르는 것보다
 * 빠르다(공용 묶음 part-picker.tsx 의 filterPartOptions).
 *
 * 지워진 부품은 빼고(is_deleted = false), 품명 차례로 돌려준다.
 *
 * 🔴 조인이 하나도 없다 — 위 머리말의 그 경계다.
 */
export async function getPartPickerList(): Promise<PartPickerRow[]> {
  return db
    .select({
      id: parts.id,
      partName: parts.partName,
      partSpec: parts.partSpec,
      drawingNo: parts.drawingNo,
      kyosanPartNo: parts.kyosanPartNo,
    })
    .from(parts)
    .where(eq(parts.isDeleted, false))
    .orderBy(parts.partName);
}

/**
 * 부품을 고를 때 단가 칸까지 채우기 위한 **단가 목록**.
 *
 * ── 🔴 왜 목록을 통째로 미리 받는가 ─────────────────────────────────────────
 * 단가가 적혀 있는 부품은 통틀어 열몇이다. 고를 때마다 서버를 한 번씩 다녀오면
 * 고른 순간과 칸이 채워지는 순간이 어긋나고, 빨리 고쳐 치면 늦게 온 응답이 사람이
 * 적은 금액을 덮을 수도 있다. 목록이 이렇게 작으니 페이지가 한 번 실어 보내고
 * 브라우저에서 찾는 편이 싸고 안전하다(getPartPickerList 의 같은 판단).
 *
 * ── 🔴 단가가 있는 부품만 돌아온다 ──────────────────────────────────────────
 * 둘 다 없는 부품은 아예 빠진다. **없는 것을 "0" 으로 채우지 않는다** — 고르개에서
 * 줄이 없다는 것은 곧 "정하지 않았다"이고, 그때는 단가 칸을 비워 둔다. 0 으로
 * 채우면 견적서가 정하지 않은 부품을 0원으로 청구한다
 * (`@dss/core/ui/inventory/part-picker-rows.ts` 의 그 규약).
 *
 * ── 🔴 재고는 여기에도 오지 않는다 ──────────────────────────────────────────
 * 조인하는 것은 단가 표 둘뿐이다. 소유구분 · 내부 비고도 담지 않는다.
 *
 * numeric 은 Drizzle 이 **문자열로 읽는다**. 화면까지 문자열로 옮긴다 — Number 를
 * 거치면 오차가 쌓이고, 그 오차가 견적서 합계와 세금계산서 사이의 1원 차이가 된다.
 */
export async function getPartPickerUnitPrices(): Promise<PartPickerPriceRow[]> {
  return db
    .select({
      partId: parts.id,
      unitPrice: partUnitPrices.unitPrice,
      overhaulUnitPrice: partOverhaulUnitPrices.unitPrice,
    })
    .from(parts)
    .leftJoin(partUnitPrices, eq(partUnitPrices.partId, parts.id))
    .leftJoin(partOverhaulUnitPrices, eq(partOverhaulUnitPrices.partId, parts.id))
    .where(
      and(
        eq(parts.isDeleted, false),
        or(isNotNull(partUnitPrices.unitPrice), isNotNull(partOverhaulUnitPrices.unitPrice))
      )
    );
}
