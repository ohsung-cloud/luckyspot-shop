import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";

/**
 * 발주 상태 알림(본사 승인·출고) — 점주에게 카카오 알림톡으로 알린다.
 *
 *   본사가 `/admin/orders` 에서 상태를 `confirmed`(본사승인) 또는 `shipped`(출고완료)로 바꾸면
 *   주문자(점주) 휴대폰으로 알림톡을 보낸다.
 *
 * 왜 알림톡(ATA)인가
 *   솔라피 권한 가이드상 `message:send-ata` 는 **허용 IP 등록이 필요 없는** 유일한 문자 채널이다.
 *   문자(SMS)는 전송자격인증제 때문에 발송 키에 고정 공인 IP가 등록돼야 하고,
 *   Vercel 서버리스는 고정 아웃바운드 IP가 없다(2026-11-20 확인).
 *
 * 필요한 환경변수 (Vercel → luckyspot-shop → Settings → Environment Variables)
 *   SOLAPI_ALIMTALK_TEMPLATE_ORDER_STATUS  카카오 채널에 등록·승인된 "발주 상태" 템플릿 ID
 *                                          (템플릿 변수: #{지점명}, #{주문번호}, #{상태})
 *   SOLAPI_PFID                            카카오 채널 발신 프로필 ID
 *   SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_SENDER   기존 문자 발송 키
 *
 * 원칙
 *   · 위 값이 하나라도 비어 있으면 **보내지 않고** debug 로그 한 줄만 남긴다(기존 흐름 영향 0).
 *   · 상태 변경 응답을 보낸 뒤(after)에 실행하고, 실패·지연·잔액 부족이 상태 변경을 막지 않는다.
 *   · 키는 process.env 에서만 읽는다. 클라이언트 번들로 나가는 값은 없다.
 *   · 로그에는 휴대폰 번호를 가려서 남긴다.
 */

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";
const REQUEST_TIMEOUT_MS = 5_000;

export type NotifiableOrderStatus = "confirmed" | "shipped";

const STATUS_LABELS: Record<NotifiableOrderStatus, string> = {
  confirmed: "본사승인",
  shipped: "출고완료",
};

export type OrderStatusAlertInput = {
  /** 숫자만 남긴 주문자 휴대폰 번호 */
  to: string;
  orderNumber: string;
  storeName: string | null;
  status: NotifiableOrderStatus;
};

export type OrderStatusAlertResult = {
  ok: boolean;
  skipped?: "not_configured" | "invalid_phone" | "unsupported_status";
  detail?: string;
};

type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  sender: string;
  pfId: string;
  templateId: string;
};

export function isOrderStatusAlertConfigured() {
  return readConfig() !== null;
}

function readConfig(): SolapiConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.replace(/\D/g, "");
  const pfId = process.env.SOLAPI_PFID?.trim();
  const templateId = process.env.SOLAPI_ALIMTALK_TEMPLATE_ORDER_STATUS?.trim();

  if (!apiKey || !apiSecret || !sender || !pfId || !templateId) return null;

  return { apiKey, apiSecret, sender, pfId, templateId };
}

export function isNotifiableStatus(value: unknown): value is NotifiableOrderStatus {
  return value === "confirmed" || value === "shipped";
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{3,4}(\d{4})$/, "$1****$2");
}

/** 지점명에서 브랜드 접두어를 떼어 본문을 짧게 쓴다. 개인 주문이면 '개인주문'. */
function resolveStoreLabel(storeName: string | null) {
  const label = storeName?.trim().replace(/^럭키스팟\s*/, "") ?? "";
  return label || "개인주문";
}

function buildMessageText(input: OrderStatusAlertInput) {
  const status = STATUS_LABELS[input.status];
  return `[럭키스팟 발주] ${resolveStoreLabel(input.storeName)} 발주(${input.orderNumber})가 ${status} 되었습니다.`;
}

function authorizationHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export async function sendOrderStatusAlert(
  input: OrderStatusAlertInput,
): Promise<OrderStatusAlertResult> {
  if (!isNotifiableStatus(input.status)) {
    return { ok: false, skipped: "unsupported_status" };
  }

  const config = readConfig();

  if (!config) {
    return { ok: false, skipped: "not_configured" };
  }

  const to = input.to.replace(/\D/g, "").slice(0, 11);

  if (!/^01\d{8,9}$/.test(to)) {
    console.warn(
      `[solapi] 주문자 번호가 올바르지 않아 상태 알림톡을 건너뜁니다 order=${input.orderNumber}`,
    );
    return { ok: false, skipped: "invalid_phone" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SOLAPI_SEND_URL, {
      body: JSON.stringify({
        message: {
          from: config.sender,
          to,
          text: buildMessageText(input),
          kakaoOptions: {
            pfId: config.pfId,
            templateId: config.templateId,
            // 대체발송(문자)은 고정 IP가 없으면 어차피 실패한다. 알림톡만 보낸다.
            disableSms: true,
            variables: {
              "#{지점명}": resolveStoreLabel(input.storeName),
              "#{주문번호}": input.orderNumber,
              "#{상태}": STATUS_LABELS[input.status],
            },
          },
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
      const detail = `status_${response.status}: ${responseText.slice(0, 200)}`;

      console.error(
        `[solapi] 상태 알림톡 실패 order=${input.orderNumber} to=${maskPhone(to)} status=${input.status} ${detail}`,
      );

      return { ok: false, detail: `status_${response.status}` };
    }

    console.log(
      `[solapi] 상태 알림톡 발송 order=${input.orderNumber} to=${maskPhone(to)} status=${input.status}`,
    );

    return { ok: true };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";

    console.error(
      `[solapi] 상태 알림톡 ${timedOut ? "시간 초과" : "오류"} order=${input.orderNumber} to=${maskPhone(to)}:`,
      error instanceof Error ? error.message : error,
    );

    return { ok: false, detail: timedOut ? "timeout" : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 상태 변경 응답을 보낸 뒤(after) 알림톡을 비동기로 보낸다.
 * 설정이 없으면 예약하지 않고 debug 로그만 남긴다. 어떤 경우에도 예외를 밖으로 던지지 않는다.
 */
export function queueOrderStatusAlert(input: OrderStatusAlertInput) {
  if (!isNotifiableStatus(input.status)) return;

  if (!readConfig()) {
    // 매 상태 변경마다 로그를 남기지 않도록 debug 레벨로 한 줄만.
    console.debug(
      `[orders] SOLAPI_ALIMTALK_TEMPLATE_ORDER_STATUS·SOLAPI_PFID가 없어 상태 알림톡을 건너뜁니다 order=${input.orderNumber}`,
    );
    return;
  }

  try {
    after(async () => {
      await sendOrderStatusAlert(input);
    });
  } catch {
    // after() 를 쓸 수 없는 실행 환경이면 응답을 막지 않는 선에서 그냥 시도한다.
    void sendOrderStatusAlert(input).catch(() => undefined);
  }
}
