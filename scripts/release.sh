#!/usr/bin/env bash
# Cut a release: bump the version, update CHANGELOG, commit, and tag — locally.
# Does NOT push or build (that's scripts/publish.sh).
#
#   scripts/release.sh            # patch bump (0.1.0 -> 0.1.1)
#   scripts/release.sh minor      # 0.1.0 -> 0.2.0
#   scripts/release.sh major      # 0.1.0 -> 1.0.0
#   scripts/release.sh 1.4.2      # explicit version
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BUMP="${1:-patch}"

command -v node >/dev/null || { echo "ERROR: Node.js required"; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is not clean — commit or stash changes first."; exit 1
fi

CONF="app/src-tauri/tauri.conf.json"
CUR="$(node -p "require('./$CONF').version")"
NEXT="$(node -e '
  const [cur, bump] = process.argv.slice(1);
  if (/^\d+\.\d+\.\d+$/.test(bump)) { console.log(bump); process.exit(0); }
  let [a, b, c] = cur.split(".").map(Number);
  if (bump === "major") { a++; b = 0; c = 0; }
  else if (bump === "minor") { b++; c = 0; }
  else if (bump === "patch") { c++; }
  else { console.error("usage: release.sh [patch|minor|major|X.Y.Z]"); process.exit(1); }
  console.log(`${a}.${b}.${c}`);
' "$CUR" "$BUMP")"

echo "==> Bumping $CUR -> $NEXT"

# Update all three version sources (package.json, tauri.conf.json as JSON; Cargo.toml via regex).
node -e '
  const fs = require("fs");
  const v = process.argv[1];
  for (const f of ["app/package.json", "app/src-tauri/tauri.conf.json"]) {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    j.version = v;
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  }
  let c = fs.readFileSync("app/src-tauri/Cargo.toml", "utf8");
  c = c.replace(/(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/, `$1${v}$2`);
  fs.writeFileSync("app/src-tauri/Cargo.toml", c);
' "$NEXT"

# Prepend a CHANGELOG section from commits since the last tag.
DATE="$(date +%Y-%m-%d)"
LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
RANGE="${LAST_TAG:+$LAST_TAG..HEAD}"
NOTES="$(git log --pretty='- %s' $RANGE 2>/dev/null || true)"
[ -z "$NOTES" ] && NOTES="- (no changes recorded)"
TMP="$(mktemp)"
{ echo "## v$NEXT — $DATE"; echo; echo "$NOTES"; echo; [ -f CHANGELOG.md ] && cat CHANGELOG.md; } > "$TMP"
mv "$TMP" CHANGELOG.md

git add app/package.json app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml CHANGELOG.md
git commit -m "Release v$NEXT"
git tag -a "v$NEXT" -m "v$NEXT"

echo "==> Committed and tagged v$NEXT (not pushed)."
echo "    Next: scripts/publish.sh   (builds, pushes the tag, creates the GitHub release)"
