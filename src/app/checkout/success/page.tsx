import type { Metadata } from "next";

import SuccessClient from "./SuccessClient";

export const metadata: Metadata = {
  title: "결제 결과 | 럭키스팟 발주",
  description: "럭키스팟 점주 발주 결제 결과입니다.",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const read = (key: string) => {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" ? first : null;
  };

  return (
    <SuccessClient
      amount={read("amount")}
      code={read("code")}
      message={read("message")}
      orderId={read("orderId")}
      paymentKey={read("paymentKey")}
    />
  );
}
