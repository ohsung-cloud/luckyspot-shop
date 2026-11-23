/**
 * 브라우저 세션 도우미 — 로그인, 화면 이동, 추출기 실행, JSON 응답 관찰
 *
 * 원칙
 *  - 자격증명은 인자로만 받고, 로그·예외 메시지에 남기지 않는다.
 *  - 로그인 실패는 예외로 올린다(그 포털만 건너뛰고 나머지는 계속).
 *  - 화면 이동은 메뉴 글자로 찾는다. 못 찾으면 그 단계만 실패로 남긴다.
 *  - 같은 화면이 부르는 JSON 응답은 **재고 % 캔버스 판독 대체용**으로만 쓰고,
 *    원문은 저장하지 않는다(파생값만 남긴다).
 */

import { chromium } from "playwright";

import { extractors } from "../extractors.mjs";

export const DEFAULTS = {
  escalprint: { baseUrl: "https://escalprint-portal.com/" },
  loyalsuns: { baseUrl: "http://coffee.loyalsuns.com:8090/" },
  navigationTimeoutMs: 20000,
  actionTimeoutMs: 8000,
};

export async function launchBrowser({ headless = true } = {}) {
  return chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ko-KR"],
  });
}

export async function newStoreContext(browser) {
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  });
  context.setDefaultTimeout(DEFAULTS.actionTimeoutMs);
  context.setDefaultNavigationTimeout(DEFAULTS.navigationTimeoutMs);
  return context;
}

/* ------------------------------------------------------------------ */
/* 로그인                                                              */
/* ------------------------------------------------------------------ */

const LOGIN_ERROR = /(아이디\s*또는\s*비밀번호|비밀번호가\s*(?:틀|일치|맞지)|로그인\s*(?:에\s*)?실패|존재하지\s*않는|사용자\s*정보를\s*확인)/;

async function assertLoggedIn(page, { selector, texts }, portalLabel) {
  try {
    if (selector) {
      await page.waitForSelector(selector, { timeout: 12000, state: "visible" });
    }
    if (texts?.length) {
      await page.waitForFunction(
        (list) => list.some((text) => (document.body.innerText || "").includes(text)),
        texts,
        { timeout: 12000 },
      );
    }
    return;
  } catch {
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
    if (LOGIN_ERROR.test(body)) {
      throw new Error(`${portalLabel} 로그인 실패 — 사이트가 자격증명을 거부했습니다(아이디/비밀번호 확인 필요).`);
    }
    throw new Error(`${portalLabel} 로그인 후 화면을 확인하지 못했습니다.`);
  }
}

export async function loginEscalprint(page, credentials, { baseUrl = DEFAULTS.escalprint.baseUrl } = {}) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const idField = page.locator('input[placeholder*="아이디"], input[name*="id" i]').first();
  const pwField = page.locator('input[type="password"]').first();
  const button = page.locator('button:has-text("로그인"), input[type="submit"]').first();

  await idField.waitFor({ state: "visible", timeout: 15000 });
  await idField.fill("");
  await idField.fill(credentials.id);
  await pwField.fill(credentials.password);
  await button.click();

  await assertLoggedIn(page, { selector: 'button:has-text("로그아웃")', texts: ["잔량 확인", "발주하기"] }, "에스칼프린트");
  await settle(page);
}

export async function loginLoyalsuns(page, credentials, { baseUrl = DEFAULTS.loyalsuns.baseUrl } = {}) {
  const loginUrl = baseUrl.replace(/\/+$/, "") + (baseUrl.includes("#") ? "" : "/#/login");
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const idField = page.locator('input[placeholder*="아이디"], input[placeholder*="사용자"]').first();
  const pwField = page.locator('input[type="password"]').first();
  const button = page.locator('button:has-text("로그인")').first();

  await idField.waitFor({ state: "visible", timeout: 15000 });
  await idField.fill("");
  await idField.fill(credentials.id);
  await pwField.fill(credentials.password);
  await button.click();

  await assertLoggedIn(page, { texts: ["판매수익", "재고 관리", "기계 로그 정보", "레시피관리"] }, "로얄선즈");
  await settle(page);
}

/* ------------------------------------------------------------------ */
/* 화면 이동·추출                                                      */
/* ------------------------------------------------------------------ */

export async function settle(page, ms = 800) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 6000 });
  } catch {
    // SPA 는 계속 폴링할 수 있다 — 네트워크가 조용해지지 않아도 진행한다.
  }
  await page.waitForTimeout(ms);
}

/** 화면에 특정 문구가 나타날 때까지 기다린다(못 나타나도 예외를 올리지 않는다). */
export async function waitForAnyText(page, texts, timeout = 15000) {
  try {
    await page.waitForFunction(
      (list) => list.some((text) => (document.body.innerText || "").includes(text)),
      texts,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

const NO_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

/**
 * 메뉴·탭을 글자로 찾아 누른다. 후보 라벨을 앞에서부터 시도한다.
 * @returns {Promise<string|null>} 실제로 누른 라벨(못 찾으면 null)
 */
export async function clickByText(page, labels, { timeout = 5000 } = {}) {
  for (const label of labels) {
    const target = label.replace(NO_EMOJI, "").trim();
    if (!target) continue;

    const locators = [
      page.locator(`button:has-text("${target}")`),
      page.locator(`[role="menuitem"]:has-text("${target}")`),
      page.locator(`a:has-text("${target}")`),
      page.locator(`li:has-text("${target}")`),
      page.getByText(target, { exact: false }),
    ];

    for (const locator of locators) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 4); i += 1) {
        const item = locator.nth(i);
        try {
          if (!(await item.isVisible())) continue;
          const text = ((await item.innerText().catch(() => "")) || "").replace(NO_EMOJI, "").trim();
          if (!text || text.length > 60) continue;
          if (!text.includes(target)) continue;
          await item.click({ timeout });
          await settle(page);
          return label;
        } catch {
          // 다음 후보로
        }
      }
    }
  }
  return null;
}

