import { useCallback, useState } from "react";

const KEY = "pagedrop-auth-token";

/** Persist the upload key in this browser only. */
export function useToken(): [string, (token: string) => void] {
  const [token, setTokenState] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setToken = useCallback((value: string) => {
    setTokenState(value);
    try {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } catch {
      // private mode / blocked storage — keep in-memory only
    }
  }, []);

  return [token, setToken];
}
