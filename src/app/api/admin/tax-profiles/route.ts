import { NextResponse } from "next/server";

import { hasAdminSession } from "@/features/admin/auth";
import { noStoreHeaders } from "@/features/http/guard";
import { listStoreOptions } from "@/features/stores/directory";
import { findStoreTaxProfile, isIssuableProfile } from "@/features/stores/tax-profiles";

/**
 * GET /api/admin/tax-profiles — 지점별 세금계산서 정보가 서버에 등록돼 있는지 점검 (본사 전용).
 *
 * 왜 필요한가
 *  - 주문서는 이제 체크박스만 보여주고, 사업자 정보는 서버가 지점 코드로 찾아 붙인다.
 *    값이 없으면 주문은 접수되지만 발급 정보가 비어 알림에 "미등록"으로 뜬다.
 *  - 그래서 본사가 "어느 지점이 등록됐고 무엇이 비었는지"를 값 없이 확인할 수 있어야 한다.
 *
 * 지키는 선
 *  - 사업자등록번호는 **끝 4자리만 가린 채** 보여주고, 상호·대표자·이메일 값은 내려보내지 않는다.
 *  - 본사 관리자 서명 쿠키가 없으면 401. Cache-Control: no-store.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskBusinessNo(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 10) return digits ? "****" : "";

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-****`;
}

export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json(
      { error: "관리자 로그인이 필요합니다.", ok: false },
      { headers: noStoreHeaders, status: 401 },
    );
  }

  const stores = await listStoreOptions();
  const rows = await Promise.all(
    stores.map(async (store) => {
      const profile = await findStoreTaxProfile(store.code);

      return {
        code: store.code,
        emailMissing: Boolean(profile && !profile.email),
        label: store.label,
        missingFields: [
          profile?.businessNo.length === 10 ? "" : "사업자등록번호",
          profile?.businessName ? "" : "상호",
          profile?.ceoName ? "" : "대표자명",
          profile?.email ? "" : "수취 이메일",
        ].filter(Boolean),
        registered: Boolean(profile),
        usable: isIssuableProfile(profile),
        businessNoMasked: maskBusinessNo(profile?.businessNo ?? ""),
      };
    }),
  );

  return NextResponse.json(
    {
      ok: true,
      // 값이 아니라 "등록 여부"만 확인하는 화면이다.
      stores: rows,
      summary: {
        missing: rows.filter((row) => !row.usable).map((row) => row.code),
        registered: rows.filter((row) => row.registered).length,
        total: rows.length,
      },
    },
    { headers: noStoreHeaders },
  );
}
