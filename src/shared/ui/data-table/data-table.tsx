"use client";

import { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTablePagination } from "./data-table-pagination";
import { DENSITY_CLASSES, useDensity } from "./density";
import { cn } from "@/shared/lib/utils";

/**
 * Reusable DataTable: the workhorse for catalog, movements, POs, audit.
 *
 * Features (all opt-in via flags; sensible defaults):
 *   - Sort (click column header, asc → desc → none)
 *   - Global filter (toolbar input filters across all columns)
 *   - Pagination (TanStack's paginated row model; disabled when virtualize=true)
 *   - Sticky header
 *   - Density toggle (compact / normal / comfortable, persisted via localStorage)
 *   - Virtualization for long lists (@tanstack/react-virtual)
 *   - EmptyState slot when filtered rows = 0
 *
 * Per ui-audit principles + COUNCIL §6 (data-dense done elegantly):
 *  - Sticky thead remains readable when scrolling deep lists
 *  - Hover state communicates row interactivity, doesn't fire on tap-targets
 *  - Numeric columns right-aligned via column meta
 *  - Empty state is guided, not "No results."
 *
 * Numeric alignment: pass `meta: { align: "right" }` in your ColumnDef.
 */
import {
  matchesSearchQuery,
  rowHaystack,
  type RowSearchValue,
} from "./global-filter";

export type ColumnAlign = "left" | "right" | "center";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: ColumnAlign;
    /**
     * Text this column contributes to the global filter. Needed only when the
     * rendered text is not reachable from the row itself, for example a name
     * resolved through a lookup map. Columns whose text lives in the row are
     * searched already.
     */
    searchValue?: RowSearchValue<TData>;
  }
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 50,
  virtualize = false,
  globalFilter: globalFilterProp,
  onGlobalFilterChange: onGlobalFilterChangeProp,
  filterPlaceholder,
  emptyState,
  toolbarRightSlot,
  className,
  stickyHeader = true,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pageSize?: number;
  virtualize?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (next: string) => void;
  filterPlaceholder?: string;
  emptyState?: React.ReactNode;
  toolbarRightSlot?: React.ReactNode;
  className?: string;
  stickyHeader?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filterInternal, setFilterInternal] = useState("");

  const searchValues = useMemo(
    () =>
      columns
        .map((column) => column.meta?.searchValue)
        .filter((read): read is RowSearchValue<T> => typeof read === "function"),
    [columns],
  );

  // Built once per data change rather than once per keystroke per column:
  // TanStack calls the filter for every globally filterable column of a row.
  const haystacks = useMemo(() => {
    const cache = new WeakMap<object, string>();
    for (const row of data) {
      if (row && typeof row === "object") {
        cache.set(row as object, rowHaystack(row, searchValues));
      }
    }
    return cache;
  }, [data, searchValues]);

  const isFilterControlled = globalFilterProp !== undefined;
  const globalFilter = isFilterControlled ? globalFilterProp : filterInternal;
  const setGlobalFilter = isFilterControlled
    ? (next: string) => onGlobalFilterChangeProp?.(next)
    : setFilterInternal;

  // TanStack Table is a known library hook that the React 19 lint can't verify.
  // It handles its own memoization internally; the false-positive is benign.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Search the row, not the column. Without both of these TanStack decides
    // which columns are searchable from the value types of the FIRST row, and
    // skips every column declared with `cell` alone. See ./global-filter.ts.
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, _columnId, value) => {
      const original = row.original as unknown;
      const cached =
        original && typeof original === "object"
          ? haystacks.get(original as object)
          : undefined;
      const haystack = cached ?? rowHaystack(row.original, searchValues);
      return matchesSearchQuery(haystack, String(value ?? ""));
    },
    getPaginationRowModel: virtualize ? undefined : getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const { density } = useDensity();
  const dc = DENSITY_CLASSES[density];

  const visibleRows = virtualize
    ? table.getFilteredRowModel().rows
    : table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => dc.estPx,
    overscan: 8,
    enabled: virtualize,
  });

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  function renderHeaderSortIcon(canSort: boolean, sort: false | "asc" | "desc") {
    if (!canSort) return null;
    if (sort === "asc") return <ArrowUp className="size-3 ml-1 inline-block" />;
    if (sort === "desc") return <ArrowDown className="size-3 ml-1 inline-block" />;
    return <ChevronsUpDown className="size-3 ml-1 inline-block text-muted-foreground/40" />;
  }

  function alignClass(a?: ColumnAlign) {
    return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <DataTableToolbar
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        filterPlaceholder={filterPlaceholder}
        rightSlot={toolbarRightSlot}
      />

      <div
        ref={scrollRef}
        tabIndex={virtualize ? 0 : undefined}
        className={cn(
          "relative overflow-auto rounded-md border border-border bg-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          virtualize ? "max-h-[70svh]" : "",
        )}
      >
        <table className="w-full text-sm">
          <thead
            className={cn(
              "bg-muted/40 text-muted-foreground",
              stickyHeader && "sticky top-0 z-10 backdrop-blur",
            )}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => {
                  const sort = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const align = (header.column.columnDef.meta as { align?: ColumnAlign } | undefined)?.align;
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "px-3 font-medium tracking-tight whitespace-nowrap",
                        dc.head,
                        alignClass(align),
                        canSort && "cursor-pointer select-none hover:text-foreground",
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      aria-sort={
                        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {renderHeaderSortIcon(canSort, sort)}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getAllColumns().length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyState ?? "No rows."}
                </td>
              </tr>
            ) : virtualize ? (
              <>
                {virtualItems.length > 0 && virtualItems[0].start > 0 ? (
                  <tr aria-hidden style={{ height: virtualItems[0].start }} />
                ) : null}
                {virtualItems.map((vi) => {
                  const row = visibleRows[vi.index];
                  return (
                    <tr
                      key={row.id}
                      data-index={vi.index}
                      className="border-b border-border last:border-b-0 hover:bg-muted/40"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const align = (cell.column.columnDef.meta as { align?: ColumnAlign } | undefined)?.align;
                        return (
                          <td
                            key={cell.id}
                            className={cn("px-3", dc.row, alignClass(align))}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {virtualItems.length > 0 &&
                virtualItems[virtualItems.length - 1].end < totalSize ? (
                  <tr
                    aria-hidden
                    style={{
                      height: totalSize - virtualItems[virtualItems.length - 1].end,
                    }}
                  />
                ) : null}
              </>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/40"
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: ColumnAlign } | undefined)?.align;
                    return (
                      <td
                        key={cell.id}
                        className={cn("px-3", dc.row, alignClass(align))}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!virtualize ? <DataTablePagination table={table} /> : null}
    </div>
  );
}
