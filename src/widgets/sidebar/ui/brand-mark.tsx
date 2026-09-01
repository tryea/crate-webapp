/**
 * The Crate glyph, same path as src/app/icon.svg. Filled with
 * `currentColor` so it takes the rail ink in both themes; the icon file
 * keeps its amber because a favicon has no theme to inherit.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M4 3h22a2 2 0 0 1 2 2v1.5a2 2 0 0 1-2 2H10v14h16a2 2 0 0 1 2 2V26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}
