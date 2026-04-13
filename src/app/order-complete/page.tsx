"use client";

import * as React from "react";
import { useToast } from "@wanteddev/wds";
import { useRouter, useSearchParams } from "next/navigation";

import { LuckyButton } from "@/components/LuckyButton";
import { formatPrice } from "@/features/shop/data";
import {
  generateOrderId,
  ORDER_ACCOUNT_NUMBER,
  ORDER_BANK_NAME,
  ORDER_SUPPORT_PHONE,
} from "@/features/order/utils";

function extractAmount(searchParamValue: string | null) {
  const parsedValue = Number(searchParamValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue;
}

export default function OrderCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [fallbackOrderId] = React.useState(() => generateOrderId());

  const orderId = searchParams.get("orderId") ?? fallbackOrderId;
  const totalPrice = extractAmount(searchParams.get("totalPrice"));
  const formattedTotalPrice = formatPrice(totalPrice);
  const copyPayload = `${ORDER_BANK_NAME} ${ORDER_ACCOUNT_NUMBER} / ${formattedTotalPrice}`;
  const sharePayload = [
    "주문이 접수되었어요. 지금 입금하면 바로 배송해요.",
    `주문번호: ${orderId}`,
    `입금은행: ${ORDER_BANK_NAME}`,
    `계좌번호: ${ORDER_ACCOUNT_NUMBER}`,
    `결제 필요 금액: ${formattedTotalPrice}`,
    `고객센터: ${ORDER_SUPPORT_PHONE}`,
  ].join("\n");

  const handleCopyAccount = async () => {
    await navigator.clipboard?.writeText(copyPayload);
    toast({
      content: "송금계좌와 금액을 복사했어요.",
      duration: "short",
      variant: "normal",
    });
  };

  const handleShareOrder = async () => {
    if (navigator.share) {
      await navigator.share({
        text: sharePayload,
        title: "주문 정보",
      });
      return;
    }

    await navigator.clipboard?.writeText(sharePayload);
    alert("주문 정보가 복사되었습니다.");
  };

  return (
    <main className="flex min-h-screen items-center bg-white px-6 py-24 text-ui-gray-900">
      <section className="mx-auto flex w-full max-w-[432px] flex-col items-center gap-6">
        <div className="w-full space-y-6">
          <h1 className="type-heading-sm break-keep text-ui-gray-900">
            주문이 접수되었어요
            <br />
            지금 입금하면 바로 배송해요
          </h1>

          <div className="py-2">
            <div className="flex min-h-10 items-start justify-between gap-4">
              <p className="type-body-md text-ui-gray-600">주문번호</p>
              <p className="type-body-md text-right text-ui-gray-900">{orderId}</p>
            </div>
            <div className="flex min-h-10 items-start justify-between gap-4">
              <p className="type-body-md text-ui-gray-600">입금은행</p>
              <p className="type-body-md text-right text-ui-gray-900">
                {ORDER_BANK_NAME}
              </p>
            </div>
            <div className="flex min-h-10 items-start justify-between gap-4">
              <p className="type-body-md text-ui-gray-600">계좌번호</p>
              <p className="type-body-md text-right text-ui-gray-900">
                {ORDER_ACCOUNT_NUMBER}
              </p>
            </div>
            <div className="flex min-h-10 items-start justify-between gap-4">
              <p className="type-body-md text-ui-gray-600">결제 필요 금액</p>
              <p className="type-body-md text-right text-ui-gray-900">
                {formattedTotalPrice}
              </p>
            </div>

            <div className="mt-2 border-t border-ui-gray-200 pt-2">
              <div className="flex min-h-10 items-start justify-between gap-4">
                <p className="type-body-md text-ui-gray-600">계산서 발행</p>
                <button
                  className="type-body-md border-0 bg-transparent p-0 text-brand-400 underline decoration-solid underline-offset-[3px]"
                  onClick={() => {
                    window.open(`tel:${ORDER_SUPPORT_PHONE.replaceAll("-", "")}`);
                  }}
                  type="button"
                >
                  고객센터 문의
                </button>
              </div>
              <div className="flex min-h-10 items-start justify-between gap-4">
                <p className="type-body-md text-ui-gray-600">
                  주문취소 및 기타문의
                </p>
                <a
                  className="type-body-md text-brand-400 underline decoration-solid underline-offset-[3px]"
                  href={`tel:${ORDER_SUPPORT_PHONE.replaceAll("-", "")}`}
                >
                  {ORDER_SUPPORT_PHONE}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full space-y-3">
          <LuckyButton
            ariaLabel="계좌 및 금액 복사하기"
            fullWidth
            onClick={() => {
              void handleCopyAccount();
            }}
            sx={{
              minHeight: "56px",
              borderRadius: "16px",
              backgroundColor: "#0090FF",
              fontSize: "20px",
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            계좌 및 금액 복사하기
          </LuckyButton>
          <LuckyButton
            appearance="weak"
            ariaLabel="닫기"
            fullWidth
            onClick={() => router.push("/")}
            sx={{
              minHeight: "56px",
              borderRadius: "16px",
              backgroundColor: "#E7F7FF",
              color: "#0090FF",
              fontSize: "20px",
              fontWeight: 600,
              lineHeight: 1.5,
              "&:hover:not(:disabled), &:active:not(:disabled)": {
                backgroundColor: "#E7F7FF",
                color: "#0090FF",
              },
            }}
          >
            닫기
          </LuckyButton>
        </div>

        <button
          className="type-body-md border-0 bg-transparent p-0 text-brand-400 underline decoration-solid underline-offset-[3px]"
          onClick={() => {
            void handleShareOrder();
          }}
          type="button"
        >
          주문정보 공유하기
        </button>
      </section>
    </main>
  );
}
