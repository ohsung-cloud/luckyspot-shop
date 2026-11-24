"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * `/owner` 로그인 — 기본은 **아이디 + 비밀번호**, 보조로 **4자리 PIN**(기존 방식).
 *
 * 계정 원본은 기존 지점 레지스트리(`stores.login_id · password_hash`)다. 새 계정 표를 만들지 않는다.
 *  - 아이디는 네이버 아이디와 맞춘 지점별 ID(예: luckyspot-hyj). 메일 주소 별칭도 같은 지점으로 열린다.
 *  - 직영 3개 지점을 묶은 본계정 ID로 들어오면 지점을 고르게 한다(서버가 `choose`로 알려 준다).
 *  - 비밀번호는 서버에서만 해시로 비교한다. 화면·로그에 원문을 남기지 않는다.
 *  - 성공하면 서버가 httpOnly 쿠키 두 개를 심고, 이 화면은 `/owner`로 다시 이동한다.
 *
 * 화면: 토스 앱처럼 회색 바탕 + 흰 카드. 390px 모바일 우선.
 */

export type OwnerLoginStore = {
  code: string;
  label: string;
  shortLabel: string;
  region: string;
  status: "active" | "paused" | "deleted";
  /** 본사 PIN이 아직 없어 데모 PIN(0000)으로 열리는 지점 */
  demoPin: boolean;
};

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

type Choice = { code: string; label: string; shortLabel: string };

