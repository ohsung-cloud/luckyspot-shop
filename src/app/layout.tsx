import type { Metadata } from "next";

import "swiper/css";
import "./globals.css";
import GlobalFonts, { fontVariables } from "@/components/font/GlobalFonts";
import AppProviders from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: {
    default: "럭키스팟 점주 발주",
    template: "%s | 럭키스팟 발주",
  },
  description:
    "럭키스팟 점주 발주 페이지. 원두·파우더·시럽·컵·부자재·가구까지 최신 단가로 한 번에 발주하세요.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
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
      </body>
    </html>
  );
}
