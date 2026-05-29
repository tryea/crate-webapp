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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={t("ariaLabel")}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {initials}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-sm font-medium">{displayName}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {role}
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
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
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
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="size-3.5" /> {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
