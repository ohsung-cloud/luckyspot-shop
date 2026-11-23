import type { Metadata, Viewport } from "next";

import "swiper/css";
import "./globals.css";
import GlobalFonts, { fontVariables } from "@/components/font/GlobalFonts";
import AppProviders from "@/components/providers/AppProviders";
import PwaBoot from "@/components/pwa/PwaBoot";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://luckyspot-shop.vercel.app";

const siteName = "럭키스팟 점주 발주";
const description =
  "럭키스팟 점주 발주 페이지. 원두·파우더·시럽·컵·부자재·가구까지 최신 단가로 한 번에 발주하세요.";

// 공유 카드(카카오톡·슬랙· 문자 미리보기)용 이미지: 카페 럭키스팟 영등포시장역점 최근 실사 사진
const shareImage = {
  url: "/assets/images/og/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "카페 럭키스팟 영등포시장역점 매장 전경",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: "%s | 럭키스팟 발주",
  },
  description,
  manifest: "/manifest.webmanifest",
  applicationName: siteName,
  appleWebApp: {
    capable: true,
    title: "럭키스팟 점주",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName,
    locale: "ko_KR",
    url: "/",
    title: siteName,
    description,
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description,
    images: [shareImage],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/** PWA — 주소창 없는 standalone 앱의 상태바 색(점주 화면 히어로와 같은 잉크색). */
export const viewport: Viewport = {
  themeColor: "#0F1412",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${fontVariables} antialiased`}>
        <GlobalFonts />
        <div id="app-root">
          <AppProviders>{children}</AppProviders>
        </div>
        <PwaBoot />
      </body>
    </html>
  );
}
