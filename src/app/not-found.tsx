import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/shared/ui/button";

/*
 * Global 404. Catches any unknown URL (and any `notFound()` call that
 * isn't caught by a closer not-found boundary). Server Component — no
 * client JS needed. Links back to `/`, which the root route redirects
 * to /dashboard or /sign-in depending on session, so this works for
 * both authenticated and anonymous visitors.
 */
export default async function NotFound() {
  const t = await getTranslations("system.notFound");

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Crate · {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonVariants({ variant: "default" })}>
          {t("backToCrate")}
        </Link>
        <Link
          href="/movements"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("movementHistory")}
        </Link>
      </div>
    </main>
  );
}
