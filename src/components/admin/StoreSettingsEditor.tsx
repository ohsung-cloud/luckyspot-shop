"use client";

import { useCallback, useState } from "react";

import type { PrintVendorType, StoreAdminListItem } from "@/features/stores/registry-types";
import { PRINT_VENDORS, PRINT_VENDOR_LABELS } from "@/features/stores/registry-types";
import { FIXED_COST_LABELS, fixedCostTotal } from "@/features/sales-report/profit";

/**
 * 매장 설정 편집 — 프린트 벤더 · 월 고정비 · PIN 재발급 · 타사 복합기 CSV.
 *
 * 모두 `설정 · 코드 · 연동` 접이식 안에 들어가므로 첫 화면 높이에는 영향이 없다.
 */

type CsvPreview = {
  ok?: boolean;
  preview?: {
    headers: Record<string, string>;
    accepted: number;
    skipped: number;
    rows: { salesDate: string; cafeRevenue: number; printRevenue: number; printSheets: number }[];
    totalRows: number;
  };
  warnings?: string[];
  message?: string;
  error?: string;
};

const inputClass =
  "h-10 w-full rounded-[9px] border border-[#E6E9E7] bg-white px-1 text-center text-[12px] tabular-nums text-[#0F1412] outline-none focus:border-[#0F1412]";

