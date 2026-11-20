import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";

/**
 * 본사(대표) 즉시 알림 — 가맹 상담 신청이 접수되면 대표님께 바로 알린다.
 *
 * 보내는 순서(먼저 성공하면 뒤는 건너뛴다)
 *  1) 카카오 알림톡(ATA) — 솔라피 권한 가이드상 `message:send-ata` 는 허용 IP 등록이 필요 없는
 *     유일한 문자 채널이라, 고정 아웃바운드 IP가 없는 Vercel(유동 IP)에서도 발송된다.
 *     `SOLAPI_PFID` + `SOLAPI_ADMIN_INQUIRY_TEMPLATE_ID` + `ADMIN_ALERT_PHONE` 이 모두 있어야 한다.
 *     템플릿이 아직 카카오 검수를 통과하지 않으면 발송이 실패하고, 아래 2)·3)으로 넘어간다.
 *     (검수가 끝나면 같은 환경변수 그대로 자동으로 알림톡이 나간다)
 *  2) 이메일 릴레이 — `ADMIN_ALERT_EMAIL_URL`(+`ADMIN_ALERT_EMAIL_SECRET`)로 {subject, text} 를
 *     POST 한다. 구글 Apps Script 같은 메일 릴레이를 가리키면 알림톡 검수 전에도 즉시 메일이 온다.
 *  3) 문자(SMS/LMS) — `SOLAPI_SMS_ALERTS=on` 일 때만. 전송자격인증제 때문에 발송 키에 고정 공인
 *     IP가 등록된 환경에서만 성공한다(Vercel 유동 IP에서는 403). 실패해도 접수에는 영향이 없다.
 *
 * 어떤 경우에도 예외를 밖으로 던지지 않고, 접수 응답을 보낸 뒤(after)에 실행한다.
 * 로그에는 휴대폰 번호를 가려서 남긴다.
 */

const SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";
const REQUEST_TIMEOUT_MS = 5_000;
const SMS_MAX_BYTES = 90;

export type AdminAlertPayload =
  | {
      kind: "inquiry";
      name: string;
      phone: string;
      region: string;
      /** 접수 경로(예: /franchise-inquiry) */
      source?: string;
    }
  | {
      kind: "order";
      storeName: string | null;
      orderNumber: string;
      /** 원 단위 결제 금액 */
      amount: number;
      requesterName: string;
    };

type Channel = "alimtalk" | "email" | "sms";

type SolapiConfig = {
  apiKey: string;
  apiSecret: string;
  sender: string;
  pfId?: string;
};

const KST = "Asia/Seoul";

function digits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function maskPhone(value: string) {
  const raw = digits(value);
  return raw.length >= 8 ? `${raw.slice(0, 3)}****${raw.slice(-4)}` : "****";
}

