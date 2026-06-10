#!/usr/bin/env bash
# Push a cut release to GitHub: build, stage URL-safe assets, generate the
# updater manifest (latest.json), push the tag, and create the GitHub Release.
# Run AFTER scripts/release.sh.  Set SKIP_BUILD=1 to reuse an existing build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="Martes-Delta-Co/Remarkable-Mobile-Prototyping-Templates"
ASSET_BASE="reMarkable-UX-Templates"          # URL-safe asset name base
CONF="app/src-tauri/tauri.conf.json"

command -v gh   >/dev/null || { echo "ERROR: GitHub CLI (gh) required — https://cli.github.com"; exit 1; }
command -v node >/dev/null || { echo "ERROR: Node.js required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: run 'gh auth login' first"; exit 1; }

VERSION="$(node -p "require('./$CONF').version")"
TAG="v$VERSION"
git rev-parse "$TAG" >/dev/null 2>&1 || { echo "ERROR: tag $TAG not found — run scripts/release.sh first."; exit 1; }

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  "$ROOT/scripts/build.sh"
fi

BUNDLE="app/src-tauri/target/universal-apple-darwin/release/bundle"
DMG="$(ls "$BUNDLE/dmg/"*.dmg 2>/dev/null | head -1 || true)"
TARGZ="$(ls "$BUNDLE/macos/"*.app.tar.gz 2>/dev/null | head -1 || true)"
SIG="$(ls "$BUNDLE/macos/"*.app.tar.gz.sig 2>/dev/null | head -1 || true)"
[ -f "$DMG" ]   || { echo "ERROR: no .dmg found — did the build succeed?"; exit 1; }
[ -f "$SIG" ]   || { echo "ERROR: no .sig found — set TAURI_SIGNING_PRIVATE_KEY and rebuild (required for auto-update)."; exit 1; }
[ -f "$TARGZ" ] || { echo "ERROR: no .app.tar.gz found."; exit 1; }

# Stage assets with URL-safe names: versioned (archival) + a stable name for the website.
DIST="$ROOT/dist"; rm -rf "$DIST"; mkdir -p "$DIST"
cp "$DMG"   "$DIST/${ASSET_BASE}_${VERSION}_universal.dmg"
cp "$DMG"   "$DIST/${ASSET_BASE}_universal.dmg"                       # stable website link
cp "$TARGZ" "$DIST/${ASSET_BASE}_${VERSION}_universal.app.tar.gz"

# Generate latest.json for the Tauri updater. Both darwin arch keys point at the
# universal artifact at its immutable, tag-pinned download URL.
DL="https://github.com/$REPO/releases/download/$TAG/${ASSET_BASE}_${VERSION}_universal.app.tar.gz"
node -e '
  const fs = require("fs");
  const [ver, sigPath, url] = process.argv.slice(1);
  const sig = fs.readFileSync(sigPath, "utf8").trim();
  const j = {
    version: ver,
    notes: "See the release notes on GitHub.",
    pub_date: new Date().toISOString(),
    platforms: {
      "darwin-aarch64": { signature: sig, url },
      "darwin-x86_64":  { signature: sig, url }
    }
  };
  fs.writeFileSync("dist/latest.json", JSON.stringify(j, null, 2));
' "$VERSION" "$SIG" "$DL"

# Release notes: the CHANGELOG section for this tag, else auto-generate from commits.
NOTES_FILE="$(mktemp)"
awk -v tag="## $TAG " 'index($0,tag)==1{f=1;next} /^## v/{if(f)exit} f' CHANGELOG.md > "$NOTES_FILE" || true

echo "==> Pushing commit and tag"
git push origin HEAD
git push origin "$TAG"

echo "==> Creating GitHub release $TAG"
if [ -s "$NOTES_FILE" ]; then
  gh release create "$TAG" "$DIST"/* --repo "$REPO" --title "$TAG" --notes-file "$NOTES_FILE"
else
  gh release create "$TAG" "$DIST"/* --repo "$REPO" --title "$TAG" --generate-notes
fi

echo
echo "==> Done."
echo "    Website download (stable link, put this on the MDC site):"
echo "      https://github.com/$REPO/releases/latest/download/${ASSET_BASE}_universal.dmg"
echo "    Auto-update endpoint (already in tauri.conf.json):"
echo "      https://github.com/$REPO/releases/latest/download/latest.json"
