/**
 * Route-level catalogue theme — runs before paint on archive/item pages.
 * Prevents OS dark-mode tokens from flashing before app.js bootstrap.
 */
(function twPageThemeBoot() {
  const path = String(globalThis.location?.pathname ?? "");
  const isHome = path === "/" || path === "" || /\/index\.html$/i.test(path);
  if (isHome) return;
  const root = document.documentElement;
  root.classList.add("theme-catalogue");
  root.style.colorScheme = "light";
  const body = document.body;
  if (body) body.classList.add("theme-catalogue");
})();
