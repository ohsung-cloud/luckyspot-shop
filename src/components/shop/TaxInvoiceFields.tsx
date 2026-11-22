"use client";

import {
  formatBusinessNo,
  isValidBusinessNo,
  isValidTaxEmail,
  normalizeBusinessNo,
  type TaxInvoiceRequest,
} from "@/features/tax-invoice";

/**
 * 세금계산서 발급 요청 입력 (주문서·빠른 주문 공용).
 *
 * 기본값은 "발급 요청" 켜짐이다. 끄면 나머지 입력은 사라지고 발급 신청 없이 접수된다.
 * 검증은 서버가 한 번 더 하지만, 여기서 먼저 알려 주어 제출 전에 고칠 수 있게 한다.
 */
export default function TaxInvoiceFields({
  value,
  onChange,
  idPrefix,
  hint,
}: {
  value: TaxInvoiceRequest;
  onChange: (next: TaxInvoiceRequest) => void;
  /** input id 접두어 — 한 화면에 두 폼이 있어도 label 이 겹치지 않게 */
  idPrefix: string;
  /** 토글 아래 보여줄 안내 (예: 지점에 등록된 정보를 채웠어요) */
  hint?: string | null;
}) {
  const patch = (next: Partial<TaxInvoiceRequest>) => onChange({ ...value, ...next });

  const businessNoInvalid = value.businessNo.length > 0 && !isValidBusinessNo(value.businessNo);
  const emailInvalid = value.email.trim().length > 0 && !isValidTaxEmail(value.email);
  const missing =
    value.requested &&
    (!isValidBusinessNo(value.businessNo) ||
      !value.businessName.trim() ||
      !value.ceoName.trim() ||
      !isValidTaxEmail(value.email));
  const touched = Boolean(
    value.businessNo.trim() ||
      value.businessName.trim() ||
      value.ceoName.trim() ||
      value.email.trim(),
  );

  const inputClass =
    "ls-focus h-12 w-full rounded-[10px] border border-[var(--ls-line-strong)] bg-white px-3.5 text-[15.5px] text-[#0F1412] outline-none placeholder:text-[#6B746D]";
  const labelClass = "text-[13.5px] font-semibold text-[#3B4740]";

  return (
    <div className="rounded-[14px] border border-[var(--ls-line)] bg-[#FAFBFB] p-3.5">
      <label className="flex cursor-pointer items-start gap-2.5" htmlFor={`${idPrefix}-tax-toggle`}>
        <input
          checked={value.requested}
          className="mt-[2px] size-5 accent-[#0F1412]"
          id={`${idPrefix}-tax-toggle`}
          onChange={(event) => patch({ requested: event.target.checked })}
          type="checkbox"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-semibold text-[#0F1412]">
            세금계산서 발급 요청
            <span className="rounded-[4px] bg-[#EDFBEF] px-1.5 py-[1px] text-[10.5px] font-semibold text-[#0B5C2A]">
              기본 ON
            </span>
          </span>
          <span className="mt-0.5 block break-keep text-[13px] leading-[1.55] text-[#3B4740]">
            입금 확인 후 아래 사업자 정보로 전자세금계산서를 발급해 이메일로 보내드립니다.
            필요 없으면 체크를 해제하세요.
          </span>
        </span>
      </label>

      {hint ? (
        <p className="mt-2 rounded-[8px] bg-[#EAF8EF] px-3 py-2 text-[12.5px] leading-[1.5] text-[#0B5C2A]">
          {hint}
        </p>
      ) : null}

      {value.requested ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <label className="block sm:col-span-2" htmlFor={`${idPrefix}-tax-business-no`}>
            <span className={labelClass}>
              사업자등록번호 <span className="text-[#B42318]">*</span>
            </span>
            <input
              aria-describedby={businessNoInvalid ? `${idPrefix}-tax-business-no-error` : undefined}
              aria-invalid={businessNoInvalid}
              autoComplete="off"
              className={`${inputClass} mt-1 tabular-nums ${
                businessNoInvalid ? "border-[#E4B4B4]" : ""
              }`}
              id={`${idPrefix}-tax-business-no`}
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => patch({ businessNo: normalizeBusinessNo(event.target.value) })}
              placeholder="123-45-67890"
              type="text"
              value={formatBusinessNo(value.businessNo)}
            />
            {businessNoInvalid ? (
              <span className="mt-1 block text-[12.5px] text-[#B42318]" id={`${idPrefix}-tax-business-no-error`}>
                10자리 사업자등록번호를 정확히 입력해 주세요.
              </span>
            ) : null}
          </label>

          <label className="block" htmlFor={`${idPrefix}-tax-business-name`}>
            <span className={labelClass}>
              상호(법인명) <span className="text-[#B42318]">*</span>
            </span>
            <input
              autoComplete="organization"
              className={`${inputClass} mt-1`}
              id={`${idPrefix}-tax-business-name`}
              maxLength={60}
              onChange={(event) => patch({ businessName: event.target.value })}
              placeholder="럭키스팟 강남구청점"
              type="text"
              value={value.businessName}
            />
          </label>

          <label className="block" htmlFor={`${idPrefix}-tax-ceo-name`}>
            <span className={labelClass}>
              대표자명 <span className="text-[#B42318]">*</span>
            </span>
            <input
              autoComplete="name"
              className={`${inputClass} mt-1`}
              id={`${idPrefix}-tax-ceo-name`}
              maxLength={30}
              onChange={(event) => patch({ ceoName: event.target.value })}
              placeholder="권오성"
              type="text"
              value={value.ceoName}
            />
          </label>

          <label className="block sm:col-span-2" htmlFor={`${idPrefix}-tax-email`}>
            <span className={labelClass}>
              세금계산서 수취 이메일 <span className="text-[#B42318]">*</span>
            </span>
            <input
              aria-describedby={emailInvalid ? `${idPrefix}-tax-email-error` : undefined}
              aria-invalid={emailInvalid}
              autoComplete="email"
              className={`${inputClass} mt-1 ${emailInvalid ? "border-[#E4B4B4]" : ""}`}
              id={`${idPrefix}-tax-email`}
              inputMode="email"
              maxLength={100}
              onChange={(event) => patch({ email: event.target.value })}
              placeholder="tax@example.com"
              type="email"
              value={value.email}
            />
            {emailInvalid ? (
              <span className="mt-1 block text-[12.5px] text-[#B42318]" id={`${idPrefix}-tax-email-error`}>
                이메일 주소를 정확히 입력해 주세요.
              </span>
            ) : null}
          </label>

          <label className="block" htmlFor={`${idPrefix}-tax-business-type`}>
            <span className={labelClass}>업태 (선택)</span>
            <input
              className={`${inputClass} mt-1`}
              id={`${idPrefix}-tax-business-type`}
              maxLength={40}
              onChange={(event) => patch({ businessType: event.target.value })}
              placeholder="서비스업"
              type="text"
              value={value.businessType}
            />
          </label>

          <label className="block" htmlFor={`${idPrefix}-tax-business-item`}>
            <span className={labelClass}>종목 (선택)</span>
            <input
              className={`${inputClass} mt-1`}
              id={`${idPrefix}-tax-business-item`}
              maxLength={40}
              onChange={(event) => patch({ businessItem: event.target.value })}
              placeholder="커피전문점"
              type="text"
              value={value.businessItem}
            />
          </label>

          {missing ? (
            <p
              className={`sm:col-span-2 text-[12.5px] leading-[1.5] ${
                touched ? "text-[#B42318]" : "text-[#3B4740]"
              }`}
            >
              사업자등록번호·상호·대표자명·이메일을 모두 입력해야 발급을 신청할 수 있어요.
            </p>
          ) : (
            <p className="sm:col-span-2 text-[12.5px] leading-[1.5] text-[#0B5C2A]">
              발급 정보가 확인됐어요. 발급은 입금 확인 후 처리됩니다.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
