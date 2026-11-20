/**
 * 토스페이먼츠 은행 코드 → 은행 이름 (가상계좌 안내용).
 * https://docs.tosspayments.com/reference/codes — 응답은 두 자리 코드.
 */

const BANK_NAMES: Record<string, string> = {
  "02": "KDB산업은행",
  "03": "IBK기업은행",
  "06": "KB국민은행",
  "07": "Sh수협은행",
  "11": "NH농협은행",
  "12": "단위농협",
  "20": "우리은행",
  "23": "SC제일은행",
  "27": "한국씨티은행",
  "30": "수협중앙회",
  "31": "iM뱅크(대구)",
  "32": "부산은행",
  "34": "광주은행",
  "35": "제주은행",
  "37": "전북은행",
  "39": "경남은행",
  "45": "새마을금고",
  "48": "신협",
  "50": "저축은행중앙회",
  "54": "HSBC",
  "60": "BOA",
  "64": "산림조합",
  "71": "우체국예금보험",
  "81": "하나은행",
  "88": "신한은행",
  "89": "케이뱅크",
  "90": "카카오뱅크",
  "92": "토스뱅크",
  "003": "IBK기업은행",
  "004": "KB국민은행",
  "007": "Sh수협은행",
  "011": "NH농협은행",
  "020": "우리은행",
  "023": "SC제일은행",
  "027": "한국씨티은행",
  "031": "iM뱅크(대구)",
  "032": "부산은행",
  "034": "광주은행",
  "035": "제주은행",
  "037": "전북은행",
  "039": "경남은행",
  "045": "새마을금고",
  "048": "신협",
  "050": "저축은행중앙회",
  "071": "우체국예금보험",
  "081": "하나은행",
  "088": "신한은행",
  "089": "케이뱅크",
  "090": "카카오뱅크",
  "092": "토스뱅크",
};

export function bankName(code: string | null | undefined) {
  if (!code) return "은행";

  return BANK_NAMES[code] ?? `은행(${code})`;
}

export function formatDepositDue(dueDate: string | null | undefined) {
  if (!dueDate) return null;

  const date = new Date(dueDate);

  if (Number.isNaN(date.getTime())) return dueDate;

  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}
