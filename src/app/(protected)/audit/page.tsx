import { requireRole } from "@/shared/lib/auth/require-role";
import { listAuditLogServer } from "@/entities/audit-log/api/server";
import { AuditTable } from "./_components/audit-table";

export default async function AuditLogPage() {
  await requireRole("manager");
  const rows = await listAuditLogServer(1000);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          Insights
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every protected mutation. Joined to the user that performed it.
        </p>
      </header>

      <AuditTable rows={rows} />
    </main>
  );
}
