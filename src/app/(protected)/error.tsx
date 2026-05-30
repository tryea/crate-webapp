"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/shared/ui/button";

/*
 * Error boundary for the protected app shell. Per the Next 16 component
 * hierarchy it wraps the page segment but NOT (protected)/layout.tsx in its
 * own segment — so a page-render error replaces only the content area while
 * the sidebar + topbar stay mounted, leaving the operator a way to navigate
 * out. (The root error.tsx still catches errors thrown by the shell layout
 * itself, where the shell is necessarily unavailable.)
 *
 * Scope: this catches *page-render* errors only. It deliberately does NOT
 * touch (protected)/layout.tsx's getServerSession — layout self-fetch
 * hardening is a separate, parked concern.
 *
 * Content-scoped container (flex-1 + justify-center) rather than min-h-svh:
 * the shell already fills the viewport, so we fill and center the content
 * slot instead of the whole screen.
 */
export default function ProtectedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("system.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Crate · {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t("reference")} {error.digest}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => unstable_retry()}>{t("retry")}</Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </main>
  );
}
