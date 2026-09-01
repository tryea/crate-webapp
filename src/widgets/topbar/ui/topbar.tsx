import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { Crumb } from "./crumb";

/**
 * Topbar and everything inside it follow the THEME (white in light mode);
 * only the rail stays constant. That split is deliberate: keep the sidebar
 * black, the topnav and its children go white.
 */
export function Topbar({
  crumbLabels,
  user,
  actions,
  leading,
}: {
  /**
   * path -> label, built by the (protected) layout. The nav tree belongs to
   * the sidebar widget and DEC-002 forbids one widget importing a sibling,
   * so the labels arrive as plain data instead.
   */
  crumbLabels: Record<string, string>;
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
    <header className="bar">
      {leading}
      <Crumb labels={crumbLabels} />
      <span className="sp" />
      {actions}
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} role={user.role} />
    </header>
  );
}
