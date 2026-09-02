"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Moon, Sun, SunMoon, UserRound } from "lucide-react";
import { signOut } from "@/shared/lib/auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { LocaleSwitcher } from "@/features/locale-switcher";
import { useTheme, type Theme } from "@/shared/lib/theme/use-theme";

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string | null | undefined;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const t = useTranslations("userMenu");

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const displayName = name ?? email;
  const initials =
    displayName
      .split(" ")
      .map((p) => p[0]?.toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "?";
  // Upper-case-only text reads as a second typeface even in the same family
  // (DESIGN-RULES), so the role is title-cased in data, not with
  // `text-transform`.
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="me" aria-label={t("ariaLabel")}>
        <span className="av">{initials}</span>
        <span className="who">
          <span className="nm2">{displayName}</span>
          <span className="rl" data-slot="user-role">
            {roleLabel}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm">{displayName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as Theme)}
        >
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {t("theme")}
          </DropdownMenuLabel>
          <DropdownMenuRadioItem value="light" className="gap-2">
            <Sun className="size-3.5" /> {t("themeLight")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <Moon className="size-3.5" /> {t("themeDark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <SunMoon className="size-3.5" /> {t("themeSystem")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <LocaleSwitcher />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/account")} className="gap-2">
          <UserRound className="size-3.5" /> {t("account")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2 text-destructive-text focus:text-destructive-text">
          <LogOut className="size-3.5" /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
