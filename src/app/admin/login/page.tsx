import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { hasAdminSession, isAdminConfigured } from "@/features/admin/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "본사 로그인",
  description: "럭키스팟 본사 발주 관리",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function AdminLoginPage() {
  if (await hasAdminSession()) redirect("/admin/orders");

  return (
    <main className="min-h-screen bg-[#0F1412] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto w-full max-w-[420px]">
        <Link className="flex items-center gap-2" href="/">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-[9px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
          >
            L
          </span>
          <span className="text-[13px] font-semibold tracking-[0.2em]">LUCKY SPOT</span>
          <span className="rounded-[4px] bg-[#1DFF26] px-1.5 py-[3px] text-[9.5px] font-bold tracking-[0.08em] text-[#0F1412]">
            HQ
          </span>
        </Link>

        <p className="mt-8 text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
          HEADQUARTERS · ORDER ADMIN
        </p>
        <h1 className="mt-2 break-keep text-[26px] font-semibold leading-[1.2] tracking-[-0.04em]">
          본사 발주 관리
        </h1>
        <p className="mt-2 break-keep text-[12.5px] leading-[1.7] text-[#A9B4AC]">
          점주 발주를 확인하고 승인·출고 상태를 바꾸는 화면입니다. 본사 담당자만 들어올 수
          있어요.
        </p>

        <div className="mt-6 rounded-[18px] bg-white p-5 text-[#0F1412]">
          <AdminLoginForm configured={isAdminConfigured()} />
        </div>

        <p className="mt-5 text-center text-[11px] text-[#7C867E]">
          <Link className="underline underline-offset-2 hover:text-white" href="/orders">
            점주 발주 내역 조회
          </Link>
          <span className="mx-2">·</span>
          <Link className="underline underline-offset-2 hover:text-white" href="/">
            발주 페이지
          </Link>
        </p>
      </div>
    </main>
  );
}
