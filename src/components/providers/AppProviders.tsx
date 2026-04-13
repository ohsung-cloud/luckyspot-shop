"use client";

import type { PropsWithChildren } from "react";
import { RegionConfig, ThemeProvider } from "@wanteddev/wds";
import { AppRouterCacheProvider } from "@wanteddev/wds-nextjs";

import { ConsultationModalProvider } from "@/components/modal/ConsultationModalProvider";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppRouterCacheProvider>
        <RegionConfig viewportBottom="96px" viewportMaxWidth="480px" />
        <ConsultationModalProvider>{children}</ConsultationModalProvider>
      </AppRouterCacheProvider>
    </ThemeProvider>
  );
}
