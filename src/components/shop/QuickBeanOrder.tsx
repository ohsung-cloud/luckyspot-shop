"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DIRECT_SHIPPING_LABEL, DIRECT_SHIPPING_VALUE } from "@/data/address";
import {
  BEAN_BAGS_PER_BOX,
  BEAN_BOX_OPTIONS,
  BEAN_BOX_PRODUCT_ID,
  BEAN_MAX_BOXES,
  BEAN_PRICE_PER_BOX,
  beanBoxesToBags,
  formatPrice,
  getProductById,
  splitVat,
} from "@/data/products";
import {
  readRecentStore,
  writeLastOrder,
  writeRecentStore,
} from "@/features/shop/preferences";
import { saveTaxReceipt } from "@/features/shop/tax-receipt";
import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import type { StoreOption } from "@/features/stores/types";
import { Card, CardBody, CardHead, Chip } from "@/components/internal/card-ui";
import { useCartStore } from "@/stores/cartStore";
import TaxInvoiceToggle from "./TaxInvoiceToggle";

/**
 * 원두 간편 발주 — 한 화면에서 세 번 누르면 끝난다.
 *
 *   ① 어느 매장인가요?  (지점 선택 — 마지막에 고른 지점이 미리 선택된다)
 *   ② 몇 박스 보낼까요?  (1·2·3박스 큰 카드 중 하나)
 *   ③ 낼 금액을 보고 "발주하기"
 *
 * 설계 원칙(럭키스팟 10원칙 · Mobile First / Simplicity Wins)
 *  - 60대 점주가 한 손으로 누를 수 있게 버튼을 크게, 글씨를 크게, 회색 글씨는 짙게.
 *  - 영어 라벨·단계 이동·수량 스태퍼·합계 표를 두지 않는다(오조작·고민 지점을 없앤다).
 *  - 원두는 1박스(1kg × 10봉 = 10kg) 단위로만 발주한다. 최소 1박스 · 최대 3박스.
 *  - 금액은 화면 표시일 뿐이고, 서버(/api/orders)가 카탈로그 단가로 다시 계산한다.
 */
