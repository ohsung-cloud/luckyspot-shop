"use client";

/**
 * 토스페이먼츠 SDK v2 로더 — 브라우저 전용.
 *
 * npm 패키지 대신 공식 스크립트(https://js.tosspayments.com/v2/standard)를 쓴다.
 * 발주 페이지는 결제를 누를 때만 SDK 가 필요하므로, 주문서를 열 때 미리 받아 둔다.
 *
 * 시크릿 키는 절대 여기로 오지 않는다. 클라이언트 키만 쓴다.
 */

const SDK_SRC = "https://js.tosspayments.com/v2/standard";
const SCRIPT_ID = "tosspayments-sdk-v2";

export type TossPaymentWindow = {
  destroy: () => void;
  on: (
    eventName: "paymentRequest" | "cancel",
    callback: (payload?: { paymentMethod?: { method?: string } }) => void,
  ) => void;
};

export type TossWidgets = {
  renderPaymentWindow: (params: { orderName: string }) => Promise<TossPaymentWindow>;
  requestPayment: (params: {
    customerMobilePhone?: string;
    customerName?: string;
    failUrl: string;
    orderId: string;
    orderName: string;
    successUrl: string;
  }) => Promise<void>;
  setAmount: (amount: { currency: "KRW"; value: number }) => Promise<void>;
};

type TossPaymentsFactory = {
  widgets: (options: { customerKey: string }) => TossWidgets;
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsFactory;
  }
}

let loader: Promise<void> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (existing) {
      if (window.TossPayments) {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("sdk_load_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = SCRIPT_ID;
    script.src = SDK_SRC;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("sdk_load_failed")), { once: true });
    document.head.appendChild(script);
  });
}

export function loadTossSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.TossPayments) return Promise.resolve();

  if (!loader) {
    loader = injectScript().catch((error) => {
      loader = null;
      throw error;
    });
  }

  return loader;
}

export type TossPaymentWindowInput = {
  amount: number;
  clientKey: string;
  customerMobilePhone?: string;
  customerName?: string;
  failUrl: string;
  onCancel?: () => void;
  orderId: string;
  orderName: string;
  successUrl: string;
};

/**
 * 결제창형 결제 — 토스 결제창(오버레이/팝업)을 띄운다.
 *
 *  · 결제수단(카드·계좌이체·가상계좌·간편결제)은 이 결제창 안에서 구매자가 고른다.
 *  · 구매자가 결제하기를 누르면 paymentRequest 이벤트가 오고, 그때 requestPayment 로
 *    successUrl/failUrl 을 넘겨 결제를 요청한다.
 *
 * 반환값은 띄운 결제창 인스턴스다. 결제창을 닫으면 onCancel 이 호출된다.
 */
export async function openTossPaymentWindow(input: TossPaymentWindowInput) {
  await loadTossSdk();

  const factory = window.TossPayments;

  if (!factory) throw new Error("sdk_not_ready");

  const widgets = factory(input.clientKey).widgets({ customerKey: "ANONYMOUS" });

  await widgets.setAmount({ currency: "KRW", value: input.amount });

  const paymentWindow = await widgets.renderPaymentWindow({ orderName: input.orderName });

  paymentWindow.on("paymentRequest", ({ paymentMethod } = {}) => {
    void widgets
      .requestPayment({
        ...(input.customerName ? { customerName: input.customerName.slice(0, 30) } : {}),
        ...(input.customerMobilePhone
          ? { customerMobilePhone: input.customerMobilePhone.replace(/\D/g, "") }
          : {}),
        failUrl: input.failUrl,
        orderId: input.orderId,
        orderName: input.orderName,
        successUrl: input.successUrl,
      })
      .catch(() => {
        // 인증이 취소되면 failUrl 이동 또는 결제창 유지 — 다음 시도를 막지 않는다.
      });

    void paymentMethod;
  });

  if (input.onCancel) {
    paymentWindow.on("cancel", () => input.onCancel?.());
  }

  return paymentWindow;
}
