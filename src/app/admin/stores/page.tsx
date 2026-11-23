import type { Metadata } from "next";

import StoreAdminConsole from "@/components/admin/StoreAdminConsole";
import InternalHeader from "@/components/internal/InternalHeader";
import { listStoreRecords, portalSecretKeys } from "@/features/stores/registry";
import type { StoreAdminListItem } from "@/features/stores/registry-types";

/**
 * /admin/stores — 본사 매장 등록 + 점주 어드민 발급.
 *
 * 매장을 만들면 `/store/[코드]` 점주 화면과 접근 코드가 동시에 나온다.
 * 목록에는 마스킹된 연락처만 내려가고, 포털 비밀번호는 이 앱이 받지도 저장하지도 않는다.
 */

export const metadata: Metadata = {
  title: "매장·점주 어드민 | 럭키스팟",
  description: "새 매장을 등록하고 점주 전용 어드민을 발급하는 본사 화면(내부용).",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default async function AdminStoresPage() {
  const records = await listStoreRecords();

  const stores: StoreAdminListItem[] = records.map((record) => {
    const { ownerPhone: _ownerPhone, ...rest } = record;

    return { ...rest, secrets: portalSecretKeys(record.code) };
  });

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <InternalHeader action={{ href: "/sales-report", label: "매출 리포트" }} subtitle="매장·점주 어드민" />

      <div className="mx-auto w-full max-w-[760px] px-4 py-5 sm:px-6 sm:py-7">
        <StoreAdminConsole initialStores={stores} />
      </div>
    </main>
  );
}
