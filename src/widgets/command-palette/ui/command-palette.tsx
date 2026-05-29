"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ClipboardList,
  ClipboardPlus,
  FileBarChart,
  Gauge,
  Package,
  ScrollText,
  Settings,
  Warehouse,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/shared/ui/command";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("command");

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>

        <CommandGroup heading={t("groupNavigate")}>
          <CommandItem onSelect={() => go("/dashboard")}>
            <Gauge /> {t("dashboard")}
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/catalog")}>
            <Package /> {t("catalog")}
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/movements")}>
            <ArrowDownUp /> {t("movements")}
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/orders")}>
            <ClipboardList /> {t("orders")}
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/reports")}>
            <FileBarChart /> {t("reports")}
          </CommandItem>
          <CommandItem onSelect={() => go("/audit")}>
            <ScrollText /> {t("audit")}
          </CommandItem>
          <CommandItem onSelect={() => go("/warehouses")}>
            <Warehouse /> {t("warehouses")}
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings /> {t("settings")}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("groupActions")}>
          <CommandItem onSelect={() => go("/movements/new/stock-in")}>
            <ArrowDown /> {t("stockIn")}
          </CommandItem>
          <CommandItem onSelect={() => go("/movements/new/stock-out")}>
            <ArrowUp /> {t("stockOut")}
          </CommandItem>
          <CommandItem onSelect={() => go("/movements/new/transfer")}>
            <ArrowDownUp /> {t("transfer")}
          </CommandItem>
          <CommandItem onSelect={() => go("/orders/new")}>
            <ClipboardPlus /> {t("createOrder")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