function kstStamp(date = new Date()) {
  const day = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "long",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} ${time}`;
}

function readSolapiConfig(): SolapiConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = digits(process.env.SOLAPI_SENDER);

  if (!apiKey || !apiSecret || !sender) return null;

  return { apiKey, apiSecret, sender, pfId: process.env.SOLAPI_PFID?.trim() || undefined };
}

function adminPhone() {
  return digits(process.env.ADMIN_ALERT_PHONE);
}

function templateIdFor(kind: AdminAlertPayload["kind"]) {
  const specific =
    kind === "inquiry"
      ? process.env.SOLAPI_ADMIN_INQUIRY_TEMPLATE_ID?.trim()
      : process.env.SOLAPI_ADMIN_ORDER_TEMPLATE_ID?.trim();

  return specific || process.env.SOLAPI_ADMIN_TEMPLATE_ID?.trim() || undefined;
}

export function subjectFor(payload: AdminAlertPayload) {
  if (payload.kind === "inquiry") {
    return `[🚨 럭키스팟 신규 가맹문의] ${payload.name} · ${payload.phone} · ${payload.region}`;
  }

  const store = payload.storeName ?? "개인 주문";
  return `[🚨 럭키스팟 신규 발주] ${store} · ${payload.orderNumber} · ${payload.amount.toLocaleString("ko-KR")}원`;
}

export function plainTextFor(payload: AdminAlertPayload, now = new Date()) {
  if (payload.kind === "inquiry") {
    return [
      "[🚨 럭키스팟 신규 가맹문의]",
      `성함: ${payload.name}`,
      `연락처: ${payload.phone}`,
      `희망지역: ${payload.region}`,
      `접수: ${kstStamp(now)}${payload.source ? ` (${payload.source})` : ""}`,
    ].join("\n");
  }

  return [
    "[🚨 럭키스팟 신규 발주]",
    `지점: ${payload.storeName ?? "개인 주문"}`,
    `주문번호: ${payload.orderNumber}`,
    `금액: ${payload.amount.toLocaleString("ko-KR")}원`,
    `주문자: ${payload.requesterName}`,
    `접수: ${kstStamp(now)}`,
  ].join("\n");
}

function alimtalkVariables(payload: AdminAlertPayload) {
  if (payload.kind === "inquiry") {
    return {
      "#{이름}": payload.name,
      "#{연락처}": payload.phone,
      "#{지역}": payload.region,
    };
  }

  return {
    "#{지점명}": payload.storeName ?? "개인 주문",
    "#{주문번호}": payload.orderNumber,
    "#{금액}": payload.amount.toLocaleString("ko-KR"),
  };
}

function authorizationHeader(apiKey: string, apiSecret: string) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function byteLength(text: string) {
  let bytes = 0;
  for (const char of text) {
    bytes += char.charCodeAt(0) > 127 ? 2 : 1;
  }
  return bytes;
}

async function postSolapi(body: Record<string, unknown>, config: SolapiConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SOLAPI_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationHeader(config.apiKey, config.apiSecret),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return { ok: true as const };

    const raw = await response.text().catch(() => "");
    return { ok: false as const, detail: `status_${response.status} ${raw.slice(0, 160)}` };
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "unknown";
    return { ok: false as const, detail };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAlimtalk(payload: AdminAlertPayload): Promise<{ ok: boolean; detail?: string }> {
  const config = readSolapiConfig();
  const to = adminPhone();
  const templateId = templateIdFor(payload.kind);

  if (!config || !config.pfId || !to || !templateId) {
    return { ok: false, detail: "alimtalk_not_configured" };
  }

  const result = await postSolapi(
    {
      message: {
        to,
        from: config.sender,
        // 알림톡은 템플릿 본문대로만 발송된다. text를 함께 보내면 1043(내용 불일치)이 난다.
        kakaoOptions: {
          pfId: config.pfId,
          templateId,
          // 템플릿은 '대체발송 안 함'으로 등록되어 있고, 문자는 고정 IP가 없으면 어차피 실패한다.
          disableSms: true,
          variables: alimtalkVariables(payload),
        },
      },
    },
    config,
  );

  return result.ok ? { ok: true } : { ok: false, detail: result.detail };
}

async function sendEmailRelay(payload: AdminAlertPayload): Promise<{ ok: boolean; detail?: string }> {
  const url = process.env.ADMIN_ALERT_EMAIL_URL?.trim();
  if (!url) return { ok: false, detail: "email_not_configured" };

  const secret = process.env.ADMIN_ALERT_EMAIL_SECRET?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Alert-Secret": secret } : {}),
      },
      body: JSON.stringify({
        to: process.env.ADMIN_ALERT_EMAIL_TO?.trim() || "osatr5s@gmail.com",
        subject: subjectFor(payload),
        text: plainTextFor(payload),
        token: secret ?? "",
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return { ok: true };

    const raw = await response.text().catch(() => "");
    return { ok: false, detail: `status_${response.status} ${raw.slice(0, 160)}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSms(payload: AdminAlertPayload): Promise<{ ok: boolean; detail?: string }> {
  if (process.env.SOLAPI_SMS_ALERTS !== "on") return { ok: false, detail: "sms_disabled" };

  const config = readSolapiConfig();
  const to = adminPhone();
  if (!config || !to) return { ok: false, detail: "sms_not_configured" };

  const text = plainTextFor(payload).replace(/\n/g, " ");
  const isShort = byteLength(text) <= SMS_MAX_BYTES;

  const result = await postSolapi(
    {
      message: {
        to,
        from: config.sender,
        text,
        type: isShort ? "SMS" : "LMS",
        ...(isShort ? {} : { subject: subjectFor(payload).slice(0, 40) }),
      },
    },
    config,
  );

  return result.ok ? { ok: true } : { ok: false, detail: result.detail };
}

async function runAlert(payload: AdminAlertPayload) {
  const channels: Channel[] = ["alimtalk", "email", "sms"];
  const failures: string[] = [];

  for (const channel of channels) {
    const result =
      channel === "alimtalk"
        ? await sendAlimtalk(payload)
        : channel === "email"
          ? await sendEmailRelay(payload)
          : await sendSms(payload);

    if (result.ok) {
      console.log(`[admin-alert] ${payload.kind} 알림 발송 완료(${channel})`);
      return;
    }

    failures.push(`${channel}:${result.detail ?? "unknown"}`);
  }

  // 어느 채널로도 못 보냈을 때만 경고 한 줄. 접수 자체는 이미 끝난 상태다.
  console.warn(`[admin-alert] ${payload.kind} 알림 미발송 — ${failures.join(" | ")}`);
}

/** 접수 응답을 보낸 뒤 알림을 시도한다. 설정이 하나도 없어도 로그 한 줄만 남긴다. */
export function queueAdminAlert(payload: AdminAlertPayload) {
  const run = () => runAlert(payload);

  try {
    after(run);
  } catch {
    void run().catch(() => undefined);
  }
}
