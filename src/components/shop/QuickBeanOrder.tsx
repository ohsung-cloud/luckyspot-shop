"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DIRECT_SHIPPING_LABEL, DIRECT_SHIPPING_VALUE } from "@/data/address";
import { formatPrice, getProductById, splitVat } from "@/data/products";
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
import { ORDER_ACCOUNT_NUMBER, ORDER_BANK_NAME, ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import type { StoreOption } from "@/features/stores/types";
import { useCartStore } from "@/stores/cartStore";
import QuantityStepper from "./QuantityStepper";
import TaxInvoiceFields from "./TaxInvoiceFields";

const BEAN_PRODUCT_ID = "bean-1kg";
const BEAN_FALLBACK_PRICE = 20000;
const QUICK_QUANTITIES = [1, 5, 10, 20] as const;
const MAX_QUANTITY = 100;

type Step = 1 | 2 | 3;

const STEPS: { key: Step; label: string }[] = [
  { key: 1, label: "지점" },
  { key: 2, label: "수량" },
  { key: 3, label: "발주 확인" },
];

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
 * 원두 3단계 빠른 발주 — 발주 페이지 최상단.
 *
 *   Step 1  지점 선택(또는 직접 입력)  → 등록된 배송지·세금계산서 기본 정보 프리필
 *   Step 2  1 / 5 / 10 / 20봉 원클릭 + -/+ 수량, 합계·부가세 실시간 계산
 *   Step 3  세금계산서 발급 확인 + 원클릭 주문 접수 → 주문 완료 화면
 *
 * 금액은 화면에서 보여주는 값일 뿐이고, 서버(/api/orders)가 카탈로그 단가로 다시 계산한다.
 * 원두 발주가 대부분이라 99품목 탐색 없이 3단계로 끝나게 하고, 전체 품목은 아래에 그대로 둔다.
 */
export default function QuickBeanOrder({
  onOpenCart,
  testMode = false,
}: {
  /** "장바구니에 담고 카드 결제" — 기존 주문서를 연다 */
  onOpenCart: () => void;
  testMode?: boolean;
}) {
  const router = useRouter();
  const addBundle = useCartStore((state) => state.addBundle);

  const bean = useMemo(() => getProductById(BEAN_PRODUCT_ID), []);
  const unitPrice = bean?.price ?? BEAN_FALLBACK_PRICE;
  const productName = bean?.name ?? "제이웨이브 레귤러핏 원두";

  const [step, setStep] = useState<Step>(1);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [storeCode, setStoreCode] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tax, setTax] = useState<TaxInvoiceRequest>({ ...EMPTY_TAX_INVOICE });
  const [taxHint, setTaxHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isDirect = storeCode === DIRECT_SHIPPING_VALUE;
  const selectedStore = stores.find((store) => store.code === storeCode) ?? null;

  const total = unitPrice * quantity;
  const vat = splitVat(total);

  const directComplete =
    customerName.trim().length > 0 && /^01\d{8,9}$/.test(phone) && deliveryAddress.trim().length > 0;
  const step1Complete = isDirect ? directComplete : Boolean(selectedStore);

  const taxComplete =
    !tax.requested ||
    (isValidBusinessNo(tax.businessNo) &&
      tax.businessName.trim().length > 0 &&
      tax.ceoName.trim().length > 0 &&
      isValidTaxEmail(tax.email));

  useEffect(() => {
    const recent = readRecentStore();

    if (recent) setStoreCode(recent.code);

    // 지점을 아직 고르지 않았을 때도 마지막에 쓴 발급 정보를 제안한다.
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
        setErrorMessage("지점 목록을 불러오지 못했어요. 직접 입력으로 발주하거나 새로고침해 주세요.");
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

    if (stored) {
      setTax((current) => mergeTax(current, stored));
    }

    if (!key) return;

    let cancelled = false;

    fetch(`/api/stores/tax-profile?code=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { profile?: Partial<TaxInvoiceRequest> | null } | null) => {
        if (cancelled || !data?.profile) return;

        setTax((current) => mergeTax(current, data.profile ?? {}));
        setTaxHint(`${selectedStore?.label ?? "지점"}에 등록된 사업자 정보를 채웠어요. 필요하면 수정하세요.`);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // selectedStore 는 storeCode 가 바뀔 때 함께 바뀐다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode]);

  const setQuantitySafe = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;

    setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Math.round(next))));
  }, []);

  const handleSubmit = async () => {
    if (submitting || !step1Complete || !taxComplete) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        body: JSON.stringify({
          items: [{ id: BEAN_PRODUCT_ID, quantity }],
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
        throw new Error(result.error ?? "발주 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const orderId = result.orderId;
      const totalPrice = Number(result.totalPrice ?? total);

      if (selectedStore) {
        writeRecentStore({ code: selectedStore.code, label: selectedStore.label });
      }

      writeLastOrder({
        count: quantity,
        createdAt: new Date().toISOString(),
        items: [{ id: BEAN_PRODUCT_ID, quantity }],
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
        )}&count=${encodeURIComponent(String(quantity))}&quick=1`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "발주 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setSubmitting(false);
    }
  };

  const handleCartCheckout = () => {
    addBundle([{ id: BEAN_PRODUCT_ID, quantity }]);
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

      <div className="relative px-4 pb-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#7CE785]">
              BEAN QUICK ORDER · 20,000원/봉
            </p>
            <h2
              className="mt-1 break-keep text-[20px] font-semibold tracking-[-0.03em] text-white"
              id="quick-bean-title"
            >
              원두는 3단계면 끝
            </h2>
            <p className="mt-1 break-keep text-[11.5px] leading-[1.55] text-[#A9B4AC]">
              지점 → 수량 → 발주 확인. 99품목을 찾지 않아도 됩니다. 세금계산서도 여기서 함께
              신청하세요.
            </p>
          </div>
          <button
            className="ls-focus h-8 shrink-0 rounded-full border border-[#2C3730] px-3 text-[11px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
            onClick={handleCartCheckout}
            type="button"
          >
            장바구니에 담고 카드 결제
          </button>
        </div>

        <ol className="mt-3 flex items-center gap-1.5" aria-label="빠른 발주 단계">
          {STEPS.map((item, index) => {
            const active = step === item.key;
            const done = step > item.key;

            return (
              <li className="flex flex-1 items-center gap-1.5" key={item.key}>
                <button
                  aria-current={active ? "step" : undefined}
                  className={`ls-focus flex h-8 w-full items-center justify-center gap-1.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                    active
                      ? "bg-[#1DFF26] text-[#0F1412]"
                      : done
                        ? "border border-[#1DFF26]/40 bg-[#16231A] text-[#7CE785]"
                        : "border border-[#2C3730] text-[#8C9690]"
                  }`}
                  disabled={item.key > step && !(step === 1 && item.key === 2 && step1Complete)}
                  onClick={() => {
                    if (item.key <= step) setStep(item.key);
                    else if (step === 1 && item.key === 2 && step1Complete) setStep(2);
                  }}
                  type="button"
                >
                  <span className="tabular-nums">{done ? "✓" : item.key}</span>
                  {item.label}
                </button>
                {index < STEPS.length - 1 ? <span aria-hidden className="h-px w-2 bg-[#2C3730]" /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative rounded-t-[18px] bg-white px-4 pb-4 pt-4 text-[#0F1412] sm:px-5">
        {step === 1 ? (
          <div>
            <h3 className="text-[14px] font-semibold">어느 지점으로 보낼까요?</h3>
            <p className="mt-0.5 text-[11px] text-[var(--ls-muted)]">
              지점을 고르면 등록된 배송지·연락처로 접수되고, 세금계산서 기본 정보도 함께 채워집니다.
            </p>

            <div className="relative mt-2.5">
              <select
                aria-label="발주 지점 선택"
                className="ls-focus h-12 w-full appearance-none rounded-[10px] border border-[var(--ls-line-strong)] bg-white px-3.5 pr-10 text-[13.5px] text-[#0F1412] outline-none"
                onChange={(event) => {
                  setStoreCode(event.target.value);
                  setTaxHint(null);
                }}
                value={storeCode}
              >
                <option disabled value="">
                  {storesLoaded ? "지점을 선택해 주세요" : "지점 목록 불러오는 중…"}
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
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ls-muted)]"
              >
                <svg height="14" viewBox="0 0 14 14" width="14">
                  <path
                    d="M3 5.5L7 9.5l4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                </svg>
              </span>
            </div>

            {selectedStore ? (
              <p className="mt-2 rounded-[10px] bg-[#F4F5F6] px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-[var(--ls-muted)]">
                <strong className="font-semibold text-[#0F1412]">{selectedStore.label}</strong> 배송지
                {selectedStore.address ? (
                  <>
                    <br />
                    {selectedStore.address}
                  </>
                ) : null}
                <br />
                연락처는 지점에 등록된 점주 번호로 안내되며, 화면에는 표시하지 않습니다.
              </p>
            ) : null}

            {isDirect ? (
              <div className="mt-2 space-y-2">
                <input
                  aria-label="주문자 성함"
                  className="ls-focus h-12 w-full rounded-[10px] border border-[var(--ls-line-strong)] px-3.5 text-[13.5px] text-[#0F1412] outline-none placeholder:text-[var(--ls-muted)]"
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="주문자 성함"
                  type="text"
                  value={customerName}
                />
                <input
                  aria-label="휴대폰 번호"
                  className="ls-focus h-12 w-full rounded-[10px] border border-[var(--ls-line-strong)] px-3.5 text-[13.5px] text-[#0F1412] outline-none placeholder:text-[var(--ls-muted)]"
                  inputMode="numeric"
                  maxLength={11}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="휴대폰 번호 11자리"
                  type="tel"
                  value={phone}
                />
                <input
                  aria-label="배송지 주소"
                  className="ls-focus h-12 w-full rounded-[10px] border border-[var(--ls-line-strong)] px-3.5 text-[13.5px] text-[#0F1412] outline-none placeholder:text-[var(--ls-muted)]"
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="배송지 주소"
                  type="text"
                  value={deliveryAddress}
                />
              </div>
            ) : null}

            {errorMessage ? (
              <p className="mt-2 rounded-[10px] border border-[#E4B4B4] bg-[#FDF2F2] px-3 py-2 text-[11.5px] leading-[1.5] text-[#8A2323]">
                {errorMessage}
              </p>
            ) : null}

            <button
              className="ls-focus mt-3 h-12 w-full rounded-[12px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:bg-[#D5DAD7] disabled:text-[#8A948D]"
              disabled={!step1Complete}
              onClick={() => {
                setErrorMessage(null);
                setStep(2);
              }}
              type="button"
            >
              {step1Complete
                ? "다음 · 원두 수량"
                : isDirect
                  ? "성함·연락처·주소를 모두 입력해 주세요"
                  : "지점을 선택해 주세요"}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold">{productName}</h3>
                <p className="mt-0.5 text-[11px] text-[var(--ls-muted)]">
                  1봉 {formatPrice(unitPrice)} · VAT 포함 · 1kg
                </p>
              </div>
              <button
                className="ls-focus text-[11.5px] text-[var(--ls-muted)] underline decoration-[var(--ls-line-strong)] underline-offset-2 hover:text-[#0F1412]"
                onClick={() => setStep(1)}
                type="button"
              >
                지점 변경
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {QUICK_QUANTITIES.map((option) => {
                const active = quantity === option;

                return (
                  <button
                    aria-pressed={active}
                    className={`ls-focus flex h-[58px] flex-col items-center justify-center rounded-[12px] text-[13.5px] font-semibold transition-colors ${
                      active
                        ? "bg-[#0F1412] text-[#1DFF26]"
                        : "border border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
                    }`}
                    key={option}
                    onClick={() => setQuantitySafe(option)}
                    type="button"
                  >
                    {option}봉
                    <span
                      className={`mt-0.5 text-[10px] font-medium tabular-nums ${
                        active ? "text-[#8CF695]" : "text-[var(--ls-muted)]"
                      }`}
                    >
                      {formatPrice(unitPrice * option)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-[var(--ls-muted)]">수량 조절</p>
                <p className="mt-0.5 text-[26px] font-semibold tabular-nums leading-none tracking-[-0.03em]">
                  {quantity}
                  <span className="ml-1 text-[12px] font-medium text-[var(--ls-muted)]">봉</span>
                </p>
              </div>
              <QuantityStepper
                label="원두 수량"
                onChange={setQuantitySafe}
                quantity={quantity}
                size="md"
              />
            </div>

            <dl className="mt-3 space-y-1.5 rounded-[12px] bg-[#F4F5F6] px-3.5 py-3 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-[var(--ls-muted)]">공급가액</dt>
                <dd className="tabular-nums">{formatPrice(vat.supply)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ls-muted)]">부가세</dt>
                <dd className="tabular-nums">{formatPrice(vat.vat)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-[var(--ls-line)] pt-2">
                <dt className="text-[13px] font-semibold">
                  합계 <span className="text-[10px] font-normal text-[var(--ls-muted)]">VAT 포함</span>
                </dt>
                <dd className="text-[19px] font-semibold tabular-nums tracking-[-0.02em]">
                  {formatPrice(total)}
                </dd>
              </div>
            </dl>

            <button
              className="ls-focus mt-3 h-12 w-full rounded-[12px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F]"
              onClick={() => setStep(3)}
              type="button"
            >
              다음 · 발주 확인
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="flex items-end justify-between gap-2">
              <h3 className="text-[14px] font-semibold">이대로 발주할까요?</h3>
              <button
                className="ls-focus text-[11.5px] text-[var(--ls-muted)] underline decoration-[var(--ls-line-strong)] underline-offset-2 hover:text-[#0F1412]"
                onClick={() => setStep(2)}
                type="button"
              >
                수량 변경
              </button>
            </div>

            <dl className="mt-2 space-y-1.5 rounded-[12px] border border-[var(--ls-line)] px-3.5 py-3 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-[var(--ls-muted)]">받는 곳</dt>
                <dd className="text-right font-medium">
                  {isDirect ? `${customerName || "직접 입력"} · ${deliveryAddress || "주소 입력"}` : selectedStore?.label}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-[var(--ls-muted)]">품목</dt>
                <dd className="text-right font-medium">
                  {productName} × {quantity}봉
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[var(--ls-line)] pt-2">
                <dt className="text-[13px] font-semibold">합계 (VAT 포함)</dt>
                <dd className="text-[17px] font-semibold tabular-nums">{formatPrice(total)}</dd>
              </div>
            </dl>

            <div className="mt-2.5">
              <TaxInvoiceFields
                hint={taxHint}
                idPrefix="quick"
                onChange={setTax}
                value={tax}
              />
            </div>

            <div className="mt-2.5 rounded-[12px] border border-[var(--ls-line)] px-3.5 py-3">
              <p className="text-[12.5px] font-semibold">결제 · 입금 안내</p>
              <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--ls-muted)]">
                발주 접수 후 {ORDER_BANK_NAME} {ORDER_ACCOUNT_NUMBER} 로 입금하시면 확인 후
                출고됩니다. 카드 결제는 위 “장바구니에 담고 카드 결제”로 진행해 주세요.
                {testMode ? " (지금은 테스트 결제 모드입니다)" : ""}
              </p>
            </div>

            {errorMessage ? (
              <p className="mt-2 rounded-[10px] border border-[#E4B4B4] bg-[#FDF2F2] px-3 py-2 text-[11.5px] leading-[1.5] text-[#8A2323]" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button
              className="ls-focus mt-3 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#0F1412] text-[15px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:bg-[#D5DAD7] disabled:text-[#8A948D]"
              disabled={submitting || !step1Complete || !taxComplete}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {submitting ? "발주 접수 중…" : `원클릭 발주 · ${formatPrice(total)}`}
            </button>
            <p className="mt-1.5 text-center text-[10.5px] leading-[1.5] text-[var(--ls-muted)]">
              {!taxComplete
                ? "세금계산서 정보를 채우거나 발급 요청을 해제해 주세요."
                : "주문취소·문의 " + ORDER_SUPPORT_PHONE}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
