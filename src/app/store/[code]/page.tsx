import type { Metadata } from "next";
import { notFound } from "next/navigation";

import InternalHeader from "@/components/internal/InternalHeader";
import StoreAdminView, {
  type StoreAdminHistoryEntry,
  type StoreAdminSnapshot,
} from "@/components/store-admin/StoreAdminView";
import { listApprovals } from "@/features/auto-order/store";
import { monthlyForStore } from "@/features/sales-report/monthly";
import { findStoreByCode } from "@/features/sales-report/stores";
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
  const unlocked = await verifyAdminAccess(record, keyParam);

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-[#F4F5F6]">
        <InternalHeader subtitle="점주 어드민" action={{ href: "/admin/stores", label: "본사" }} />
        <div className="mx-auto w-full max-w-[430px] px-4 py-10">
          <div className="rounded-[24px] border border-[#E6E9E7] bg-white p-6">
            <p className="font-mono text-[11px] font-bold text-[#98A29B]">{record.code}</p>
            <h1 className="mt-1 text-[22px] font-bold leading-[1.3] text-[#0F1412]">
              점주 접근 코드가
              <br />
              필요합니다
            </h1>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#6B746D]">
              본사에서 발급한 접근 코드를 넣으면 {record.shortLabel} 화면이 열립니다.
            </p>

            <form action={`/store/${record.code}`} className="mt-5" method="get">
              <input
                autoComplete="one-time-code"
                className="h-12 w-full rounded-[12px] border border-[#E0E4E2] bg-white px-3 text-center font-mono text-[18px] font-bold tracking-[0.12em] text-[#0F1412] uppercase outline-none focus:border-[#0F1412]"
                name="key"
                placeholder="XXXX-XXXXXX"
              />
              <button
                className="mt-2 h-[54px] w-full rounded-[14px] bg-[#0F1412] text-[16px] font-bold text-white"
                type="submit"
              >
                열기
              </button>
            </form>

            {keyParam ? (
              <p className="mt-3 rounded-[12px] bg-[#FFEBEE] px-3 py-2 text-[12px] font-semibold text-[#B3261E]">
                코드가 맞지 않습니다. 본사에 재발급을 요청해 주세요.
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
        <div className="mx-auto w-full max-w-[430px] px-4 py-10">
          <div className="rounded-[24px] border border-[#E6E9E7] bg-white p-6 text-center">
            <p className="text-[13px] font-bold text-[#8A5A00]">일시정지된 매장</p>
            <h1 className="mt-1 text-[20px] font-bold text-[#0F1412]">{record.label}</h1>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#6B746D]">
              본사에서 매장을 일시정지했습니다. 다시 열려면 본사에 문의해 주세요.
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
            title: "에스칼프린트 · 로얄선즈 스냅샷",
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
          history={history}
          monthly={{
            current: monthlyForStore(record.code, "2026-11"),
            previous: monthlyForStore(record.code, "2026-10"),
          }}
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
          }}
        />
      </div>
    </main>
  );
}

type Snapshot = NonNullable<ReturnType<typeof findStoreByCode>>["snapshot"];

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
