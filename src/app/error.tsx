"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/shared/ui/button";

/*
 * Route-segment error boundary. Catches uncaught exceptions thrown while
 * rendering any page (NOT errors in the root layout itself — those are
 * caught by global-error.tsx). Renders inside the root layout, so the
 * theme + design tokens are available here.
 *
 * Next 16 (≥16.2.0): the recovery prop is `unstable_retry` (re-fetches +
 * re-renders the segment), which replaces the older `reset` (re-render
 * only). For a Server Component that failed on a transient DB hiccup,
 * re-fetching is the correct recovery — so we wire `unstable_retry`.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surfaces in server logs (digest) + browser console for diagnosis.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Crate · Error
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong.
        </h1>
        <p className="text-sm text-muted-foreground">
          This screen hit an unexpected error. Your data is safe — every
          stock change is an append-only ledger entry, so nothing here can
          be left half-written. Try again, and if it persists, head back to
          the dashboard.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground/70">
            Reference: {error.digest}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
