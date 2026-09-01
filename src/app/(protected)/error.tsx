"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/*
 * Error boundary for the protected app shell. Per the Next 16 component
 * hierarchy it wraps the page segment but NOT (protected)/layout.tsx, so a
 * page-render error replaces only the content area while the rail and topbar
 * stay mounted and the operator keeps a way to navigate out. (The root
 * error.tsx still catches errors thrown by the shell layout itself, where the
 * shell is necessarily unavailable.)
 *
 * Scope: this catches page-render errors only. It does NOT catch
 * (protected)/layout.tsx's getServerSession; that throw bubbles to the root
 * boundary. Layout self-fetch resilience is handled upstream by DEC-024
 * (getServerSessionResilient: retry, then fail closed to /sign-in), so a
 * transient DB blip no longer reaches any error boundary at all.
 *
 * Dressed in the shell's own tokens rather than the shadcn set, for the same
 * reason as loading.tsx: an error screen that looks like a different product
 * makes the operator doubt the whole app rather than the one page. Retry is
 * the filled action and it is the first thing in the row, because the honest
 * first move after a transient failure is to try again.
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
    <main className="pad" role="alert">
      <p className="stamp">Crate · {t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="lede max-w-prose">{t("body")}</p>

      {error.digest ? (
        <p className="stamp fig mt-3">
          {t("reference")} {error.digest}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-act" onClick={() => unstable_retry()}>
          {t("retry")}
        </button>
        <Link className="btn" href="/dashboard">
          {t("backToDashboard")}
        </Link>
      </div>
    </main>
  );
}
