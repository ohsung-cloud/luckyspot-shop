import { NextResponse } from "next/server";

import { fetchStoreTaxProfile } from "@/features/stores/directory";
import { noStoreHeaders } from "@/features/http/guard";

/**
 * GET /api/stores/tax-profile?code=STORE_GNG
 *
 * 주문서 Step 1 에서 지점을 고르면 세금계산서 기본 사업자 정보를 미리 채우는 값.
 *  - 등록된 값이 없으면(마이그레이션 전 포함) `profile: null` 로 정상 응답한다.
 *  - 점주 실명·휴대폰은 내리지 않는다. 사업자등록번호·상호·대표자·수취 이메일만.
 *  - 지점 코드로만 조회하고 목록으로 내려주지 않는다(캐시 금지).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_CODE_PATTERN = /^[A-Za-z0-9_-]{2,40}$/;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";

  if (!STORE_CODE_PATTERN.test(code)) {
    return NextResponse.json({ error: "invalid store code", ok: false }, { status: 400 });
  }

  const profile = await fetchStoreTaxProfile(code);

  return NextResponse.json({ ok: true, profile }, { headers: noStoreHeaders });
}
