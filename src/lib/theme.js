// Light/dark theme, applied via the `dark` class on <html> (Tailwind darkMode:
// "class"). The initial class is set by an inline script in index.html to avoid
// a flash; these helpers keep it in sync with the toggle.

const KEY = "nettrack.theme";

export function getStoredTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function setTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch { /* storage unavailable */ }
}
