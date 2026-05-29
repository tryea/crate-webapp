"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { toast } from "@/shared/lib/toast/toast";
import {
  setPoStatusAction,
  type PoStatusValue,
} from "@/entities/purchase-order";

export function PoHeaderActions({
  poId,
  status,
  hasLines,
}: {
  poId: string;
  status: PoStatusValue;
  hasLines: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(next: PoStatusValue) {
    startTransition(async () => {
      const res = await setPoStatusAction(poId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked as ${next}`);
      router.refresh();
    });
  }

  const canSend = status === "draft" && hasLines;
  const canCancel = status === "draft" || status === "sent" || status === "partial";

  return (
    <div className="flex items-center gap-2">
      {canSend ? (
        <Button
          size="sm"
          onClick={() => setStatus("sent")}
          disabled={isPending}
          className="gap-1.5"
        >
          <Send className="size-3.5" /> Mark sent
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStatus("cancelled")}
          disabled={isPending}
          className="gap-1.5"
        >
          <Ban className="size-3.5" /> Cancel
        </Button>
      ) : null}
    </div>
  );
}
