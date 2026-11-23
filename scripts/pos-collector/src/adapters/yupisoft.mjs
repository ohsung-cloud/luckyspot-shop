import { createAdapter } from "./types.mjs";

/**
 * 유피소프트 어댑터 — 포털/API 스키마.
 *
 * 아직 화면 구조가 확정되지 않아 **스키마를 먼저 고정**한다. 수집기(또는 API 연동)는
 * `snapshot.yupisoft` 아래에 아래 모양으로만 담으면 된다.
 *
 *   supplies: [{ code: "K"|"C"|"M"|"Y", level: 62 }]   (0~100 또는 0~1)
 *   trays   : [{ name: "Tray1", level: 35 }, …]
 *   machine : { model, serial, counterTotal, online, errors[] }
 *   sales   : { day, amount, refund, prints, colorPrints, month, monthAmount }
 *
 * 앱의 `src/lib/vendors/yupisoft.ts`가 이 스키마를 표준 스냅샷으로 바꾼다.
 * 로그인 방식이 API 키로 바뀌면 credentialEnv 만 바꾸면 된다.
 */

export const yupisoftAdapter = createAdapter({
  id: "yupisoft",
  label: "유피소프트",
  browser: true,
  credentialEnv: ["YUPISOFT_<ENV>_ID", "YUPISOFT_<ENV>_PW"],

  envelope({ store, capturedAt, yupisoft }) {
    if (!yupisoft) return null;

    return {
      storeCode: store.storeCode,
      storeLabel: store.label,
      snapshot: {
        capturedAt,
        source: "yupisoft",
        yupisoft: {
          capturedAt,
          branch: yupisoft.branch ?? store.portals?.yupisoftBranch ?? store.storeId,
          machine: yupisoft.machine,
          supplies: yupisoft.supplies,
          trays: yupisoft.trays,
          sales: yupisoft.sales,
          notes: yupisoft.notes,
        },
      },
    };
  },
});
