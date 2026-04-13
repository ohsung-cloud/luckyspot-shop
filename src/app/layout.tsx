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
