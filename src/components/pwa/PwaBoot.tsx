"use client";

import { useEffect, useState } from "react";

/**
 * PWA 부트스트랩 — 서비스워커 등록 + 설치 안내.
 *
 *  - 운영(https)에서만 등록한다. 개발 서버에서 등록하면 낡은 캐시가 화면을 덮는다.
 *  - 설치 안내는 한 줄 배너로만. 점주의 첫 화면(매출)을 가리지 않도록 3초 뒤 사라진다.
 */

type InstallEvent = Event & { prompt: () => Promise<void> };

export default function PwaBoot() {
  const [installable, setInstallable] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      const register = () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      };

      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallable(event as InstallEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!installable) return;
    const timer = window.setTimeout(() => setHidden(true), 6000);
    return () => window.clearTimeout(timer);
  }, [installable]);

  if (!installable || hidden) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-40 mx-auto max-w-[520px] rounded-[14px] bg-[#0F1412] px-3 py-2.5 text-white shadow-[0_10px_30px_rgba(15,20,18,0.35)]">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold text-[#0F1412]">
          L
        </span>
        <p className="min-w-0 flex-1 text-[11.5px] leading-[1.45] text-[#C8D0CA]">
          홈화면에 추가하면 <span className="font-bold text-white">앱처럼 1초</span>에 열립니다.
        </p>
        <button
          className="h-8 shrink-0 rounded-[9px] bg-[#1DFF26] px-2.5 text-[11px] font-bold text-[#0F1412]"
          onClick={() => {
            void installable.prompt();
            setHidden(true);
          }}
          type="button"
        >
          설치
        </button>
        <button
          aria-label="설치 안내 닫기"
          className="shrink-0 px-1 text-[13px] text-[#7E8A82]"
          onClick={() => setHidden(true)}
          type="button"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