export default function QuickBeanOrder({
  onOpenCart,
}: {
  /** "카드로 결제하기" — 기존 주문서를 연다 */
  onOpenCart: () => void;
  /** 토스 테스트 결제 모드 여부(결제는 주문서에서 알린다) */
  testMode?: boolean;
}) {
  const router = useRouter();
  const addBundle = useCartStore((state) => state.addBundle);

  const bean = useMemo(() => getProductById(BEAN_BOX_PRODUCT_ID), []);

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [storeCode, setStoreCode] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [boxes, setBoxes] = useState(1);
  // 세금계산서는 "발급 요청 여부"만 고른다. 사업자 정보는 서버가 지점 코드로 채운다.
  const [taxRequested, setTaxRequested] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

  const unitPrice = bean?.price ?? BEAN_PRICE_PER_BOX;
  const bags = beanBoxesToBags(boxes);
  const total = unitPrice * boxes;
  const vat = splitVat(total);

  const isDirect = storeCode === DIRECT_SHIPPING_VALUE;
  const selectedStore = stores.find((store) => store.code === storeCode) ?? null;

  const directComplete =
    customerName.trim().length > 0 && /^01\d{8,9}$/.test(phone) && deliveryAddress.trim().length > 0;
  const storeComplete = isDirect ? directComplete : Boolean(selectedStore);

  useEffect(() => {
    const recent = readRecentStore();

    if (recent) setStoreCode(recent.code);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/stores", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { stores?: StoreOption[] }) => {
        if (cancelled) return;

        setStores(Array.isArray(data.stores) ? data.stores : []);
        setStoresLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStoresLoaded(true);
        setErrorMessage("지점 목록을 불러오지 못했어요. 새로고침해 주세요.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;

    // 막힌 곳을 버튼 아래 글로만 알리지 않고, 그 자리로 데려가 바로 고치게 한다.
    if (!storeComplete) {
      setStoreError(
        isDirect ? "성함·연락처·주소를 모두 입력해 주세요." : "매장을 먼저 골라 주세요.",
      );
      document.getElementById("quick-store")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setStoreError(null);
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        body: JSON.stringify({
          items: [{ id: BEAN_BOX_PRODUCT_ID, quantity: boxes }],
          taxInvoiceRequested: taxRequested,
          // 지점 주문은 코드만 보낸다 — 이름·연락처·주소는 서버가 지점 정보로 채운다.
          ...(isDirect
            ? {
                address: deliveryAddress.trim(),
                name: customerName.trim(),
                phone,
                shippingOption: DIRECT_SHIPPING_LABEL,
              }
            : { storeCode: selectedStore?.code }),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        totalPrice?: number;
      };

      if (!response.ok || !result.orderId) {
        throw new Error(result.error ?? "발주를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }

      const orderId = result.orderId;
      const totalPrice = Number(result.totalPrice ?? total);

      if (selectedStore) {
        writeRecentStore({ code: selectedStore.code, label: selectedStore.label });
      }

      writeLastOrder({
        count: boxes,
        createdAt: new Date().toISOString(),
        items: [{ id: BEAN_BOX_PRODUCT_ID, quantity: boxes }],
        orderNumber: orderId,
        storeCode: selectedStore?.code ?? null,
        storeName: selectedStore?.label ?? null,
        totalAmount: totalPrice,
      });

      saveTaxReceipt(orderId, taxRequested);

      router.push(
        `/order-complete?orderId=${encodeURIComponent(orderId)}&totalPrice=${encodeURIComponent(
          String(totalPrice),
        )}&count=${encodeURIComponent(String(boxes))}&unit=${encodeURIComponent("박스")}`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "발주를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      setSubmitting(false);
    }
  };

  const handleCardCheckout = () => {
    addBundle([{ id: BEAN_BOX_PRODUCT_ID, quantity: boxes }]);
    onOpenCart();
  };

  return (
    <Card className="mt-3">
      <CardHead
        right={<Chip tone="green">3단계</Chip>}
        sub={`1박스는 ${BEAN_BAGS_PER_BOX}봉(10kg) · ${formatPrice(unitPrice)}이에요`}
        title="원두 간편 발주"
      />

      <CardBody className="pt-4">
        {/* ① 지점 */}
        <StepLabel step={1} title="어느 매장인가요?" />

        <div className="relative mt-2" id="quick-store">
          <select
            aria-label="발주 지점 선택"
            className="ls-focus h-14 w-full appearance-none rounded-[14px] bg-[#F7F8F9] px-4 pr-11 text-[17px] font-semibold text-[#0F1412] outline-none ring-0 transition-shadow focus:ring-2 focus:ring-[#0F1412]"
            onChange={(event) => {
              setStoreCode(event.target.value);
              setStoreError(null);
            }}
            value={storeCode}
          >
            <option disabled value="">
              {storesLoaded ? "매장을 선택해 주세요" : "매장 목록 불러오는 중…"}
            </option>
            {stores.map((store) => (
              <option key={store.code} value={store.code}>
                {store.label}
              </option>
            ))}
            <option value={DIRECT_SHIPPING_VALUE}>{DIRECT_SHIPPING_LABEL}</option>
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#8B948D]"
          >
            <svg height="16" viewBox="0 0 14 14" width="16">
              <path
                d="M3 5.5L7 9.5l4-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </span>
        </div>

        {selectedStore ? (
          <p className="mt-2 break-keep text-[13.5px] leading-[1.5] text-[#8B948D]">
            <strong className="font-bold text-[#0B5C2A]">{selectedStore.label}</strong>으로 배송해요.
          </p>
        ) : null}

        {storeError ? (
          <p
            className="mt-2 break-keep rounded-[12px] bg-[#FFF2F2] px-3.5 py-2.5 text-[13.5px] font-semibold leading-[1.5] text-[#B3261E]"
            role="alert"
          >
            {storeError}
          </p>
        ) : null}

        {isDirect ? (
          <div className="mt-2 space-y-2">
            <input
              aria-label="주문자 성함"
              className="ls-focus h-14 w-full rounded-[14px] bg-[#F7F8F9] px-4 text-[16px] text-[#0F1412] outline-none ring-0 transition-shadow placeholder:text-[#98A29B] focus:ring-2 focus:ring-[#0F1412]"
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="주문자 성함"
              type="text"
              value={customerName}
            />
            <input
              aria-label="휴대폰 번호"
              className="ls-focus h-14 w-full rounded-[14px] bg-[#F7F8F9] px-4 text-[16px] text-[#0F1412] outline-none ring-0 transition-shadow placeholder:text-[#98A29B] focus:ring-2 focus:ring-[#0F1412]"
              inputMode="numeric"
              maxLength={11}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="휴대폰 번호 11자리"
              type="tel"
              value={phone}
            />
            <input
              aria-label="배송지 주소"
              className="ls-focus h-14 w-full rounded-[14px] bg-[#F7F8F9] px-4 text-[16px] text-[#0F1412] outline-none ring-0 transition-shadow placeholder:text-[#98A29B] focus:ring-2 focus:ring-[#0F1412]"
              onChange={(event) => setDeliveryAddress(event.target.value)}
              placeholder="배송지 주소"
              type="text"
              value={deliveryAddress}
            />
          </div>
        ) : null}

        {/* ② 박스 수량 */}
        <div className="mt-6">
          <StepLabel step={2} title="몇 박스 보낼까요?" />
        </div>

        <div
          aria-label="원두 박스 수량 선택"
          className="mt-2 space-y-2 sm:grid sm:grid-cols-3 sm:gap-2.5 sm:space-y-0"
          role="group"
        >
          {BEAN_BOX_OPTIONS.map((option) => {
            const active = boxes === option;

            return (
              <button
                aria-pressed={active}
                className={`ls-focus flex min-h-[78px] w-full items-center justify-between gap-3 rounded-[16px] px-4 text-left transition-colors sm:min-h-[112px] sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:px-5 ${
                  active
                    ? "bg-[#0F1412] text-white shadow-[0_10px_24px_-14px_rgba(15,20,18,0.65)]"
                    : "bg-[#F7F8F9] text-[#0F1412] hover:bg-[#EFF1F0]"
                }`}
                key={option}
                onClick={() => setBoxes(option)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[20px] font-bold leading-none tracking-[-0.01em]">{option}박스</span>
                    {option === 1 ? (
                      <span
                        className={`rounded-full px-2 py-[3px] text-[11px] font-bold leading-none ${
                          active ? "bg-[#1DFF26] text-[#0F1412]" : "bg-[#EDFBEF] text-[#0B5C2A]"
                        }`}
                      >
                        최소
                      </span>
                    ) : null}
                    {active ? (
                      <svg aria-hidden height="15" viewBox="0 0 24 24" width="15">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          fill="none"
                          stroke="#1DFF26"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span
                    className={`mt-1 block text-[13px] font-medium ${
                      active ? "text-[#C8D0CA]" : "text-[#8B948D]"
                    }`}
                  >
                    {beanBoxesToBags(option)}봉 · {beanBoxesToBags(option)}kg
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[18px] font-bold tabular-nums tracking-[0.02em] sm:mt-1 ${
                    active ? "text-[#1DFF26]" : "text-[#0F1412]"
                  }`}
                >
                  {formatPrice(unitPrice * option)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 break-keep text-[13.5px] leading-[1.55] text-[#8B948D]">
          한 번에 최대 {BEAN_MAX_BOXES}박스까지예요. 더 필요하면{" "}
          <a
            className="whitespace-nowrap font-bold text-[#0B5C2A] underline underline-offset-2"
            href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
          >
            {ORDER_SUPPORT_PHONE}
          </a>
          로 전화 주세요.
        </p>

        {/* 세금계산서 — 체크 하나. 사업자 정보는 서버가 지점 코드로 채운다 */}
        <div className="mt-4" id="quick-tax">
          <TaxInvoiceToggle
            idPrefix="quick"
            onChange={setTaxRequested}
            personal={isDirect}
            requested={taxRequested}
          />
        </div>

        {/* ③ 낼 금액과 발주 */}
        <div className="mt-6">
          <StepLabel step={3} title="낼 금액을 확인해 주세요" />
        </div>

        <div className="mt-2 rounded-[18px] bg-[#F7F8F9] px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[#8B948D]">낼 금액</p>
              <p className="mt-0.5 text-[12.5px] tabular-nums tracking-[0.01em] text-[#8B948D]">
                {boxes}박스 · {bags}봉 · 부가세 포함
              </p>
            </div>
            <p className="shrink-0 text-[26px] font-bold leading-none tracking-[0.02em] tabular-nums text-[#0F1412] sm:text-[28px]">
              {formatPrice(total)}
            </p>
          </div>
          <p className="mt-1.5 text-right text-[11.5px] tabular-nums tracking-[0.01em] text-[#98A29B]">
            공급가액 {formatPrice(vat.supply)} + 부가세 {formatPrice(vat.vat)}
          </p>
        </div>

        {errorMessage ? (
          <p
            className="mt-3 break-keep rounded-[12px] bg-[#FFF2F2] px-4 py-3 text-[13.5px] font-semibold leading-[1.5] text-[#B3261E]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className="ls-focus mt-3 flex h-[58px] w-full items-center justify-center rounded-[16px] bg-[#1DFF26] text-[18px] font-bold tracking-[-0.01em] text-[#0F1412] transition-colors hover:bg-[#3BE93F] disabled:opacity-50"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {submitting ? "발주 접수 중…" : `${boxes}박스 발주하기`}
        </button>

        <p className="mt-2 break-keep text-center text-[13px] leading-[1.5] text-[#8B948D]">
          발주하면 접수되고, 입금하시면 출고돼요.
        </p>

        <button
          className="ls-focus mt-2.5 flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#F2F4F6] text-[14.5px] font-bold text-[#3B4740] transition-colors hover:bg-[#E9ECEB]"
          onClick={handleCardCheckout}
          type="button"
        >
          카드로 결제하기
        </button>
      </CardBody>
    </Card>
  );
}

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[16px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412]">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-[#EDFBEF] text-[12px] font-bold text-[#0B5C2A]"
      >
        {step}
      </span>
      {title}
    </h3>
  );
}
