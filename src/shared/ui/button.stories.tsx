import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@/shared/ui/button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Outline: Story = { args: { variant: "outline" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Link: Story = { args: { variant: "link" } };
export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">XS</Button>
      <Button size="sm">SM</Button>
      <Button size="default">Default</Button>
      <Button size="lg">LG</Button>
    </div>
  ),
};
