import { useState, useEffect } from "react";

// Like useState, but persisted to sessionStorage under `key`, so the value
// survives navigating away and back (and reloads) within the same tab session.
export function useSessionState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, value]);

  return [value, setValue];
}
