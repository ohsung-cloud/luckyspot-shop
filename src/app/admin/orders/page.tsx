import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AdminOrdersClient from "@/components/admin/AdminOrdersClient";
import { hasAdminSession, isAdminConfigured } from "@/features/admin/auth";
import { listAdminOrders } from "@/features/admin/orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "발주 관리",
  description: "럭키스팟 본사 발주 관리",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function AdminOrdersPage() {
  // 미들웨어가 없어도 이 지점에서 한 번 더 검증한다(본문 차단의 최종 지점).
  if (!isAdminConfigured() || !(await hasAdminSession())) {
    redirect("/admin/login");
  }

  const result = await listAdminOrders({ limit: 200 });

  return (
    <AdminOrdersClient
      initialOrders={result.ok ? result.orders : []}
      loadError={result.ok ? null : result.reason}
    />
  );
}
