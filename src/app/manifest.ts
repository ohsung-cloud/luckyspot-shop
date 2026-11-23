import type { MetadataRoute } from "next";

/**
 * 점주용 PWA 매니페스트 — 홈화면에 추가하면 주소창 없는 standalone 앱으로 열린다.
 *
 * 원칙
 *  - start_url 은 점주 어드민(`/store/STORE_GNM`) — 설치하자마자 오늘 매출이 보이게.
 *  - 아이콘은 네온그린(브랜드) 512/192 + maskable 512. iOS는 apple-touch-icon(180)을 쓴다.
 *  - display: standalone, theme_color 는 히어로 카드와 같은 잉크색(#0F1412).
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "럭키스팟 점주 — 매출·발주",
    short_name: "럭키스팟 점주",
    description: "점주 전용 매출·원두·토너·용지 발주·실마진 어드민.",
    start_url: "/store/STORE_GNM",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F1412",
    theme_color: "#0F1412",
    lang: "ko",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "매출 리포트", short_name: "매출", url: "/sales-report" },
      { name: "3종 발주", short_name: "발주", url: "/auto-order" },
    ],
  };
}
