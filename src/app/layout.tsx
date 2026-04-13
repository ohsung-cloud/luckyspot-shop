import type { Metadata } from "next";

import "swiper/css";
import "./globals.css";
import AppLayout from "@/components/AppLayout";
import GlobalFonts, { fontVariables } from "@/components/font/GlobalFonts";
import AppProviders from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: {
    default: "Luckyspot Shop",
    template: "%s | Luckyspot Shop",
  },
  description: "Luckyspot shop starter built from the shared design system.",
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${fontVariables} antialiased`}>
        <GlobalFonts />
        <div id="app-root">
          <AppProviders>
            <AppLayout  center={children} />
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
