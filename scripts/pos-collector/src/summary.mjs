/**
 * GitHub Step Summary / 콘솔 요약
 *
 * 민감정보를 남기지 않는다: 금액·매출·계정·비밀번호는 쓰지 않고,
 * "무엇을 읽었는지(건수)·성공/실패·사유"만 남긴다.
 * (이 저장소는 공개 상태이며 Actions 로그·아티팩트도 공개된다.)
 */

const statusMark = (ok, skipped) => (skipped ? "⏭️" : ok ? "✅" : "❌");

export function renderSummary(report) {
  const lines = [];
  lines.push(`# POS 자동 수집 결과 — ${report.finishedAtKst} (KST)`);
  lines.push("");
  lines.push(
    `- 실행 모드: ${report.mode === "dry-run" ? "dry-run (전송 없음)" : "실행"}${report.mock ? " · mock" : ""}`,
  );
  lines.push(`- 소요: ${report.durationSec}s · Node ${report.nodeVersion} · Playwright ${report.playwrightVersion ?? "-"}`);
  lines.push("");

  lines.push("## 지점별 결과");
  lines.push("");
  lines.push("| 지점 | 포털 | 상태 | 읽은 항목 | 전송 |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const store of report.stores) {
    for (const portal of ["loyalsuns", "escalprint"]) {
      const entry = store.portals?.[portal];
      if (!entry) continue;
      const mark = statusMark(entry.ok, entry.skipped);
      const detail =
        portal === "loyalsuns"
          ? `재고 ${store.metrics?.loyalsuns?.inventoryItems ?? 0} · 메뉴 ${store.metrics?.loyalsuns?.bestsellers ?? 0} · 주문 ${store.metrics?.loyalsuns?.orderRowsToday ?? 0} · 레시피 ${store.metrics?.loyalsuns?.recipes ?? 0}`
          : `토너 ${store.metrics?.escalprint?.tonerRead ?? 0}/4 · 용지 ${store.metrics?.escalprint?.paperRead ?? 0}/2 · 카탈로그 ${store.metrics?.escalprint?.catalogItems ?? 0} · 일정 ${store.metrics?.escalprint?.calendarEvents ?? 0}`;
      const ingest = entry.skipped
        ? "—"
        : store.ingest?.ok
          ? `HTTP ${store.ingest.status}`
          : store.ingest
            ? `HTTP ${store.ingest.status}`
            : "—";
      lines.push(`| ${store.storeLabel} (${store.storeCode}) | ${portal} | ${mark} | ${detail} | ${ingest} |`);
    }
  }

  const failures = [];
  for (const store of report.stores) {
    for (const portal of ["loyalsuns", "escalprint"]) {
      const entry = store.portals?.[portal];
      if (!entry || entry.skipped) continue;
      for (const item of entry.steps ?? []) {
        if (!item.ok) failures.push(`${store.storeCode} · ${portal} · \`${item.key}\` — ${item.error ?? "실패"}`);
      }
    }
  }

  lines.push("");
  if (failures.length > 0) {
    lines.push("## 실패한 단계");
    lines.push("");
    for (const item of failures.slice(0, 20)) lines.push(`- ${item}`);
    if (failures.length > 20) lines.push(`- … 외 ${failures.length - 20}건`);
  } else {
    lines.push("## 실패한 단계");
    lines.push("");
    lines.push("- 없음");
  }

  if (report.warnings?.length) {
    lines.push("");
    lines.push("## 참고");
    lines.push("");
    for (const warning of report.warnings.slice(0, 10)) lines.push(`- ${warning}`);
  }

  lines.push("");
  lines.push("## 지점 경로(다음 실행 튜닝용)");
  lines.push("");
  for (const store of report.stores) {
    if (!store.routes) continue;
    const parts = Object.entries(store.routes)
      .filter(([, value]) => value && value.hash)
      .map(([key, value]) => `${key}=${value.hash}`);
    if (parts.length > 0) lines.push(`- ${store.storeCode}: ${parts.join(" ")}`);
  }

  return `${lines.join("\n")}\n`;
}
