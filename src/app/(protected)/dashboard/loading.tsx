import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

/*
 * Bespoke loading fallback for the dashboard — the daily landing page whose
 * KPI-grid + chart + paired-list shape is too distinct for the generic
 * (protected)/loading.tsx to mirror honestly. Matching the real layout keeps
 * the skeleton→content swap shift-free.
 *
 * a11y: role="status" + sr-only label (WCAG 4.1.3); pulse blocks aria-hidden.
 */
export default async function DashboardLoading() {
  const t = await getTranslations("system.loading");

  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8"
    >
      <span className="sr-only">{t("label")}</span>

      {/* header */}
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* KPI row — 4 cards */}
      <div aria-hidden className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`kpi-${i}`}>
            <CardHeader>
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-7 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3.5 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* top-items chart */}
      <Card aria-hidden>
        <CardHeader>
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>

      {/* low-stock + recent movements */}
      <div aria-hidden className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {Array.from({ length: 2 }).map((_, c) => (
          <Card key={`list-${c}`}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-48 max-w-full" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, r) => (
                  <div
                    key={`list-${c}-row-${r}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
