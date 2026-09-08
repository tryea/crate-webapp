import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";
import { demoEntryEnabled } from "@/shared/lib/auth/demo-entry";

/**
 * FR-31: whether the demo door exists is a SERVER fact (two env vars), and it
 * has to be read per REQUEST, not per build. `output: "standalone"` means this
 * image is compiled once and then run in an environment configured later, so a
 * value captured at `next build` would describe the build machine and not the
 * running deployment. That is NEXT-GOTCHAS 7 and 21 in one line, and the cost
 * of avoiding it is one server render of a form that was already interactive.
 */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm demoEnabled={demoEntryEnabled()} />
    </Suspense>
  );
}
