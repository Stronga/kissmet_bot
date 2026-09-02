import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>(path)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(() => { setError(""); reload(); }, deps);
  return { data, error, loading, reload, setData };
}
