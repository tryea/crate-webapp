"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "@/shared/lib/auth/client";
import { safeCallbackPath } from "@/shared/lib/auth/safe-redirect";
import {
  DEMO_FAILED_PARAM,
  DEMO_FAILED_VALUE,
} from "@/shared/lib/auth/demo-entry";
import { Button } from "@/shared/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/input-group";

/**
 * `demoEnabled` is decided on the server (see ./page.tsx). A client
 * component cannot read the env vars that configure the demo, and guessing
 * from the client would show a button the server refuses to honour.
 */
export function SignInForm({ demoEnabled }: { demoEnabled: boolean }) {
  const t = useTranslations("auth.signIn");
  const router = useRouter();
  const sp = useSearchParams();
  // DEC-026: sanitize the query-supplied callback to a same-site path before it
  // reaches either `router.push` (client hard-nav) or BetterAuth `callbackURL`.
  const callbackUrl = safeCallbackPath(sp.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // FR-31: /api/demo sends the visitor back here with this flag when the
  // configured demo credential no longer opens the account. Reusing the
  // generic copy keeps the operator problem from reading like the visitor
  // typed something wrong.
  const demoFailed = sp.get(DEMO_FAILED_PARAM) === DEMO_FAILED_VALUE;
  const [error, setError] = useState<string | null>(
    demoFailed ? t("errorGeneric") : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn.email({
        email,
        password,
        callbackURL: callbackUrl,
      });
      if (res.error) {
        // Forgiving copy per Nadia's note: never leak which side was wrong.
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
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs ring-ring/0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={t("emailPlaceholder")}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          {/* Keep the visible <label> bound to the input by id so the input's
              accessible name stays exactly "Password", the e2e specs use
              getByLabel("Password", { exact: true }), which must NOT also
              match the toggle's "Show password" aria-label. */}
          <label htmlFor="password" className="font-medium">
            {t("password")}
          </label>
          <InputGroup className="h-9 rounded-md">
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              minLength={8}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("hideAria") : t("showAria")}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>

      {demoEnabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              {t("demoDivider")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* A separate <form>: forms cannot nest, and a plain POST (no fetch,
              no onClick) means the demo opens even if the visitor presses it
              before this component has hydrated. */}
          <form method="post" action="/api/demo">
            <Button type="submit" variant="outline" className="w-full">
              {t("demoSubmit")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">{t("demoHint")}</p>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {t("newHere")}{" "}
        <Link
          href="/sign-up"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("createAccount")}
        </Link>
      </p>
    </main>
  );
}
