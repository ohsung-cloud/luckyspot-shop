import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";

/**
 * 발주 접수 완료 문자(SOLAPI) — 서버 전용.
 *
 * 주문이 구글시트 웹훅과 Supabase에 정상 접수된 뒤, 주문자 휴대폰(requester_phone)으로
 * 접수 안내 문자를 보낸다.
 *  - 환경변수(SOLAPI_API_KEY·SOLAPI_API_SECRET·SOLAPI_SENDER)가 하나라도 비어 있으면
 *    보내지 않고 경고 로그만 남긴다.
 *  - 잔액 부족·허용 IP 불일치·네트워크 오류·시간 초과가 나도 주문 접수 응답은 절대
 *    실패하지 않는다. 응답을 보낸 뒤(after)에 실행하고, 예외는 안에서 삼킨다.
 *  - 본문 바이트 수에 따라 SMS(90바이트 이내) / LMS(2,000바이트 이내)를 자동으로 고른다.
 *  - 키는 process.env에서만 읽는다. 클라이언트 번들로 나가는 값은 없다.
 */

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";
const SOLAPI_REQUEST_TIMEOUT_MS = 4_000;
const SMS_MAX_BYTES = 90;
const LMS_MAX_BYTES = 2_000;

export type OrderNotifyInput = {
  /** 숫자만 남긴 주문자 휴대폰 번호(예: 01099017189) */
  to: string;
  /** 배송지 라벨에서 뽑은 지점명. 개인 주문(직접 입력)이면 null */
  storeName: string | null;
  /** 주문번호(예: 261119-123A) */
  orderNumber: string;
  /** 서버가 카탈로그 단가로 계산한 결제 금액(원) */
  totalAmount: number;
};

export type OrderNotifyResult = {
  ok: boolean;
  skipped?: "not_configured" | "invalid_phone" | "empty_message";
  error?: string;
  type?: "SMS" | "LMS";
};

type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  sender: string;
  pfId?: string;
  orderTemplateId?: string;
};

function readConfig(): SolapiConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.replace(/\D/g, "");

  if (!apiKey || !apiSecret || !sender) return null;

  return {
    apiKey,
    apiSecret,
    sender,
    pfId: process.env.SOLAPI_PFID?.trim() || undefined,
    orderTemplateId: process.env.SOLAPI_ORDER_TEMPLATE_ID?.trim() || undefined,
  };
}

export function isOrderNotificationConfigured() {
  return readConfig() !== null;
}

/** 로그에 남길 때는 가운데 자리를 가린다. */
function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{3,4}(\d{4})$/, "$1****$2");
}

/** 문자(SMS/LMS) 바이트 수 — 솔라피 기준대로 한글·기호 2바이트, 영문·숫자 1바이트로 센다. */
function countMessageBytes(text: string) {
  let bytes = 0;

  for (const char of text) {
    bytes += char.charCodeAt(0) > 127 ? 2 : 1;
  }

  return bytes;
}

/** 지점명에서 브랜드 접두어를 떼어 본문을 짧게 쓴다. 개인 주문이면 '개인주문'. */
function resolveStoreLabel(storeName: string | null) {
  const label = storeName?.trim().replace(/^럭키스팟\s*/, "") ?? "";

  return label || "개인주문";
}

function buildMessageText(input: OrderNotifyInput) {
  const amount = input.totalAmount.toLocaleString("ko-KR");

  return `[럭키스팟 발주] ${resolveStoreLabel(input.storeName)} 발주(${input.orderNumber}, ${amount}원)가 정상 접수되었습니다.`;
}

function authorizationHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 실패 원인을 운영자가 바로 알아볼 수 있게 짧게 덧붙인다. */
function describeFailure(status: number, body: string) {
  const hints: string[] = [];

  if (status === 403 || /allowed ip|허용\s*ip|IP/i.test(body)) {
    hints.push("허용 IP 불일치 또는 권한 없음 — 솔라피 콘솔에서 이 요청을 보낸 서버 IP를 확인하세요");
  }

  if (/NotEnoughBalance|잔액/i.test(body)) {
    hints.push("잔액 부족 — 솔라피 콘솔에서 충전이 필요합니다");
  }

  return hints.length ? ` (${hints.join(" / ")})` : "";
}

