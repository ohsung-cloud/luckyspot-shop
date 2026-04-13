import { OrderCompletePageClient } from "./OrderCompletePageClient";

type OrderCompletePageProps = {
  searchParams?: Promise<{
    orderId?: string | string[];
    totalPrice?: string | string[];
  }>;
};

function getSingleSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function OrderCompletePage({
  searchParams,
}: OrderCompletePageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <OrderCompletePageClient
      orderId={getSingleSearchParamValue(resolvedSearchParams?.orderId)}
      totalPrice={getSingleSearchParamValue(resolvedSearchParams?.totalPrice)}
    />
  );
}
