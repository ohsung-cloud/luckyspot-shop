import type { BeverageLine, RevenueSnapshot } from "../types";

import {
  asNumber,
  asText,
  kstDate,
  type NormalizedSnapshot,
  normalizeCapturedAt,
} from "./types";

/**
 * 로얄선즈 커피 포털(`coffee.loyalsuns.com:8090`) 스냅샷 어댑터.
 *
 * 포털 화면에서 확인된 실제 필드
 *   기계 상태 : 온라인/오프라인, 재료 부족 기계 알림(S/N, 바디코드)
 *   매출      : 금일 / 어제 / 이달 매출액, 누적 주문금액·건수, 환불주문
 *   판매내역  : 베스트셀러 음료 Top10 — 상품명칭별 판매량
 *               (예: 아메리카노 HOT/ICED, 투샷, 바닐라밀크티 …)
 *   메뉴      : 레시피관리 / 재고관리 / 판매수익 / 판매관리
 *
 * 수집기(🔬 작업)는 아래 형태로 보내면 된다.
 *   { loyalsuns: { capturedAt, machine: { online, alerts: [{ code, serial, message }] },
 *                  revenue: { today, yesterday, month },
 *                  orders: { todayCount, totalCount, refundCount },
 *                  bestsellers: [{ name, quantity, amount }] } }
 *
 * 음료 잔수는 **베스트셀러 Top10 수량 합**을 우선 쓰고, 없으면 금일 매출 ÷ 객단가(2,300원)로 추정한다.
 * Top10은 전체 판매의 일부일 수 있으므로, 합이 매출÷객단가보다 크게 작으면 경고를 남긴다.
 */

export type LoyalsunsSnapshotInput = {
  capturedAt?: string;
  machine?: {
    online?: boolean;
    alerts?: { code?: string; serial?: string; message?: string; bodyCode?: string }[];
  };
  revenue?: { today?: number | string; yesterday?: number | string; month?: number | string };
  orders?: {
    todayCount?: number | string;
    totalCount?: number | string;
    refundCount?: number | string;
    refundToday?: number | string;
  };
  bestsellers?: { name?: string; productName?: string; quantity?: number | string; qty?: number | string; amount?: number | string }[];
  notes?: string[];
};

const AVERAGE_TICKET = 2300;

export function normalizeLoyalsunsSnapshot(
  input: LoyalsunsSnapshotInput,
  options: { storeCode: string; capturedAtFallback?: string },
): NormalizedSnapshot {
  const capturedAt = normalizeCapturedAt(input.capturedAt, options.capturedAtFallback);
  const notes: string[] = [];
  const warnings: string[] = [];

  const todayRevenue = asNumber(input.revenue?.today);
  const yesterdayRevenue = asNumber(input.revenue?.yesterday);
  const monthRevenue = asNumber(input.revenue?.month);
  const todayCount = asNumber(input.orders?.todayCount);
  const refundToday = asNumber(input.orders?.refundToday);

  const beverages: BeverageLine[] = [];

  for (const item of input.bestsellers ?? []) {
    const name = asText(item.name ?? item.productName, 40);
    const quantity = asNumber(item.quantity ?? item.qty);
    if (!name || quantity === null || quantity <= 0) continue;
    beverages.push({ name, quantity: Math.round(quantity), amount: asNumber(item.amount) });
  }

  const topSum = beverages.reduce((sum, item) => sum + item.quantity, 0);
  const estimatedFromRevenue = todayRevenue !== null && todayRevenue > 0 ? Math.round(todayRevenue / AVERAGE_TICKET) : null;

  let drinksSold: number | null = null;

  if (topSum > 0) {
    drinksSold = topSum;
    if (estimatedFromRevenue !== null && estimatedFromRevenue > 0 && topSum < estimatedFromRevenue * 0.6) {
      warnings.push(
        `베스트셀러 합 ${topSum}잔이 매출 추정 ${estimatedFromRevenue}잔보다 적습니다 — Top10 밖 판매분이 있습니다.`,
      );
    }
    notes.push(`베스트셀러 ${beverages.length}종 합계 ${topSum}잔`);
  } else if (estimatedFromRevenue !== null) {
    drinksSold = estimatedFromRevenue;
    notes.push(`음료 잔수 미제공 — 금일 매출 ÷ ${AVERAGE_TICKET.toLocaleString("ko-KR")}원으로 추정`);
  }

  if (todayCount !== null) notes.push(`오늘 주문 ${todayCount.toLocaleString("ko-KR")}건`);
  if (refundToday !== null && refundToday > 0) notes.push(`환불 ${refundToday}건`);

  const alerts = input.machine?.alerts ?? [];
  if (alerts.length > 0) {
    const labels = alerts
      .map((alert) => asText(alert.message ?? alert.code, 30) ?? asText(alert.serial, 20))
      .filter((label): label is string => Boolean(label));
    warnings.push(`재료 부족·기계 알림 ${alerts.length}건${labels.length ? `: ${labels.join(", ")}` : ""}`);
  }
  if (input.machine?.online === false) {
    warnings.push("기계가 오프라인으로 표시됩니다 — 매출 급감이 소모 감소가 아닐 수 있습니다.");
  }

  const revenues: RevenueSnapshot[] = [];
  const today = kstDate(capturedAt);
  const yesterdayDate = new Date(new Date(capturedAt).getTime() - 24 * 3600_000).toISOString();
  const yesterday = kstDate(yesterdayDate);

  if (todayRevenue !== null) {
    revenues.push({
      source: "loyalsuns",
      scope: "day",
      periodStart: today,
      periodEnd: today,
      grossAmount: todayRevenue,
      refundAmount: refundToday ?? 0,
      netAmount: todayRevenue - (refundToday ?? 0),
      orderCount: todayCount,
      refundCount: refundToday,
    });
  }

  if (yesterdayRevenue !== null) {
    revenues.push({
      source: "loyalsuns",
      scope: "day",
      periodStart: yesterday,
      periodEnd: yesterday,
      grossAmount: yesterdayRevenue,
      refundAmount: 0,
      netAmount: yesterdayRevenue,
      orderCount: null,
      refundCount: null,
    });
  }

  if (monthRevenue !== null) {
    const monthStart = `${today.slice(0, 7)}-01`;
    revenues.push({
      source: "loyalsuns",
      scope: "month",
      periodStart: monthStart,
      periodEnd: today,
      grossAmount: monthRevenue,
      refundAmount: 0,
      netAmount: monthRevenue,
      orderCount: null,
      refundCount: null,
    });
  }

  if (yesterdayRevenue !== null) notes.push(`어제 매출 ${yesterdayRevenue.toLocaleString("ko-KR")}원`);
  if (monthRevenue !== null) notes.push(`이달 매출 ${monthRevenue.toLocaleString("ko-KR")}원`);

  const patch: NormalizedSnapshot["patch"] = {};
  if (todayRevenue !== null) patch.cafeRevenue = Math.max(0, Math.round(todayRevenue));
  if (drinksSold !== null) patch.drinksSold = drinksSold;

  if (input.notes?.length) notes.push(...input.notes.slice(0, 5));

  return {
    source: "loyalsuns",
    capturedAt,
    salesDate: kstDate(capturedAt),
    patch,
    telemetry: null,
    beverages,
    revenues,
    machine: {
      online: typeof input.machine?.online === "boolean" ? input.machine.online : null,
      alerts: (input.machine?.alerts ?? [])
        .map((alert) => asText(alert.message ?? alert.code, 40) ?? asText(alert.serial, 24))
        .filter((label): label is string => Boolean(label)),
    },
    notes,
    warnings,
  };
}
