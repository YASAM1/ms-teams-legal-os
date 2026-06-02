#!/usr/bin/env bash
# Push every variable in .env.local to all three Vercel environments
# (production, preview, development) in one shot — so you don't have to
# run `vercel env add` dozens of times by hand.
#
# Usage, from the project root:
#   bash scripts/push-env-to-vercel.sh
#
# Safe to re-run: variables that already exist on Vercel are left alone.

set -uo pipefail

ENV_FILE="${1:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Can't find $ENV_FILE — make sure you run this from your project root." >&2
  exit 1
fi

# DATABASE_URL is provided by the Vercel/Neon integration already; NODE_ENV
# should not be set manually. Skip both.
SKIP="DATABASE_URL NODE_ENV"

pushed=0
while IFS='=' read -r key value; do
  # skip blank lines and comments
  [ -z "${key:-}" ] && continue
  case "$key" in \#*) continue ;; esac
  # skip Vercel-managed / reserved keys
  case " $SKIP " in *" $key "*) echo "—  $key (managed by Vercel, skipped)"; continue ;; esac
  # trim one layer of surrounding single or double quotes
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  # skip keys you haven't filled in yet (optional features)
  [ -z "$value" ] && { echo "—  $key (empty, skipped)"; continue ; }

  for target in production preview development; do
    if printf '%s' "$value" | vercel env add "$key" "$target" >/dev/null 2>&1; then
      echo "✓  $key → $target"
      pushed=$((pushed + 1))
    else
      echo "•  $key → $target (already set, left as-is)"
    fi
  done
done < "$ENV_FILE"

echo
echo "Done — pushed $pushed value(s)."
echo "Now redeploy so the bot picks them up:  vercel --prod"
