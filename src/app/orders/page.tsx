import type { Metadata } from "next";

import OrdersLookupClient from "@/components/orders/OrdersLookupClient";
import { listStoreOptions } from "@/features/stores/directory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 발주 내역 조회",
  description: "럭키스팟 점주 발주 내역과 처리 상태(접수대기·본사승인·출고완료)를 확인하세요.",
  robots: { index: false, follow: false },
};

export default async function OrdersLookupPage() {
  const stores = await listStoreOptions();

  return (
    <OrdersLookupClient
      stores={stores.map((store) => ({ code: store.code, label: store.label }))}
    />
  );
}
