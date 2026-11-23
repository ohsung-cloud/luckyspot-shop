"use client";

import type { SplitResult } from "@/features/auto-order/types";

import { ENTITY_LABEL, ENTITY_TONE, packUnit, won } from "./format";

/**
 * 사업자별 분기 결과 — 점주 사업자 전표와 본사 사업자 전표를 나란히 보여준다.
 * 세금계산서는 '공급처(발행) → 사업자(수신)'로 표기한다.
 */
export default function SplitSlips({ split, compact = false }: { split: SplitResult; compact?: boolean }) {
  if (split.slips.length === 0) {
    return (
      <p className="rounded-[16px] bg-[#F4F5F6] px-4 py-6 text-center text-[14px] text-[#6B746D]">
        분기할 발주 항목이 없습니다.
      </p>
    );
  }

  return (
    <div className={compact ? "grid gap-3" : "grid items-start gap-3 md:grid-cols-2"}>
      {split.slips.map((slip) => (
        <article
          key={slip.entityType}
          className="rounded-[20px] border border-[#E6E9E7] bg-white p-4 shadow-[0_4px_16px_rgba(15,20,18,0.04)]"
        >
          <div className="flex items-start justify-between gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${ENTITY_TONE[slip.entityType]}`}>
              {ENTITY_LABEL[slip.entityType]}
            </span>
            <span className="text-[19px] font-bold tabular-nums text-[#0F1412]">{won(slip.totalAmount)}</span>
          </div>

          <p className="mt-2 text-[13px] font-semibold text-[#0F1412]">{slip.entityName}</p>
          <p className="mt-0.5 text-[11.5px] text-[#6B746D]">사업자번호 {slip.businessNoMasked} (마스킹)</p>

          <ul className="mt-3 space-y-2">
            {slip.lines.map((line) => (
              <li key={line.sku} className="flex items-start justify-between gap-2 text-[13.5px]">
                <span className="text-[#3B4740]">
                  {line.name}
                  <span className="ml-1 text-[11.5px] text-[#6B746D]">×{line.quantity}{packUnit(line.packLabel)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#0F1412]">{won(line.amount)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 border-t border-dashed border-[#E6E9E7] pt-3 text-[12px] text-[#3B4740]">
            <div className="flex justify-between">
              <dt>공급가액</dt>
              <dd className="tabular-nums">{won(slip.supplyAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>부가세</dt>
              <dd className="tabular-nums">{won(slip.vatAmount)}</dd>
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#6B746D]">결제 귀속 · {slip.paymentOwner}</div>
            {slip.suppliers.map((group) => (
              <div key={group.supplier} className="text-[11.5px] text-[#6B746D]">
                세금계산서 · {group.taxInvoiceIssuer} → {group.taxInvoiceRecipient}
              </div>
            ))}
            <div className="text-[11.5px] text-[#6B746D]">{slip.costShareNote}</div>
          </dl>
        </article>
      ))}
    </div>
  );
}
