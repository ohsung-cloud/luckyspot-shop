"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "@wanteddev/wds";
import { AppRouterCacheProvider } from "@wanteddev/wds-nextjs";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
    </ThemeProvider>
  );
}
