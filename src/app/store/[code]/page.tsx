import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import InternalHeader from "@/components/internal/InternalHeader";
import StorePinLock from "@/components/store-admin/StorePinLock";
import StoreAdminView, {
  type StoreAdminHistoryEntry,
  type StoreAdminSnapshot,
} from "@/components/store-admin/StoreAdminView";
import { listApprovals } from "@/features/auto-order/store";
import { monthlyForStore } from "@/features/sales-report/monthly";
import { estimateProfit } from "@/features/sales-report/profit";
import { storePulse } from "@/features/sales-report/trend";
import { findStoreByCode } from "@/features/sales-report/stores";
import { DEMO_PIN, readPinCookie, verifyPinToken } from "@/features/stores/pin";
import { findStoreRecord, verifyAdminAccess } from "@/features/stores/registry";

/**
 * /store/[code] — 점주 전용 어드민.
 *
 * 한 지점의 데이터만 보여준다(합산 없음). 첫 화면의 주인공은
 * 원두·토너·용지 3종의 잔여 상태와 원터치 발주 버튼이다.
 *
 * 접근: 매장에 점주 접근 코드가 설정돼 있으면 `?key=코드`가 맞아야 열린다.
 *       코드가 없는 시드 매장(강남구청역·한예종)은 기존 내부 화면과 같이 열람만 개방한다.
 */

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const record = await findStoreRecord(code);

  return {
    title: `${record?.label ?? "점주 어드민"} | 럭키스팟`,
    description: "점주 전용 매출·소모품·자동발주 어드민(내부용).",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

export const dynamic = "force-dynamic";

export default async function StoreAdminPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const record = await findStoreRecord(code);

  if (!record || record.status === "deleted") notFound();

  const query = await searchParams;
  const keyParam = Array.isArray(query.key) ? query.key[0] : query.key;
  const lockParam = Array.isArray(query.lock) ? query.lock[0] : query.lock;

  const keyUnlocked = await verifyAdminAccess(record, keyParam);

  // 4자리 간편 PIN — 서명 쿠키(30일)가 있으면 ?key 없이도 열린다(1초 재접속).
  const cookieHeader = (await cookies()).toString();
  const pinUnlocked = verifyPinToken(record.code, readPinCookie(cookieHeader, record.code));

  // ?lock=1 은 잠금 화면 미리보기(점주에게 보여 줄 때).
  const needsPin = (record.pinEnabled && !keyUnlocked && !pinUnlocked) || lockParam === "1";

  if (needsPin) {
    return (
      <StorePinLock
        code={record.code}
        demoPin={record.hasAdminCode ? null : DEMO_PIN}
        label={record.label}
        shortLabel={record.shortLabel}
        wrongKey={Boolean(keyParam)}
      />
    );
  }

  if (!keyUnlocked && !pinUnlocked) {
    return (
      <main className="min-h-screen bg-[#F4F5F6]">
        <InternalHeader subtitle="점주 어드민" action={{ href: "/admin/stores", label: "본사" }} />
        <div className="mx-auto w-full max-w-[430px] px-5 py-10">
          <div className="rounded-[24px] bg-white px-6 py-7 shadow-[0_1px_2px_rgba(15,20,18,0.04)]">
            <span className="inline-flex rounded-full bg-[#0F1412] px-2.5 py-1 font-mono text-[10px] font-bold text-[#1DFF26]">
              {record.code}
            </span>
            <h1 className="mt-3 text-[24px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412]">
              점주 접근 코드가
              <br />
              필요해요
            </h1>
            <p className="mt-2 text-[12.5px] font-medium leading-[1.6] text-[#8B948D]">
              본사에서 받은 코드를 넣으면 {record.shortLabel} 화면이 열려요.
            </p>

            <form action={`/store/${record.code}`} className="mt-5" method="get">
              <input
                autoComplete="one-time-code"
                className="h-14 w-full rounded-[14px] bg-[#F7F8F9] px-3 text-center font-mono text-[18px] font-bold tracking-[0.12em] text-[#0F1412] uppercase outline-none ring-1 ring-transparent focus:ring-[#0F1412]"
                name="key"
                placeholder="XXXX-XXXXXX"
              />
              <button
                className="mt-2 h-[54px] w-full rounded-[16px] bg-[#1DFF26] text-[16px] font-bold text-[#0F1412]"
                type="submit"
              >
                열기
              </button>
            </form>

            {keyParam ? (
              <p className="mt-3 rounded-[14px] bg-[#FFF2F2] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.5] text-[#B3261E]">
                코드가 맞지 않아요. 본사에 다시 발급을 요청해 주세요.
              </p>
            ) : null}

            {record.hasPin ? (
              <p className="mt-4 text-center text-[11.5px] font-medium text-[#8B948D]">
                이미 PIN을 받았다면{" "}
                <a className="font-bold text-[#0B5C2A] underline" href={`/store/${record.code}?lock=1`}>
                  4자리 PIN으로 열기
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  if (record.status === "paused") {
    return (
      <main className="min-h-screen bg-[#F4F5F6]">
        <InternalHeader subtitle="점주 어드민" action={{ href: "/admin/stores", label: "본사" }} />
        <div className="mx-auto w-full max-w-[430px] px-5 py-10">
          <div className="rounded-[24px] bg-white px-6 py-7 text-center shadow-[0_1px_2px_rgba(15,20,18,0.04)]">
            <span className="inline-flex rounded-full bg-[#FFF6E0] px-2.5 py-1 text-[10.5px] font-bold text-[#8A5A00]">
              일시정지된 매장
            </span>
            <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em] text-[#0F1412]">{record.label}</h1>
            <p className="mt-2 text-[12.5px] font-medium leading-[1.6] text-[#8B948D]">
              본사에서 매장을 잠시 멈췄어요. 다시 열려면 본사에 문의해 주세요.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const snapshotStore = findStoreByCode(record.code);
  const snapshotData = snapshotStore?.snapshot ?? null;

  const snapshot: StoreAdminSnapshot | null = snapshotData
    ? {
        capturedAt: snapshotData.capturedAt,
        beanDaysLeft: snapshotData.bean.daysLeftWithBurst,
        beanPct: snapshotData.bean.stockPct,
        tonerMin: Math.min(
          snapshotData.print.toner.k,
          snapshotData.print.toner.c,
          snapshotData.print.toner.m,
          snapshotData.print.toner.y,
        ),
        paperAvgPct: snapshotData.print.trayAvgPct,
        alerts: buildAlerts(snapshotData, record.thresholds),
      }
    : null;

  const approvals = listApprovals(record.code);
  const history: StoreAdminHistoryEntry[] = [
    ...(snapshotData
      ? [
          {
            at: snapshotData.capturedAt,
            kind: "수집" as const,
            title: "매출·재고 실측 스냅샷",
            detail: `토너·용지·원두 실측 · 매출 ${snapshotData.revenue.coffee.today.toLocaleString("ko-KR")}원(오늘)`,
          },
        ]
      : []),
    ...approvals.map((approval) => ({
      at: approval.approvedAt,
      kind: "발주" as const,
      title:
        approval.status === "canceled"
          ? "발주 취소"
          : approval.status === "confirmed_split"
            ? "사업자별 발주 확정"
            : "발주 승인 · 5분 유예",
      detail: `${approval.proposals.length}개 품목 · ${approval.split.totalAmount.toLocaleString("ko-KR")}원`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <InternalHeader subtitle="점주 어드민" action={{ href: "/sales-report", label: "매출" }} />

      <div className="mx-auto w-full max-w-[760px] px-4 py-5 sm:px-6 sm:py-7">
        <StoreAdminView
          calibrations={record.calibrations}
          fixedCost={record.monthlyFixedCost}
          history={history}
          monthly={{
            current: monthlyForStore(record.code, "2026-11"),
            previous: monthlyForStore(record.code, "2026-10"),
          }}
          profit={{
            current: estimateProfit({ month: monthlyForStore(record.code, "2026-11"), fixedCost: record.monthlyFixedCost }),
            previous: estimateProfit({ month: monthlyForStore(record.code, "2026-10"), fixedCost: record.monthlyFixedCost }),
          }}
          pulse={storePulse({
            code: record.code,
            asOf: snapshotData?.today ?? "2026-11-23",
            dailyRate: snapshotData?.revenue.coffee.dailyRate ?? null,
          })}
          snapshot={snapshot}
          store={{
            code: record.code,
            label: record.label,
            shortLabel: record.shortLabel,
            storeType: record.storeType,
            region: record.region,
            ownerName: record.ownerName,
            phoneMasked: record.phoneMasked,
            thresholds: record.thresholds,
            coffeeEntityName: record.coffeeEntity.name,
            printEntityName: record.printEntity.name,
            hasAdminCode: record.hasAdminCode,
            pinEnabled: record.pinEnabled,
            printVendor: record.printVendor,
          }}
          todayRevenue={snapshotData?.revenue.coffee.today ?? null}
        />
      </div>
    </main>
  );
}

type Snapshot = NonNullable<NonNullable<ReturnType<typeof findStoreByCode>>["snapshot"]>;

function buildAlerts(data: Snapshot, thresholds: { beanDays: number; tonerDays: number; paperDays: number }) {
  const alerts: { title: string; detail: string; tone: "red" | "amber" | "blue" }[] = [];

  const beanDays = data.bean.daysLeftWithBurst;
  if (beanDays !== null && beanDays <= thresholds.beanDays) {
    alerts.push({
      tone: beanDays <= 2 ? "red" : "amber",
      title: `원두 ${beanDays.toFixed(1)}일 남음`,
      detail: `${Math.round(data.bean.stockGrams).toLocaleString("ko-KR")}g · 하루 ${data.bean.dailyGramsWithBurst}g 소모(버스트 반영)`,
    });
  }

  const tonerMin = Math.min(data.print.toner.k, data.print.toner.c, data.print.toner.m, data.print.toner.y);
  if (tonerMin <= 30) {
    alerts.push({
      tone: tonerMin <= 10 ? "red" : "amber",
      title: `토너 ${tonerMin}%`,
      detail: `K ${data.print.toner.k}% · C ${data.print.toner.c}% · M ${data.print.toner.m}% · Y ${data.print.toner.y}%`,
    });
  }

  if (data.print.trayAvgPct <= 40) {
    alerts.push({
      tone: data.print.trayAvgPct <= 15 ? "red" : "amber",
      title: `용지 잔량 ${data.print.trayAvgPct}%`,
      detail: `Tray1 ${data.print.paper.tray1}% · Tray2 ${data.print.paper.tray2}%`,
    });
  }

  return alerts.slice(0, 3);
}
