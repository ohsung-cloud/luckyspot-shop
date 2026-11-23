/** 두 사이트 수집기(two-site-collector)가 만든 일일 분석 스냅샷 스키마. */

export type SalesReportSnapshot = {
  schemaVersion: string;
  storeCode: string;
  storeLabel: string;
  capturedAt: string;
  today: string;
  burst: {
    today: string;
    printWeight: number;
    coffeeWeight: number;
    activeWindow: { title: string; end: string } | null;
    events: { title: string; phase: string; daysToStart: number; daysSinceEnd: number; weight: number }[];
  };
  demand: {
    mix: { name: string; quantity: number }[];
    drinkCount: number;
    byMaterial: {
      material: string;
      slot: string | null;
      units: number;
      unit: string;
      amount: number;
    }[];
  };
  bean: {
    method: string;
    rows: {
      product: string;
      kind: string;
      drinks: number;
      gramsPerDrink: number;
      totalGrams: number;
      machineGrams: number | null;
      deviationPct: number | null;
      source: string;
    }[];
    coffeeDrinks: number;
    dailyUnits: number;
    dailyGrams: number;
    avgGramsPerDrink: number;
    dailyGramsWithBurst: number;
    stockPct: number;
    stockGrams: number;
    daysLeftPlain: number;
    daysLeftWithBurst: number;
    servingsLeft: number;
    unitBasis: { confirmed: string; assumed: string; logScale: string };
    refillLog: {
      at: string;
      serial: string;
      bodyCode: string;
      slot: string;
      beforePct: number;
      afterPct: number;
      capacity: number;
      capacityUnit: string;
      note: string;
    }[];
  };
  drift: {
    orders: number;
    actualTotals: Record<string, number>;
    findings: {
      type: string;
      severity: string;
      product: string;
      material: string;
      detail: string;
      hint: string;
    }[];
    summary: string;
  };
  stock: {
    material: string;
    slot: string;
    pct: number;
    unit: string;
    units: number;
    unitsPerDay: number;
    daysLeft: number | null;
    safetyDays: number;
    status: "ok" | "watch" | "empty";
  }[];
  print: {
    toner: { k: number; c: number; m: number; y: number };
    paper: { tray1: number; tray2: number };
    trayAvgPct: number;
    tonerAvgPct: number;
    hasCounterHistory: boolean;
    cumulativePrintCount: number;
    nextParts: { name: string; price: number; note: string }[];
    actions: {
      sku: string;
      owner: string;
      reason: string;
      options: { boxes: number; amount: number; shipping: boolean }[];
      recommendBoxes: number;
    }[];
  };
  orders: {
    proposals: {
      domain: "cafe" | "print";
      material: string;
      owner: "franchisee_cafe" | "hq_print";
      pct: number | null;
      daysLeft: number | null;
      quantity: number;
      packLabel: string | null;
      amount: number | null;
      reason: string;
      needsQuote?: boolean;
      priceBasis?: string;
      shippingNote?: string;
    }[];
    byOwner: Record<
      "franchisee_cafe" | "hq_print",
      { count: number; amount: number; unknownAmount: number }
    >;
  };
  revenue: {
    coffee: {
      today: number;
      yesterday: number;
      month: number;
      cumulativeTotal: number;
      dailyRate: number;
      trendPct: number;
    };
    print: {
      month: string;
      total: number;
      prevMonth: { month: string; total: number; changePct: number };
      refund: number;
      currentMonthPending: boolean;
      history: { month: string; total: number; changePct: number | null }[];
      trendPct: number;
    };
    blended: { dailyRate: number; monthlyRunRate: number; basis: string };
  };
  risk: {
    todayRevenue: number;
    icedRevenue: number;
    icedShare: number;
    items: {
      material: string;
      slot: string;
      pct: number;
      affectedMenus: string[];
      revenueAtRiskPerDay: number | null;
      icedShare: number;
      priority: number;
      action: string;
    }[];
  };
  assumptions: string[];
};
