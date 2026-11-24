"use client";

import { useCallback, useMemo, useState } from "react";

import HqTabs from "@/components/internal/HqTabs";
import StoreSettingsEditor from "@/components/admin/StoreSettingsEditor";
import {
  COFFEE_CONTRIBUTION_PCT,
  PRINT_CONTRIBUTION_PCT,
  previewByFixedCost,
} from "@/features/sales-report/profit";
import type {
  PrintVendorType,
  StoreAdminListItem,
  StoreThresholds,
  StoreType,
} from "@/features/stores/registry-types";
import { PRINT_VENDORS, PRINT_VENDOR_LABELS } from "@/features/stores/registry-types";

/**
 * 본사 매장·점주 어드민 생성 콘솔.
 *
 * 모바일 퍼스트: 한 손 엄지로 목록을 훑고, 아래 고정 버튼 하나로 새 매장을 만든다.
 * 심플: 목록 카드에는 '이름·상태·바로가기'만. 사업자·포털·기준일은 접이식 고급 설정.
 * 비밀: 포털 비밀번호 입력칸은 없다. GitHub Secrets 키 이름만 안내한다.
 */

type CreateResponse = {
  ok: boolean;
  store?: StoreAdminListItem;
  adminCode?: string;
  adminUrl?: string;
  pin?: string;
  secrets?: StoreAdminListItem["secrets"];
  message?: string;
  error?: string;
  errors?: { field: string; message: string }[];
};

const STORE_TYPE_OPTIONS: StoreType[] = ["6평", "10평", "15평+", "1평 샵인샵"];

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "활성", className: "bg-[#EDFBEF] text-[#0B5C2A]" },
  paused: { label: "일시정지", className: "bg-[#FFF6E0] text-[#8A5A00]" },
  deleted: { label: "삭제", className: "bg-[#F1F2F2] text-[#6B746D]" },
};

type FormState = {
  label: string;
  ownerName: string;
  phone: string;
  storeType: StoreType;
  code: string;
  region: string;
  printVendor: PrintVendorType;
  rent: string;
  maintenance: string;
  internet: string;
  solution: string;
  pin: string;
  coffeeEntityName: string;
  coffeeBusinessNo: string;
  printEntityName: string;
  printBusinessNo: string;
  loyalsunsStoreId: string;
  escalprintBranch: string;
  beanDays: string;
  tonerDays: string;
  paperDays: string;
};

