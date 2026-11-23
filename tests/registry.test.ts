import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAdminCode,
  hashAdminCode,
  isValidStoreCode,
  maskBusinessNo,
  maskPhone,
  matchesAdminCode,
  suggestStoreCode,
  validateCreateInput,
} from "../src/features/stores/registry";
import { monthlyForStore, monthOverMonth } from "../src/features/sales-report/monthly";

/**
 * 매장·점주 어드민 레지스트리와 월별 매출 요약 검증.
 * 실행: npm test (tsc → node --test)
 */

test("매장 코드는 STORE_ + 영문·숫자로 만들고 중복을 피한다", () => {
  const first = suggestStoreCode("송도에스파이브시티점");
  assert.match(first, /^STORE_[A-Z0-9]{2,14}$/);
  assert.ok(isValidStoreCode(first));

  const second = suggestStoreCode("송도에스파이브시티점", [first]);
  assert.notEqual(first, second);
  assert.ok(isValidStoreCode(second));

  const latin = suggestStoreCode("Lucky Songdo 5");
  assert.ok(latin.startsWith("STORE_LUCKY"));
});

test("입력 검증 — 매장명·점주명·연락처·코드·사업자번호", () => {
  const ok = validateCreateInput({
    label: "송도에스파이브시티점",
    ownerName: "이지수",
    phone: "010-1234-5678",
    coffeeBusinessNo: "123-45-67890",
  });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.phone, "01012345678");

  const bad = validateCreateInput({
    label: "a",
    ownerName: "",
    phone: "12",
    code: "GNM",
    coffeeBusinessNo: "123",
  });
  const fields = bad.errors.map((error) => error.field);
  assert.ok(fields.includes("label"));
  assert.ok(fields.includes("ownerName"));
  assert.ok(fields.includes("phone"));
  assert.ok(fields.includes("code"));
  assert.ok(fields.includes("coffeeBusinessNo"));

  const duplicated = validateCreateInput(
    { label: "강남구청역점", ownerName: "권오성", phone: "01011112222", code: "STORE_GNM" },
    ["STORE_GNM", "STORE_HYJ"],
  );
  assert.ok(duplicated.errors.some((error) => error.field === "code"));
});

test("마스킹 — 연락처·사업자번호 원문을 화면으로 내보내지 않는다", () => {
  assert.equal(maskPhone("010-9901-7189"), "010-****-7189");
  assert.equal(maskPhone(""), "미등록");
  assert.equal(maskBusinessNo("1234567890"), "123-**-***90");
  assert.equal(maskBusinessNo("12345"), "미등록");
});

test("점주 접근 코드 — 발급 형식과 해시 비교(원문 저장 없음)", () => {
  const code = generateAdminCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{6}$/);

  const hash = hashAdminCode(code);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.ok(matchesAdminCode(hash, code));
  assert.ok(matchesAdminCode(hash, code.toLowerCase()));
  assert.ok(!matchesAdminCode(hash, generateAdminCode()));
  assert.ok(!matchesAdminCode(null, code));
});

test("월별 매출 — 지점별로 따로, 모르는 값은 null(부분 집계)", () => {
  const gangnamOct = monthlyForStore("STORE_GNM", "2026-10");
  assert.ok(gangnamOct);
  assert.equal(gangnamOct.coffee.amount, 1_720_600);
  assert.equal(gangnamOct.coffee.orders, 624);
  assert.equal(gangnamOct.print.amount, 500_200);
  assert.equal(gangnamOct.total, 2_220_800);
  assert.equal(gangnamOct.partial, false);

  const gangnamNov = monthlyForStore("stORE_gnm".toUpperCase(), "2026-11");
  assert.ok(gangnamNov);
  assert.equal(gangnamNov.coffee.amount, 1_059_700);
  assert.equal(gangnamNov.print.amount, null);
  assert.equal(gangnamNov.print.status, "pending");
  assert.equal(gangnamNov.partial, true);
  assert.equal(gangnamNov.total, 1_059_700);

  const hanyeojongOct = monthlyForStore("STORE_HYJ", "2026-10");
  assert.ok(hanyeojongOct);
  assert.equal(hanyeojongOct.coffee.amount, null);
  assert.equal(hanyeojongOct.coffee.status, "missing");
  assert.equal(hanyeojongOct.print.amount, 1_963_240);
  assert.equal(hanyeojongOct.partial, true);

  // 두 지점을 더한 값은 어디에도 없다.
  assert.equal(monthlyForStore("STORE_UNKNOWN", "2026-10"), null);
  assert.equal(monthOverMonth("STORE_GNM"), null);
});
