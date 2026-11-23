import { BUSINESS_ENTITIES } from "./rules";
import type {
  AutoOrderProposal,
  EntityOrderSlip,
  OwnerEntityType,
  SplitLine,
  SplitResult,
  SplitSupplierGroup,
} from "./types";

/**
 * 사업자/세금계산서 분기 엔진 — 특허 청구항 (e)(f).
 *
 * 1건의 통합 발주 승인을 받으면, 발주 라인을 **소유 사업자별로 나누고**
 * 같은 사업자 안에서도 **공급처가 다르면 세금계산서 발행 주체를 따로** 잡는다.
 *
 *   점주 사업자(카페)  ← 제이웨이브(원두), 로얄선스(컵·리드) …
 *   본사 사업자(프린트) ← 본사 지정 공급처(용지·토너)
 *
 * 금액은 전부 부가세 포함 단가다. 공급가액 = round(합계 ÷ 1.1), 부가세 = 합계 − 공급가액.
 * (럭키스팟 발주 카탈로그가 VAT 포함 단가만 쓰기 때문이다.)
 */

export function entityNameFor(entityType: OwnerEntityType, storeLabel: string) {
  if (entityType === "hq_print") return BUSINESS_ENTITIES.hq_print.name;

  const cafeLabel = storeLabel.replace("럭키스팟", "카페 럭키스팟");
  return `${cafeLabel} · 점주 사업자`;
}

function vatSplit(total: number) {
  const supplyAmount = Math.round(total / 1.1);
  return { supplyAmount, vatAmount: total - supplyAmount };
}

export function splitProposals(input: {
  approvalId: string;
  storeCode: string;
  storeLabel: string;
  proposals: AutoOrderProposal[];
}): SplitResult {
  const byEntity = new Map<OwnerEntityType, AutoOrderProposal[]>();

  for (const proposal of input.proposals) {
    const list = byEntity.get(proposal.ownerEntityType) ?? [];
    list.push(proposal);
    byEntity.set(proposal.ownerEntityType, list);
  }

  const slips: EntityOrderSlip[] = [];

  for (const entityType of ["franchisee_cafe", "hq_print"] as const) {
    const proposals = byEntity.get(entityType);
    if (!proposals || proposals.length === 0) continue;

    const entity = BUSINESS_ENTITIES[entityType];
    const entityName = entityNameFor(entityType, input.storeLabel);

    const lines: SplitLine[] = proposals.map((proposal) => ({
      sku: proposal.sku,
      name: proposal.name,
      quantity: proposal.quantity,
      packLabel: proposal.packLabel,
      unitPrice: proposal.unitPrice,
      amount: proposal.amount,
      supplier: proposal.supplier,
    }));

    const bySupplier = new Map<string, SplitLine[]>();

    for (const line of lines) {
      const list = bySupplier.get(line.supplier) ?? [];
      list.push(line);
      bySupplier.set(line.supplier, list);
    }

    const suppliers: SplitSupplierGroup[] = [...bySupplier.entries()].map(([supplier, groupLines]) => {
      const total = groupLines.reduce((sum, line) => sum + line.amount, 0);
      const { supplyAmount, vatAmount } = vatSplit(total);

      return {
        supplier,
        taxInvoiceIssuer: supplier,
        taxInvoiceRecipient: entityName,
        recipientBusinessNoMasked: entity.businessNoMasked,
        lines: groupLines,
        supplyAmount,
        vatAmount,
        totalAmount: total,
      };
    });

    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const { supplyAmount, vatAmount } = vatSplit(totalAmount);

    slips.push({
      entityType,
      entityName,
      businessNoMasked: entity.businessNoMasked,
      paymentOwner: entity.paymentOwner,
      costShareNote: entity.costShareNote,
      lines,
      suppliers,
      supplyAmount,
      vatAmount,
      totalAmount,
    });
  }

  const totalAmount = slips.reduce((sum, slip) => sum + slip.totalAmount, 0);

  const routing = slips.flatMap((slip) =>
    slip.suppliers.map((group) => ({
      entityType: slip.entityType,
      entityName: slip.entityName,
      supplier: group.supplier,
      taxInvoiceIssuer: group.taxInvoiceIssuer,
      taxInvoiceRecipient: group.taxInvoiceRecipient,
      amount: group.totalAmount,
    })),
  );

  return {
    approvalId: input.approvalId,
    storeCode: input.storeCode,
    storeLabel: input.storeLabel,
    slips,
    totalAmount,
    routing,
  };
}
