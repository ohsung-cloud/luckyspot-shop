import type { Metadata } from "next";

import { OrderCompletePageClient } from "./OrderCompletePageClient";

export const metadata: Metadata = {
  title: "주문 접수",
  robots: { index: false, follow: false },
};

type OrderCompletePageProps = {
  searchParams?: Promise<{
    orderId?: string | string[];
    totalPrice?: string | string[];
    count?: string | string[];
    unit?: string | string[];
  }>;
};

function getSingleSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function OrderCompletePage({ searchParams }: OrderCompletePageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <OrderCompletePageClient
      itemCount={getSingleSearchParamValue(resolvedSearchParams?.count)}
      orderId={getSingleSearchParamValue(resolvedSearchParams?.orderId)}
      totalPrice={getSingleSearchParamValue(resolvedSearchParams?.totalPrice)}
      unit={getSingleSearchParamValue(resolvedSearchParams?.unit)}
    />
  );
}
