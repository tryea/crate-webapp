"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  PackageOpen,
  RefreshCcw,
  Upload,
  XCircle,
} from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { downloadCsv } from "@/shared/lib/csv/export";
import { toast } from "@/shared/lib/toast/toast";
import {
  importProductsAction,
  PRODUCT_IMPORT_CSV_HEADERS,
  productImportRowSchema,
  type ProductImportResult,
} from "@/entities/product";

type ParsedState =
  | { status: "idle" }
  | { status: "parsing"; fileName: string }
  | {
      status: "parsed";
      fileName: string;
      rawRows: Array<Record<string, unknown>>;
      preview: PreviewRow[];
      validRows: Array<Record<string, unknown>>;
    }
  | { status: "submitting"; fileName: string }
  | { status: "done"; fileName: string; result: ProductImportResult };

interface PreviewRow {
  rowNumber: number; // 1-indexed (header = 1, data = 2..)
  sku: string;
  name: string;
  ok: boolean;
  error?: string;
}

const TEMPLATE_SAMPLE: Record<string, string> = {
  sku: "BEV-001",
  name: "Mineral Water 600ml",
  description: "",
  image_url: "",
  unit: "btl",
  barcode: "",
  category_slug: "beverages",
  supplier_name: "Aria Distributors",
  reorder_point: "24",
  cost_price: "1500.00",
  selling_price: "3500.00",
  is_active: "true",
};

