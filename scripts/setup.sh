#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ok()   { echo "[ok]   $*"; }
info() { echo "[info] $*"; }
warn() { echo "[warn] $*"; }
fail() { echo "[fail] $*" >&2; exit 1; }

trap 'fail "Setup failed at line $LINENO — see output above."' ERR

# ---------------------------------------------------------------------------
# 1. Platform guard — exit early on Windows shells (Git Bash / MSYS / Cygwin)
# ---------------------------------------------------------------------------
UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME_S" in
  MINGW*|CYGWIN*|MSYS*)
    echo ""
    echo "This setup script requires bash on macOS or Linux (or WSL on Windows)."
    echo "Native Windows shells (cmd.exe, PowerShell, Git Bash) are not supported."
    echo ""
    echo "Windows users: run the manual steps instead:"
    echo ""
    echo "  npm install"
    echo "  npm run build"
    echo "  npx playwright install chromium"
    echo ""
    echo "Or run this script from WSL (Windows Subsystem for Linux)."
    echo ""
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# 2. Node version check
# ---------------------------------------------------------------------------
info "Checking Node.js version..."

if ! command -v node &>/dev/null; then
  echo ""
  fail "Node.js is not installed (or not on PATH).

To install it, run:
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

Then load nvm into your current terminal (without closing it):
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"

Then install Node 22 and re-run this script:
  nvm install 22
  nvm use 22
  npm run setup"
fi

NODE_VERSION="$(node -v)"          # e.g. v22.14.0
NODE_MAJOR="${NODE_VERSION#v}"     # strip leading 'v'
NODE_MAJOR="${NODE_MAJOR%%.*}"     # keep only the major number

if [ "$NODE_MAJOR" -ge 25 ]; then
  echo ""
  fail "Node $NODE_VERSION is too new. sf-docs-mcp requires Node 18–24.

Switch to Node 22 with nvm:
  nvm install 22
  nvm use 22
  node -v   # should be v22.x.x

Then re-run:
  npm run setup"
elif [ "$NODE_MAJOR" -lt 18 ]; then
  echo ""
  fail "Node $NODE_VERSION is too old. sf-docs-mcp requires Node 18–24.

Upgrade to Node 22 with nvm:
  nvm install 22
  nvm use 22
  node -v   # should be v22.x.x

Then re-run:
  npm run setup"
fi

ok "Node $NODE_VERSION (major $NODE_MAJOR) — supported."

# ---------------------------------------------------------------------------
# 3. Install dependencies
# ---------------------------------------------------------------------------
info "Running npm install..."
cd "$REPO_ROOT"
npm install
ok "npm install done."

# ---------------------------------------------------------------------------
# 4. Build TypeScript
# ---------------------------------------------------------------------------
info "Building TypeScript (npm run build)..."
npm run build
ok "Build complete."

# ---------------------------------------------------------------------------
# 5. Install Playwright Chromium
# ---------------------------------------------------------------------------
info "Installing Playwright Chromium..."
npx playwright install chromium
ok "Playwright Chromium installed."

# ---------------------------------------------------------------------------
# 6. Smoke check — stdin EOF causes clean exit (code 0) = healthy server
# ---------------------------------------------------------------------------
info "Running smoke check..."
node dist/mcp-server.js </dev/null &
SMOKE_PID=$!
sleep 2

if kill -0 "$SMOKE_PID" 2>/dev/null; then
  # Still running after 2 s — unexpected; clean up and warn
  kill "$SMOKE_PID" 2>/dev/null || true
  wait "$SMOKE_PID" 2>/dev/null || true
  warn "Smoke check: server did not exit on stdin EOF — verify manually with: node dist/mcp-server.js"
else
  wait "$SMOKE_PID"
  SMOKE_EXIT=$?
  if [ "$SMOKE_EXIT" -eq 0 ]; then
    ok "Smoke check passed (server exited cleanly on stdin EOF)."
  else
    warn "Smoke check: server exited with code $SMOKE_EXIT — verify manually with: node dist/mcp-server.js"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Print absolute path + ready-to-paste mcp.json block
# ---------------------------------------------------------------------------
MCP_SERVER_PATH="$REPO_ROOT/dist/mcp-server.js"

echo ""
echo "============================================================"
ok "Setup complete!"
echo "============================================================"
echo ""
echo "Absolute path to dist/mcp-server.js:"
echo "  $MCP_SERVER_PATH"
echo ""
echo "Add the following inside the \"mcpServers\" object in ~/.cursor/mcp.json:"
echo ""
echo "  \"sf-docs\": {"
echo "    \"command\": \"node\","
echo "    \"args\": [\"$MCP_SERVER_PATH\"]"
echo "  }"
echo ""
echo "Then reload MCP in Cursor: Command Palette → \"MCP: Reload Servers\""
echo ""
