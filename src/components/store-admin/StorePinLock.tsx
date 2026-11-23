"use client";

import { useCallback, useEffect, useState } from "react";

import InternalHeader from "@/components/internal/InternalHeader";

/**
 * 점주 4자리 PIN 잠금 화면 — 홈화면(PWA)에서 1초 재접속.
 *
 * 동작
 *  1. 숫자 4개를 누르면 자동 제출 → `POST /api/stores/[code]/pin`.
 *  2. 성공하면 서버가 httpOnly 쿠키(30일)를 심고, 화면을 새로 그려 점주 어드민이 열린다.
 *  3. 기기에는 **PIN 원문이 아니라 해시**(지점코드+PIN의 SHA-256)만 남긴다.
 *     같은 PIN을 다시 입력할 때 그 해시로 먼저 확인해, 서버 응답을 기다리지 않고 즉시 반응한다.
 *
 * 보안
 *  - 원문은 localStorage에도 서버 DB에도 남기지 않는다(DB에는 별도 해시).
 *  - 10분에 10회로 제한된다(서버 rate limit).
 */

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

async function hashPin(code: string, pin: string) {
  const data = new TextEncoder().encode(`luckyspot-pin|${code.toUpperCase()}|${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function StorePinLock({
  code,
  label,
  shortLabel,
  demoPin,
  wrongKey,
}: {
  code: string;
  label: string;
  shortLabel: string;
  /** 시드 지점은 데모 PIN(0000)을 화면에 안내한다. 새 매장은 null(본사에서 받은 PIN). */
  demoPin: string | null;
  wrongKey?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(wrongKey ? "접근 코드가 맞지 않습니다." : null);
  const [known, setKnown] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);

  const storageKey = `ls.pin.${code.toUpperCase()}`;

  useEffect(() => {
    try {
      setKnown(Boolean(localStorage.getItem(storageKey)));
    } catch {
      setKnown(false);
    }
  }, [storageKey]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);

      try {
        // 로컬 해시가 일치하면 즉시 통과 신호(서버 확인은 그대로 수행한다).
        let localMatch = false;
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) localMatch = saved === (await hashPin(code, value));
        } catch {
          localMatch = false;
        }

        const response = await fetch(`/api/stores/${encodeURIComponent(code)}/pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

        if (!response.ok || !payload?.ok) {
          if (localMatch) {
            setError("PIN은 기기에 맞지만 서버 확인이 필요합니다. 잠시 후 다시 시도해 주세요.");
          } else {
            setError(payload?.error ?? "PIN이 맞지 않습니다.");
          }
          setPin("");
          return;
        }

        try {
          localStorage.setItem(storageKey, await hashPin(code, value));
        } catch {
          // 저장이 막혀도 이번 세션은 열린다(쿠키가 있으므로).
        }

        window.location.replace(`/store/${encodeURIComponent(code)}`);
      } catch {
        setError("연결이 불안정합니다. 잠시 후 다시 시도해 주세요.");
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [code, storageKey],
  );

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

    if (next.length === 4) void submit(next);
  };

  return (
    <main className="min-h-screen bg-[#0F1412] text-white">
      <InternalHeader subtitle="점주 어드민" action={{ href: "/admin/stores", label: "본사" }} />

      <div className="mx-auto w-full max-w-[430px] px-5 pb-10 pt-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 font-mono text-[10px] font-bold text-[#0F1412]">
            {code}
          </span>
          <span className="text-[10.5px] text-[#9AA39C]">{known ? "이 기기에서 다시 여는 중" : "처음 여는 기기"}</span>
        </div>

        <h1 className="mt-2 text-[24px] font-bold leading-[1.25] tracking-[-0.02em]">{shortLabel}</h1>
        <p className="mt-1 text-[12px] leading-[1.6] text-[#9AA39C]">
          {label} · 4자리 PIN을 누르면 바로 열립니다.
        </p>

        <div aria-label={`PIN ${pin.length}자리 입력됨`} className="mt-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`size-3.5 rounded-full transition-colors ${
                index < pin.length ? "bg-[#1DFF26]" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {error ? (
          <p aria-live="polite" className="mt-4 rounded-[12px] bg-[#3A1414] px-3 py-2 text-center text-[12px] font-semibold text-[#FF8A8A]">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-center text-[11px] text-[#7E8A82]">{busy ? "확인 중…" : "숫자 4개"}</p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {KEYPAD.map((key, index) => (
            <button
              key={`${key}-${index}`}
              aria-label={key === "⌫" ? "한 글자 지우기" : key ? `${key} 입력` : undefined}
              className={`h-[62px] rounded-[16px] text-[24px] font-bold tabular-nums transition-colors ${
                key === "⌫"
                  ? "bg-transparent text-[#9AA39C]"
                  : key
                    ? "bg-white/10 text-white active:bg-[#1DFF26] active:text-[#0F1412]"
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

        {demoPin ? (
          <p className="mt-4 rounded-[12px] bg-white/8 px-3 py-2 text-center text-[11px] leading-[1.6] text-[#C8D0CA]">
            이 지점은 <span className="font-bold text-[#1DFF26]">데모 PIN {demoPin}</span> 으로 열 수 있습니다.
            본사에서 PIN을 재발급하면 바뀝니다.
          </p>
        ) : null}

        <button
          className="mt-4 h-11 w-full rounded-[12px] border border-white/15 text-[12.5px] font-semibold text-[#C8D0CA]"
          onClick={() => setShowKeyForm((prev) => !prev)}
          type="button"
        >
          {showKeyForm ? "접근 코드 닫기" : "접근 코드로 열기"}
        </button>

        {showKeyForm ? (
          <form action={`/store/${code}`} className="mt-2" method="get">
            <input
              autoComplete="one-time-code"
              className="h-12 w-full rounded-[12px] border border-white/20 bg-white/5 px-3 text-center font-mono text-[17px] font-bold tracking-[0.12em] text-white uppercase outline-none focus:border-[#1DFF26]"
              name="key"
              placeholder="XXXX-XXXXXX"
            />
            <button className="mt-2 h-12 w-full rounded-[12px] bg-[#1DFF26] text-[14px] font-bold text-[#0F1412]" type="submit">
              접근 코드로 열기
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-[10px] leading-[1.6] text-[#6E7A72]">
          PIN은 이 기기에 해시로만 남고, 30일 뒤 다시 물어봅니다.
        </p>
      </div>
    </main>
  );
}
