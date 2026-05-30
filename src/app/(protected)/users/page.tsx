import { requireRolePage } from "@/shared/lib/auth/require-role";
import { listUsersServer } from "@/entities/user/api/server";
import { UsersTable } from "./_components/users-table";

export default async function UsersPage() {
  await requireRolePage("admin");
  const rows = await listUsersServer();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Everyone with access to this workspace and the role that scopes what
          they can do. Roles are seeded for the demo — invite &amp; role
          management is on the roadmap.
        </p>
      </header>

      <UsersTable rows={rows} />
    </main>
  );
}
