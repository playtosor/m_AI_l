#!/usr/bin/env bash
# sync-plugin.sh — publish helper for the m_AI_l mailbox plugin.
#
# Keeps the plugin package (plugin/) in sync with the sources:
#   - version  : copied from packages/mcp/package.json into plugin/.claude-plugin/plugin.json
#   - skills   : copied from skills/messaging/*.md into plugin/skills/<name>/SKILL.md
#   - (option) --build        : rebuild the server bundle first (pnpm prepack in packages/mcp)
#   - (option) --install-local: also refresh the locally installed skills in ~/.zcode/skills/
#
# Usage:
#   ./scripts/sync-plugin.sh [--build] [--install-local]
#
# After running it, commit + push the repo; the GitHub marketplace
# (.claude-plugin/marketplace.json at repo root) picks the plugin from
# Vibe/mcp_server/plugin. The admin console is intentionally NOT part of
# the plugin: it stays a local-only tool declared in the owner's config.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/plugin"
SKILLS_SRC="$ROOT/skills/messaging"
ZCODE_SKILLS="$HOME/.zcode/skills"

BUILD=0
INSTALL_LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --install-local) INSTALL_LOCAL=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

# 1. Optional build of the npm server bundle.
if [ "$BUILD" -eq 1 ]; then
  echo "==> Building @m_ai_l/mcp (pnpm prepack)"
  (cd "$ROOT/packages/mcp" && pnpm prepack)
fi

# 2. Sync version from the npm package into the plugin manifest.
#    Run Node from each directory and use relative paths so Windows Node does
#    not need to resolve MSYS/Cygwin-style absolute paths (and cygpath is not
#    required).
VERSION="$(cd "$ROOT/packages/mcp" && node -p "require('./package.json').version")"
echo "==> Syncing plugin version -> $VERSION"
(
  cd "$PLUGIN_DIR"
  node -e '
  const fs = require("fs");
  const manifestPath = ".claude-plugin/plugin.json";
  const version = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
' "$VERSION"
)

# 3. Sync skills (source file -> plugin skill dir with SKILL.md).
#    Mapping: skills/messaging/mailbox_read.md  -> plugin/skills/mailbox-read/SKILL.md
#             skills/messaging/mailbox_write.md -> plugin/skills/mailbox-write/SKILL.md
#             skills/messaging/aro.md           -> plugin/skills/aro/SKILL.md
echo "==> Syncing skills"
for pair in "mailbox_read.md:mailbox-read" "mailbox_write.md:mailbox-write" "aro.md:aro"; do
  src="${pair%%:*}"
  dest="${pair##*:}"
  dest_dir="$PLUGIN_DIR/skills/$dest"
  mkdir -p "$dest_dir"
  cp "$SKILLS_SRC/$src" "$dest_dir/SKILL.md"
  echo "    $src -> plugin/skills/$dest/SKILL.md"
done

# 4. Optionally refresh the locally installed ZCode skills.
if [ "$INSTALL_LOCAL" -eq 1 ]; then
  echo "==> Refreshing local ZCode skills in $ZCODE_SKILLS"
  for pair in "mailbox_read.md:mailbox-read" "mailbox_write.md:mailbox-write" "aro.md:aro"; do
    src="${pair%%:*}"
    dest="${pair##*:}"
    mkdir -p "$ZCODE_SKILLS/$dest"
    cp "$SKILLS_SRC/$src" "$ZCODE_SKILLS/$dest/SKILL.md"
    echo "    $ZCODE_SKILLS/$dest/SKILL.md updated"
  done
fi

echo "==> Done. Next steps: commit + push the repo, then update the plugin from the marketplace."
