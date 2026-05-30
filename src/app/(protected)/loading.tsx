import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/shared/ui/skeleton";

/*
 * Generic loading fallback for every protected route that does not ship its
 * own loading.tsx. Per the Next 16 component hierarchy it renders INSIDE
 * (protected)/layout.tsx (the shell) but wraps only the page segment in a
 * Suspense boundary — sidebar + topbar stay mounted while the page streams.
 *
 * Layout-agnostic on purpose: a header block + a toolbar row + stacked
 * full-width rows read sensibly whether the route resolves to a data table
 * or a form. The dashboard, whose KPI-grid + chart shape is too distinct for
 * this to read honestly, overrides with its own loading.tsx.
 *
 * a11y (WCAG 4.1.3 Status Messages): role="status" makes this a polite live
 * region; the sr-only localized label announces the loading state to
 * assistive tech. The pulse blocks are decorative (aria-hidden).
 */
export default async function ProtectedLoading() {
  const t = await getTranslations("system.loading");

  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8"
    >
      <span className="sr-only">{t("label")}</span>

      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div aria-hidden className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-9 w-28 shrink-0" />
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={`row-${i}`} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