export default function OwnerLogin({
  stores,
  preselect,
  notice,
}: {
  stores: OwnerLoginStore[];
  /** 방금 열려 있던 지점(지점 전환 시) */
  preselect?: string | null;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<"id" | "pin">("id");

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [choose, setChoose] = useState<Choice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = preselect
    ? stores.find((store) => store.code === preselect && store.status === "active")
    : null;

  const [selected, setSelected] = useState<string>(first?.code ?? stores.find((store) => store.status === "active")?.code ?? "");
  const [pin, setPin] = useState("");

  const store = stores.find((candidate) => candidate.code === selected) ?? null;

  useEffect(() => {
    setPin("");
    setError(null);
  }, [selected, mode]);

  const signIn = useCallback(async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; choose?: Choice[] }
        | null;

      if (payload?.choose && payload.choose.length > 0) {
        setChoose(payload.choose);
        return;
      }

      if (!response.ok || payload?.ok !== true) {
        setError(payload?.error ?? "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      window.location.replace("/owner");
    } catch {
      setError("연결이 불안정해요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }, []);

  const press = (key: string) => {
    if (busy) return;

    if (key === "⌫") {
      setPin((prev) => prev.slice(0, -1));
      setError(null);
      return;
    }

    if (!key) return;

    const next = `${pin}${key}`.slice(0, 4);
    setPin(next);
    setError(null);

    if (next.length === 4 && store) void signIn({ code: store.code, pin: next });
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <header className="border-b border-[#EBEEF0] bg-white">
        <div className="mx-auto flex w-full max-w-[430px] items-center gap-2.5 px-4 py-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#0F1412] text-[15px] font-bold leading-none text-[#1DFF26]"
          >
            L
          </span>
          <span className="min-w-0 leading-none">
            <span className="block text-[9.5px] font-bold tracking-[0.18em] text-[#0B5C2A]">LUCKY SPOT</span>
            <span className="mt-1 block text-[15.5px] font-bold tracking-[-0.015em] text-[#0F1412]">점주 포털</span>
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[430px] px-4 pb-10 pt-5">
        <h1 className="text-[24px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412]">
          {mode === "id" ? (
            <>
              점주 아이디로
              <br />
              들어갈까요?
            </>
          ) : (
            <>
              우리 지점으로
              <br />
              들어갈까요?
            </>
          )}
        </h1>
        <p className="mt-1.5 text-[12.5px] font-medium leading-[1.55] text-[#8B948D]">
          {mode === "id"
            ? "본사에서 받은 아이디와 비밀번호를 넣어 주세요."
            : "지점을 고르고 비밀번호 4자리를 누르면 열려요."}
        </p>

        {notice && !choose ? (
          <p className="mt-3 rounded-[14px] bg-[#FFF6E0] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.5] text-[#8A5A00]">
            {notice}
          </p>
        ) : null}

        {mode === "id" ? (
          <>
            {choose ? (
              <section className="mt-4 rounded-[24px] bg-white p-2 shadow-[0_1px_2px_rgba(15,20,18,0.04)]">
                <p className="px-3 pt-2 text-[11.5px] font-semibold text-[#3B4740]">어느 지점으로 들어갈까요?</p>
                <ul className="mt-1 divide-y divide-[#F1F3F2]">
                  {choose.map((item) => (
                    <li key={item.code}>
                      <button
                        className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] px-3.5 py-3 text-left hover:bg-[#F7F8F9]"
                        disabled={busy}
                        onClick={() => void signIn({ code: item.code, password })}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-bold text-[#0F1412]">{item.shortLabel}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8B948D]">{item.code}</span>
                        </span>
                        <span aria-hidden className="text-[#A7AFA9]">
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <form
                className="mt-4 rounded-[24px] bg-white px-4 py-5 shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy || !loginId.trim() || !password) return;
                  void signIn({ loginId: loginId.trim(), password });
                }}
              >
                <label className="block text-[11.5px] font-bold text-[#6B746D]" htmlFor="owner-login-id">
                  아이디
                </label>
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  className="mt-1 h-13 min-h-[52px] w-full rounded-[12px] bg-[#F7F8F9] px-3.5 text-[15px] font-semibold text-[#0F1412] outline-none ring-1 ring-transparent focus:ring-[#0F1412]"
                  id="owner-login-id"
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="luckyspot-지점"
                  spellCheck={false}
                  type="text"
                  value={loginId}
                />

                <label className="mt-3.5 block text-[11.5px] font-bold text-[#6B746D]" htmlFor="owner-login-password">
                  비밀번호
                </label>
                <input
                  autoComplete="current-password"
                  className="mt-1 h-13 min-h-[52px] w-full rounded-[12px] bg-[#F7F8F9] px-3.5 text-[15px] font-semibold tracking-[0.08em] text-[#0F1412] outline-none ring-1 ring-transparent focus:ring-[#0F1412]"
                  id="owner-login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="6자리 이상"
                  type="password"
                  value={password}
                />

                <button
                  className="mt-4 flex h-[54px] w-full items-center justify-center rounded-[16px] bg-[#1DFF26] text-[16px] font-bold text-[#0F1412] transition-colors hover:bg-[#3BE93F] disabled:bg-[#E6E9E7] disabled:text-[#98A29B]"
                  disabled={busy || !loginId.trim() || !password}
                  type="submit"
                >
                  {busy ? "확인하는 중…" : "로그인"}
                </button>

                <p className="mt-2 text-center text-[10.5px] leading-[1.6] text-[#A7AFA9]">
                  아이디는 지점마다 달라요. 잊었다면 본사(1551-7157)로 문의해 주세요.
                </p>
              </form>
            )}

            {error ? (
              <p
                aria-live="polite"
                className="mt-3 rounded-[14px] bg-[#FFF2F2] px-3 py-2.5 text-center text-[11.5px] font-semibold leading-[1.5] text-[#B3261E]"
              >
                {error}
              </p>
            ) : null}

            {choose ? (
              <button
                className="mt-3 h-11 w-full rounded-[12px] bg-white text-[12px] font-bold text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
                onClick={() => {
                  setChoose(null);
                  setPassword("");
                }}
                type="button"
              >
                다시 로그인
              </button>
            ) : null}

            <button
              className="mt-4 h-12 w-full rounded-[14px] bg-white text-[12.5px] font-bold text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
              onClick={() => {
                setMode("pin");
                setError(null);
                setChoose(null);
              }}
              type="button"
            >
              4자리 PIN으로 열기
            </button>
          </>
        ) : (
          <>
            <section className="mt-4 max-h-[228px] overflow-y-auto overscroll-contain rounded-[24px] bg-white p-2 shadow-[0_1px_2px_rgba(15,20,18,0.04)]">
              <ul className="divide-y divide-[#F1F3F2]">
                {stores.map((candidate) => {
                  const active = candidate.code === selected;
                  const paused = candidate.status === "paused";

                  return (
                    <li key={candidate.code}>
                      <button
                        aria-pressed={active}
                        className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[16px] px-3.5 py-3 text-left transition-colors ${
                          active ? "bg-[#EDFBEF]" : "hover:bg-[#F7F8F9]"
                        }`}
                        onClick={() => setSelected(candidate.code)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-bold text-[#0F1412]">{candidate.shortLabel}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8B948D]">
                            {candidate.region ? `${candidate.region} · ` : ""}
                            {candidate.code}
                            {paused ? " · 일시정지" : ""}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                            active ? "border-[#0F1412] bg-[#0F1412] text-[#1DFF26]" : "border-[#DDE3DF] text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div aria-label={`비밀번호 ${pin.length}자리 입력됨`} className="mt-5 flex justify-center gap-3">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={`size-3.5 rounded-full transition-colors ${index < pin.length ? "bg-[#0F1412]" : "bg-[#DDE3DF]"}`}
                />
              ))}
            </div>

            {error ? (
              <p
                aria-live="polite"
                className="mt-4 rounded-[14px] bg-[#FFF2F2] px-3 py-2.5 text-center text-[11.5px] font-semibold leading-[1.5] text-[#B3261E]"
              >
                {error}
              </p>
            ) : (
              <p className="mt-4 text-center text-[11px] font-medium text-[#A7AFA9]">
                {busy ? "확인하는 중…" : store?.demoPin ? "이 지점은 데모 PIN 0000으로 열려요" : "숫자 4개"}
              </p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {KEYPAD.map((key, index) => (
                <button
                  key={`${key}-${index}`}
                  aria-label={key === "⌫" ? "한 글자 지우기" : key ? `${key} 입력` : undefined}
                  className={`h-[58px] rounded-[18px] text-[23px] font-bold tabular-nums transition-colors ${
                    key === "⌫"
                      ? "bg-transparent text-[#8B948D]"
                      : key
                        ? "bg-white text-[#0F1412] shadow-[0_1px_2px_rgba(15,20,18,0.04)] active:bg-[#E9ECEB]"
                        : "pointer-events-none bg-transparent"
                  }`}
                  disabled={busy || !key}
                  onClick={() => press(key)}
                  type="button"
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              className="mt-4 h-12 w-full rounded-[14px] bg-white text-[12.5px] font-bold text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
              onClick={() => {
                setMode("id");
                setError(null);
                setPin("");
              }}
              type="button"
            >
              아이디로 로그인
            </button>
          </>
        )}

        <p className="mt-6 text-center text-[10.5px] leading-[1.7] text-[#A7AFA9]">
          비밀번호는 지점마다 다르고, 본사에서 바꿀 수 있어요.
          <br />
          로그인하면 이 기기에서 30일 동안 다시 묻지 않아요.
        </p>
      </div>
    </main>
  );
}
