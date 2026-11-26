"use client";

/**
 * 세금계산서 발급 요청 — 체크박스 하나만.
 *
 * 2026-11-26 변경
 *  - 사업자등록번호·상호·대표자명·수취 이메일·업태·종목 입력칸을 모두 없앴다.
 *  - 지점별 사업자 정보는 서버(DB·환경변수)에만 있고, 주문이 들어오면 서버가 지점 코드로 채운다.
 *    브라우저는 "발급을 요청했는가(불린)" 하나만 보낸다.
 *  - 그래서 화면에 사업자 정보가 뜨지 않고, 네트워크·페이지 소스에도 남지 않는다.
 */
export default function TaxInvoiceToggle({
  requested,
  onChange,
  idPrefix,
  personal = false,
}: {
  /** 발급 요청 여부 (기본 ON) */
  requested: boolean;
  onChange: (requested: boolean) => void;
  /** input id 접두어 — 한 화면에 두 폼이 있어도 label 이 겹치지 않게 */
  idPrefix: string;
  /** 개인 배송(지점 없음)이면 안내 문구를 바꾼다 */
  personal?: boolean;
}) {
  return (
    <div className="rounded-[16px] bg-white/70 p-3.5">
      <label className="flex cursor-pointer items-start gap-2.5" htmlFor={`${idPrefix}-tax-toggle`}>
        <input
          checked={requested}
          className="mt-[2px] size-5 accent-[#0F1412]"
          id={`${idPrefix}-tax-toggle`}
          onChange={(event) => onChange(event.target.checked)}
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
            {personal
              ? "입금 확인 후 본사에서 사업자 정보를 확인해 전자세금계산서를 발급합니다. 필요 없으면 체크를 해제하세요."
              : "등록된 매장 사업자 정보로 전자세금계산서를 발급합니다. 필요 없으면 체크를 해제하세요."}
          </span>
        </span>
      </label>
    </div>
  );
}
