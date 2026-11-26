"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DIRECT_SHIPPING_LABEL, DIRECT_SHIPPING_VALUE } from "@/data/address";
import { beanBoxesToBags, formatPrice, getOrderLimits, splitVat } from "@/data/products";
import {
  coverageLabel,
  cycleLabel,
  cycleDays,
  daysCovered,
  DEFAULT_STORE_SCALE,
  shortestCoverage,
  storeScaleLabel,
  type StoreScale,
} from "@/data/consumables";
import {
  readRecentStore,
  readStoreScale,
  writeLastOrder,
  writeRecentStore,
} from "@/features/shop/preferences";
import { saveTaxReceipt } from "@/features/shop/tax-receipt";
import { savePaymentIntent } from "@/features/payments/intent-storage";
import { openTossPaymentWindow } from "@/features/payments/sdk";
import type { StoreOption } from "@/features/stores/types";
import { cartCount, cartTotal, resolveCart, useCartStore } from "@/stores/cartStore";
import QuantityStepper from "./QuantityStepper";
import TaxInvoiceToggle from "./TaxInvoiceToggle";

const PRIVACY_HREF = "https://luckyspot.kr/privacy";

function CloseIcon() {
  return (
    <svg aria-hidden height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M4 4l10 10M14 4L4 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export default function OrderSheet({
  open,
  onClose,
  initialStoreCode,
  notice,
  testMode = false,
  lockedStores,
}: {
  open: boolean;
  onClose: () => void;
  /** /orders·"그대로 담기"에서 넘어온 지점 — "받는 곳"을 미리 채운다 */
  initialStoreCode?: string | null;
  /** 시트 상단에 보여줄 안내(예: 지난 발주를 그대로 담았어요) */
  notice?: string | null;
  /** 토스페이먼츠 테스트 키로 동작 중인지 — 화면 상단에 배지로 알린다 */
  testMode?: boolean;
  /**
   * "받는 곳" 목록을 서버(/api/stores) 대신 이 값으로 고정한다.
   * `/owner`처럼 로그인한 지점 하나로만 주문을 내야 하는 화면이 쓴다.
   * 넘기지 않으면 지금까지와 똑같이 /api/stores 목록을 쓴다.
   */
  lockedStores?: StoreOption[];
}) {
  const router = useRouter();
  const lines = useCartStore((state) => state.lines);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearItems = useCartStore((state) => state.clearItems);

  const entries = useMemo(() => resolveCart(lines), [lines]);
  const total = cartTotal(entries);
  const count = cartCount(entries);
  const vat = splitVat(total);
  // 원두만 담았으면 완료 화면에도 "3개"가 아니라 "3박스"로 보여준다.
  const countUnit = entries.length > 0 && entries.every((entry) => entry.product.unit === "1박스") ? "박스" : "개";

  const [addressValue, setAddressValue] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scale, setScale] = useState<StoreScale>(DEFAULT_STORE_SCALE);
  // 세금계산서는 "발급 요청 여부"만 고른다. 사업자 정보는 서버가 지점 코드로 채운다.
  const [taxRequested, setTaxRequested] = useState(true);

  const selectedStore = stores.find((store) => store.code === addressValue) ?? null;
  const isDirect = addressValue === DIRECT_SHIPPING_VALUE;
  const directComplete =
    customerName.trim().length > 0 && phone.length >= 10 && deliveryAddress.trim().length > 0;
  const canSubmit =
    entries.length > 0 &&
    (isDirect ? directComplete : Boolean(selectedStore)) &&
    agreed &&
    !submitting &&
    !preparing;

  // 담은 소모품이 가장 빨리 떨어지는 품목 기준 "며칠 버티는지"
  const coverage = shortestCoverage(
    entries.map(({ product, quantity }) => ({ id: product.id, quantity })),
    scale,
  );
  const coverageText = coverageLabel(coverage);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    setScale(readStoreScale());
  }, [open]);

  useEffect(() => {
    if (!open) {
      setErrorMessage(null);
      setSubmitting(false);
      setPreparing(false);
      return;
    }

    // 지점 목록은 개인정보 없는 값(코드·이름·주소)만 서버 API에서 받아온다.
    if (lockedStores) {
      if (!storesLoaded) {
        setStores(lockedStores);
        setStoresLoaded(true);

        const preferred = initialStoreCode || lockedStores[0]?.code || "";
        if (preferred && lockedStores.some((store) => store.code === preferred)) setAddressValue(preferred);
      }
      return;
    }

    if (storesLoaded) return;

    let cancelled = false;

    fetch("/api/stores", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { stores?: StoreOption[] }) => {
        if (cancelled) return;

        const options = Array.isArray(data.stores) ? data.stores : [];
        setStores(options);
        setStoresLoaded(true);

        // 최근에 쓴 지점이 있으면 "받는 곳"을 미리 채운다 — 한 탭을 더 줄인다.
        const preferred = initialStoreCode || readRecentStore()?.code || "";

        if (preferred && options.some((store) => store.code === preferred)) {
          setAddressValue(preferred);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStoresLoaded(true);
        setErrorMessage("받는 곳 목록을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.");
      });

    return () => {
      cancelled = true;
    };
  }, [initialStoreCode, lockedStores, open, storesLoaded]);

  if (!open) return null;

  /**
   * 온라인 결제 — 서버가 금액을 확정한 뒤 토스 결제창으로 이동한다.
   * 성공하면 /checkout/success 에서 서버 승인(confirm)까지 마쳐야 발주가 완료된다.
   */
  const handlePay = async () => {
    if (!canSubmit) return;

    setPreparing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/payments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
          taxInvoiceRequested: taxRequested,
          ...(isDirect
            ? {
                address: deliveryAddress.trim(),
                name: customerName.trim(),
                phone,
                shippingOption: DIRECT_SHIPPING_LABEL,
              }
            : { storeCode: selectedStore?.code }),
        }),
      });

      const prepared = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        amount?: number;
        clientKey?: string;
        items?: { id: string; quantity: number }[];
        orderId?: string;
        orderName?: string;
        testMode?: boolean;
        token?: string;
      };

      if (!response.ok || prepared.ok !== true) {
        throw new Error(prepared.error ?? "결제를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }

      if (!prepared.orderId || !prepared.token || !prepared.clientKey || !prepared.amount) {
        throw new Error("결제 준비 응답이 올바르지 않아요. 잠시 후 다시 시도해 주세요.");
      }

      const recipient = isDirect
        ? {
            address: deliveryAddress.trim(),
            name: customerName.trim(),
            phone,
            shippingOption: DIRECT_SHIPPING_LABEL,
            storeCode: null,
            storeName: null,
          }
        : {
            address: selectedStore?.address ?? "",
            name: selectedStore?.label ?? "",
            phone: "",
            shippingOption: selectedStore?.label ?? "",
            storeCode: selectedStore?.code ?? null,
            storeName: selectedStore?.label ?? null,
          };

      // 결제창에서 돌아온 뒤 서버에 그대로 넘길 값 — 페이지가 이동해도 남도록 브라우저에 둔다.
      savePaymentIntent({
        amount: prepared.amount,
        createdAt: new Date().toISOString(),
        items: prepared.items ?? lines.map((line) => ({ id: line.id, quantity: line.quantity })),
        method: "toss_window",
        orderId: prepared.orderId,
        orderName: prepared.orderName ?? "럭키스팟 발주",
        recipient,
        storeName: selectedStore?.label ?? null,
        token: prepared.token,
      });

      // 토스 결제창 — 카드·계좌이체·가상계좌·간편결제를 이 창에서 고른다.
      await openTossPaymentWindow({
        amount: prepared.amount,
        clientKey: prepared.clientKey,
        ...(recipient.name ? { customerName: recipient.name } : {}),
        ...(phone ? { customerMobilePhone: phone } : {}),
        failUrl: `${window.location.origin}/checkout/fail`,
        onCancel: () => setPreparing(false),
        orderId: prepared.orderId,
        orderName: prepared.orderName ?? "럭키스팟 발주",
        successUrl: `${window.location.origin}/checkout/success`,
      });

      // 결제창이 열렸다. 결제를 마치면 successUrl/failUrl 로 이동한다.
      setPreparing(false);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;

      setErrorMessage(
        code === "USER_CANCEL"
          ? "결제를 취소하셨어요. 다시 결제해 주세요."
          : code === "sdk_load_failed" || code === "sdk_not_ready"
            ? "결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요."
            : error instanceof Error
              ? error.message
              : "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      setPreparing(false);
    }
  };

  /** 온라인 결제 없이 기존처럼 계좌 입금으로 발주한다(본사 입금 확인 후 출고). */
  const handleBankTransfer = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
          // 지점 주문은 코드만 보낸다. 점주 이름·연락처·주소는 서버가 Supabase에서 채운다.
          taxInvoiceRequested: taxRequested,
          ...(isDirect
            ? {
                address: deliveryAddress.trim(),
                name: customerName.trim(),
                phone,
                shippingOption: DIRECT_SHIPPING_LABEL,
              }
            : { storeCode: selectedStore?.code }),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        totalPrice?: number;
      };

      if (!response.ok || !result.orderId) {
        throw new Error(result.error ?? "주문 접수에 실패했어요.");
      }

      if (selectedStore) {
        writeRecentStore({ code: selectedStore.code, label: selectedStore.label });
      }

      // 다음 발주를 1초로 만드는 재료 — 이 브라우저에 "직전 발주 구성"만 남긴다.
      writeLastOrder({
        orderNumber: result.orderId,
        createdAt: new Date().toISOString(),
        storeCode: selectedStore?.code ?? null,
        storeName: selectedStore?.label ?? null,
        totalAmount: Number(result.totalPrice ?? total),
        count,
        items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
      });

      // 주문 완료 화면이 "발급 신청함" 한 줄을 보여줄 수 있게 여부만 남긴다.
      saveTaxReceipt(result.orderId, taxRequested);

      clearItems();
      onClose();
      router.push(
        `/order-complete?orderId=${encodeURIComponent(result.orderId)}&totalPrice=${encodeURIComponent(
          String(result.totalPrice ?? total),
        )}&count=${encodeURIComponent(String(count))}&unit=${encodeURIComponent(countUnit)}`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "주문 접수에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0F1412]/55 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        aria-label="주문 확인"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.4)] lg:rounded-[24px]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-[var(--ls-line)] px-5 py-4">
          <div>
            <p className="type-eyebrow text-[var(--ls-green-ink)]">주문 확인</p>
            <h2 className="mt-0.5 text-[21px] font-bold tracking-[-0.03em] text-[#0F1412]">
              이대로 주문할까요?
            </h2>
          </div>
          <button
            aria-label="주문 확인 닫기"
            className="ls-focus grid size-9 place-items-center rounded-full border border-[var(--ls-line)] text-[#0F1412] transition-colors hover:bg-[#F1F3F2]"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {notice ? (
            <p className="mx-5 mt-4 rounded-[12px] border border-[#9BD3B2] bg-[#EAF8EF] px-3.5 py-2.5 text-[11.5px] font-medium leading-[1.55] text-[#0B5C2A]">
              {notice}
            </p>
          ) : null}

          <section className="px-5 pt-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[16px] font-bold text-[#0F1412]">담은 품목</h3>
              <span className="text-[13px] text-[#3B4740]">{entries.length}종</span>
            </div>

            {entries.length ? (
              <ul className="mt-2 divide-y divide-[var(--ls-line)] border-y border-[var(--ls-line)]">
                {entries.map(({ product, quantity, amount }) => {
                  const limits = getOrderLimits(product.id);

                  return (
                  <li className="flex items-start justify-between gap-3 py-3" key={product.id}>
                    <div className="min-w-0 flex-1">
                      <p className="break-keep text-[15px] font-bold leading-[1.35] text-[#0F1412]">
                        {product.name}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-[#3B4740]">
                        {formatPrice(product.price)} · {product.unit}
                        {limits.unit === "박스" ? (
                          <span className="ml-1.5 font-semibold text-[#0B5C2A]">
                            {quantity}박스 = {beanBoxesToBags(quantity)}봉
                          </span>
                        ) : null}
                        {(() => {
                          const lineDays = daysCovered(product.id, quantity, scale);
                          const lineCycle = cycleDays(product.id, scale);

                          if (!lineDays) return null;

                          return (
                            <span className="ml-1.5 font-semibold text-[#0B5C2A]">
                              {coverageLabel(lineDays)}
                              {lineCycle ? ` · ${cycleLabel(lineCycle)} 권장` : ""}
                            </span>
                          );
                        })()}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <QuantityStepper
                          label={product.name}
                          max={limits.max}
                          min={limits.min}
                          onChange={(next) => setQuantity(product.id, next)}
                          quantity={quantity}
                          size="md"
                        />
                        <button
                          className="ls-focus h-11 px-2 text-[13px] font-medium text-[#3B4740] underline decoration-[var(--ls-line-strong)] underline-offset-2 hover:text-[#0F1412]"
                          onClick={() => removeItem(product.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <p className="shrink-0 pt-0.5 text-[15px] font-bold tabular-nums text-[#0F1412]">
                      {formatPrice(amount)}
                    </p>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-[14px] bg-[#F7F8F9] px-4 py-8 text-center text-[13px] font-medium text-[#8B948D]">
                담긴 품목이 없어요. 목록에서 필요한 품목을 담아주세요.
              </p>
            )}

            {coverageText ? (
              <p className="mt-3 break-keep rounded-[10px] bg-[#F4F5F6] px-3 py-2 text-[11px] leading-[1.55] text-[var(--ls-muted)]">
                {`${storeScaleLabel(scale)} 매장 기준, 이 구성으로 소모품이 가장 빨리 떨어지는 품목까지 `}
                <strong className="font-semibold text-[#0B5C2A]">{coverageText}</strong>
                {"예요. 잔량과 맞춰 수량을 조정해 주세요."}
              </p>
            ) : null}
          </section>

          <section className="mx-5 mt-4 rounded-[14px] bg-[#F4F5F6] p-4">
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <dt className="text-[var(--ls-muted)]">공급가액</dt>
                <dd className="tabular-nums text-[#0F1412]">{formatPrice(vat.supply)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ls-muted)]">부가세</dt>
                <dd className="tabular-nums text-[#0F1412]">{formatPrice(vat.vat)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-[var(--ls-line)] pt-2">
                <dt className="text-[13px] font-semibold text-[#0F1412]">
                  합계 <span className="text-[10.5px] font-normal text-[var(--ls-muted)]">VAT 포함</span>
                </dt>
                <dd className="text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-[#0F1412]">
                  {formatPrice(total)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="px-5 pt-5">
            <h3 className="text-[13px] font-semibold text-[#0F1412]">받는 곳</h3>
            <div className="relative mt-2">
              <select
                aria-label="받는 곳 선택"
                className="ls-focus h-12 w-full appearance-none rounded-[10px] border border-[var(--ls-line-strong)] bg-white px-3.5 pr-10 text-[13.5px] text-[#0F1412] outline-none"
                onChange={(event) => setAddressValue(event.target.value)}
                value={addressValue}
              >
                <option disabled value="">
                  지점 또는 배송지를 선택해 주세요
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
            ) : selectedStore ? (
              <p className="mt-2 rounded-[10px] bg-[#F4F5F6] px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-[var(--ls-muted)]">
                {selectedStore.label} 배송지
                {selectedStore.address ? (
                  <>
                    <br />
                    {selectedStore.address}
                  </>
                ) : null}
                <br />
                받는 분 연락처는 발주 담당자에게만 전달됩니다.
              </p>
            ) : null}
          </section>

          <section className="px-5 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#0F1412]">세금계산서</h3>
              <span className="text-[10.5px] text-[var(--ls-muted)]">전자세금계산서</span>
            </div>
            <div className="mt-2">
              <TaxInvoiceToggle
                idPrefix="sheet"
                onChange={setTaxRequested}
                personal={isDirect}
                requested={taxRequested}
              />
            </div>
          </section>

          <section className="px-5 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#0F1412]">결제 수단</h3>
              <span className="text-[10.5px] text-[var(--ls-muted)]">토스페이먼츠</span>
            </div>

            {testMode ? (
              <p className="mt-2 rounded-[12px] bg-[#FFF6E0] px-3 py-2 text-[11px] leading-[1.55] text-[#8A5A00]">
                <strong className="font-semibold">테스트 결제 모드</strong> — 실제 금액이 청구되지
                않아요. 결제 흐름만 확인해 주세요.
              </p>
            ) : null}

            <div className="mt-2 rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
              <div className="flex flex-wrap gap-1.5">
                {["카드", "계좌이체", "가상계좌(무통장입금)", "간편결제"].map((label) => (
                  <span
                    className="rounded-full bg-[#F4F5F6] px-2.5 py-[3px] text-[10.5px] font-medium text-[#3B4740]"
                    key={label}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-[1.55] text-[var(--ls-muted)]">
                결제하기를 누르면 토스페이먼츠 결제창이 열려요. 결제수단은 그 창에서 고르면
                돼요.
              </p>
            </div>

            <p className="mt-2 text-[10.5px] leading-[1.55] text-[var(--ls-muted)]">
              카드·계좌이체는 결제 즉시 완료되고, 가상계좌는 발급된 계좌로 입금하면 확인 후
              출고돼요.
            </p>
          </section>

          <section className="px-5 pb-5 pt-4">
            <label className="flex items-start gap-2">
              <input
                checked={agreed}
                className="mt-[3px] size-4 accent-[#0F1412]"
                onChange={(event) => setAgreed(event.target.checked)}
                type="checkbox"
              />
              <span className="text-[11.5px] leading-[1.55] text-[var(--ls-muted)]">
                주문 접수를 위해 이름·연락처·배송지를 수집하는 데 동의해요.{" "}
                <a
                  className="underline underline-offset-2 hover:text-[#0F1412]"
                  href={PRIVACY_HREF}
                  rel="noreferrer"
                  target="_blank"
                >
                  개인정보처리방침
                </a>
              </span>
            </label>

          </section>
        </div>

        {/* 스크롤과 상관없이 합계·주문 버튼은 항상 보이게 둔다. */}
        <footer className="border-t border-[var(--ls-line)] bg-white px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
          {errorMessage ? (
            <p
              className="mb-2 rounded-[10px] border border-[#E4B4B4] bg-[#FDF2F2] px-3 py-2 text-[12px] leading-[1.5] text-[#8A2323]"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#3B4740]">
              합계 <span className="text-[12px] font-normal">부가세 포함</span>
            </p>
            <p className="text-[24px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
              {formatPrice(total)}
            </p>
          </div>
          <button
            className="ls-focus mt-2 flex h-[58px] w-full items-center justify-center rounded-[16px] bg-[#1DFF26] text-[18px] font-bold text-[#0F1412] transition-colors hover:bg-[#3BE93F] disabled:bg-[#E6E9E7] disabled:text-[#98A29B]"
            disabled={!canSubmit}
            onClick={handlePay}
            type="button"
          >
            {preparing ? "결제창 여는 중…" : `결제하기 · ${formatPrice(total)}`}
          </button>
          <button
            className="ls-focus mt-1.5 flex h-12 w-full items-center justify-center rounded-[12px] text-[13.5px] font-medium text-[#3B4740] underline decoration-[var(--ls-line-strong)] underline-offset-2 transition-colors hover:text-[#0F1412] disabled:opacity-50"
            disabled={!canSubmit}
            onClick={handleBankTransfer}
            type="button"
          >
            {submitting ? "주문 접수 중..." : "계좌 입금으로 발주하기 (입금 안내)"}
          </button>
          <p className="mt-1.5 text-center text-[12.5px] leading-[1.5] text-[#3B4740]">
            {!isDirect && !selectedStore
              ? "받는 곳을 선택하면 결제할 수 있어요."
              : isDirect && !directComplete
                ? "주문자 성함·연락처·주소를 모두 입력해 주세요."
                : !agreed
                    ? "개인정보 수집에 동의하면 결제할 수 있어요."
                    : "결제가 완료되면 발주가 접수되고 본사에서 확인해요."}
          </p>
        </footer>
      </div>
    </div>
  );
}
