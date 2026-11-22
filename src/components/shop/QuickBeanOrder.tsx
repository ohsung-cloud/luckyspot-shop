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
import {
  readRecentTaxProfile,
  readStoredTaxProfile,
  saveTaxProfile,
  saveTaxReceipt,
} from "@/features/shop/tax-profile";
import {
  EMPTY_TAX_INVOICE,
  isValidBusinessNo,
  isValidTaxEmail,
  type TaxInvoiceRequest,
} from "@/features/tax-invoice";
import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import type { StoreOption } from "@/features/stores/types";
import { useCartStore } from "@/stores/cartStore";
import TaxInvoiceFields from "./TaxInvoiceFields";

function mergeTax(base: TaxInvoiceRequest, fill: Partial<TaxInvoiceRequest>): TaxInvoiceRequest {
  const pick = (current: string, next: string | undefined) => current.trim() || next?.trim() || "";

  return {
    businessItem: pick(base.businessItem, fill.businessItem),
    businessName: pick(base.businessName, fill.businessName),
    businessNo: pick(base.businessNo, fill.businessNo),
    businessType: pick(base.businessType, fill.businessType),
    ceoName: pick(base.ceoName, fill.ceoName),
    email: pick(base.email, fill.email),
    requested: base.requested,
  };
}

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
  const [tax, setTax] = useState<TaxInvoiceRequest>({ ...EMPTY_TAX_INVOICE });
  const [taxHint, setTaxHint] = useState<string | null>(null);
  const [taxOpen, setTaxOpen] = useState(false);
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

  const taxComplete =
    !tax.requested ||
    (isValidBusinessNo(tax.businessNo) &&
      tax.businessName.trim().length > 0 &&
      tax.ceoName.trim().length > 0 &&
      isValidTaxEmail(tax.email));

  useEffect(() => {
    const recent = readRecentStore();

    if (recent) setStoreCode(recent.code);

    // 세금계산서 정보가 이미 있으면 접어 두고, 없으면 펼쳐서 바로 입력하게 한다.
    const lastTax = readRecentTaxProfile();

    if (lastTax) setTax((current) => mergeTax(current, lastTax));
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

  // 지점을 고르면 그 지점에 저장된 발급 정보 → 서버에 등록된 정보 순으로 채운다.
  useEffect(() => {
    if (!storeCode) return;

    const key = storeCode === DIRECT_SHIPPING_VALUE ? null : storeCode;
    const stored = readStoredTaxProfile(key);

    setTaxHint(null);

    if (stored) setTax((current) => mergeTax(current, stored));

    if (!key) return;

    let cancelled = false;

    fetch(`/api/stores/tax-profile?code=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { profile?: Partial<TaxInvoiceRequest> | null } | null) => {
        if (cancelled || !data?.profile) return;

        setTax((current) => mergeTax(current, data.profile ?? {}));
        setTaxHint("지점에 등록된 사업자 정보를 채웠어요.");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [storeCode]);

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

    if (!taxComplete) {
      setTaxOpen(true);
      setErrorMessage(null);
      document.getElementById("quick-tax")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        body: JSON.stringify({
          items: [{ id: BEAN_BOX_PRODUCT_ID, quantity: boxes }],
          taxInvoice: tax,
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
        throw new Error(result.error ?? "발주를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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

      saveTaxProfile(isDirect ? null : selectedStore?.code ?? null, tax);
      saveTaxReceipt(orderId, tax);

      router.push(
        `/order-complete?orderId=${encodeURIComponent(orderId)}&totalPrice=${encodeURIComponent(
          String(totalPrice),
        )}&count=${encodeURIComponent(String(boxes))}&unit=${encodeURIComponent("박스")}`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "발주를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setSubmitting(false);
    }
  };

  const handleCardCheckout = () => {
    addBundle([{ id: BEAN_BOX_PRODUCT_ID, quantity: boxes }]);
    onOpenCart();
  };

  return (
    <section
      aria-labelledby="quick-bean-title"
      className="relative mt-1 overflow-hidden rounded-[20px] bg-[#0F1412] text-white"
      id="quick-bean"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-[240px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.16),rgba(29,255,38,0))]"
      />

      <div className="relative px-4 pb-5 pt-5 sm:px-6">
        <h2
          className="break-keep text-[24px] font-bold leading-[1.2] tracking-[-0.03em] text-white"
          id="quick-bean-title"
        >
          원두 발주
        </h2>
        <p className="mt-1.5 break-keep text-[15px] leading-[1.5] text-[#D5DCD7]">
          1박스 = {BEAN_BAGS_PER_BOX}봉(10kg) ·{" "}
          <strong className="font-bold text-[#1DFF26]">{formatPrice(unitPrice)}</strong>
        </p>
      </div>

      <div className="relative rounded-t-[18px] bg-white px-4 pb-5 pt-5 text-[#0F1412] sm:px-6">
        {/* ① 지점 */}
        <StepLabel step={1} title="어느 매장인가요?" />

        <div className="relative mt-2" id="quick-store">
          <select
            aria-label="발주 지점 선택"
            className="ls-focus h-14 w-full appearance-none rounded-[12px] border-2 border-[var(--ls-line-strong)] bg-white px-4 pr-11 text-[17px] font-semibold text-[#0F1412] outline-none"
            onChange={(event) => {
              setStoreCode(event.target.value);
              setTaxHint(null);
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
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#0F1412]"
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
          <p className="mt-2 break-keep text-[14px] leading-[1.5] text-[#3B4740]">
            <strong className="font-semibold text-[#0F1412]">{selectedStore.label}</strong>으로
            배송합니다.
          </p>
        ) : null}

        {storeError ? (
          <p
            className="mt-2 break-keep rounded-[10px] bg-[#FDF2F2] px-3.5 py-2.5 text-[15px] font-semibold leading-[1.5] text-[#8A2323]"
            role="alert"
          >
            {storeError}
          </p>
        ) : null}

        {isDirect ? (
          <div className="mt-2 space-y-2">
            <input
              aria-label="주문자 성함"
              className="ls-focus h-14 w-full rounded-[12px] border-2 border-[var(--ls-line-strong)] px-4 text-[16px] text-[#0F1412] outline-none placeholder:text-[#6B746D]"
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="주문자 성함"
              type="text"
              value={customerName}
            />
            <input
              aria-label="휴대폰 번호"
              className="ls-focus h-14 w-full rounded-[12px] border-2 border-[var(--ls-line-strong)] px-4 text-[16px] text-[#0F1412] outline-none placeholder:text-[#6B746D]"
              inputMode="numeric"
              maxLength={11}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="휴대폰 번호 11자리"
              type="tel"
              value={phone}
            />
            <input
              aria-label="배송지 주소"
              className="ls-focus h-14 w-full rounded-[12px] border-2 border-[var(--ls-line-strong)] px-4 text-[16px] text-[#0F1412] outline-none placeholder:text-[#6B746D]"
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

        <div className="mt-2 space-y-2 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0" role="group" aria-label="원두 박스 수량 선택">
          {BEAN_BOX_OPTIONS.map((option) => {
            const active = boxes === option;

            return (
              <button
                aria-pressed={active}
                className={`ls-focus flex min-h-[78px] w-full items-center justify-between gap-3 rounded-[14px] px-4 text-left transition-colors sm:min-h-[118px] sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:px-5 ${
                  active
                    ? "bg-[#0F1412] text-white ring-2 ring-[#0F1412] ring-offset-2"
                    : "border-2 border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
                }`}
                key={option}
                onClick={() => setBoxes(option)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[21px] font-bold leading-none">{option}박스</span>
                    {option === 1 ? (
                      <span
                        className={`rounded-full px-2 py-[3px] text-[11.5px] font-bold ${
                          active ? "bg-[#1DFF26] text-[#0F1412]" : "bg-[#EDFBEF] text-[#0B5C2A]"
                        }`}
                      >
                        최소
                      </span>
                    ) : null}
                    {active ? (
                      <svg aria-hidden height="16" viewBox="0 0 24 24" width="16">
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
                    className={`mt-1 block text-[14px] font-medium ${
                      active ? "text-[#C8D0CA]" : "text-[#3B4740]"
                    }`}
                  >
                    {beanBoxesToBags(option)}봉 · {beanBoxesToBags(option)}kg
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[19px] font-bold tabular-nums sm:mt-1 ${
                    active ? "text-[#1DFF26]" : "text-[#0F1412]"
                  }`}
                >
                  {formatPrice(unitPrice * option)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 break-keep text-[14px] leading-[1.5] text-[#3B4740]">
          한 번에 최대 {BEAN_MAX_BOXES}박스까지예요. 더 필요하면{" "}
          <a
            className="whitespace-nowrap font-semibold underline underline-offset-2"
            href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
          >
            {ORDER_SUPPORT_PHONE}
          </a>
          에 전화 주세요.
        </p>

        {/* 세금계산서 — 평소에는 접힌 한 줄, 필요할 때만 연다 */}
        <div className="mt-5 rounded-[14px] border-2 border-[var(--ls-line)]" id="quick-tax">
          <button
            aria-expanded={taxOpen}
            className="ls-focus flex min-h-[56px] w-full items-center justify-between gap-2 rounded-[12px] px-4 text-left"
            onClick={() => setTaxOpen((open) => !open)}
            type="button"
          >
            <span className="text-[16px] font-semibold text-[#0F1412]">세금계산서</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`text-[14.5px] font-semibold ${
                  tax.requested && !taxComplete ? "text-[#B42318]" : tax.requested ? "text-[#0B5C2A]" : "text-[#3B4740]"
                }`}
              >
                {tax.requested ? (taxComplete ? "발급 신청함" : "정보 입력 필요") : "발급 안 함"}
              </span>
              <svg
                aria-hidden
                className={`text-[#3B4740] transition-transform ${taxOpen ? "rotate-180" : ""}`}
                height="14"
                viewBox="0 0 14 14"
                width="14"
              >
                <path
                  d="M3 5.5L7 9.5l4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
          </button>

          {taxOpen ? (
            <div className="px-3 pb-3">
              {!taxComplete ? (
                <p className="mb-2 rounded-[10px] bg-[#FFF7E6] px-3 py-2 text-[14px] font-semibold leading-[1.5] text-[#7A5A00]">
                  사업자 정보를 채워 주세요. 발급이 필요 없으면 위 체크를 풀어 주세요.
                </p>
              ) : null}
              <TaxInvoiceFields hint={taxHint} idPrefix="quick" onChange={setTax} value={tax} />
            </div>
          ) : null}
        </div>

        {/* ③ 낼 금액과 발주 */}
        <div className="mt-5 border-t-2 border-[#0F1412] pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[16px] font-semibold text-[#3B4740]">낼 금액</p>
              <p className="mt-0.5 text-[13.5px] tabular-nums text-[#3B4740]">
                {boxes}박스 · {bags}봉 · 부가세 포함
              </p>
            </div>
            <p className="text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#0F1412]">
              {formatPrice(total)}
            </p>
          </div>
          <p className="mt-1 text-right text-[13px] tabular-nums text-[#3B4740]">
            공급가액 {formatPrice(vat.supply)} + 부가세 {formatPrice(vat.vat)}
          </p>
        </div>

        {errorMessage ? (
          <p
            className="mt-3 break-keep rounded-[12px] border-2 border-[#E4B4B4] bg-[#FDF2F2] px-4 py-3 text-[15px] font-semibold leading-[1.5] text-[#8A2323]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          className="ls-focus mt-4 flex h-[60px] w-full items-center justify-center rounded-[14px] bg-[#0F1412] text-[19px] font-bold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:bg-[#D5DAD7] disabled:text-[#5F6A63]"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {submitting ? "발주 접수 중…" : `${boxes}박스 발주하기`}
        </button>

        <p className="mt-2 break-keep text-center text-[14px] leading-[1.5] text-[#3B4740]">
          발주하면 접수되고, 입금하시면 출고됩니다.
        </p>

        <button
          className="ls-focus mt-3 flex h-[54px] w-full items-center justify-center rounded-[14px] border-2 border-[var(--ls-line-strong)] text-[15.5px] font-semibold text-[#0F1412] transition-colors hover:border-[#0F1412]"
          onClick={handleCardCheckout}
          type="button"
        >
          카드로 결제하기
        </button>
      </div>
    </section>
  );
}

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[18px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412]">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-[#0F1412] text-[14px] font-bold text-[#1DFF26]"
      >
        {step}
      </span>
      {title}
    </h3>
  );
}
