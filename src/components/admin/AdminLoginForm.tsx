"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * 본사 로그인 폼.
 * 비밀번호는 이 화면에서 서버(/api/admin/auth)로만 보내고, 응답에는 절대 담기지 않는다.
 * 설정이 없는 환경에서는 입력 자체를 막고 안내만 보여준다(fail-closed).
 */
export default function AdminLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [passcode, setPasscode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !configured) return;

    const value = passcode.trim();

    if (value.length < 6) {
      setError("비밀번호는 6자리 이상입니다.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/auth", {
        body: JSON.stringify({ passcode: value }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean; reason?: string }
        | null;

      if (!response.ok || payload?.ok !== true) {
        setError(payload?.error ?? "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setPending(false);
        return;
      }

      setPasscode("");
      router.replace("/admin/orders");
      router.refresh();
    } catch {
      setError("네트워크 오류로 로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  };

  if (!configured) {
    return (
      <div className="rounded-[12px] border border-[#E5C86A] bg-[#FFF7DD] px-4 py-3">
        <p className="text-[12.5px] font-semibold text-[#7A5A00]">관리자 비밀번호가 아직 없습니다</p>
        <p className="mt-1 text-[11.5px] leading-[1.7] text-[#7A5A00]">
          Vercel → luckyspot-shop → Settings → Environment Variables 에
          <br />
          <code className="font-mono">SHOP_ADMIN_PASSCODE</code>,
          <code className="ml-1 font-mono">SHOP_ADMIN_COOKIE_SECRET</code> 를 등록한 뒤
          재배포하면 이 화면에서 로그인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-[12px] font-semibold text-[#0F1412]">관리자 비밀번호</span>
        <input
          autoComplete="current-password"
          autoFocus
          className="ls-focus mt-1.5 h-12 w-full rounded-[12px] border border-[var(--ls-line-strong)] px-3.5 text-[15px] tracking-[0.25em] outline-none placeholder:tracking-normal placeholder:text-[var(--ls-muted)]"
          inputMode="numeric"
          maxLength={12}
          onChange={(event) => setPasscode(event.target.value.replace(/\D/g, ""))}
          placeholder="숫자 비밀번호"
          type="password"
          value={passcode}
        />
      </label>

      {error ? (
        <p aria-live="polite" className="rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[11.5px] leading-[1.6] text-[#9B1C1C]">
          {error}
        </p>
      ) : null}

      <button
        className="ls-focus flex h-12 w-full items-center justify-center rounded-[12px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "확인 중…" : "로그인"}
      </button>

      <p className="text-[10.5px] leading-[1.6] text-[var(--ls-muted)]">
        로그인 상태는 이 브라우저에서 7일간 유지됩니다. 공용 기기에서는 사용 후 로그아웃해
        주세요.
      </p>
    </form>
  );
}
