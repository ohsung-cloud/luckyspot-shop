import { NextResponse } from "next/server";

import { listStoreOptions } from "@/features/stores/directory";

/**
 * 발주 폼의 "받는 곳" 목록.
 *
 * 점주 실명·휴대폰은 내리지 않는다. 지점 코드·이름·주소·지역만 내려가고,
 * 주문 접수 때 서버가 지점 코드로 연락처를 채운다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stores = await listStoreOptions();

  return NextResponse.json(
    { stores },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  );
}
