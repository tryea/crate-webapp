import { notFound } from "next/navigation";

/**
 * FR-30 (D-08): the sign-up door stays closed until FR-29 separates tenants.
 *
 * `notFound()` rather than a disabled form or a redirect: the API behind the
 * form is closed too (see src/shared/lib/auth/sign-up-gate), so rendering the
 * form would only advertise an account the server refuses to create. A real 404
 * is the honest answer for a route that is not open.
 *
 * FR-29 hand-off: `return <SignUpForm />` from ./sign-up-form.
 */
export default function SignUpPage() {
  notFound();
}