/** 표의 첫 행 안에 있는 버튼을 누른다(예: 재고 [보기]). */
export async function clickFirstRowButton(page, labels, { timeout = 5000 } = {}) {
  for (const label of labels) {
    const buttons = page.locator(`tr button:has-text("${label}"), tr a:has-text("${label}")`);
    const count = await buttons.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 3); i += 1) {
      try {
        const item = buttons.nth(i);
        if (!(await item.isVisible())) continue;
        await item.click({ timeout });
        await settle(page);
        return true;
      } catch {
        // 다음
      }
    }
  }
  // 표가 아닌 카드형 화면 대비
  const fallback = page.locator(`button:has-text("${labels[0]}")`).first();
  try {
    if (await fallback.isVisible()) {
      await fallback.click({ timeout });
      await settle(page);
      return true;
    }
  } catch {
    // 없음
  }
  return false;
}

/** 추출기 하나를 현재 화면에서 실행한다. */
export async function runExtractor(page, name) {
  const source = extractors[name];
  if (!source) throw new Error(`알 수 없는 추출기: ${name}`);
  const raw = await page.evaluate(source);
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (parsed && parsed.error) throw new Error(`${name}: ${parsed.error}`);
  return parsed;
}

export async function closeDialog(page) {
  try {
    const closeButton = page.locator('.el-dialog__headerbtn, [aria-label="Close"]').first();
    if (await closeButton.isVisible({ timeout: 1500 })) {
      await closeButton.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(300);
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
  }
}

export async function pageLocation(page) {
  return page.evaluate(() => ({ url: location.origin + location.pathname, hash: location.hash, title: document.title })).catch(() => null);
}

/* ------------------------------------------------------------------ */
/* JSON 응답 관찰(재고 % 캔버스 대체)                                   */
/* ------------------------------------------------------------------ */

const SENSITIVE_KEY = /(token|password|passwd|secret|auth|session|cookie|jwt|email|phone|주민)/i;

/** 응답 본문을 메모리에만 담는다(디스크 저장 없음). */
export function attachJsonCapture(page, patterns, { limit = 40, maxBody = 300000 } = {}) {
  const captures = [];

  page.on("response", async (response) => {
    try {
      if (captures.length >= limit) return;
      const url = response.url();
      if (!patterns.some((pattern) => pattern.test(url))) return;
      const contentType = response.headers()["content-type"] ?? "";
      if (!/json/i.test(contentType)) return;
      const text = await response.text();
      if (!text || text.length > maxBody) return;
      const json = JSON.parse(text);
      captures.push({ url: redactUrl(url), json });
    } catch {
      // 관찰 실패는 무시 — 수집 자체를 막지 않는다.
    }
  });

  return captures;
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.origin + parsed.pathname;
  } catch {
    return "unknown";
  }
}

function collectObjects(node, out, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 200)) collectObjects(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  const entries = Object.entries(node).filter(([key]) => !SENSITIVE_KEY.test(key));
  const percent = {};
  const labels = {};

  for (const [key, value] of entries) {
    if (typeof value === "number" && /(pct|percent|rate|ratio|remain|level|stock|amount)/i.test(key) && value >= 0 && value <= 5000) {
      percent[key] = value;
    }
    if (typeof value === "string" && /(name|material|reagent|slot|title|label|group)/i.test(key) && value.length <= 40) {
      labels[key] = value;
    }
  }

  if (Object.keys(percent).length > 0 && Object.values(labels).some((v) => /[가-힣]/.test(v))) {
    out.push({ percent, labels });
  }

  for (const [, value] of entries) {
    if (value && typeof value === "object") collectObjects(value, out, depth + 1);
  }
}

/**
 * 재고 화면이 부른 JSON 에서 슬롯별 잔량 % 를 뽑는다.
 * 이름(한글)과 퍼센트류 숫자가 함께 있는 객체만 인정하고, 3개 미만이면 버린다.
 */
export function inventoryFromCaptures(captures) {
  const found = [];

  for (const capture of captures) {
    const objects = [];
    collectObjects(capture.json, objects);
    for (const { percent, labels } of objects) {
      const pct = pickPercent(percent);
      if (pct === null) continue;
      const material = labels.material ?? labels.reagent ?? labels.name ?? labels.title ?? null;
      const slot = labels.slot ?? labels.label ?? null;
      const group = labels.group ?? null;
      if (!material && !slot) continue;
      found.push({ group, slot, material, pct });
    }
  }

  const dedup = new Map();
  for (const item of found) {
    const key = `${item.slot ?? ""}|${item.material ?? ""}|${item.pct}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }
  const items = [...dedup.values()];
  return items.length >= 3 ? items.slice(0, 60) : [];
}

function pickPercent(percent) {
  const preferred = ["pct", "percent", "rate", "ratio", "remainRate", "stockRate", "level"];
  for (const key of preferred) {
    const key2 = Object.keys(percent).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (key2) return percent[key2];
  }
  const first = Object.values(percent)[0];
  return typeof first === "number" ? first : null;
}
