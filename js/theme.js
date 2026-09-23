/**
 * CAMPUSX — THEME ENGINE
 * Manages Dark Mode & Light Mode with LocalStorage persistence.
 */

(function () {
  const THEME_KEY = "campusx_theme";

  // Determine initial theme
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Apply theme to DOM
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    // Update icons if buttons exist
    document.querySelectorAll(".theme-toggle-icon").forEach(icon => {
      icon.textContent = theme === "dark" ? "☀️" : "🌙";
    });
  }

  // Toggle function
  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  };

  // Initialize immediately
  applyTheme(getPreferredTheme());

  // Attach listener after DOM loads
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".theme-toggle, #themeToggle").forEach(btn => {
      btn.addEventListener("click", window.toggleTheme);
    });
    // Ensure icon matches
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current);
  });
})();
