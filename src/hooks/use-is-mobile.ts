"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 640px)";

export function useIsMobile(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const getSnapshot = useCallback(
    () => window.matchMedia(MOBILE_QUERY).matches,
    [],
  );
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
