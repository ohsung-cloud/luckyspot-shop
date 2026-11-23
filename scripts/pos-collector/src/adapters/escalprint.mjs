import { createAdapter } from "./types.mjs";

/**
 * 에스칼프린트 어댑터 — 기존 포털(1호 벤더).
 *
 * 지점 정의(`stores.mjs`)의 포털 ID로 로그인해 화면에서 읽은 값을
 * 표준 봉투(`snapshot.escalprint`)로 만든다. 값 해석·환산은 앱이 한다.
 */

export const escalprintAdapter = createAdapter({
  id: "escalprint",
  label: "에스칼프린트",
  browser: true,
  credentialEnv: ["ESCAL_<ENV>_ID", "ESCAL_<ENV>_PW"],

  envelope({ store, capturedAt, escalprint }) {
    if (!escalprint) return null;

    return {
      storeCode: store.storeCode,
      storeLabel: store.label,
      snapshot: {
        capturedAt,
        source: "escalprint",
        escalprint: {
          capturedAt,
          device: {
            model: escalprint.device?.model,
            serial: escalprint.device?.serial,
            cumulativePrintCount: escalprint.device?.cumulativePrintCount,
          },
          toner: escalprint.toner,
          paper: escalprint.paper,
          revenue: escalprint.revenue
            ? {
                month: escalprint.revenue.month,
                total: escalprint.revenue.total,
                refund: escalprint.revenue.refund,
              }
            : undefined,
          todaySheets: escalprint.todaySheets,
          colorSheets: escalprint.colorSheets,
        },
      },
    };
  },
});