export default function StoreSettingsEditor({
  store,
  busy,
  onBusy,
  onNotice,
  onReload,
}: {
  store: StoreAdminListItem;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [vendor, setVendor] = useState<PrintVendorType>(store.printVendor);
  const [cost, setCost] = useState({
    rent: String(store.monthlyFixedCost?.rent ?? 0),
    maintenance: String(store.monthlyFixedCost?.maintenance ?? 0),
    internet: String(store.monthlyFixedCost?.internet ?? 0),
    solution: String(store.monthlyFixedCost?.solution ?? 0),
  });
  const [pin, setPin] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const save = useCallback(async () => {
    onBusy(true);

    try {
      const response = await fetch(`/api/admin/stores/${encodeURIComponent(store.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            printVendor: vendor,
            monthlyFixedCost: {
              rent: Number(cost.rent.replace(/\D/g, "")) || 0,
              maintenance: Number(cost.maintenance.replace(/\D/g, "")) || 0,
              internet: Number(cost.internet.replace(/\D/g, "")) || 0,
              solution: Number(cost.solution.replace(/\D/g, "")) || 0,
            },
            pinEnabled: store.pinEnabled,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      onNotice(payload?.message ?? payload?.error ?? "저장했습니다.");
      await onReload();
    } catch {
      onNotice("설정을 저장하지 못했어요.");
    } finally {
      onBusy(false);
    }
  }, [cost, onBusy, onNotice, onReload, store.code, store.pinEnabled, vendor]);

  const regenerate = async () => {
    onBusy(true);

    try {
      const response = await fetch(`/api/admin/stores/${encodeURIComponent(store.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-pin" }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; pin?: string; error?: string } | null;

      if (!response.ok || !payload?.pin) {
        onNotice(payload?.error ?? "PIN을 발급하지 못했어요.");
        return;
      }

      setPin(payload.pin);
      onNotice("새 PIN을 발급했습니다. 지금 한 번만 보입니다.");
      await onReload();
    } catch {
      onNotice("PIN을 발급하지 못했어요.");
    } finally {
      onBusy(false);
    }
  };

  const runCsv = async (commit: boolean) => {
    if (csv.trim().length === 0) {
      onNotice("CSV 내용을 붙여넣어 주세요.");
      return;
    }

    setCsvBusy(true);

    try {
      const response = await fetch("/api/auto-order/ingest-pos/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeCode: store.code, vendor: "generic_webhook", csv, commit }),
      });
      const payload = (await response.json().catch(() => null)) as CsvPreview | null;

      if (commit) {
        onNotice(payload?.message ?? payload?.error ?? "적용했습니다.");
        setCsvPreview(null);
        setCsv("");
        return;
      }

      setCsvPreview(payload);
      if (!payload?.ok) onNotice(payload?.error ?? "CSV를 읽지 못했어요.");
    } catch {
      onNotice("CSV를 읽지 못했어요.");
    } finally {
      setCsvBusy(false);
    }
  };

  const total = fixedCostTotal({
    rent: Number(cost.rent.replace(/\D/g, "")) || 0,
    maintenance: Number(cost.maintenance.replace(/\D/g, "")) || 0,
    internet: Number(cost.internet.replace(/\D/g, "")) || 0,
    solution: Number(cost.solution.replace(/\D/g, "")) || 0,
  });

  return (
    <div className="mt-2 grid gap-2">
      {/* 프린트 벤더 */}
      <div className="rounded-[10px] bg-white px-2.5 py-2">
        <p className="text-[10.5px] font-bold text-[#3B4740]">프린트 복합기 벤더</p>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {PRINT_VENDORS.map((option) => (
            <button
              key={option}
              className={`h-8 rounded-[8px] border text-[10px] font-bold ${
                vendor === option ? "border-[#0F1412] bg-[#0F1412] text-white" : "border-[#E6E9E7] bg-white text-[#3B4740]"
              }`}
              onClick={() => setVendor(option)}
              type="button"
            >
              {PRINT_VENDOR_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-[1.5] text-[#98A29B]">
          수집기가 어느 포털을 읽을지 정합니다. 타사는 표준 JSON 웹훅·CSV로 받습니다.
        </p>
      </div>

      {/* 월 고정비 */}
      <div className="rounded-[10px] bg-white px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-bold text-[#3B4740]">월 고정비(예상 순수익 계산)</p>
          <span className="text-[9.5px] font-bold tabular-nums text-[#0B5C2A]">{total.toLocaleString("ko-KR")}원</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {FIXED_COST_LABELS.map((item) => (
            <label key={item.key} className="block">
              <span className="block text-[8.5px] text-[#98A29B]">{item.label}</span>
              <input
                className={inputClass}
                inputMode="numeric"
                onChange={(event) => setCost((prev) => ({ ...prev, [item.key]: event.target.value }))}
                value={cost[item.key]}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          className="h-9 rounded-[9px] bg-[#0F1412] text-[11px] font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          벤더 · 고정비 저장
        </button>
        <button
          className="h-9 rounded-[9px] border border-[#E6E9E7] bg-white text-[11px] font-bold text-[#3B4740] disabled:opacity-50"
          disabled={busy}
          onClick={() => void regenerate()}
          type="button"
        >
          4자리 PIN 재발급
        </button>
      </div>

      {pin ? (
        <p className="rounded-[9px] bg-[#FFF9EA] px-2.5 py-2 text-[11px] font-bold text-[#8A5A00]">
          새 PIN <span className="font-mono text-[15px] tracking-[0.2em] text-[#0F1412]">{pin}</span> — 지금 한 번만 보입니다.
        </p>
      ) : null}

      {/* 타사 복합기 CSV */}
      <details className="rounded-[10px] bg-white px-2.5 py-2">
        <summary className="cursor-pointer text-[10.5px] font-bold text-[#3B4740]">타사 복합기 CSV 마감 업로드 · 미리보기</summary>
        <p className="mt-1 text-[9px] leading-[1.5] text-[#98A29B]">
          첫 줄에 날짜(date) 열이 있어야 합니다. 커피매출 · 프린트매출 · 출력매수 · 컬러매수 · 원두g 열을 알아봅니다.
        </p>
        <textarea
          className="mt-1 h-20 w-full rounded-[8px] border border-[#E6E9E7] p-2 font-mono text-[10px] text-[#0F1412] outline-none focus:border-[#0F1412]"
          onChange={(event) => setCsv(event.target.value)}
          placeholder={"date,printRevenue,printSheets,colorSheets\n2026-11-22,250000,1200,90"}
          value={csv}
        />
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <button
            className="h-8 rounded-[8px] border border-[#D7DBD9] bg-white text-[10.5px] font-bold text-[#3B4740] disabled:opacity-50"
            disabled={csvBusy}
            onClick={() => void runCsv(false)}
            type="button"
          >
            {csvBusy ? "읽는 중…" : "미리보기"}
          </button>
          <button
            className="h-8 rounded-[8px] bg-[#1DFF26] text-[10.5px] font-bold text-[#0F1412] disabled:opacity-50"
            disabled={csvBusy || !csvPreview?.ok || (csvPreview?.preview?.accepted ?? 0) === 0}
            onClick={() => void runCsv(true)}
            type="button"
          >
            저장 · 예측 반영
          </button>
        </div>

        {csvPreview?.preview ? (
          <div className="mt-1.5 rounded-[8px] bg-[#F8F9F9] px-2 py-1.5">
            <p className="text-[9.5px] font-bold text-[#3B4740]">
              {csvPreview.preview.accepted}일 읽음 · 건너뜀 {csvPreview.preview.skipped}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {csvPreview.preview.rows.slice(-3).map((row) => (
                <li key={row.salesDate} className="flex justify-between text-[9px] tabular-nums text-[#6B746D]">
                  <span>{row.salesDate}</span>
                  <span>
                    프린트 {row.printRevenue.toLocaleString("ko-KR")}원 · {row.printSheets.toLocaleString("ko-KR")}매
                  </span>
                </li>
              ))}
            </ul>
            {(csvPreview.warnings ?? []).length > 0 ? (
              <p className="mt-1 text-[8.5px] leading-[1.5] text-[#8A5A00]">{(csvPreview.warnings ?? [])[0]}</p>
            ) : null}
          </div>
        ) : null}
      </details>

      <p className="rounded-[10px] bg-white px-2.5 py-2 text-[10.5px] leading-[1.6] text-[#6B746D]">
        포털 비밀번호는 이 앱에 저장하지 않습니다. GitHub → Settings → Secrets 에{" "}
        <span className="font-mono">{store.secrets.loyalsunsId}</span> ·{" "}
        <span className="font-mono">{store.secrets.loyalsunsPassword}</span> ·{" "}
        <span className="font-mono">{store.secrets.escalprintId}</span> ·{" "}
        <span className="font-mono">{store.secrets.escalprintPassword}</span> 를 넣으면 수집기가 이 지점을 읽습니다.
      </p>
    </div>
  );
}
