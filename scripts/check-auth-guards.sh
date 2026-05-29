#!/usr/bin/env bash
# DEC-003 CI guardrail.
#
# Fails if any file under src/app/**/{route.ts,actions.ts} (i.e. any Server
# Action or route handler) does NOT call `requireRole(...)` AND is not in
# the public-endpoint allowlist.
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

# Collect every server-side handler file (portable: macOS bash 3.2 lacks mapfile)
handlers=()
while IFS= read -r line; do
  handlers+=("$line")
done < <(find src/app -type f \( -name "route.ts" -o -name "actions.ts" \) | sort)

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
done

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "Auth-guard check FAILED — $violations unguarded handler(s)."
  echo "See DEC-003: every protected mutation must call requireRole()."
  exit 1
fi

echo "✓ Auth-guard check passed (${total} handlers scanned)."
