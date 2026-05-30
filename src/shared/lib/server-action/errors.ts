/**
 * DEC-023 — fail-closed handler for the *unexpected* branch of a server
 * action's catch block.
 *
 * The leak it closes: every entity action used to end its catch with
 *   `const message = err instanceof Error ? err.message : "Database error";
 *    return { ok: false, error: message };`
 * and the client renders that straight into a toast (`toast.error(res.error)`).
 * So an *unhandled* DB error piped `err.message` — raw SQL, table/column
 * names ("Failed query: select COALESCE(SUM…") — to the operator. That is
 * class-wide info disclosure (OWASP), witnessed during the DEC-013 RED.
 *
 * The fix is a two-class model, enforced at the call site:
 *  - **Authored / expected** branches (Zod validation, unique-constraint
 *    `*_idx`, and the throw-sentinels `INSUFFICIENT_STOCK::`, `PO_*::`,
 *    `OVER_RECEIVE::`) keep returning their hand-written safe strings —
 *    they're useful, non-leaking business signals. This helper does NOT
 *    touch them.
 *  - **Unexpected / unknown** branches (the fall-through) delegate HERE:
 *    the real cause is logged server-side for diagnostics, and a generic,
 *    actionable message is returned to the client. We close the leak
 *    without going blind.
 *
 * `context` is a short, non-sensitive label (e.g. "stockIn", "receivePo")
 * that tags the server log so an on-call engineer can find the cause —
 * it is NOT returned to the client.
 *
 * `userMessage` overrides the default only where a domain word genuinely
 * helps (e.g. import rollback). Keep overrides generic — never interpolate
 * `err`/`err.message` into them, or you re-open the leak this closes.
 *
 * Returns the `false` arm of `ActionResult<T>` (generic-independent), so it
 * slots into any action regardless of its success type.
 */

const GENERIC_ACTION_ERROR = "Something went wrong. Please try again.";

export function unexpectedActionError(
  err: unknown,
  context: string,
  userMessage: string = GENERIC_ACTION_ERROR,
): { ok: false; error: string } {
  console.error(`[action:${context}]`, err);
  return { ok: false, error: userMessage };
}
