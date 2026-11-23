/**
 * 스냅샷 → `POST /api/auto-order/ingest-pos` 본문
 *
 * 원본: two-site-collector/bin/daily.mjs `toIngestPayload`
 * 계약(서버 어댑터가 읽는 필드)만 담는다. 지점 값은 합산하지 않으며 storeCode 로 분리된다.
 */

export function toIngestPayload(snapshot) {
  const escal = snapshot.escalprint ?? {};
  const loyal = snapshot.loyalsuns ?? {};

  return {
    storeId: snapshot.storeId ?? null,
    storeCode: snapshot.storeCode,
    storeLabel: snapshot.storeLabel,
    snapshot: {
      capturedAt: snapshot.capturedAt,
      escalprint: {
        capturedAt: snapshot.capturedAt,
        device: {
          model: escal.device?.model ?? undefined,
          serial: escal.device?.serial ?? undefined,
          cumulativePrintCount: escal.device?.cumulativePrintCount ?? undefined,
        },
        toner: escal.toner,
        paper: escal.paper,
        revenue: escal.revenue
          ? {
              month: escal.revenue.month,
              total: escal.revenue.total,
              refund: escal.revenue.refund,
            }
          : undefined,
        notes: escal.reorderHint ? [escal.reorderHint] : [],
      },
      loyalsuns: {
        capturedAt: snapshot.capturedAt,
        machine: {
          online: loyal.machine?.online,
          alerts: (loyal.machine?.alerts ?? []).map((alert) => ({
            code: alert.type,
            serial: alert.serial,
            bodyCode: alert.bodyCode,
            message: alert.message,
          })),
        },
        revenue: {
          today: loyal.revenue?.today,
          yesterday: loyal.revenue?.yesterday,
          month: loyal.revenue?.month,
        },
        orders: {
          todayCount: loyal.orders?.todayCount,
          totalCount: loyal.orders?.totalCount,
          refundCount: loyal.orders?.refundCount,
        },
        bestsellers: loyal.bestsellers,
        notes: (loyal.shortages ?? []).map((item) => `재료 부족: ${item.material}(${item.slot}) ${item.pct}%`),
      },
    },
  };
}

/** 수집 요약(지표) — 민감정보(금액) 없이 성공/실패만 남긴다. */
export function summarizeSnapshot(snapshot) {
  const loyal = snapshot.loyalsuns ?? {};
  const escal = snapshot.escalprint ?? {};
  return {
    storeCode: snapshot.storeCode,
    storeLabel: snapshot.storeLabel,
    capturedAt: snapshot.capturedAt,
    escalprint: {
      tonerRead: [escal.toner?.k, escal.toner?.c, escal.toner?.m, escal.toner?.y].filter((v) => v !== null && v !== undefined).length,
      paperRead: [escal.paper?.tray1, escal.paper?.tray2].filter((v) => v !== null && v !== undefined).length,
      cumulativePrintCount: escal.device?.cumulativePrintCount ?? null,
      revenueMonths: (escal.revenue?.history ?? []).length,
      catalogItems: (escal.catalog ?? []).length,
      calendarEvents: (escal.calendar ?? []).length,
    },
    loyalsuns: {
      bestsellers: (loyal.bestsellers ?? []).length,
      orderRowsToday: (loyal.orders?.today ?? []).length,
      inventoryItems: (loyal.inventory ?? []).length,
      inventorySource: loyal.inventorySource ?? "none",
      recipes: (loyal.recipes ?? []).length,
      consumptionRows: (loyal.consumptionLog ?? []).length,
      shortages: (loyal.shortages ?? []).length,
      revenueTodayRead: typeof loyal.revenue?.today === "number",
      revenueMonthRead: typeof loyal.revenue?.month === "number",
      revenueLastMonthRead: typeof loyal.revenue?.lastMonth === "number",
    },
  };
}
