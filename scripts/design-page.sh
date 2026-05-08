#!/usr/bin/env bash
# Init a new page in the Meridian frontend workflow.
# Usage: scripts/design-page.sh <page-name>
#   e.g. scripts/design-page.sh overview
#
# What it does:
#   1. Creates docs/design/<page-name>/ for Stitch exports
#   2. Runs ui-ux-pro-max --design-system --persist for the page
#   3. Prints next steps

set -euo pipefail

PAGE="${1:-}"
if [[ -z "$PAGE" ]]; then
  echo "Usage: $0 <page-name>" >&2
  echo "  e.g. $0 overview" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESIGN_DIR="$REPO_ROOT/docs/design/$PAGE"
SKILL_CLI="$HOME/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.5.0/.claude/skills/ui-ux-pro-max/scripts/search.py"

mkdir -p "$DESIGN_DIR"

if [[ ! -f "$SKILL_CLI" ]]; then
  echo "warn: ui-ux-pro-max CLI not found at $SKILL_CLI" >&2
  echo "      skipping --design-system step. Install/update the skill, then re-run." >&2
else
  echo "→ Generating design system rules for page '$PAGE'..."
  cd "$REPO_ROOT"
  python3 "$SKILL_CLI" \
    "AI cost analytics dashboard editorial dark mode density power-user $PAGE" \
    --design-system \
    --persist \
    -p "Meridian" \
    --page "$PAGE" \
    -f markdown
fi

cat <<EOF

Done. Next:

  1. Open Stitch:           https://stitch.withgoogle.com/
     Use the prompt template in docs/design/WORKFLOW.md (Step 1).
     Save exports to:       $DESIGN_DIR/

  2. Hand-edit:              design-system/meridian/pages/$PAGE.md
     Capture grid choice, density, page-specific overrides.

  3. Build:                  src/pages/$PAGE.jsx

  4. Verify (Step 4):        Playwright at 1440/768/390.

EOF
