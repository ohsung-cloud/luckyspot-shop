import type { Metadata } from "next";
import { cookies } from "next/headers";

import OwnerDashboard from "@/components/owner/OwnerDashboard";
import OwnerLogin, { type OwnerLoginStore } from "@/components/owner/OwnerLogin";
import { loadOwnerDashboard } from "@/features/owner/data";
import { isTossTestMode } from "@/features/payments/keys";
import { readOwnerSession } from "@/features/stores/owner-session";
import { resolveStoreByCode } from "@/features/stores/directory";
import { findStoreRecord, listStoreRecords } from "@/features/stores/registry";
import { seedPinFor } from "@/features/stores/seed-pins";
import type { StoreOption } from "@/features/stores/types";

/**
 * `/owner` — 점주 통합 포털.
 *
 * 한 지점이 로그인하면 그 지점의 **매출 → 재고 → 발주 → 결제**를 한 화면에서 끝낸다.
 *
 *  ① 로그인: 지점 코드 + 4자리 비밀번호(기존 `stores.pin_hash` 체계, 시드 지점은 0000)
 *  ② 대시보드 순서(사용자 지정): 이번 달 매출·예상 순이익 → 원두·용지 재고 → 최근 발주내역
 *  ③ 발주·결제: 화면의 재고 카드에서 바로 장바구니에 담고, 기존 주문서(토스페이먼츠)로 결제
 *
 * 지점 분리
 *  - 세션에 담긴 지점 하나만 조회한다. `?code=`로 다른 지점을 넣어도 데이터는 열리지 않는다.
 *  - 받는 곳도 로그인한 지점 하나로 고정한다(다른 지점 코드로 주문이 나가지 않게).
 *
 * 내부용: 검색 비노출(noindex, nofollow). 홈페이지 메뉴에는 걸지 않는다.
 */

export const metadata: Metadata = {
  title: "점주 포털 | 럭키스팟",
  description: "점주 전용 매출·재고·발주·결제 통합 포털(내부용).",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function OwnerPortalPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const switchMode = first(query.switch) === "1";
  const requested = first(query.code).trim();

  const records = await listStoreRecords();
  const stores: OwnerLoginStore[] = records
    .filter((record) => record.status !== "deleted")
    .map((record) => ({
      code: record.code,
      label: record.label,
      shortLabel: record.shortLabel,
      region: record.region,
      status: record.status,
      demoPin: !record.hasAdminCode && !seedPinFor(record.code),
    }));

  const cookieHeader = (await cookies()).toString();
  const session = switchMode ? null : readOwnerSession(cookieHeader);

  if (!session) {
    return (
      <OwnerLogin
        notice={switchMode ? "지점을 바꾸려면 아래에서 골라 주세요." : null}
        preselect={requested || null}
        stores={stores}
      />
    );
  }

  const record = await findStoreRecord(session.code);

  if (!record || record.status === "deleted") {
    return (
      <OwnerLogin
        notice="이 지점을 더 이상 찾을 수 없어요. 다시 로그인해 주세요."
        preselect={null}
        stores={stores}
      />
    );
  }

  if (record.status === "paused") {
    return (
      <main className="min-h-screen bg-[#F4F5F6]">
        <div className="mx-auto w-full max-w-[430px] px-5 pb-10 pt-10">
          <div className="rounded-[24px] bg-white px-6 py-7 text-center shadow-[0_1px_2px_rgba(15,20,18,0.04)]">
            <span className="inline-flex rounded-full bg-[#FFF6E0] px-2.5 py-1 text-[10.5px] font-bold text-[#8A5A00]">
              일시정지된 지점
            </span>
            <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-[#0F1412]">{record.label}</h1>
            <p className="mt-2 text-[12.5px] font-medium leading-[1.6] text-[#8B948D]">
              본사에서 이 지점 포털을 잠시 멈췄어요. 다시 열려면 본사에 문의해 주세요.
            </p>
            <a
              className="mt-5 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#0F1412] text-[13.5px] font-bold text-white"
              href="/owner?switch=1"
            >
              다른 지점으로 로그인
            </a>
          </div>
        </div>
      </main>
    );
  }

  const data = await loadOwnerDashboard(record);
  const directory = await resolveStoreByCode(record.code).catch(() => null);

  const storeOption: StoreOption = {
    address: directory?.address ?? "",
    code: record.code,
    label: record.label,
    region: record.region || null,
  };

  return <OwnerDashboard data={data} storeOption={storeOption} testMode={isTossTestMode()} />;
}
