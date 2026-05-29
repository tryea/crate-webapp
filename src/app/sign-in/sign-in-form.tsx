"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signIn } from "@/shared/lib/auth/client";
import { Button } from "@/shared/ui/button";

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn.email({ email, password, callbackURL: callbackUrl });
      if (res.error) {
        // Forgiving copy per Nadia's note — never leak which side was wrong.
        setError(t("errorCredentials"));
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Crate</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t("email")}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none ring-ring/0 focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={t("emailPlaceholder")}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          {/* Label + show-toggle as siblings (not descendants of label) so
              the input is the ONLY element associated with the "Password"
              accessible name. Playwright's getByLabel can't resolve a
              wrapped <button> as a fallback target. */}
          <div className="flex items-center justify-between font-medium">
            <label htmlFor="password" className="cursor-pointer">
              {t("password")}
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hideAria") : t("showAria")}
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              {showPassword ? t("hide") : t("show")}
            </button>
          </div>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none ring-ring/0 focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={t("passwordPlaceholder")}
            minLength={8}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t("newHere")}{" "}
        <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t("createAccount")}
        </Link>
      </p>
    </main>
  );
}
