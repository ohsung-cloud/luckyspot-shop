"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useToast } from "@wanteddev/wds";
import { useRouter } from "next/navigation";
import { IconCheckThick, IconChevronDown } from "@wanteddev/wds-icon";

import { LuckyButton } from "@/components/LuckyButton";
import ShopProductImage from "@/components/ShopProductImage";
import {
  DIRECT_SHIPPING_VALUE,
  getShopAddressByValue,
  shopAddresses,
} from "@/data/address";
import { formatPrice } from "@/data/products";
import {
  selectCartTotalPrice,
  useCartStore,
} from "@/stores/cartStore";
import { useConsultationModal } from "./ConsultationModalProvider";

export default function ConsultationBottomSheet() {
  const router = useRouter();
  const toast = useToast();
  const { isOpen, close } = useConsultationModal();
  const cartItems = useCartStore((state) => state.items);
  const clearItems = useCartStore((state) => state.clearItems);
  const removeItem = useCartStore((state) => state.removeItem);
  const totalPrice = useCartStore(selectCartTotalPrice);
  const [visible, setVisible] = useState(false);
  const [selectedAddressValue, setSelectedAddressValue] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedAddress = getShopAddressByValue(selectedAddressValue);
  const isAddressSelected = Boolean(selectedAddress);
  const isDirectShipping = selectedAddress?.value === DIRECT_SHIPPING_VALUE;
  const isDirectShippingComplete =
    customerName.trim().length > 0 &&
    phoneNumber.length === 11 &&
    deliveryAddress.trim().length > 0;
  const isSubmitDisabled =
    !cartItems.length ||
    !isAddressSelected ||
    isSubmitting ||
    (isDirectShipping && !isDirectShippingComplete);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    setVisible(false);
  }, [isOpen]);

  const resetForm = () => {
    setSelectedAddressValue("");
    setCustomerName("");
    setPhoneNumber("");
    setDeliveryAddress("");
    setAgreedToPrivacy(true);
  };

  const handleClose = () => {
    setVisible(false);
    window.setTimeout(() => {
      resetForm();
      close();
    }, 300);
  };

  const handleRemoveCartItem = (itemId: string) => {
    const willBeEmpty = cartItems.length === 1;

    removeItem(itemId);

    if (willBeEmpty) {
      handleClose();
      toast({
        content: "장바구니에 담긴 상품이 없습니다",
        duration: "short",
        variant: "normal",
      });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!cartItems.length) {
      toast({
        content: "장바구니에 담긴 상품이 없습니다",
        duration: "short",
        variant: "normal",
      });
      return;
    }

    if (!selectedAddress) {
      toast({
        content: "주소를 선택해주세요",
        duration: "short",
        variant: "normal",
      });
      return;
    }

    if (isDirectShipping && !isDirectShippingComplete) {
      toast({
        content: "필수 정보를 입력해주세요",
        duration: "short",
        variant: "normal",
      });
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const orderPayload = {
        address: isDirectShipping
          ? deliveryAddress.trim()
          : selectedAddress.address,
        items: cartItems,
        name: isDirectShipping ? customerName.trim() : selectedAddress.name,
        phone: isDirectShipping ? phoneNumber.trim() : selectedAddress.phone,
        shippingOption: selectedAddress.label,
      };

      const response = await fetch("/api/orders", {
        body: JSON.stringify(orderPayload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const result = (await response.json()) as {
        error?: string;
        orderId?: string;
        totalPrice?: number;
      };

      if (!response.ok || !result.orderId) {
        throw new Error(result.error ?? "Order request failed");
      }

      const nextUrl = `/order-complete?orderId=${encodeURIComponent(
        result.orderId,
      )}&totalPrice=${encodeURIComponent(
        (result.totalPrice ?? totalPrice).toString(),
      )}`;

      clearItems();
      resetForm();
      close();
      router.push(nextUrl);
    } catch (error) {
      toast({
        content:
          error instanceof Error
            ? error.message
            : "주문 접수에 실패했습니다 잠시 후 다시 시도해주세요",
        duration: "short",
        variant: "negative",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        style={{
          backgroundColor: visible ? "rgba(0,0,0,0.4)" : "transparent",
          transition: "background-color 0.3s ease",
        }}
        onClick={handleClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center pointer-events-none min-[1200px]:left-1/2 min-[1200px]:w-[480px] min-[1200px]:right-auto">
        <form
          className="pointer-events-auto flex max-h-[calc(100vh-24px)] w-full max-w-[480px] flex-col overflow-y-auto bg-white"
          onSubmit={handleSubmit}
          style={{
            borderTopLeftRadius: "28px",
            borderTopRightRadius: "28px",
            transform: visible ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.3s ease",
          }}
        >
          <div className="flex justify-center px-6 pb-2 pt-4">
            <div className="h-1 w-12 rounded-[40px] bg-ui-gray-200" />
          </div>

          <div className="bg-white px-6 pb-2">
            {cartItems.length ? (
              <div className="max-h-[352px] overflow-y-auto overscroll-contain border-y border-ui-gray-200">
                {cartItems.map((item) => (
                  <article
                    key={item.id}
                    className="flex min-h-[160px] items-center justify-between py-6"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <h2 className="type-heading-xs break-keep text-ui-gray-900">
                        {item.name}
                      </h2>
                      <p className="type-body-lg mt-2 text-ui-gray-600">
                        {formatPrice(item.price)}
                      </p>
                      <LuckyButton
                        appearance="link"
                        className="mt-2 w-fit"
                        onClick={() => handleRemoveCartItem(item.id)}
                        sx={{
                          minHeight: "auto",
                          paddingInline: "0px",
                          fontSize: "16px",
                          fontWeight: 400,
                          lineHeight: "24px",
                          justifyContent: "flex-start",
                          textUnderlineOffset: "3px",
                        }}
                      >
                        삭제하기
                      </LuckyButton>
                    </div>

                    <ShopProductImage product={item} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[140px] items-center justify-center rounded-[16px] border border-ui-gray-200 bg-white px-6 py-8 text-center">
                <p className="type-body-md text-ui-gray-600">
                  장바구니에 담긴 상품이 아직 없어요.
                  <br />
                  원하는 상품을 담으면 여기에서 바로 주문할 수 있습니다.
                </p>
              </div>
            )}
          </div>

          <div className="px-6 pb-2 pt-2">
            <div className="space-y-3">
              <div className="relative">
                <select
                  className="type-body-md h-12 w-full appearance-none rounded-[8px] border border-ui-gray-200 bg-white px-5 pr-12 text-ui-gray-900 outline-none"
                  onChange={(event) => setSelectedAddressValue(event.target.value)}
                  value={selectedAddressValue}
                >
                  <option value="" disabled>
                    주소 선택
                  </option>
                  {shopAddresses.map((address) => (
                    <option key={address.value} value={address.value}>
                      {address.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-ui-gray-600">
                  <IconChevronDown style={{ fontSize: "24px" }} />
                </span>
              </div>
              {isDirectShipping ? (
                <>
                  <input
                    className="type-body-md h-12 w-full rounded-[8px] border border-ui-gray-200 px-5 text-ui-gray-900 outline-none placeholder:text-ui-gray-600"
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="주문자 성함"
                    type="text"
                    value={customerName}
                  />
                  <input
                    className="type-body-md h-12 w-full rounded-[8px] border border-ui-gray-200 px-5 text-ui-gray-900 outline-none placeholder:text-ui-gray-600"
                    inputMode="numeric"
                    maxLength={11}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 11));
                    }}
                    placeholder="휴대폰 번호 11자리"
                    type="tel"
                    value={phoneNumber}
                  />
                  <input
                    className="type-body-md h-12 w-full rounded-[8px] border border-ui-gray-200 px-5 text-ui-gray-900 outline-none placeholder:text-ui-gray-600"
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                    placeholder="배송지 주소 입력"
                    type="text"
                    value={deliveryAddress}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="px-6 pb-4 pt-2">
            <label className="flex items-center gap-2">
              <input
                checked={agreedToPrivacy}
                className="sr-only"
                onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                type="checkbox"
              />
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-[5px] ${
                  agreedToPrivacy
                    ? "text-brand-400"
                    : "border border-ui-gray-300 text-transparent"
                }`}
              >
                {agreedToPrivacy ? (
                  <IconCheckThick style={{ fontSize: "20px" }} />
                ) : null}
              </span>
              <span className="type-body-sm text-ui-gray-600">
                제출 시 개인정보수집에 자동 동의합니다
              </span>
              <LuckyButton
                appearance="link"
                sx={{
                  minHeight: "auto",
                  paddingInline: "0px",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "20px",
                  textUnderlineOffset: "2px",
                }}
              >
                약관보기
              </LuckyButton>
            </label>
          </div>

          <div className="space-y-3 px-6 pb-4 pt-0">
            <LuckyButton
              appearance={isSubmitDisabled ? "weak" : "fill"}
              disabled={isSubmitDisabled}
              fullWidth
              type="submit"
              sx={{
                minHeight: "56px",
                borderRadius: "16px",
                fontSize: "20px",
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              {isSubmitting
                ? "주문 접수 중..."
                : `${formatPrice(totalPrice)} 주문하기`}
            </LuckyButton>

            <LuckyButton
              appearance="weak"
              fullWidth
              onClick={handleClose}
              sx={{
                minHeight: "56px",
                borderRadius: "16px",
                backgroundColor: "#E7F7FF",
                color: "#00A0FF",
                fontSize: "20px",
                fontWeight: 600,
                lineHeight: 1.5,
                "&:hover:not(:disabled), &:active:not(:disabled)": {
                  backgroundColor: "#E7F7FF",
                  color: "#00A0FF",
                },
              }}
            >
              닫기
            </LuckyButton>
          </div>
        </form>
      </div>
    </>
  );
}
