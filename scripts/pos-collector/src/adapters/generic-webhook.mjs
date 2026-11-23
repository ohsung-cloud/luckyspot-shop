import { createAdapter } from "./types.mjs";

/**
 * 타사 복합기 공용 어댑터(`generic_webhook`).
 *
 * 브라우저 로그인이 필요 없다. 두 길로 들어온다.
 *  1) 표준 JSON 웹훅 — 복합기 관리 시스템이 직접 `POST /api/auto-order/ingest-pos` 로 보낸다.
 *     { "vendor": "generic_webhook", "storeCode", "capturedAt",
 *       "device": { model, serial, cumulativePrintCount },
 *       "consumables": [ { sku: "toner-black", levelPct: 62 }, { sku: "a4-paper", levelPct: 38 } ],
 *       "sales": { date, printRevenue, printSheets, colorSheets } }
 *  2) CSV 업로드 — 사람이 본사 화면에서 마감 CSV를 올린다(`/api/auto-order/ingest-pos/csv`).
 *
 * 수집기는 이 벤더의 '웹훅 본문을 그대로 통과'시키는 일만 한다(값을 만들지 않는다).
 */

export const genericWebhookAdapter = createAdapter({
  id: "generic_webhook",
  label: "타사 복합기(공용)",
  browser: false,
  credentialEnv: [],

  envelope({ store, capturedAt, generic }) {
    if (!generic) return null;

    return {
      storeCode: store.storeCode,
      storeLabel: store.label,
      vendor: "generic_webhook",
      snapshot: {
        capturedAt: generic.capturedAt ?? capturedAt,
        source: "generic_webhook",
        ...generic,
      },
    };
  },
});
