import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Small hook around the browser online/offline events.
export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

// Persistent bar shown while the device is offline. Reads keep working from the
// cached data; writes will fail until the connection is back.
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500 text-amber-950 text-xs font-medium">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Sin conexión — mostrando datos guardados. Los cambios no se guardarán hasta reconectar.</span>
    </div>
  );
}
