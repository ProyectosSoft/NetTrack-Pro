import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import Sidebar from "./Sidebar";
import ThemeToggle from "@/components/shared/ThemeToggle";
import UndoButton from "@/components/shared/UndoButton";
import OfflineBanner from "@/components/shared/OfflineBanner";
import { Menu } from "lucide-react";

// Remembers the <main> scroll position per history entry, so going back to a list
// returns to where you were instead of jumping to the top.
const scrollPositions = new Map();

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef(null);
  const location = useLocation();
  const navType = useNavigationType();

  // Continuously record the scroll position for the current history entry.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => { scrollPositions.set(location.key, el.scrollTop); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [location.key]);

  // On back/forward (POP) restore the saved position; on a new navigation (PUSH)
  // start at the top. Retry across frames until the content is tall enough
  // (lists render after their data loads).
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (navType !== "POP") {
      el.scrollTop = 0;
      return;
    }
    const saved = scrollPositions.get(location.key) ?? 0;
    if (!saved) { el.scrollTop = 0; return; }
    let raf;
    let tries = 0;
    const restore = () => {
      el.scrollTop = saved;
      tries += 1;
      if (el.scrollTop < saved - 1 && tries < 40) raf = requestAnimationFrame(restore);
    };
    raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, [location.key, navType]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <OfflineBanner />
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-heading font-semibold text-base">NetTrack</span>
          <div className="ml-auto flex items-center gap-1">
            <UndoButton />
            <ThemeToggle />
          </div>
        </header>
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}