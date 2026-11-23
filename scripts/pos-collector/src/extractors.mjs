/**
 * 화면 추출기 (Playwright `page.evaluate` 안에서 실행되는 동기 IIFE 문자열)
 *
 * 원본: two-site-collector/src/extractors.mjs (2026-11-23, 실제 포털 화면에서 검증)
 * 이식하면서 바뀐 점
 *   - 에스칼프린트 홈: 기기 모델·S/N·교체 안내·잔량 경고 문구까지 읽는다(기존에는 모델명만).
 *   - 에스칼프린트 매출: 환불 내역 요약(월별)을 함께 읽는다.
 *   - 로얄선즈 대시보드: 금일/어제/이달 + 지난달(전월) 매출 라벨을 함께 읽고,
 *     월별 표가 있으면 monthRows 로 남긴다.
 *   - 로얄선즈 매출: 라벨이 붙은 매출 값을 화면 어디서든 모아 본다(판매수익 화면 대응).
 *   - 로얄선즈 재료부족: "재료 부족" 목록을 별도 추출기로 뺐다.
 *
 * 규칙
 *   - 읽기 전용. 클릭·입력·전송하지 않는다.
 *   - 사이트에 없는 값을 만들지 않는다. 못 읽으면 null 로 남긴다.
 *   - 비밀번호·토큰·세션 값은 이 화면들에 있지 않으며, 있어도 읽지 않는다.
 */

