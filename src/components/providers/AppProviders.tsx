"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "@wanteddev/wds";
import { AppRouterCacheProvider } from "@wanteddev/wds-nextjs";

import { ConsultationModalProvider } from "@/components/modal/ConsultationModalProvider";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppRouterCacheProvider>
        <ConsultationModalProvider>{children}</ConsultationModalProvider>
      </AppRouterCacheProvider>
    </ThemeProvider>
  );
}