const EMPTY_FORM: FormState = {
  label: "",
  ownerName: "",
  phone: "",
  storeType: "6평",
  code: "",
  region: "",
  printVendor: "escalprint",
  rent: "800000",
  maintenance: "150000",
  internet: "33000",
  solution: "55000",
  pin: "",
  coffeeEntityName: "",
  coffeeBusinessNo: "",
  printEntityName: "",
  printBusinessNo: "",
  loyalsunsStoreId: "",
  escalprintBranch: "",
  beanDays: "4",
  tonerDays: "5",
  paperDays: "4",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-[#3B4740]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-[1.5] text-[#98A29B]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "mt-1 h-12 w-full rounded-[12px] border border-[#E0E4E2] bg-white px-3 text-[15px] font-medium text-[#0F1412] outline-none focus:border-[#0F1412]";

export default function StoreAdminConsole({ initialStores }: { initialStores: StoreAdminListItem[] }) {
  const [stores, setStores] = useState<StoreAdminListItem[]>(initialStores);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [advanced, setAdvanced] = useState(false);
  const [fixedDetail, setFixedDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    code: string;
    adminUrl: string;
    adminCode: string;
    label: string;
    pin?: string;
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeCount = useMemo(() => stores.filter((store) => store.status === "active").length, [stores]);

  // 월세(＋세부 고정비)만으로도 손익분기·예상 순수익을 바로 보여 준다.
  const preview = previewByFixedCost({
    rent: Number(form.rent.replace(/\D/g, "")) || 0,
    maintenance: Number(form.maintenance.replace(/\D/g, "")) || 0,
    internet: Number(form.internet.replace(/\D/g, "")) || 0,
    solution: Number(form.solution.replace(/\D/g, "")) || 0,
  });
  const detailFixed = [
    Number(form.maintenance.replace(/\D/g, "")) || 0,
    Number(form.internet.replace(/\D/g, "")) || 0,
    Number(form.solution.replace(/\D/g, "")) || 0,
  ].reduce((sum, value) => sum + value, 0);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} 복사했어요`);
    } catch {
      setToast("복사가 막혀 있어요. 길게 눌러 복사해 주세요.");
    }
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const reload = useCallback(async () => {
    const response = await fetch("/api/admin/stores", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { stores?: StoreAdminListItem[] } | null;
    if (Array.isArray(payload?.stores)) setStores(payload.stores);
  }, []);

  const submit = async () => {
    setBusy(true);
    setErrors([]);

    try {
      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label,
          ownerName: form.ownerName,
          phone: form.phone,
          storeType: form.storeType,
          code: form.code || undefined,
          region: form.region,
          coffeeEntityName: form.coffeeEntityName,
          coffeeBusinessNo: form.coffeeBusinessNo,
          printEntityName: form.printEntityName,
          printBusinessNo: form.printBusinessNo,
          loyalsunsStoreId: form.loyalsunsStoreId,
          escalprintBranch: form.escalprintBranch,
          printVendor: form.printVendor,
          monthlyFixedCost: {
            rent: Number(form.rent.replace(/\D/g, "")) || 0,
            maintenance: Number(form.maintenance.replace(/\D/g, "")) || 0,
            internet: Number(form.internet.replace(/\D/g, "")) || 0,
            solution: Number(form.solution.replace(/\D/g, "")) || 0,
          },
          pin: form.pin.replace(/\D/g, "").slice(0, 4) || undefined,
          thresholds: {
            beanDays: Number(form.beanDays) || 4,
            tonerDays: Number(form.tonerDays) || 5,
            paperDays: Number(form.paperDays) || 4,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as CreateResponse | null;

      if (!response.ok || !payload?.ok || !payload.store || !payload.adminCode) {
        setErrors(payload?.errors ?? [{ field: "form", message: payload?.error ?? "매장을 만들지 못했습니다." }]);
        return;
      }

      setIssued({
        code: payload.store.code,
        adminUrl: payload.adminUrl ?? payload.store.adminPath,
        adminCode: payload.adminCode,
        label: payload.store.label,
        pin: payload.pin,
      });
      setForm(EMPTY_FORM);
      setOpen(false);
      await reload();
    } catch {
      setErrors([{ field: "form", message: "네트워크 오류로 만들지 못했습니다. 다시 시도해 주세요." }]);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (code: string, action: "active" | "paused" | "deleted") => {
    setBusy(true);

    try {
      const response = await fetch(
        action === "deleted"
          ? `/api/admin/stores/${encodeURIComponent(code)}`
          : `/api/admin/stores/${encodeURIComponent(code)}`,
        {
          method: action === "deleted" ? "DELETE" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: action === "deleted" ? undefined : JSON.stringify({ status: action }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      setToast(payload?.message ?? payload?.error ?? "처리했습니다.");
      await reload();
    } catch {
      setToast("처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 2800);
    }
  };

  const regenerate = async (code: string) => {
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/stores/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-code" }),
      });
      const payload = (await response.json().catch(() => null)) as CreateResponse | null;

      if (!response.ok || !payload?.ok || !payload.adminCode) {
        setToast(payload?.error ?? "코드를 다시 발급하지 못했어요.");
        return;
      }

      const store = stores.find((item) => item.code === code);
      setIssued({
        code,
        adminCode: payload.adminCode,
        adminUrl: payload.adminUrl ?? `/store/${code}?key=${payload.adminCode}`,
        label: store?.label ?? code,
      });
      await reload();
    } catch {
      setToast("코드를 다시 발급하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const saveThresholds = async (code: string, thresholds: StoreThresholds) => {
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/stores/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setToast(payload?.message ?? "저장했습니다.");
      await reload();
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 2400);
    }
  };

  return (
    <div className="grid gap-3.5 pb-28">
      <header className="px-1">
        <p className="text-[12.5px] font-semibold text-[#007A36]">본사 · 매장 관리</p>
        <h1 className="mt-1 text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#0F1412]">
          매장이 생기면
          <br />
          점주 어드민도 함께
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#6B746D]">
          매장 {stores.length}곳 · 활성 {activeCount}곳. 만든 즉시 점주 전용 화면과 접근 코드가 발급됩니다.
        </p>
      </header>

      <HqTabs active="/admin/stores" />

      {issued ? (
        <section className="rounded-[20px] border-2 border-[#0F1412] bg-white p-4">
          <p className="text-[11.5px] font-bold text-[#007A36]">발급 완료 · 지금 한 번만 보입니다</p>
          <h2 className="mt-1 text-[18px] font-bold text-[#0F1412]">{issued.label}</h2>

          <dl className="mt-3 space-y-2">
            <div className="rounded-[12px] bg-[#F4F5F6] px-3 py-2.5">
              <dt className="text-[11px] text-[#6B746D]">매장 코드</dt>
              <dd className="mt-0.5 font-mono text-[15px] font-bold text-[#0F1412]">{issued.code}</dd>
            </div>
            <div className="rounded-[12px] bg-[#FFF9EA] px-3 py-2.5">
              <dt className="text-[11px] text-[#8A5A00]">점주 접근 코드</dt>
              <dd className="mt-0.5 font-mono text-[18px] font-bold tracking-[0.08em] text-[#0F1412]">{issued.adminCode}</dd>
            </div>
            {issued.pin ? (
              <div className="rounded-[12px] bg-[#EDFBEF] px-3 py-2.5">
                <dt className="text-[11px] text-[#0B5C2A]">4자리 간편 PIN(PWA 재접속)</dt>
                <dd className="mt-0.5 font-mono text-[20px] font-bold tracking-[0.3em] text-[#0F1412]">{issued.pin}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="h-11 rounded-[12px] bg-[#0F1412] text-[13px] font-bold text-white"
              onClick={() => void copy(issued.adminCode, "접근 코드를")}
              type="button"
            >
              코드 복사
            </button>
            <button
              className="h-11 rounded-[12px] border border-[#D7DBD9] bg-white text-[13px] font-bold text-[#3B4740]"
              onClick={() => void copy(`${window.location.origin}${issued.adminUrl}`, "점주 링크를")}
              type="button"
            >
              링크 복사
            </button>
          </div>

          <a
            className="mt-2 flex h-12 items-center justify-center rounded-[12px] bg-[#1DFF26] text-[14px] font-bold text-[#0F1412]"
            href={issued.adminUrl}
          >
            점주 어드민 열기
          </a>
          <button
            className="mt-2 h-10 w-full rounded-[10px] text-[12px] font-semibold text-[#6B746D]"
            onClick={() => setIssued(null)}
            type="button"
          >
            닫기
          </button>
        </section>
      ) : null}

      <ul className="grid gap-2.5">
        {stores.map((store) => {
          const status = STATUS_META[store.status] ?? STATUS_META.active;
          const isOpen = expanded === store.code;

          return (
            <li key={store.code} className="rounded-[20px] border border-[#E6E9E7] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10.5px] font-semibold tracking-[0.04em] text-[#98A29B]">{store.code}</p>
                  <h2 className="mt-0.5 truncate text-[17px] font-bold text-[#0F1412]">{store.label}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <p className="mt-1.5 text-[12px] text-[#6B746D]">
                {store.storeType} · {store.region || "지역 미입력"} · 점주 {store.ownerName || "미등록"}
                {store.phoneMasked !== "미등록" ? ` · ${store.phoneMasked}` : ""}
              </p>
              <p className="text-[11px] text-[#98A29B]">
                {PRINT_VENDOR_LABELS[store.printVendor]} · 고정비{" "}
                {(store.monthlyFixedCost.rent + store.monthlyFixedCost.maintenance + store.monthlyFixedCost.internet + store.monthlyFixedCost.solution).toLocaleString("ko-KR")}원/월 · PIN{" "}
                {store.hasPin ? "설정됨" : "없음"}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  className={`flex h-11 items-center justify-center rounded-[12px] text-[13px] font-bold ${
                    store.status === "active"
                      ? "bg-[#0F1412] text-white"
                      : "bg-[#F1F2F2] text-[#98A29B]"
                  }`}
                  href={store.adminPath}
                >
                  {store.status === "active" ? "점주 어드민" : "일시정지됨"}
                </a>
                <button
                  className="h-11 rounded-[12px] border border-[#D7DBD9] bg-white text-[13px] font-bold text-[#3B4740] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void regenerate(store.code)}
                  type="button"
                >
                  접근 코드 재발급
                </button>
              </div>

              <details
                className="mt-2 rounded-[12px] bg-[#F8F9F9] px-3 py-2"
                onToggle={(event) => setExpanded(event.currentTarget.open ? store.code : null)}
                open={isOpen}
              >
                <summary className="cursor-pointer text-[12px] font-semibold text-[#3B4740]">설정 · 코드 · 연동</summary>

                <dl className="mt-2 space-y-1.5 text-[12px] text-[#3B4740]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">커피 사업자</dt>
                    <dd className="text-right">{store.coffeeEntity.name || "미등록"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">프린트 사업자</dt>
                    <dd className="text-right">{store.printEntity.name || "미등록"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">커피 포털 매장 ID</dt>
                    <dd className="text-right font-mono">{store.portals.loyalsunsStoreId || "미입력"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">프린트 포털 지점명</dt>
                    <dd className="text-right font-mono">{store.portals.escalprintBranch || "미입력"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">점주 접근 코드</dt>
                    <dd className="text-right">{store.hasAdminCode ? "설정됨(원문 미보관)" : "없음 — 열람 개방"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6B746D]">프린트 벤더</dt>
                    <dd className="text-right">{PRINT_VENDOR_LABELS[store.printVendor]}</dd>
                  </div>
                </dl>

                <ThresholdEditor
                  busy={busy}
                  initial={store.thresholds}
                  onSave={(next) => void saveThresholds(store.code, next)}
                />

                <StoreSettingsEditor
                  busy={busy}
                  onBusy={setBusy}
                  onNotice={(message) => {
                    setToast(message);
                    window.setTimeout(() => setToast(null), 2600);
                  }}
                  onReload={reload}
                  store={store}
                />

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className="h-10 rounded-[10px] border border-[#E6E9E7] bg-white text-[12px] font-semibold text-[#3B4740] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void changeStatus(store.code, store.status === "active" ? "paused" : "active")}
                    type="button"
                  >
                    {store.status === "active" ? "일시정지" : "다시 활성화"}
                  </button>
                  <button
                    className="h-10 rounded-[10px] border border-[#F3D2D2] bg-white text-[12px] font-semibold text-[#B3261E] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void changeStatus(store.code, "deleted")}
                    type="button"
                  >
                    목록에서 삭제
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto w-full max-w-[760px] px-4 py-3">
          <button
            className="h-[58px] w-full rounded-[16px] bg-[#1DFF26] text-[17px] font-bold text-[#0F1412]"
            onClick={() => {
              setIssued(null);
              setErrors([]);
              setOpen(true);
            }}
            type="button"
          >
            + 새 매장 만들기
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <div className="max-h-[94vh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] bg-[#F4F5F6] p-4 sm:rounded-[24px] sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[19px] font-bold text-[#0F1412]">새 매장 등록</h2>
              <button
                className="grid size-10 place-items-center rounded-full bg-white text-[16px] font-bold text-[#6B746D]"
                onClick={() => setOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-[1.6] text-[#6B746D]">
              필수 3개만 넣으면 됩니다. 사업자·포털·기준일은 아래 고급 설정에서.
            </p>

            <div className="mt-3 grid gap-2.5">
              <Field label="매장명">
                <input
                  className={inputClass}
                  onChange={(event) => update("label", event.target.value)}
                  placeholder="예: 송도에스파이브시티점"
                  value={form.label}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="점주명">
                  <input
                    className={inputClass}
                    onChange={(event) => update("ownerName", event.target.value)}
                    placeholder="예: 이지수"
                    value={form.ownerName}
                  />
                </Field>
                <Field label="연락처">
                  <input
                    className={inputClass}
                    inputMode="tel"
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="010-0000-0000"
                    value={form.phone}
                  />
                </Field>
              </div>

              <div>
                <span className="text-[12.5px] font-semibold text-[#3B4740]">매장 형태</span>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {STORE_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      className={`h-11 rounded-[11px] border text-[12px] font-bold ${
                        form.storeType === option
                          ? "border-[#0F1412] bg-[#0F1412] text-white"
                          : "border-[#E0E4E2] bg-white text-[#3B4740]"
                      }`}
                      onClick={() => update("storeType", option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* 월세만 입력하면 끝 — 나머지 고정비는 기본값으로 채워 둔다. */}
              <Field label="월세(임대료)" hint="월세만 넣으면 손익분기와 예상 순수익이 바로 계산됩니다.">
                <input
                  className={`${inputClass} text-[17px] font-bold tabular-nums`}
                  inputMode="numeric"
                  onChange={(event) => update("rent", event.target.value)}
                  placeholder="예: 800000"
                  value={form.rent}
                />
              </Field>

              <div className="rounded-[14px] border border-[#E6E9E7] bg-white px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11.5px] font-bold text-[#3B4740]">예상 순수익 미리보기</p>
                  <span className="text-[9.5px] text-[#98A29B]">
                    월 고정비 {preview.fixedTotal.toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
                    <p className="text-[9.5px] text-[#6B746D]">손익분기 월 매출</p>
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#0F1412]">
                      {preview.bepRevenue.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                  <div className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
                    <p className="text-[9.5px] text-[#6B746D]">월 매출 300만이면</p>
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums text-[#0F1412]">
                      {preview.referenceNet.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[9px] leading-[1.5] text-[#98A29B]">
                  커피 7 : 프린트 3 · 커피 공헌이익 {COFFEE_CONTRIBUTION_PCT}% · 프린트 {PRINT_CONTRIBUTION_PCT}% 기준 참고값이에요. 실제 매출은 수집 후 바뀌어요.
                </p>
              </div>

              <button
                className="flex h-11 items-center justify-between rounded-[12px] bg-white px-3 text-[13px] font-semibold text-[#3B4740]"
                onClick={() => setFixedDetail((prev) => !prev)}
                type="button"
              >
                세부 고정비 조정 · 관리비 · 인터넷 · 솔루션
                <span className="text-[11px] text-[#98A29B]">
                  {fixedDetail ? "접기" : `기본 ${detailFixed.toLocaleString("ko-KR")}원 채움`}
                </span>
              </button>

              {fixedDetail ? (
                <div className="grid gap-2.5 rounded-[16px] bg-white p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="관리비">
                      <input
                        className={`${inputClass} text-center`}
                        inputMode="numeric"
                        onChange={(event) => update("maintenance", event.target.value)}
                        value={form.maintenance}
                      />
                    </Field>
                    <Field label="인터넷">
                      <input
                        className={`${inputClass} text-center`}
                        inputMode="numeric"
                        onChange={(event) => update("internet", event.target.value)}
                        value={form.internet}
                      />
                    </Field>
                    <Field label="솔루션">
                      <input
                        className={`${inputClass} text-center`}
                        inputMode="numeric"
                        onChange={(event) => update("solution", event.target.value)}
                        value={form.solution}
                      />
                    </Field>
                  </div>
                  <p className="text-[9px] leading-[1.5] text-[#98A29B]">
                    비우지 않아도 됩니다. 기본값으로 두면 월세만으로 계산되고, 실제 고지서를 받으면 본사 설정에서 언제든 고칠 수 있습니다.
                  </p>
                </div>
              ) : null}

              <button
                className="flex h-11 items-center justify-between rounded-[12px] bg-white px-3 text-[13px] font-semibold text-[#3B4740]"
                onClick={() => setAdvanced((prev) => !prev)}
                type="button"
              >
                고급 설정 · 사업자 · 포털 · 기준일
                <span className="text-[11px] text-[#98A29B]">{advanced ? "접기" : "열기"}</span>
              </button>

              {advanced ? (
                <div className="grid gap-2.5 rounded-[16px] bg-white p-3">
                  <Field label="매장 코드" hint="비우면 자동 생성 (STORE_ 영문·숫자)">
                    <input
                      className={`${inputClass} font-mono uppercase`}
                      onChange={(event) => update("code", event.target.value.toUpperCase())}
                      placeholder="자동"
                      value={form.code}
                    />
                  </Field>

                  <Field label="지역">
                    <input
                      className={inputClass}
                      onChange={(event) => update("region", event.target.value)}
                      placeholder="예: 인천 송도"
                      value={form.region}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="커피 사업자명">
                      <input
                        className={inputClass}
                        onChange={(event) => update("coffeeEntityName", event.target.value)}
                        value={form.coffeeEntityName}
                      />
                    </Field>
                    <Field label="사업자번호">
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        onChange={(event) => update("coffeeBusinessNo", event.target.value)}
                        placeholder="10자리"
                        value={form.coffeeBusinessNo}
                      />
                    </Field>
                    <Field label="프린트 사업자명">
                      <input
                        className={inputClass}
                        onChange={(event) => update("printEntityName", event.target.value)}
                        value={form.printEntityName}
                      />
                    </Field>
                    <Field label="사업자번호">
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        onChange={(event) => update("printBusinessNo", event.target.value)}
                        placeholder="10자리"
                        value={form.printBusinessNo}
                      />
                    </Field>
                  </div>

                  <Field label="커피 포털 매장 ID" hint="아이디만. 비밀번호는 GitHub Secrets에만.">
                    <input
                      className={inputClass}
                      onChange={(event) => update("loyalsunsStoreId", event.target.value)}
                      placeholder="예: loyal_suns84"
                      value={form.loyalsunsStoreId}
                    />
                  </Field>

                  <Field label="프린트 복합기 벤더" hint="수집기가 어느 포털을 읽을지 정합니다.">
                    <div className="mt-1 grid grid-cols-3 gap-1.5">
                      {PRINT_VENDORS.map((option) => (
                        <button
                          key={option}
                          className={`h-10 rounded-[10px] border text-[11px] font-bold ${
                            form.printVendor === option
                              ? "border-[#0F1412] bg-[#0F1412] text-white"
                              : "border-[#E0E4E2] bg-white text-[#3B4740]"
                          }`}
                          onClick={() => update("printVendor", option)}
                          type="button"
                        >
                          {PRINT_VENDOR_LABELS[option]}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="프린트 포털 지점명" hint="벤더 포털의 지점 ID. 비밀번호는 GitHub Secrets에만.">
                    <input
                      className={inputClass}
                      onChange={(event) => update("escalprintBranch", event.target.value)}
                      placeholder="예: ESCAL_1011"
                      value={form.escalprintBranch}
                    />
                  </Field>

                  <Field label="4자리 PIN (선택)" hint="비우면 자동 발급. 발급값은 저장 후 한 번만 보입니다.">
                    <input
                      className={`${inputClass} text-center font-mono tracking-[0.3em]`}
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => update("pin", event.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="0000"
                      value={form.pin}
                    />
                  </Field>

                  <div>
                    <span className="text-[12.5px] font-semibold text-[#3B4740]">알림 기준일</span>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <Field label="원두">
                        <input
                          className={`${inputClass} text-center`}
                          inputMode="numeric"
                          onChange={(event) => update("beanDays", event.target.value)}
                          value={form.beanDays}
                        />
                      </Field>
                      <Field label="토너">
                        <input
                          className={`${inputClass} text-center`}
                          inputMode="numeric"
                          onChange={(event) => update("tonerDays", event.target.value)}
                          value={form.tonerDays}
                        />
                      </Field>
                      <Field label="용지">
                        <input
                          className={`${inputClass} text-center`}
                          inputMode="numeric"
                          onChange={(event) => update("paperDays", event.target.value)}
                          value={form.paperDays}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              ) : null}

              {errors.length > 0 ? (
                <ul className="rounded-[12px] bg-[#FFEBEE] px-3 py-2.5 text-[12px] text-[#B3261E]">
                  {errors.map((error) => (
                    <li key={`${error.field}-${error.message}`}>· {error.message}</li>
                  ))}
                </ul>
              ) : null}

              <button
                className="h-[58px] w-full rounded-[16px] bg-[#1DFF26] text-[17px] font-bold text-[#0F1412] disabled:opacity-60"
                disabled={busy}
                onClick={() => void submit()}
                type="button"
              >
                {busy ? "만드는 중…" : "매장 + 점주 어드민 만들기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[520px] rounded-[12px] bg-[#0F1412] px-4 py-3 text-center text-[12.5px] font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ThresholdEditor({
  initial,
  busy,
  onSave,
}: {
  initial: StoreThresholds;
  busy: boolean;
  onSave: (next: StoreThresholds) => void;
}) {
  const [bean, setBean] = useState(String(initial.beanDays));
  const [toner, setToner] = useState(String(initial.tonerDays));
  const [paper, setPaper] = useState(String(initial.paperDays));

  return (
    <div className="mt-2 rounded-[10px] bg-white px-2.5 py-2">
      <p className="text-[11px] font-semibold text-[#6B746D]">알림 기준일(잔여일)</p>
      <div className="mt-1 flex items-center gap-1.5">
        {[
          { label: "원두", value: bean, set: setBean },
          { label: "토너", value: toner, set: setToner },
          { label: "용지", value: paper, set: setPaper },
        ].map((item) => (
          <label key={item.label} className="flex-1">
            <span className="block text-[10px] text-[#98A29B]">{item.label}</span>
            <input
              className="mt-0.5 h-9 w-full rounded-[8px] border border-[#E6E9E7] px-2 text-center text-[14px] tabular-nums"
              inputMode="numeric"
              onChange={(event) => item.set(event.target.value)}
              value={item.value}
            />
          </label>
        ))}
        <button
          className="mt-3.5 h-9 shrink-0 rounded-[8px] bg-[#0F1412] px-3 text-[11.5px] font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            onSave({
              beanDays: Number(bean) || initial.beanDays,
              tonerDays: Number(toner) || initial.tonerDays,
              paperDays: Number(paper) || initial.paperDays,
            })
          }
          type="button"
        >
          저장
        </button>
      </div>
    </div>
  );
}