export async function sendOrderNotification(input: OrderNotifyInput): Promise<OrderNotifyResult> {
  const config = readConfig();

  if (!config) {
    return { ok: false, skipped: "not_configured" };
  }

  const to = input.to.replace(/\D/g, "").slice(0, 11);

  if (!/^01\d{8,9}$/.test(to)) {
    console.warn(`[solapi] 주문자 번호가 올바르지 않아 발주 완료 문자를 건너뜁니다 order=${input.orderNumber}`);
    return { ok: false, skipped: "invalid_phone" };
  }

  const fullText = buildMessageText(input);
  const fullBytes = countMessageBytes(fullText);

  if (fullBytes > LMS_MAX_BYTES) {
    console.warn(
      `[solapi] 완료 문자 본문이 ${fullBytes}바이트로 LMS 한도(${LMS_MAX_BYTES})를 넘어 보내지 않습니다 order=${input.orderNumber}`,
    );
    return { ok: false, skipped: "empty_message" };
  }

  const type: "SMS" | "LMS" = fullBytes <= SMS_MAX_BYTES ? "SMS" : "LMS";

  // 템플릿 3(UrQZWfn2wY): "[럭키스팟 발주] #{지점명} 발주(#{주문번호}, #{금액}원)가 정상 접수되었습니다."
  // 알림톡은 허용 IP 등록이 필요 없어 Vercel에서도 발송되고, 문자는 고정 IP가 없으면 403이다.
  const kakaoOptions =
    config.pfId && config.orderTemplateId
      ? {
          pfId: config.pfId,
          templateId: config.orderTemplateId,
          disableSms: true,
          variables: {
            "#{지점명}": resolveStoreLabel(input.storeName),
            "#{주문번호}": input.orderNumber,
            "#{금액}": input.totalAmount.toLocaleString("ko-KR"),
          },
        }
      : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOLAPI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SOLAPI_SEND_URL, {
      body: JSON.stringify({
        message: {
          from: config.sender,
          to,
          text: fullText,
          ...(kakaoOptions ? { kakaoOptions } : { type, ...(type === "LMS" ? { subject: "[럭키스팟] 발주 접수" } : {}) }),
        },
      }),
      cache: "no-store",
      headers: {
        Authorization: authorizationHeader(config.apiKey, config.apiSecret),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        `[solapi] 발주 완료 문자 실패 order=${input.orderNumber} to=${maskPhone(to)} status=${response.status}` +
          describeFailure(response.status, responseText),
        responseText.slice(0, 200),
      );

      return { error: `status_${response.status}`, ok: false, type };
    }

    console.log(
      `[solapi] 발주 완료 문자 발송 order=${input.orderNumber} to=${maskPhone(to)} type=${type} bytes=${fullBytes}`,
    );

    return { ok: true, type };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";

    console.error(
      `[solapi] 발주 완료 문자 ${timedOut ? "시간 초과" : "오류"} order=${input.orderNumber} to=${maskPhone(to)}:`,
      error instanceof Error ? error.message : error,
    );

    return { error: timedOut ? "timeout" : "request_failed", ok: false, type };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 주문 접수 응답을 보낸 뒤(after) 완료 문자를 비동기로 보낸다.
 * 설정이 없으면 예약하지 않고 경고만 남긴다. 어떤 경우에도 예외를 밖으로 던지지 않는다.
 */
export function queueOrderNotification(input: OrderNotifyInput) {
  if (!readConfig()) {
    console.warn(
      `[orders] SOLAPI_API_KEY·SOLAPI_API_SECRET·SOLAPI_SENDER가 없어 발주 완료 문자를 건너뜁니다 order=${input.orderNumber}`,
    );
    return;
  }

  try {
    after(async () => {
      await sendOrderNotification(input);
    });
  } catch {
    // after()를 쓸 수 없는 실행 환경이면 응답을 막지 않는 선에서 그냥 시도한다.
    void sendOrderNotification(input).catch(() => undefined);
  }
}
