#!/usr/bin/env bash
set -euo pipefail

put_secret() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    return 0
  fi

  printf '%s' "$value" | npx wrangler secret put "$name"
}

put_secret NEXT_PUBLIC_SUPABASE_URL "${NEXT_PUBLIC_SUPABASE_URL:-}"
put_secret NEXT_PUBLIC_SUPABASE_ANON_KEY "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
put_secret SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}"
put_secret ADMIN_LOGIN "${ADMIN_LOGIN:-}"
put_secret ADMIN_PASSWORD "${ADMIN_PASSWORD:-}"
put_secret DRAW_LOGIN "${DRAW_LOGIN:-}"
put_secret DRAW_PASSWORD "${DRAW_PASSWORD:-}"
