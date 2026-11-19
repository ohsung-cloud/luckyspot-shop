"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DIRECT_SHIPPING_VALUE,
  getShopAddressByValue,
  shopAddresses,
} from "@/data/address";
import { formatPrice, splitVat } from "@/data/products";
import { cartCount, cartTotal, resolveCart, useCartStore } from "@/stores/cartStore";
import QuantityStepper from "./QuantityStepper";

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
}: {
  open: boolean;
  onClose: () => void;
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

  const [addressValue, setAddressValue] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAddress = getShopAddressByValue(addressValue);
  const isDirect = selectedAddress?.value === DIRECT_SHIPPING_VALUE;
  const directComplete =
    customerName.trim().length > 0 && phone.length >= 10 && deliveryAddress.trim().length > 0;
  const canSubmit =
    entries.length > 0 &&
    Boolean(selectedAddress) &&
    agreed &&
    !submitting &&
    (!isDirect || directComplete);

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
    if (!open) {
      setErrorMessage(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAddress) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: isDirect ? deliveryAddress.trim() : selectedAddress.address,
          items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
          name: isDirect ? customerName.trim() : selectedAddress.name,
          phone: isDirect ? phone : selectedAddress.phone.replace(/\D/g, ""),
          shippingOption: selectedAddress.label,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        totalPrice?: number;
      };

      if (!response.ok || !result.orderId) {
        throw new Error(result.error ?? "주문 접수에 실패했습니다.");
      }

      clearItems();
      onClose();
      router.push(
        `/order-complete?orderId=${encodeURIComponent(result.orderId)}&totalPrice=${encodeURIComponent(
          String(result.totalPrice ?? total),
        )}&count=${encodeURIComponent(String(count))}`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "주문 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
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
            <p className="type-eyebrow text-[var(--ls-green-ink)]">ORDER</p>
            <h2 className="mt-0.5 text-[19px] font-semibold tracking-[-0.03em] text-[#0F1412]">
              주문 확인
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
          <section className="px-5 pt-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-semibold text-[#0F1412]">담은 품목</h3>
              <span className="text-[11.5px] text-[var(--ls-muted)]">{count}개</span>
            </div>

            {entries.length ? (
              <ul className="mt-2 divide-y divide-[var(--ls-line)] border-y border-[var(--ls-line)]">
                {entries.map(({ product, quantity, amount }) => (
                  <li className="flex items-start justify-between gap-3 py-3" key={product.id}>
                    <div className="min-w-0 flex-1">
                      <p className="break-keep text-[13.5px] font-semibold leading-[1.35] text-[#0F1412]">
                        {product.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--ls-muted)]">
                        {formatPrice(product.price)} · {product.unit}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <QuantityStepper
                          label={product.name}
                          onChange={(next) => setQuantity(product.id, next)}
                          quantity={quantity}
                        />
                        <button
                          className="ls-focus text-[11.5px] text-[var(--ls-muted)] underline decoration-[var(--ls-line-strong)] underline-offset-2 hover:text-[#0F1412]"
                          onClick={() => removeItem(product.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <p className="shrink-0 pt-0.5 text-[13.5px] font-semibold tabular-nums text-[#0F1412]">
                      {formatPrice(amount)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-[12px] border border-dashed border-[var(--ls-line-strong)] px-4 py-8 text-center text-[13px] text-[var(--ls-muted)]">
                담긴 품목이 없어요. 목록에서 필요한 품목을 담아주세요.
              </p>
            )}
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
                {shopAddresses.map((address) => (
                  <option key={address.value} value={address.value}>
                    {address.label}
                  </option>
                ))}
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
            ) : selectedAddress ? (
              <p className="mt-2 rounded-[10px] bg-[#F4F5F6] px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-[var(--ls-muted)]">
                {selectedAddress.name ? `${selectedAddress.name} · ` : ""}
                {selectedAddress.phone}
                {selectedAddress.address ? (
                  <>
                    <br />
                    {selectedAddress.address}
                  </>
                ) : null}
              </p>
            ) : null}
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
                주문 접수를 위해 이름·연락처·배송지를 수집하는 데 동의합니다.{" "}
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
            <p className="text-[11.5px] text-[var(--ls-muted)]">
              합계 <span className="text-[10px]">VAT 포함</span>
            </p>
            <p className="text-[18px] font-semibold tabular-nums tracking-[-0.03em] text-[#0F1412]">
              {formatPrice(total)}
            </p>
          </div>
          <button
            className="ls-focus mt-2 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#0F1412] text-[15.5px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:bg-[#D5DAD7] disabled:text-[#8A948D]"
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? "주문 접수 중..." : "주문하기"}
          </button>
          <p className="mt-1.5 text-center text-[10.5px] leading-[1.5] text-[var(--ls-muted)]">
            주문 후 입금 계좌를 안내해 드려요. 입금이 확인되면 출고됩니다.
          </p>
        </footer>
      </div>
    </div>
  );
}
