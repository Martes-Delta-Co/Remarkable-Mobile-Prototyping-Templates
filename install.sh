#!/usr/bin/env bash
# One-step installer (macOS / Linux): downloads the templates from GitHub and
# copies them to a USB-connected reMarkable. See README / INSTALL guides first.
#   bash install.sh        (or: REPO=you/repo bash install.sh)
set -euo pipefail
REPO="${REPO:-YOURNAME/remarkable-mobile-ux-templates}"   # <-- CHANGE to your repo
BRANCH="${BRANCH:-main}"
IP="${IP:-10.11.99.1}"
DEST="/home/root/.local/share/remarkable/xochitl/"
SSHOPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

cat <<EOF
reMarkable UX Templates — installer
  repo:   $REPO ($BRANCH)
  device: $IP (over USB)

Make sure: device on USB; (Paper Pro) Developer Mode enabled; and have the SSH password from
  Settings > General > Help > About > Copyrights and licenses > "GPLv3 Compliance"
EOF
read -r -p "Press Enter to continue (Ctrl-C to cancel)... " _ || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "Downloading templates from GitHub..."
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" -o "$tmp/repo.tgz"
tar -xzf "$tmp/repo.tgz" -C "$tmp"
# find the folder that actually contains the template files (works whatever the repo layout)
one="$(find "$tmp" -type f -name 'uxtpl_*.template' 2>/dev/null | head -n1 || true)"
[ -n "$one" ] || { echo "ERROR: no templates found in $REPO ($BRANCH). Check the repo name."; exit 1; }
src="$(dirname "$one")"
echo "Found $(ls "$src"/uxtpl_*.template | wc -l | tr -d ' ') templates."
echo "Installing — you'll be asked for the device password once:"
( cd "$src" && tar cf - uxtpl_* ) | ssh "${SSHOPTS[@]}" "root@$IP" \
  "rm -rf ${DEST}uxtpl_* ; tar xf - -C '$DEST' ; systemctl restart xochitl"
echo
echo "Done! On the tablet: New page -> Template (look for '1UP COL iPhone', etc.)."
