"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="light"
        position="bottom-right"
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
  );
}
