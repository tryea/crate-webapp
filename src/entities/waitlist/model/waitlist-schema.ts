import { z } from "zod";

/**
 * Longest address Postgres will ever be asked to hold: RFC 5321 caps a
 * forward-path at 256 octets including the angle brackets, so 254 is the
 * largest address that can actually be delivered. Anything longer is not a
 * short address that got unlucky, it is somebody probing what the endpoint
 * will swallow.
 */
export const WAITLIST_EMAIL_MAX_LENGTH = 254;

/**
 * The only shape `POST /api/waitlist` accepts.
 *
 * Three deliberate properties, all of them load-bearing for an endpoint that
 * strangers on the open internet can call:
 *
 * 1. `strictObject` REJECTS unknown keys instead of ignoring them. A lenient
 *    object would accept `{ email, body, subject, to }` and quietly drop the
 *    extras, which is precisely the shape of a payload written by somebody
 *    hoping the endpoint forwards content somewhere. Here there is nothing to
 *    drop it into: the request is refused whole.
 * 2. Trim and lowercase run BEFORE the format check, so the value that reaches
 *    the UNIQUE constraint is already canonical. ` A@B.com ` and `a@b.com` are
 *    the same row, not two.
 * 3. The length ceiling is applied to the canonical value, so padding an
 *    address with whitespace cannot be used to slip past it.
 */
export const waitlistSignupSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email("Enter a valid email address.")
        .max(WAITLIST_EMAIL_MAX_LENGTH, "That address is too long."),
    ),
});

export type WaitlistSignupInput = z.input<typeof waitlistSignupSchema>;
export type WaitlistSignupValues = z.output<typeof waitlistSignupSchema>;
