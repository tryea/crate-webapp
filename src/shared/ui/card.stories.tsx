import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Bayside Warehouse</CardTitle>
        <CardDescription>Primary distribution hub</CardDescription>
        <CardAction>
          <Button size="xs" variant="outline">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          1,284 SKUs tracked across 6 zones. Last sync 2 minutes ago.
        </p>
      </CardContent>
      <CardFooter>
        <span className="text-muted-foreground text-xs">Updated 2026-05-30</span>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Reorder alert</CardTitle>
        <CardDescription>3 items below threshold</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Riverbend clinic — compact density.</p>
      </CardContent>
    </Card>
  ),
};
