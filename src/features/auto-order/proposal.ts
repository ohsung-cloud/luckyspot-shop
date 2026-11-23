import type { AutoOrderProposal, ForecastRun } from "./types";

/**
 * 예측 결과 → 발주 제안 큐.
 *
 *  - 리드타임 + 안전재고일 안으로 들어온 SKU만 제안한다(④).
 *  - 이상 감지(hold)가 켜져 있으면 제안을 만들지 않고 전부 held_anomaly로 둔다.
 *  - id는 (지점·기준일·SKU·수량) 해시라 같은 데이터면 같은 id가 나온다.
 *    화면 새로고침·API 재호출에도 승인 대상이 흔들리지 않게 하기 위함이다.
 */

/** FNV-1a 32bit — 화면·제안 id용. 암호학적 용도가 아니다. */
function fnv1a(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function proposalId(input: {
  storeCode: string;
  asOfDate: string;
  sku: string;
  quantity: number;
}) {
  return `AOP-${fnv1a(`${input.storeCode}|${input.asOfDate}|${input.sku}|${input.quantity}`)}`;
}

export function buildProposals(run: ForecastRun, nowIso = new Date().toISOString()): AutoOrderProposal[] {
  return run.forecasts
    .filter((forecast) => forecast.due && forecast.suggestedQty > 0)
    .map((forecast) => ({
      id: proposalId({
        storeCode: run.storeCode,
        asOfDate: run.asOfDate,
        sku: forecast.sku,
        quantity: forecast.suggestedQty,
      }),
      storeCode: run.storeCode,
      storeLabel: run.storeLabel,
      sku: forecast.sku,
      name: forecast.name,
      spec: forecast.spec,
      ownerEntityType: forecast.ownerEntityType,
      quantity: forecast.suggestedQty,
      packLabel: forecast.packLabel,
      unitPrice: forecast.unitPrice,
      amount: forecast.amount,
      supplier: forecast.supplier,
      remainingDays: forecast.remainingDays,
      leadTimeDays: forecast.leadTimeDays,
      safetyStockDays: forecast.safetyStockDays,
      crossFactor: forecast.crossFactor,
      evidenceLine: forecast.evidenceLine,
      status: run.hold ? ("held_anomaly" as const) : ("pending_approval" as const),
      reason: `잔여 ${forecast.remainingDays}일 ≤ 리드타임 ${forecast.leadTimeDays}일 + 안전 ${forecast.safetyStockDays}일`,
      createdAt: nowIso,
    }))
    .sort((a, b) => a.remainingDays - b.remainingDays);
}

export function proposalTotals(proposals: AutoOrderProposal[]) {
  return proposals.reduce(
    (totals, proposal) => {
      totals.count += 1;
      if (proposal.ownerEntityType === "franchisee_cafe") totals.cafeAmount += proposal.amount;
      else totals.hqAmount += proposal.amount;
      totals.totalAmount += proposal.amount;
      return totals;
    },
    { count: 0, cafeAmount: 0, hqAmount: 0, totalAmount: 0 },
  );
}
