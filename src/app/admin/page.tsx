import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /admin 은 발주 관리 화면으로 바로 보낸다(로그인 여부는 /admin/orders 가 판단). */
export default function AdminIndexPage() {
  redirect("/admin/orders");
}
