import type { Meta, StoryObj } from "@storybook/react-vite";
import { PackageOpen, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoData: Story = {
  args: {
    icon: PackageOpen,
    title: "No products yet",
    description: "Add your first product to start tracking stock.",
    action: <Button size="sm">Add product</Button>,
  },
};

export const NoResults: Story = {
  args: {
    icon: SearchX,
    variant: "search",
    title: "No matches",
    description: "Try a different search term or clear your filters.",
    action: (
      <Button size="sm" variant="outline">
        Clear filters
      </Button>
    ),
  },
};

export const LoadError: Story = {
  args: {
    icon: TriangleAlert,
    variant: "error",
    title: "Couldn't load movements",
    description: "Something went wrong fetching the ledger.",
    action: (
      <Button size="sm" variant="outline">
        Retry
      </Button>
    ),
  },
};
