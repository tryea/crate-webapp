import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "@/shared/ui/input";

const meta = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "Search SKUs…" },
  parameters: { layout: "padded" },
  render: (args) => (
    <div className="w-72">
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: "Acme Widget 12mm" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "Read-only" } };
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "Invalid SKU" },
};
