import { getTranslations } from "next-intl/server";

/*
 * Generic loading fallback for every protected route that does not ship its
 * own loading.tsx. Per the Next 16 component hierarchy it renders INSIDE
 * (protected)/layout.tsx: the layout is the parent, and only the page segment
 * sits in the Suspense boundary, so the rail and topbar stay mounted and do
 * not flash while the page streams. Verified in the browser, not assumed.
 *
 * This is not a rare state. It appears on every navigation between protected
 * routes, so it is part of ordinary use and has to speak the shell's language
 * exactly: same tokens, same radii, same rhythm. A skeleton still wearing the
 * old shadcn classes would read as a broken page for a fraction of a second,
 * which is precisely the impression this shell exists to remove.
 *
 * Layout-agnostic on purpose: a header block, a toolbar row, then stacked
 * full-width rows read sensibly whether the route resolves to a data table or
 * a form. The dashboard, whose shape is too distinct for this to mirror
 * honestly, overrides with its own loading.tsx.
 *
 * The blocks pulse in BRIGHTNESS, never in `opacity`. `animate-pulse` dips to
 * 0.5 opacity, and opacity on a subtree is grey by another name; the shell
 * holds a hard zero on dimmed content, so the skeleton holds it too.
 *
 * a11y (WCAG 4.1.3 Status Messages): role="status" makes this a polite live
 * region; the sr-only localized label announces the loading state to
 * assistive tech. The pulse blocks are decorative (aria-hidden).
 */
export default async function ProtectedLoading() {
  const t = await getTranslations("system.loading");

  return (
    <div className="pad" role="status" aria-busy="true">
      <span className="sr-only">{t("label")}</span>

      <div aria-hidden className="flex flex-col gap-2">
        <div className="sk-block h-4 w-40" />
        <div className="sk-block h-6 w-64 max-w-full" />
        <div className="sk-block h-4 w-80 max-w-full" />
      </div>

      <div aria-hidden className="mt-5 flex items-center justify-between gap-3">
        <div className="sk-block h-8 w-64 max-w-full" />
        <div className="sk-block h-8 w-32 shrink-0" />
      </div>

      <div aria-hidden className="panel mt-3 flex flex-col gap-3 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`row-${i}`} className="sk-block h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
