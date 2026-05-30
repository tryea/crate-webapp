"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { signOut } from "@/shared/lib/auth/client";
import { Button } from "@/shared/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations("userMenu");
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      onClick={handleSignOut}
      disabled={pending}
      className="gap-2 text-destructive-text hover:text-destructive-text"
    >
      <LogOut className="size-4" aria-hidden="true" />
      {t("signOut")}
    </Button>
  );
}
