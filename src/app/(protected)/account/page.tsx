import type { ReactNode } from "react";
import { getFormatter } from "next-intl/server";
import { requireRole } from "@/shared/lib/auth/require-role";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { SignOutButton } from "./_components/sign-out-button";

/**
 * Profile / account page: the destination for the topbar user-menu "Account"
 * item. Before this existed the menu pushed to a non-existent /account, which
 * surfaced the generic error boundary. Everyone can view their own account, so
 * the gate is the baseline "staff".
 */
export default async function AccountPage() {
  const { user } = await requireRole("staff");
  const format = await getFormatter();

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Name", value: user.name ?? "none" },
    { label: "Email", value: user.email },
    {
      label: "Role",
      value: (
        <Badge variant="outline" className="font-mono uppercase tracking-wider">
          {user.role}
        </Badge>
      ),
    },
    {
      label: "Member since",
      value: format.dateTime(new Date(user.createdAt), "date"),
    },
    {
      label: "Account ID",
      value: (
        <span className="font-mono text-xs text-muted-foreground">{user.id}</span>
      ),
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.name ?? user.email}
        </h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Your account details. Roles are managed by an admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col divide-y divide-border/60">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-4 py-2.5 text-sm"
              >
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="min-w-0 truncate text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SignOutButton />
      </div>
    </main>
  );
}
