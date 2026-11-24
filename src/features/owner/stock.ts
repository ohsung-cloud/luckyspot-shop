import { getProductById, getOrderLimits } from "../../data/products";
import type { SkuForecast } from "../auto-order/types";

/**
 * 점주 포털(`/owner`)의 재고 카드 — 자동발주 예측(SkuForecast)을 점주가 읽는 말로 바꾼다.
 *
 * 원칙
 *  - 첫 화면의 주인공은 **원두와 용지**다(사용자 지시 2026-11-25). 나머지 소모품은 보조 목록.
 *  - 숫자는 예측 그대로 쓰고, 없는 값은 0으로 채우지 않는다("수집 전").
 *  - 부족·없음이면 발주 버튼을 같은 줄에 둔다. 수량은 예측의 추천 수량(박스·개)을 그대로 쓴다.
 *  - 발주 id는 카탈로그(`data/products.ts`)의 상품 id와 같다 — 장바구니에 그대로 담긴다.
 */

export type StockStatus = "out" | "low" | "ok" | "unknown";

export type OwnerStockItem = {
  sku: string;
  /** 화면 라벨 — "원두", "A4 용지" */
  label: string;
  /** 카탈로그 상품명 */
  name: string;
  spec: string;
  status: StockStatus;
  statusLabel: string;
  /** "3,300g" · "420매" · "—" */
  stockText: string;
  /** "하루 780g" */
  dailyText: string;
  remainingDays: number | null;
  /** "4.2일" */
  daysText: string;
  /** "11/27 소진 예상" — 기준일이 없으면 null */
  emptyOnText: string | null;
  /** 장바구니에 담을 수량(카탈로그 발주 단위) */
  suggestedQty: number;
  /** "1박스 · 200,000원" */
  suggestedText: string;
  unitPrice: number;
  amount: number;
  orderable: boolean;
  /** 예측 근거 한 줄(교차 보정·실측 등) */
  note: string | null;
  due: boolean;
};

export type OwnerStockView = {
  core: OwnerStockItem[];
  extras: OwnerStockItem[];
  /** 발주가 필요한 품목 수(원두·용지 포함) */
  shortCount: number;
  /** 추천 수량 그대로 담았을 때의 합계(원, VAT 포함) */
  recommendedTotal: number;
  /** 예측 기준일 — "2026-11-22" */
  asOfDate: string;
};

const CORE_ORDER = [
  { sku: "bean-10kg", label: "원두", threshold: "bean" as const },
  { sku: "a4-paper", label: "A4 용지", threshold: "paper" as const },
];

const EXTRA_LABELS: Record<string, string> = {
  "cup-plastic-16": "플라스틱 컵",
  "cup-paper-16": "종이 컵",
  "lid-white-16": "흰 뚜껑",
  "toner-black": "검정 토너",
  "toner-color": "컬러 토너",
};

function unitText(sku: string) {
  return sku.startsWith("toner") ? "개" : "박스";
}

function packText(sku: string) {
  return sku === "a4-paper" ? "2,500매" : sku.startsWith("toner") ? "1개" : "";
}

function dayNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function daysText(value: number | null) {
  if (value === null) return "—";
  if (value >= 99) return "99일+";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}일`;
}

/** 기준일(YYYY-MM-DD) + 남은 일수 → "11/27" (KST 달력 기준) */
export function emptyOnLabel(asOfDate: string, remainingDays: number | null) {
  if (!asOfDate || remainingDays === null || !Number.isFinite(remainingDays)) return null;

  const [year, month, day] = asOfDate.split("-").map(Number);
  if (!year || !month || !day) return null;

  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() + Math.floor(remainingDays));

  return `${at.getUTCMonth() + 1}/${at.getUTCDate()}`;
}

function statusFor(input: {
  forecast: SkuForecast | null | undefined;
  thresholdDays: number;
}): StockStatus {
  const { forecast, thresholdDays } = input;
  if (!forecast) return "unknown";
  if (forecast.stockOnHand <= 0) return "out";
  if (forecast.remainingDays <= thresholdDays / 2) return "out";
  if (forecast.remainingDays <= thresholdDays) return "low";
  return "ok";
}

const STATUS_LABEL: Record<StockStatus, string> = {
  out: "곧 없어요",
  low: "발주할 때",
  ok: "넉넉해요",
  unknown: "수집 전",
};

function toItem(input: {
  sku: string;
  label: string;
  thresholdDays: number;
  forecast: SkuForecast | null | undefined;
  asOfDate: string;
}): OwnerStockItem {
  const { sku, label, thresholdDays, forecast, asOfDate } = input;
  const product = getProductById(sku);
  const limits = getOrderLimits(sku);

  const remainingDays = dayNumber(forecast?.remainingDays);
  const status = statusFor({ forecast, thresholdDays });
  const suggestedQty = Math.max(
    limits.min,
    Math.min(limits.max, forecast && forecast.suggestedQty > 0 ? forecast.suggestedQty : 1),
  );
  const unitPrice = product?.price ?? forecast?.unitPrice ?? 0;

  const stockText = forecast
    ? `${Math.round(forecast.stockOnHand).toLocaleString("ko-KR")}${forecast.stockUnit}`
    : "—";
  const dailyText = forecast
    ? `하루 ${Math.round(forecast.predictedDailyConsumption).toLocaleString("ko-KR")}${forecast.stockUnit}`
    : "예측 전";

  return {
    sku,
    label,
    name: product?.name ?? forecast?.name ?? label,
    spec: product?.spec ?? forecast?.spec ?? packText(sku),
    status,
    statusLabel: STATUS_LABEL[status],
    stockText,
    dailyText,
    remainingDays,
    daysText: daysText(remainingDays),
    emptyOnText: emptyOnLabel(asOfDate, remainingDays),
    suggestedQty,
    suggestedText: `${suggestedQty}${unitText(sku)}${
      unitPrice > 0 ? ` · ${(unitPrice * suggestedQty).toLocaleString("ko-KR")}원` : ""
    }`,
    unitPrice,
    amount: unitPrice * suggestedQty,
    orderable: Boolean(product),
    note: forecast?.stockSource === "telemetry" ? (forecast.stockNote ?? null) : null,
    due: Boolean(forecast?.due),
  };
}

export function buildOwnerStock(input: {
  forecasts: SkuForecast[];
  thresholds: { beanDays: number; tonerDays: number; paperDays: number };
  asOfDate: string;
}): OwnerStockView {
  const { forecasts, thresholds, asOfDate } = input;
  const find = (sku: string) => forecasts.find((item) => item.sku === sku) ?? null;

  const core = CORE_ORDER.map((entry) =>
    toItem({
      sku: entry.sku,
      label: entry.label,
      thresholdDays: entry.threshold === "bean" ? thresholds.beanDays : thresholds.paperDays,
      forecast: find(entry.sku),
      asOfDate,
    }),
  );

  const extras = Object.entries(EXTRA_LABELS).map(([sku, label]) => {
    const forecast = find(sku);
    const thresholdDays = sku.startsWith("toner") ? thresholds.tonerDays : 4;

    return toItem({ sku, label, thresholdDays, forecast, asOfDate });
  });

  const all = [...core, ...extras];
  const short = all.filter((item) => item.status === "out" || item.status === "low");

  return {
    core,
    extras,
    shortCount: short.length,
    recommendedTotal: short.reduce((sum, item) => sum + item.amount, 0),
    asOfDate,
  };
}

/** 부족 품목을 모두 담은 장바구니 줄 — 원두·용지는 수량을 그대로, 나머지는 추천 수량. */
export function recommendedCartLines(view: OwnerStockView) {
  return [...view.core, ...view.extras]
    .filter((item) => item.orderable && (item.status === "out" || item.status === "low"))
    .map((item) => ({ id: item.sku, quantity: item.suggestedQty }));
}