export function ProductImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<ParsedState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function reset() {
    setState({ status: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function downloadTemplate() {
    downloadCsv(
      "products-import-template.csv",
      [TEMPLATE_SAMPLE],
      { fields: PRODUCT_IMPORT_CSV_HEADERS as unknown as ReadonlyArray<string> },
    );
  }

  function handleFile(file: File) {
    setState({ status: "parsing", fileName: file.name });
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawRows = results.data;
        if (rawRows.length === 0) {
          toast.error("No rows found in CSV.");
          setState({ status: "idle" });
          return;
        }
        if (rawRows.length > 5000) {
          toast.error("Maximum 5,000 rows per import. Split the file.");
          setState({ status: "idle" });
          return;
        }

        const preview: PreviewRow[] = [];
        const validRows: Array<Record<string, unknown>> = [];

        rawRows.forEach((raw, i) => {
          const parsed = productImportRowSchema.safeParse(raw);
          const rowNumber = i + 2;
          const sku = String(raw?.sku ?? "").trim() || "none";
          const name = String(raw?.name ?? "").trim() || "none";

          if (parsed.success) {
            preview.push({ rowNumber, sku, name, ok: true });
            validRows.push(raw);
          } else {
            const issue = parsed.error.issues[0];
            const field = issue?.path?.[0] ?? "row";
            preview.push({
              rowNumber,
              sku,
              name,
              ok: false,
              error: `${String(field)}: ${issue?.message ?? "invalid"}`,
            });
          }
        });

        setState({
          status: "parsed",
          fileName: file.name,
          rawRows,
          preview,
          validRows,
        });
      },
      error: (err) => {
        toast.error(`Parse failed: ${err.message}`);
        setState({ status: "idle" });
      },
    });
  }

  function handleSubmit() {
    if (state.status !== "parsed" || state.validRows.length === 0) return;
    const valid = state.validRows;
    const fileName = state.fileName;
    startTransition(async () => {
      setState({ status: "submitting", fileName });
      const res = await importProductsAction(valid);
      if (!res.ok) {
        toast.error(res.error);
        setState({ status: "idle" });
        return;
      }
      toast.success(
        `Imported ${res.data.inserted + res.data.updated} of ${res.data.totalRows}`,
      );
      setState({ status: "done", fileName, result: res.data });
      router.refresh();
    });
  }

  const validCount =
    state.status === "parsed" ? state.preview.filter((p) => p.ok).length : 0;
  const invalidCount =
    state.status === "parsed" ? state.preview.filter((p) => !p.ok).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV template</CardTitle>
          <CardDescription>
            Use lowercase snake_case headers. Required: <code>sku</code>,{" "}
            <code>name</code>. Optional FKs (<code>category_slug</code>,{" "}
            <code>supplier_name</code>) resolve to ids server-side; unknown
            lookups null the FK rather than rejecting the row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={downloadTemplate} variant="outline" size="sm" className="gap-1.5">
              <Download className="size-3.5" /> Download template
            </Button>
            <p className="text-xs text-muted-foreground">
              Headers (in order):{" "}
              {(PRODUCT_IMPORT_CSV_HEADERS as readonly string[]).map((h: string, i: number) => (
                <span key={h}>
                  <code className="font-mono">{h}</code>
                  {i < PRODUCT_IMPORT_CSV_HEADERS.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          </div>
        </CardContent>
      </Card>

      {state.status === "idle" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pick a file</CardTitle>
            <CardDescription>
              Drag &amp; drop coming in Phase 8 polish, file picker for now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/20 px-6 py-12 text-sm text-muted-foreground hover:bg-muted/40">
              <FileUp className="size-4" aria-hidden="true" />
              <span>Click to choose a .csv file (max 5,000 rows)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </CardContent>
        </Card>
      ) : null}

      {state.status === "parsing" ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Parsing {state.fileName}…
            </div>
          </CardContent>
        </Card>
      ) : null}

      {state.status === "parsed" ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Preview · {state.fileName}</CardTitle>
                <CardDescription>
                  {validCount} valid · {invalidCount} invalid, only valid rows submit.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={reset} variant="ghost" size="sm" className="gap-1.5">
                  <RefreshCcw className="size-3.5" /> Reset
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={validCount === 0 || isPending}
                  className="gap-1.5"
                >
                  <Upload className="size-3.5" />
                  {isPending ? "Importing…" : `Import ${validCount}`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PreviewTable rows={state.preview} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {state.status === "submitting" ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Importing…
            </div>
          </CardContent>
        </Card>
      ) : null}

      {state.status === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Done
            </CardTitle>
            <CardDescription>
              {state.result.inserted} inserted · {state.result.updated} updated ·{" "}
              {state.result.errors} errors out of {state.result.totalRows}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResultTable result={state.result} />
            <div className="mt-4 flex items-center gap-2">
              <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
                <RefreshCcw className="size-3.5" /> Import another
              </Button>
              <Button
                onClick={() => router.push("/catalog")}
                size="sm"
                className="gap-1.5"
              >
                <PackageOpen className="size-3.5" /> Open catalog
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={PackageOpen} title="Nothing to preview" />;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border max-h-[50svh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/40 text-muted-foreground backdrop-blur">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-xs font-medium">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium">SKU</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.rowNumber}
              className={cn(
                "border-b border-border last:border-b-0",
                !r.ok && "bg-destructive/5",
              )}
            >
              <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                {r.rowNumber}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.sku}</td>
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5">
                {r.ok ? (
                  <Badge variant="outline" className="border-success/20 bg-success/10 text-success-text font-medium">
                    Valid
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-destructive-text">
                    <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{r.error}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultTable({ result }: { result: ProductImportResult }) {
  if (result.perRow.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border max-h-[50svh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/40 text-muted-foreground backdrop-blur">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-xs font-medium">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium">SKU</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {result.perRow.map((r: ProductImportResult["perRow"][number]) => (
            <tr
              key={r.rowNumber}
              className={cn(
                "border-b border-border last:border-b-0",
                r.status === "error" && "bg-destructive/5",
              )}
            >
              <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                {r.rowNumber}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">{r.sku ?? "none"}</td>
              <td className="px-3 py-1.5">
                {r.status === "inserted" && (
                  <Badge variant="outline" className="border-success/20 bg-success/10 text-success-text">
                    Inserted
                  </Badge>
                )}
                {r.status === "updated" && (
                  <Badge variant="outline" className="border-info/20 bg-info/10 text-info-text">
                    Updated
                  </Badge>
                )}
                {r.status === "skipped" && (
                  <Badge variant="outline" className="border-muted text-muted-foreground-strong">
                    Skipped
                  </Badge>
                )}
                {r.status === "error" && (
                  <div className="flex items-center gap-2 text-xs text-destructive-text">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>{r.error}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
