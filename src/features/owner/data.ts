import { buildState } from "@/features/auto-order/service";
import { monthlyForStore, type MonthlyPeriod, type MonthlySummary } from "@/features/sales-report/monthly";
import { estimateProfit, type MonthlyFixedCost, type ProfitEstimate } from "@/features/sales-report/profit";
import type { StoreRegistryRecord } from "@/features/stores/registry-types";

import { listOwnerOrders, type OwnerOrderList } from "./orders";
import { buildOwnerStock, type OwnerStockView } from "./stock";

/**
 * `/owner` 대시보드에 필요한 값 묶음 — **한 지점 것만** 만든다(서버 전용).
 *
 * 순서는 사용자가 정한 정보 구조를 그대로 따른다.
 *   ① 이번 달 매출 + 예상 순이익  ② 원두·용지 재고  ③ 최근 발주내역
 *
 * 지점 분리
 *  - 이 함수는 지점 레코드 하나를 받아 그 지점의 매출·재고·주문만 돌려준다.
 *    다른 지점 숫자를 더하거나 섞지 않는다(기존 매출 리포트 원칙과 같다).
 *
 * 실패는 값으로 남긴다
 *  - 재고 예측이 실패해도 매출·주문은 그대로 보여 준다(카드마다 상태를 따로).
 *  - Supabase 미설정이면 주문은 "설정 없음"으로 표시하고 0건으로 위장하지 않는다.
 */

export const CURRENT_PERIOD: MonthlyPeriod = "2026-11";
export const PREVIOUS_PERIOD: MonthlyPeriod = "2026-10";

export type OwnerDashboardView = {
  store: {
    code: string;
    label: string;
    shortLabel: string;
    region: string;
    storeType: string;
  };
  current: {
    month: MonthlySummary | null;
    profit: ProfitEstimate | null;
    fixedCost: MonthlyFixedCost;
  };
  previous: {
    month: MonthlySummary | null;
    profit: ProfitEstimate | null;
  };
  stock: {
    view: OwnerStockView | null;
    dataSource: "supabase" | "memory" | "demo" | null;
    asOfDate: string | null;
    /** 예측을 못 만들었을 때의 한 줄 안내 */
    error: string | null;
  };
  orders: OwnerOrderList;
  generatedAt: string;
};

export async function loadOwnerDashboard(
  record: StoreRegistryRecord,
  now: Date = new Date(),
): Promise<OwnerDashboardView> {
  const month = monthlyForStore(record.code, CURRENT_PERIOD);
  const previousMonth = monthlyForStore(record.code, PREVIOUS_PERIOD);
  const fixedCost = record.monthlyFixedCost;

  const profit = estimateProfit({ month, fixedCost, asOf: now });
  const previousProfit = estimateProfit({ month: previousMonth, fixedCost, asOf: now });

  let stock: OwnerDashboardView["stock"] = {
    view: null,
    dataSource: null,
    asOfDate: null,
    error: null,
  };

  try {
    const built = await buildState({ storeCode: record.code, storeLabel: record.label });
    stock = {
      view: buildOwnerStock({
        forecasts: built.state.run.forecasts,
        thresholds: record.thresholds,
        asOfDate: built.state.asOfDate,
      }),
      dataSource: built.state.dataSource,
      asOfDate: built.state.asOfDate,
      error: null,
    };
  } catch (error) {
    console.error("[owner] 재고 예측을 만들지 못했습니다:", error instanceof Error ? error.message : error);
    stock = {
      view: null,
      dataSource: null,
      asOfDate: null,
      error: "재고 예측을 불러오지 못했어요. 잠시 후 새로고침해 주세요.",
    };
  }

  return {
    store: {
      code: record.code,
      label: record.label,
      shortLabel: record.shortLabel,
      region: record.region,
      storeType: record.storeType,
    },
    current: { month, profit, fixedCost },
    previous: { month: previousMonth, profit: previousProfit },
    stock,
    orders: await listOwnerOrders({ storeCode: record.code, limit: 5 }),
    generatedAt: now.toISOString(),
  };
}
