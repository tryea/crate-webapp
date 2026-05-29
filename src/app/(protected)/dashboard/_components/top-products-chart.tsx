"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONEY_COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const MONEY_FULL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface TopProductRow {
  productId: string;
  sku: string;
  name: string;
  value: number;
  qty: number;
  wac: number;
}

export function TopProductsChart({ data }: { data: TopProductRow[] }) {
  // Recharts wants `name` for the categorical axis. Use SKU as the
  // identifier (compact, mono-ish) — the tooltip surfaces the full name.
  const chartData = data.map((d) => ({
    name: d.sku,
    fullName: d.name,
    value: Math.round(d.value),
    qty: d.qty,
    wac: d.wac,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
      >
        <CartesianGrid
          horizontal={false}
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          opacity={0.4}
        />
        <XAxis
          type="number"
          stroke="var(--color-muted-foreground)"
          tick={{ fontSize: 11, fill: "currentColor" }}
          tickFormatter={(v) => MONEY_COMPACT.format(v as number)}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--color-muted-foreground)"
          tick={{ fontSize: 10, fill: "currentColor", fontFamily: "var(--font-mono)" }}
          width={70}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
            padding: "8px 10px",
          }}
          labelStyle={{ color: "var(--color-popover-foreground)", fontWeight: 600 }}
          itemStyle={{ color: "var(--color-popover-foreground)" }}
          formatter={((value: unknown, _name: unknown, item: unknown) => {
            const v = typeof value === "number" ? value : Number(value);
            const payload = (item as { payload?: { fullName: string; qty: number; wac: number } }).payload;
            if (!payload) return [MONEY_FULL.format(v), ""];
            return [
              `${MONEY_FULL.format(v)}  · ${payload.qty} × ${MONEY_FULL.format(payload.wac)}`,
              payload.fullName,
            ];
          }) as never}
        />
        <Bar
          dataKey="value"
          fill="var(--color-primary)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
