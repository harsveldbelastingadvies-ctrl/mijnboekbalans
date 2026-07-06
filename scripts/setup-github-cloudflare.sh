#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Gebruik: scripts/setup-github-cloudflare.sh <github-repo-url>"
  echo "Voorbeeld: scripts/setup-github-cloudflare.sh git@github.com:gebruikersnaam/boekbalans.git"
  exit 1
fi

repo_url="$1"

if [ ! -d ".git" ]; then
  git init -b main
fi

git rm -r --cached .pnpm-store >/dev/null 2>&1 || true

git add .
git commit -m "Prepare BoekBalans for GitHub and Cloudflare" || true

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$repo_url"
else
  git remote add origin "$repo_url"
fi

git push --force-with-lease -u origin main

echo
echo "Code staat op GitHub."
echo "Maak daarna in Cloudflare D1 aan:"
echo "  wrangler d1 create boekbalans"
echo
echo "Vul de database_id in wrangler.jsonc in en voer uit:"
echo "  wrangler d1 execute boekbalans --file=drizzle/0000_create_workspace_store.sql"
echo
echo "Zet in GitHub Actions secrets:"
echo "  CLOUDFLARE_API_TOKEN"
echo "  CLOUDFLARE_ACCOUNT_ID"
