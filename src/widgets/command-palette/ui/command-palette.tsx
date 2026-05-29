"use client";

import { useRouter } from "next/navigation";
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

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search or jump…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/dashboard")}>
            <Gauge /> Dashboard
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/catalog")}>
            <Package /> Catalog
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/movements")}>
            <ArrowDownUp /> Movements
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/orders")}>
            <ClipboardList /> Purchase orders
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/reports")}>
            <FileBarChart /> Reports
          </CommandItem>
          <CommandItem onSelect={() => go("/audit")}>
            <ScrollText /> Audit log
          </CommandItem>
          <CommandItem onSelect={() => go("/warehouses")}>
            <Warehouse /> Warehouses
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings /> Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/movements/new/stock-in")}>
            <ArrowDown /> Stock in (receive)
          </CommandItem>
          <CommandItem onSelect={() => go("/movements/new/stock-out")}>
            <ArrowUp /> Stock out (issue)
          </CommandItem>
          <CommandItem onSelect={() => go("/movements/new/transfer")}>
            <ArrowDownUp /> Transfer
          </CommandItem>
          <CommandItem onSelect={() => go("/orders/new")}>
            <ClipboardPlus /> Create purchase order
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
