#!/usr/bin/env bash
# Run in Terminal.app (outside Cursor) if `git init` fails inside the IDE
# (e.g. Operation not permitted on .git/hooks under ~/Documents).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]] || ! git rev-parse --git-dir >/dev/null 2>&1; then
  rm -rf .git
  git init
fi

git branch -M main 2>/dev/null || true

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/tylin496/timeless-wardrobe.git"
else
  git remote set-url origin "https://github.com/tylin496/timeless-wardrobe.git"
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit (already clean)."
else
  git commit -m "Initial commit: Timeless Wardrobe"
fi

if ! git push -u origin main; then
  echo "Push failed. If GitHub already has a README commit, try:"
  echo "  git pull origin main --rebase --allow-unrelated-histories"
  echo "  git push -u origin main"
  exit 1
fi
