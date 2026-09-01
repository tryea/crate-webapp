"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { signUp } from "@/shared/lib/auth/client";
import { Button } from "@/shared/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/input-group";

export default function SignUpPage() {
  const t = useTranslations("auth.signUp");
  const router = useRouter();

  const [name, setName] = useState("");
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
      const res = await signUp.email({ name, email, password });
      if (res.error) {
        setError(res.error.message ?? t("errorCreate"));
        return;
      }
      router.push("/dashboard");
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
        <p className="text-sm text-muted-foreground">
          {t.rich("subtitle", {
            role: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t("name")}</span>
          <input
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none ring-ring/0 focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={t("namePlaceholder")}
          />
        </label>

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
          {/* Visible <label> bound by id so the input's accessible name stays
              exactly "Password" for getByLabel("Password", { exact: true }),
              the toggle's "Show password" aria-label must not collide. */}
          <label htmlFor="password" className="font-medium">
            {t("password")}
          </label>
          <InputGroup className="h-9 rounded-md">
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
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

      <p className="text-sm text-muted-foreground">
        {t("alreadyHave")}{" "}
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </main>
  );
}
