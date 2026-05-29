"use client";

import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { dateStampedFilename, downloadCsv } from "@/shared/lib/csv/export";

export function ReportSection<T extends Record<string, unknown>>({
  title,
  description,
  rows,
  preview,
  filenameBase,
}: {
  title: string;
  description: string;
  rows: T[];
  preview: React.ReactNode;
  filenameBase: string;
}) {
  function handleExport() {
    downloadCsv(dateStampedFilename(filenameBase), rows);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          onClick={handleExport}
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={rows.length === 0}
        >
          <Download className="size-3.5" /> CSV ({rows.length})
        </Button>
      </CardHeader>
      <CardContent>{preview}</CardContent>
    </Card>
  );
}
