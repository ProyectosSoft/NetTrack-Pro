import React, { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { isDark, setTheme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }) {
  const [dark, setDark] = useState(isDark);
  const toggle = () => {
    setTheme(dark ? "light" : "dark");
    setDark(!dark);
  };
  return (
    <button
      onClick={toggle}
      title={dark ? "Modo claro" : "Modo oscuro"}
      aria-label="Cambiar tema"
      className={`p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground ${className}`}
    >
      {dark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
    </button>
  );
}
