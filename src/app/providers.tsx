"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000 },
        },
      })
  );

  return (
    <I18nProvider initialLocale={initialLocale}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          theme="light"
          position={initialLocale === "he" ? "bottom-left" : "bottom-right"}
          toastOptions={{
            style: {
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-foreground)",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </QueryClientProvider>
    </I18nProvider>
  );
}
