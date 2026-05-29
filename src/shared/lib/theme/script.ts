/**
 * Inline FOUC-prevention script. Returned as a string and injected into
 * <head> as a non-module script BEFORE React hydrates. Pattern from
 * Sapta's ~/.claude/CLAUDE.md.
 *
 * Storage key matches the runtime `useTheme()` hook so the two read the
 * same source of truth.
 */
export const THEME_SCRIPT = `
(function() {
  try {
    var pref = localStorage.getItem('crate-theme') || 'system';
    var isDark = pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`.trim();
