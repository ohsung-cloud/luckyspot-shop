"use client";

import { Chip } from "@/components/internal/card-ui";
import type { SplitResult } from "@/features/auto-order/types";

import { ENTITY_LABEL, packUnit, won } from "./format";

/**
 * 사업자별 분기 결과 — 점주 사업자 전표와 본사 사업자 전표를 나란히 보여준다.
 * 세금계산서는 '공급처(발행) → 사업자(수신)'로 표기한다.
 * 카드 방식: 흰 카드 20px 라운드, 왼쪽 사업자 이름 / 오른쪽 굵은 금액.
 */
export default function SplitSlips({ split, compact = false }: { split: SplitResult; compact?: boolean }) {
  if (split.slips.length === 0) {
    return (
      <p className="rounded-[16px] bg-[#F7F8F9] px-4 py-6 text-center text-[12.5px] font-medium text-[#8B948D]">
        나눌 발주 항목이 없어요.
      </p>
    );
  }

  return (
    <div className={compact ? "grid gap-2.5" : "grid items-start gap-2.5 md:grid-cols-2"}>
      {split.slips.map((slip) => (
        <article key={slip.entityType} className="rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(15,20,18,0.06)]">
          <div className="flex items-start justify-between gap-2">
            <Chip tone={slip.entityType === "franchisee_cafe" ? "green" : "blue"}>
              {ENTITY_LABEL[slip.entityType]}
            </Chip>
            <span className="text-[19px] font-bold tabular-nums tracking-[-0.02em] text-[#0F1412]">{won(slip.totalAmount)}</span>
          </div>

          <p className="mt-2.5 text-[12.5px] font-bold text-[#0F1412]">{slip.entityName}</p>
          <p className="mt-0.5 text-[10.5px] font-medium text-[#A7AFA9]">사업자번호 {slip.businessNoMasked} (마스킹)</p>

          <ul className="mt-3 divide-y divide-[#F1F3F2]">
            {slip.lines.map((line) => (
              <li key={line.sku} className="flex items-start justify-between gap-2 py-2 text-[12.5px]">
                <span className="min-w-0 text-[#3B4740]">
                  <span className="block truncate">{line.name}</span>
                  <span className="mt-0.5 block text-[10.5px] text-[#A7AFA9]">
                    ×{line.quantity}
                    {packUnit(line.packLabel)}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[#0F1412]">{won(line.amount)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-2 space-y-1 border-t border-[#F1F3F2] pt-2.5 text-[11.5px] text-[#3B4740]">
            <div className="flex justify-between">
              <dt className="text-[#8B948D]">공급가액</dt>
              <dd className="font-semibold tabular-nums">{won(slip.supplyAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#8B948D]">부가세</dt>
              <dd className="font-semibold tabular-nums">{won(slip.vatAmount)}</dd>
            </div>
            <div className="mt-1.5 text-[10.5px] leading-[1.55] text-[#A7AFA9]">결제 귀속 · {slip.paymentOwner}</div>
            {slip.suppliers.map((group) => (
              <div key={group.supplier} className="text-[10.5px] leading-[1.55] text-[#A7AFA9]">
                세금계산서 · {group.taxInvoiceIssuer} → {group.taxInvoiceRecipient}
              </div>
            ))}
            <div className="text-[10.5px] leading-[1.55] text-[#A7AFA9]">{slip.costShareNote}</div>
          </dl>
        </article>
      ))}
    </div>
  );
}
