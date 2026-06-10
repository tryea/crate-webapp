#!/usr/bin/env bash
# DEC-003 CI guardrail.
#
# Fails if any route.ts / actions.ts under the FSD layout (src/app, src/entities,
# src/features, src/widgets, src/screens — see the find on line ~34, the real
# mutation surface lives in src/entities/*/api/actions.ts) does NOT call
# `requireRole(...)` AND is not in the public-endpoint allowlist.
#
# Rationale (COUNCIL §3.4 + DEC-003 R4): the most-likely real-world auth
# failure is a route handler shipped without an auth check. Compile-time
# grep makes the safe path the path of least resistance.
#
# Usage: ./scripts/check-auth-guards.sh
# Exit:  0 = green · 1 = at least one unguarded handler.

set -euo pipefail

# Public endpoints that legitimately do NOT call requireRole().
# Add a justification comment when extending.
PUBLIC_ALLOWLIST=(
  # BetterAuth's own catch-all — handles its own auth + rate-limiting.
  "src/app/api/auth/[...all]/route.ts"
)

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# Collect every server-side handler file across the FSD layout
# (route.ts + actions.ts in app/, entities/, features/ — anywhere
# Server Actions or route handlers can land per DEC-002).
# Portable: macOS bash 3.2 lacks mapfile.
handlers=()
while IFS= read -r line; do
  handlers+=("$line")
done < <(find src/app src/entities src/features src/widgets src/screens -type f \( -name "route.ts" -o -name "actions.ts" \) 2>/dev/null | sort)

violations=0
total=${#handlers[@]}
for f in "${handlers[@]}"; do
  # Skip if file matches an allowlist entry
  skip=0
  for allowed in "${PUBLIC_ALLOWLIST[@]}"; do
    if [[ "$f" == "$allowed" ]]; then
      skip=1
      break
    fi
  done
  if [[ $skip -eq 1 ]]; then
    continue
  fi

  # File must mention `requireRole(` somewhere
  if ! grep -q "requireRole(" "$f"; then
    echo "✗ UNGUARDED: $f"
    echo "    expected: call to requireRole(<role>) inside this handler"
    echo "    or add this path to PUBLIC_ALLOWLIST with justification"
    violations=$((violations + 1))
  fi

  # Issue #2 guardrail: any handler that WRITES to the DB must bind the RLS
  # user context. Direct `db.transaction(` / `db.insert|update|delete(` in a
  # handler means the write skips `withUserContext` → the 0003 policies see
  # an unbound query and the per-user enforcement silently does not apply.
  # Reads (`db.select`) stay allowed unbound — list pages don't need binding.
  if grep -qE "db\.(transaction|insert|update|delete)\(" "$f"; then
    if ! grep -q "withUserContext(" "$f"; then
      echo "✗ UNBOUND WRITE: $f"
      echo "    expected: DB writes wrapped in withUserContext(user.id, user.role, ...)"
      echo "    (direct db.transaction/insert/update/delete bypasses RLS user binding)"
      violations=$((violations + 1))
    fi
  fi
done

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "Auth-guard check FAILED — $violations unguarded handler(s)."
  echo "See DEC-003: every protected mutation must call requireRole()."
  exit 1
fi

echo "✓ Auth-guard check passed (${total} handlers scanned)."
