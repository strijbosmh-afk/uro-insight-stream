import * as React from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";

/**
 * useLiveData — TanStack Query wrapper that polls on an interval and
 * automatically pauses when the document is hidden.
 */
export function useLiveData<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  intervalMs = 30_000,
) {
  const [visible, setVisible] = React.useState(
    typeof document === "undefined" ? true : !document.hidden,
  );

  React.useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    refetchInterval: visible ? intervalMs : false,
    refetchIntervalInBackground: false,
  });
}

export default useLiveData;