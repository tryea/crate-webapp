#!/usr/bin/env bash
# FR-29 CI guardrail, the read-side counterpart to check-auth-guards.sh.
#
# Fails if a read surface reaches the bare `db` handle instead of going through
# `withReadContext`. Ticket 989 bound every read under src/app/(protected), the
# nine entity api/server.ts read modules and the sidebar widget; without a
# sweep the next read added anywhere in there would quietly go back to being
# unbound, and the FR-29 survey already recorded what that costs: a tenant
# policy that holds on writes and is ignored on every screen
# (src/db/rls/TENANT-SEPARATION.md §3).
#
# Why the module path and not the symbol: `db` can arrive as a named import, a
# namespace import or a require, and a check that knows only the first shape
# reports a clean tree while half of it was never looked at. Any mention of the
# client module in a read surface is the violation.
#
# Usage: ./scripts/check-read-binding.sh
# Exit:  0 = green · 1 = at least one unbound read surface.

set -euo pipefail

# Read surfaces that legitimately hold the bare handle.
# Add a justification comment when extending.
ALLOWLIST=(
  # FR-32 waitlist. Public by design: the row is left by a stranger on the
  # marketing page who has no account, so there is no identity to bind it to,
  # and its route is already in check-auth-guards.sh's public allowlist for the
  # same reason. Binding it would refuse the one caller it exists for.
  "src/entities/waitlist/api/server.ts"
)

CLIENT_MODULE='db/client'

mapfile -t files < <(
  {
    find 'src/app/(protected)' -type f \( -name '*.ts' -o -name '*.tsx' \)
    find src/entities -type f -path '*/api/server.ts'
    find src/widgets -type f \( -name '*.ts' -o -name '*.tsx' \)
  } | sort
)

total=0
violations=0

for f in "${files[@]}"; do
  skip=0
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$f" == "$allowed" ]]; then
      skip=1
      break
    fi
  done
  if [[ $skip -eq 1 ]]; then
    continue
  fi

  total=$((total + 1))

  if grep -qE "(from|require\()\s*[\"'][^\"']*${CLIENT_MODULE}[\"']" "$f"; then
    echo "✗ UNBOUND READ SURFACE: $f"
    echo "    expected: reads go through withReadContext(...) from @/shared/lib/auth/read-context"
    echo "    or add this path to ALLOWLIST with justification"
    violations=$((violations + 1))
  fi
done

if [[ ${#files[@]} -eq 0 ]]; then
  echo "Read-binding check FAILED: scanned 0 files, the find patterns are wrong."
  exit 1
fi

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "Read-binding check FAILED: $violations unbound read surface(s)."
  echo "See FR-29 / ticket 989: every protected read runs inside a database identity."
  exit 1
fi

echo "✓ Read-binding check passed (${total} read surfaces scanned, ${#ALLOWLIST[@]} allowlisted)."