export const extractors = {
  /* ---------------- 에스칼프린트 (escalprint-portal.com) ---------------- */

  /** 🏠 홈 / 🖨️ 잔량 확인 — 토너·용지·누적 매수·기기 정보 */
  "escalprint.home": String.raw`(() => {
    const text = document.body.innerText.replace(/\u00a0/g, " ");
    const num = (re) => {
      const m = text.match(re);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    };
    const toner = {
      k: num(/\bK\s*(\d{1,3})\s*%/),
      c: num(/\bC\s*(\d{1,3})\s*%/),
      m: num(/\bM\s*(\d{1,3})\s*%/),
      y: num(/\bY\s*(\d{1,3})\s*%/),
    };
    const paper = {
      tray1: num(/Tray\s*1\s*(\d{1,3})\s*%/i),
      tray2: num(/Tray\s*2\s*(\d{1,3})\s*%/i),
    };
    const cumulative = num(/누적\s*(?:출력\s*)?([\d,]+)\s*매/);
    const model = (text.match(/([A-Za-z][A-Za-z0-9-]{2,}\s+[A-Za-z]{1,4}\d{3,5}[A-Za-z0-9-]*)\s*·\s*S\/N/) || [])[1] || null;
    const serial = (text.match(/S\/N\s*([A-Za-z0-9-]{4,})/) || [])[1] || null;
    const deviceName = (text.match(/에스칼_[^\n]*?\[[^\]]*\]/) || [])[0] || null;
    const reorder = (text.match(/재입고 추천[^\n]*\n?([^\n]*남음)/) || [])[1] || null;
    const lowStockWarning = /잔량이\s*얼마\s*남지\s*않은\s*소모품/.test(text);
    const updatedAt = (text.match(/최종\s*업데이트\s*([\d.\-: ]{10,20})/) || [])[1] || null;
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      toner, paper, cumulativePrintCount: cumulative,
      deviceModel: model, deviceSerial: serial, deviceName,
      reorderHint: reorder, lowStockWarning, updatedAt,
    });
  })()`,

  /** 📅 일정 — 학사일정(시험기간 등) */
  "escalprint.calendar": String.raw`(() => {
    const KEY = /(수능|논술|기말|중간|고사|시험|개강|방학|성탄|공휴일)/;
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const body = document.body.innerText.replace(/\u00a0/g, " ");
    const header = body.match(/(\d{4})년\s*(\d{1,2})월/);
    const rows = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("td, .cal-cell, [class*=day], [class*=event], li")) {
      if (!visible(el)) continue;
      const t = el.innerText.replace(/\s+/g, " ").trim();
      if (!t || t.length > 120 || !KEY.test(t)) continue;
      const row = el.closest("tr, .cal-cell, li") || el;
      const rowText = (row.innerText || t).replace(/\s+/g, " " ).trim();
      const title = t.replace(/^[\d.\/]+\s*/, "").trim() || t;
      if (seen.has(title)) continue;
      seen.add(title);
      const day = (rowText.match(/(?:^|\s)(\d{1,2})(?:\s|일)/) || [])[1];
      rows.push({ day: day ? Number(day) : null, title });
    }
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      year: header ? Number(header[1]) : null,
      month: header ? Number(header[2]) : null,
      events: rows,
    });
  })()`,

  /** 💰 청구·정산 → 📈 매출 분석 — 월별 실매출·환불 */
  "escalprint.revenue": String.raw`(() => {
    const body = document.body.innerText.replace(/\u00a0/g, " ");
    const rows = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(cells => cells.length >= 2 && /\d{2}년\s*\d{2}월/.test(cells[0]));
    const history = rows.map(cells => {
      const m = cells[0].match(/(\d{2})년\s*(\d{2})월/);
      const changeMatch = cells[2] ? cells[2].match(/-?[\d.]+/) : null;
      const magnitude = changeMatch ? Math.abs(Number(changeMatch[0])) : null;
      return {
        month: m ? "20" + m[1] + "-" + m[2] : null,
        total: Number((cells[1] || "").replace(/[^\d]/g, "")),
        changePct:
          magnitude === null
            ? null
            : /\u25BC|-/.test(cells[2])
              ? -magnitude
              : magnitude,
      };
    }).filter(row => row.month);
    const head = body.match(/(\d{2})년\s*(\d{2})월\s*매출\s*현황[\s\S]{0,40}?([\d,]+)\s*원/);
    const refunds = [...body.matchAll(/(\d{4})-(\d{2})\s*\((\d+)건[^)]*?환불\s*합계\s*([\d,]+)\s*원\)/g)]
      .map(m => ({ month: m[1] + "-" + m[2], count: Number(m[3]), total: Number(m[4].replace(/,/g, "")) }));
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      current: head ? { month: "20" + head[1] + "-" + head[2], total: Number(head[3].replace(/,/g, "")) } : null,
      history,
      refunds,
    });
  })()`,

  /** 💰 청구·정산 → 💰 환불 내역 — 월별 환불 합계 */
  "escalprint.refunds": String.raw`(() => {
    const body = document.body.innerText.replace(/\u00a0/g, " ");
    const refunds = [...body.matchAll(/(\d{4})-(\d{2})\s*\((\d+)건[^)]*?\uD658\uBD88\s*\uD569\uACC4\s*([\d,]+)\s*\uC6D0\)/g)]
      .map(m => ({ month: m[1] + "-" + m[2], count: Number(m[3]), total: Number(m[4].replace(/,/g, "")) }));
    return JSON.stringify({ capturedAt: new Date().toISOString(), refunds });
  })()`,

  /** 💰 청구·정산 → 📈 매출 분석 → 🧾 발주 지출 분석 */
  "escalprint.spend": String.raw`(() => {
    const text = document.body.innerText;
    const head = text.match(/(\d{2})년\s*(\d{2})월\s*발주\s*지출\s*현황[\s\S]{0,30}?([\d,]+)\s*원/);
    const byCat = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 2 && /원/.test(c[1] || ""));
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      month: head ? "20" + head[1] + "-" + head[2] : null,
      total: head ? Number(head[3].replace(/,/g, "")) : null,
      rows: byCat,
    });
  })()`,

  /** 📦 발주하기 — 카탈로그(가격·최소수량·무료배송 기준) */
  "escalprint.catalog": String.raw`(() => {
    const text = document.body.innerText.replace(/\u00a0/g, " ");
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const free = text.match(/(\d+)\s*만원\s*이상\s*무료배송/);
    const items = [];
    const nodes = [...document.querySelectorAll("[class*=product], [class*=item], li, article")];
    const seen = new Set();
    for (const node of nodes) {
      const t = node.innerText;
      if (!t || t.length > 400) continue;
      if (!visible(node)) continue;
      const lines = t.split("\n").map(s => s.trim()).filter(Boolean);
      const priceLine = lines.findIndex(l => /^[\d,]+\s*원/.test(l));
      if (priceLine <= 0) continue;
      let name = null;
      for (let back = 1; back <= 4 && priceLine - back >= 0; back += 1) {
        const line = lines[priceLine - back];
        if (!line) continue;
        if (/^(최소|최대|수량|단가|추천매가|사진 없음|\d)/.test(line)) continue;
        if (/최소\s*\d|단위로\s*주문|^[\d,]+\s*원/.test(line)) continue;
        if (line.replace(/[^가-힣A-Za-z0-9]/g, "").length < 3) continue;
        name = line;
        break;
      }
      if (!name) continue;
      const price = Number(lines[priceLine].replace(/[^\d]/g, ""));
      const unit = (lines[priceLine].match(/\/\s*([^\s)]+)/) || [])[1] || null;
      const minQty = (t.match(/최소\s*(\d+)/) || [])[1];
      const key = name + "|" + price;
      if (!name || !price || seen.has(key)) continue;
      seen.add(key);
      items.push({ name, price, unit, minQty: minQty ? Number(minQty) : 1 });
    }
    return JSON.stringify({ capturedAt: new Date().toISOString(), freeShippingThreshold: free ? Number(free[1]) * 10000 : null, items });
  })()`,

  /* ---------------- 로얄선즈 (coffee.loyalsuns.com:8090) ---------------- */

  /** Main page — 금일·어제·이달·지난달 매출, 누적, 베스트셀러, 재료부족 */
  "loyalsuns.dashboard": String.raw`(() => {
    const t = document.body.innerText.replace(/\u00a0/g, " ");
    const money = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
    const labeled = (labels) => {
      for (const label of labels) {
        const m = t.match(new RegExp(label + "[\\s\\S]{0,20}?([\\d,]+)\\s*원?"));
        if (m) return Number(m[1].replace(/,/g, ""));
      }
      return null;
    };
    const best = [];
    document.querySelectorAll("tr").forEach(tr => {
      const cells = [...tr.cells].map(td => td.innerText.trim());
      if (cells.length >= 2 && /^[\d,]+$/.test(cells[0] || "") && /[가-힣]/.test(cells[1] || "")) {
        best.push({ name: cells[1], quantity: Number(cells[0].replace(/,/g, "")), amount: cells[2] && /^[\d,]+$/.test(cells[2]) ? Number(cells[2].replace(/,/g, "")) : null });
      }
    });
    const monthRows = [];
    document.querySelectorAll("tr").forEach(tr => {
      const cells = [...tr.cells].map(td => td.innerText.trim());
      const joined = cells.join(" ");
      if (/(\d{4}-\d{2}|\d{2}년\s*\d{1,2}월)/.test(joined) && /[\d,]{3,}/.test(joined)) {
        monthRows.push(cells);
      }
    });
    const shortage = [...document.querySelectorAll("*")].some(el => el.children.length === 0 && /재료\s*부족/.test(el.textContent || ""));
    const online = money(/온라인\s*(?:기계)?\s*([\d,]+)\s*대/) ?? (/(오프라인|연결\s*끊김)/.test(t) ? 0 : null);
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      revenue: {
        today: money(/금일\s*매출[\s\S]{0,20}?([\d,]+)/),
        yesterday: money(/어제\s*매출[\s\S]{0,20}?([\d,]+)/),
        month: money(/이달\s*매출[\s\S]{0,20}?([\d,]+)/),
        lastMonth: labeled(["전월\\s*매출", "지난달\\s*매출", "전월"]),
        cumulativeTotal: money(/누적\s*주문\s*금액[\s\S]{0,20}?([\d,]+)/),
      },
      orders: {
        totalCount: money(/누적\s*주문\s*건수[\s\S]{0,20}?([\d,]+)/),
        refundCount: money(/환불\s*주문[\s\S]{0,20}?([\d,]+)/),
      },
      bestsellers: best,
      monthRows,
      shortage,
      onlineMachines: online,
    });
  })()`,

  /** 판매수익 화면 — 라벨이 붙은 매출 값과 월별 표를 모은다(금일/전일/이달/지난달) */
  "loyalsuns.revenue": String.raw`(() => {
    const t = document.body.innerText.replace(/\u00a0/g, " ");
    const money = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
    const monthRows = [];
    document.querySelectorAll("tr").forEach(tr => {
      const cells = [...tr.cells].map(td => td.innerText.trim());
      if (cells.length >= 2 && /(\d{4}-\d{2}|\d{1,2}월)/.test(cells[0] || "")) {
        monthRows.push({ label: cells[0], amount: Number((cells[1] || "").replace(/[^\d]/g, "")) || null, cells });
      }
    });
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      today: money(/금일\s*매출[\s\S]{0,20}?([\d,]+)/),
      yesterday: money(/어제\s*매출[\s\S]{0,20}?([\d,]+)/),
      month: money(/이달\s*매출[\s\S]{0,20}?([\d,]+)/),
      lastMonth: money(/(?:전월|지난달)\s*매출[\s\S]{0,20}?([\d,]+)/),
      monthRows,
    });
  })()`,

  /**
   * 재고 관리 → [보기] 재고정보 다이얼로그 — 슬롯별 잔량 %
   *
   * 이 화면의 % 값은 캔버스로 그려져 DOM 텍스트에 없을 수 있다.
   * 그때는 수집기가 같은 화면이 부르는 JSON 응답(있으면)에서 값을 채운다
   * (`src/browser/inventory.mjs`). 여기서는 텍스트로 읽히는 값만 돌려준다.
   */
  "loyalsuns.inventory": String.raw`(() => {
    const dialog = [...document.querySelectorAll(".el-dialog, [role=dialog]")].find(d => /분말 상자 재료|범용 상자 재료|재고\s*정보/.test(d.innerText || ""));
    if (!dialog) return JSON.stringify({ error: "재고정보 다이얼로그가 열려 있지 않습니다" });
    const canvasCount = dialog.querySelectorAll("canvas").length;
    const groups = [...dialog.querySelectorAll("p")].map(p => p.innerText.trim()).filter(t => /상자 재료|펌프 재료/.test(t));
    const textItems = [];
    const text = dialog.innerText.replace(/\u00a0/g, " ");
    let group = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/상자 재료|펌프 재료/.test(line)) { group = line; continue; }
      const m = line.match(/^([\d.]+)\s*%$/);
      if (m && group) textItems.push({ group, pct: Number(m[1]) });
    }
    const named = [];
    for (const card of dialog.querySelectorAll("div, li, article")) {
      const t = card.innerText.replace(/\u00a0/g, " ");
      if (!t || t.length > 200) continue;
      const m = t.match(/([\d.]+)\s*%/);
      const name = (t.match(/\(([^)]{1,20})\)/) || [])[1] || null;
      const slot = (t.match(/(분말\s*박스\s*\d+|연동\s*펌프\s*\d+|범용\s*재료\s*상자\s*\d+|범용\s*상자\s*\d+)/) || [])[1] || null;
      if (m && (name || slot)) named.push({ group, slot, material: name, pct: Number(m[1]) });
    }
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      canvasCount,
      needsVision: canvasCount > 0 && textItems.length === 0 && named.length === 0,
      groups,
      textItems,
      named,
      note: canvasCount > 0 ? "재고 %가 캔버스로 렌더링됩니다" : null,
    });
  })()`,

  /** 판매수익 → 판매정보 — 오늘 주문 내역 */
  "loyalsuns.orders": String.raw`(() => {
    const rows = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 5 && /\d{4}-\d{2}-\d{2}/.test(c[1] || c[2] || c[0] || ""));
    const pager = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)\s*페이지|총\s*([\d,]+)\s*건/);
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      rows,
      totalHint: pager ? Number((pager[1] || pager[3] || "0").replace(/,/g, "")) || null : null,
    });
  })()`,

  /** 레시피관리 — 상품 목록(가격·원가) */
  "loyalsuns.products": String.raw`(() => {
    const rows = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 3 && /[가-힣]/.test(c[1] || ""));
    return JSON.stringify({ capturedAt: new Date().toISOString(), rows });
  })()`,

  /** 레시피관리 → 상품 [보기] 다이얼로그 — 음료 1잔 레시피 */
  "loyalsuns.recipeDialog": String.raw`(() => {
    const dialog = [...document.querySelectorAll(".el-dialog, [role=dialog]")].find(d => /상품\s*구성|레시피/.test(d.innerText || ""));
    if (!dialog) return JSON.stringify({ error: "레시피 다이얼로그가 열려 있지 않습니다" });
    const text = dialog.innerText;
    const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
    const rows = [...dialog.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 4 && /[가-힣]/.test(c.join("")));
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      product: (text.match(/상품\s*명칭[^\n]*\n\s*([^\n]+)/) || [])[1] || (dialog.querySelector("h3, .el-dialog__title") || {}).innerText || null,
      coffeeMl: num(/커피\s*추출\s*수량[\s\S]{0,20}?(\d+)/),
      doubleShot: /2배\s*추출[\s\S]{0,20}?(켜기|ON|사용)/.test(text),
      rows,
    });
  })()`,

  /** 기계 로그 정보 → 원료 소모 일지 — 주문별 실측 소모 */
  "loyalsuns.consumption": String.raw`(() => {
    const text = document.body.innerText;
    const total = (text.match(/총\s*소모량\s*[:：]\s*([\d.]+)/) || [])[1];
    const rows = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 6 && /\d{11,}/.test(c[1] || c[0] || ""));
    return JSON.stringify({ capturedAt: new Date().toISOString(), total: total ? Number(total) : null, rows });
  })()`,

  /** 기계 로그 정보 → 보충 로그 (최근 1개월) */
  "loyalsuns.refill": String.raw`(() => {
    const rows = [...document.querySelectorAll("tr")]
      .map(tr => [...tr.cells].map(td => td.innerText.trim()))
      .filter(c => c.length >= 3 && /(\uBCF4\uCDA9|\uC7A5\uC785)/.test(c.join(" ")));
    return JSON.stringify({ capturedAt: new Date().toISOString(), rows });
  })()`,

  /** 기계 로그 정보 → 재료부족 기계 (오늘) */
  "loyalsuns.shortage": String.raw`(() => {
    const t = document.body.innerText.replace(/\u00a0/g, " ");
    const items = [];
    for (const el of document.querySelectorAll("tr, li, .el-card, div")) {
      const s = el.innerText;
      if (!s || s.length > 200) continue;
      if (!/재료\s*부족|부족\s*(?:재료|기계)/.test(s)) continue;
      const serial = (s.match(/\b(\d{15,20})\b/) || [])[1] || null;
      const body = (s.match(/\b(20\d{8})\b/) || [])[1] || null;
      items.push({ serial, bodyCode: body, text: s.replace(/\s+/g, " ").slice(0, 120) });
    }
    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const key = item.serial || item.text;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
      if (unique.length >= 10) break;
    }
    return JSON.stringify({ capturedAt: new Date().toISOString(), shortage: /재료\s*부족/.test(t), items: unique });
  })()`,
};

export default extractors;
