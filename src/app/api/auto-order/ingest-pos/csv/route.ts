import { NextResponse } from "next/server";

import { buildState } from "@/features/auto-order/service";
import { saveSales } from "@/features/auto-order/store";
import { findStoreRecord } from "@/features/stores/registry";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";
import { previewVendorCsv, vendorLabel } from "@/lib/vendors";

/**
 * POST /api/auto-order/ingest-pos/csv — 타사 복합기 공용 CSV 마감 업로드.
 *
 * 두 단계로 쓴다.
 *   1) `{ storeCode, csv }`                    → **미리보기**: 읽은 행·건너뛴 행·경고만 돌려준다(저장 없음)
 *   2) `{ storeCode, csv, commit: true }`      → 저장하고 그 지점의 예측을 다시 계산해 돌려준다
 *
 * 왜 미리보기인가
 *  - 타사 복합기 CSV는 회사마다 열 이름이 다르다. 바로 저장하면 틀린 열이 매출로 들어간다.
 *    점주/본사가 먼저 읽힌 값을 보고 '적용'을 눌러야 저장된다.
 *
 * 인증
 *  - `INGEST_API_SECRET`이 설정돼 있으면 `x-ingest-secret` 헤더가 필요하다(수집기와 같은 규칙).
 *  - 다만 이 앱의 본사 화면에서 올리는 요청(same-origin)은 그 화면 자체가 이미 열려 있으므로 통과시킨다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_CODE = /^[A-Za-z0-9_-]{2,32}$/;

function authorized(request: Request) {
  const expected = process.env.INGEST_API_SECRET;
  if (!expected) return true;

  const header = request.headers.get("x-ingest-secret") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = header || (authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "");

  if (provided.length === expected.length && provided.length > 0) {
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) {
      mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    if (mismatch === 0) return true;
  }

  // 본사 화면에서 올리는 same-origin 요청은 허용(그 화면 자체가 인증 없이 열려 있다).
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site === "same-origin") return true;
  if (origin && origin === new URL(request.url).origin) return true;

  return false;
}

export async function POST(request: Request) {
  const limit = takeRateLimit(request, "ingest-csv", 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, { retryAfter: limit.retryAfter });
  }

  if (!authorized(request)) return jsonError("수집 인증이 필요합니다.", 401);

  const parsed = await readJsonObject(request, 512 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const requestedCode =
    typeof body.storeCode === "string" && STORE_CODE.test(body.storeCode.trim())
      ? body.storeCode.trim().toUpperCase()
      : null;

  if (!requestedCode) return jsonError("storeCode가 필요합니다.", 400);

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (csv.trim().length === 0) return jsonError("CSV 내용이 비어 있습니다.", 400);

  const record = await findStoreRecord(requestedCode);
  const vendor = typeof body.vendor === "string" ? body.vendor : record?.printVendor ?? "generic_webhook";

  const preview = previewVendorCsv({ vendor, storeCode: requestedCode, csv });
  const warnings = [...preview.warnings];

  if (record && record.printVendor === "escalprint" && vendor === "escalprint") {
    warnings.push("이 지점은 에스칼프린트 포털로 자동 수집됩니다. CSV는 타사 복합기 지점에서만 쓰세요.");
  }

  const commit = body.commit === true;
  if (!commit) {
    return NextResponse.json(
      {
        ok: true,
        committed: false,
        storeCode: requestedCode,
        vendor,
        vendorLabel: vendorLabel(vendor),
        preview: {
          headers: preview.headers,
          accepted: preview.accepted,
          skipped: preview.skipped,
          rows: preview.rows.slice(-7),
          totalRows: preview.rows.length,
        },
        warnings: warnings.slice(0, 8),
        message: `${preview.accepted}일치를 읽었습니다. 값이 맞으면 적용을 눌러 주세요.`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (preview.rows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        committed: false,
        storeCode: requestedCode,
        error: "저장할 행이 없습니다. 열 이름과 날짜 형식을 확인해 주세요.",
        warnings: warnings.slice(0, 8),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  await saveSales(preview.rows);

  const built = await buildState({ storeCode: requestedCode, storeLabel: record?.label });

  return NextResponse.json(
    {
      ...built.state,
      ok: true,
      committed: true,
      storeCode: requestedCode,
      vendor,
      vendorLabel: vendorLabel(vendor),
      saved: preview.rows.length,
      warnings: warnings.slice(0, 8),
      message: `${preview.rows.length}일치 CSV 마감을 저장하고 예측을 다시 계산했습니다.`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
