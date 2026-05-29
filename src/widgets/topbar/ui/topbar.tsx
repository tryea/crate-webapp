import { UserMenu } from "./user-menu";

export function Topbar({
  pageTitle,
  user,
  actions,
  leading,
}: {
  pageTitle?: string;
  user: { name: string | null | undefined; email: string; role: string };
  /**
   * Slot for elements like the command-palette launcher. Composed by the
   * (protected) layout so the topbar doesn't reach across into another
   * widget (DEC-002: widgets cannot import siblings).
   */
  actions?: React.ReactNode;
  /**
   * Leading slot (rendered before the title) for the mobile nav trigger.
   * Same DEC-002 reasoning as `actions`: the sidebar widget owns MobileNav,
   * so the layout passes it in rather than the topbar importing a sibling.
   */
  leading?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {leading}
      <h1 className="text-sm font-medium text-foreground/90">
        {pageTitle ?? "Crate"}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {actions}
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
