import type { Meta, StoryObj } from "@storybook/react-vite";

import { StockStatusBadge } from "@/shared/ui/stock-status-badge";

const meta = {
  title: "UI/StockStatusBadge",
  component: StockStatusBadge,
  args: { status: "in-stock" },
  argTypes: {
    status: {
      control: "select",
      options: ["in-stock", "low-stock", "out-of-stock", "on-transit"],
    },
  },
} satisfies Meta<typeof StockStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = { args: { status: "in-stock" } };
export const LowStock: Story = { args: { status: "low-stock" } };
export const OutOfStock: Story = { args: { status: "out-of-stock" } };
export const OnTransit: Story = { args: { status: "on-transit" } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StockStatusBadge status="in-stock" />
      <StockStatusBadge status="low-stock" />
      <StockStatusBadge status="out-of-stock" />
      <StockStatusBadge status="on-transit" />
    </div>
  ),
};
