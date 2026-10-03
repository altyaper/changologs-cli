#!/bin/sh
# Install or update the changologs CLI:
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/altyaper/changologs-cli/main/install.sh)"
#
# Downloads the prebuilt single-file bundle from the latest GitHub Release.
# Overrides: CHANGOLOGS_DIR (install dir, default ~/.changologs-cli),
#            CHANGOLOGS_BIN_DIR (symlink target, default ~/.local/bin),
#            CHANGOLOGS_VERSION (release tag, e.g. v0.1.0; default latest).
set -eu

GH_REPO="altyaper/changologs-cli"
VERSION="${CHANGOLOGS_VERSION:-latest}"
DIR="${CHANGOLOGS_DIR:-$HOME/.changologs-cli}"
BIN_DIR="${CHANGOLOGS_BIN_DIR:-$HOME/.local/bin}"
MIN_NODE="24.5.0"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required."
command -v node >/dev/null 2>&1 || die "Node.js >= $MIN_NODE is required (https://nodejs.org)."

# The CLI's shebang uses --use-env-proxy, which needs Node 24.5+.
node -e '
  const [a, b, c] = process.versions.node.split(".").map(Number);
  const [x, y, z] = process.argv[1].split(".").map(Number);
  process.exit(a !== x ? +(a < x) : b !== y ? +(b < y) : +(c < z));
' "$MIN_NODE" || die "Node.js >= $MIN_NODE is required (found $(node -v))."

if [ "$VERSION" = latest ]; then
  URL="https://github.com/$GH_REPO/releases/latest/download/changologs.js"
else
  URL="https://github.com/$GH_REPO/releases/download/$VERSION/changologs.js"
fi

# Earlier versions of this script installed a git checkout here and built it.
if [ -d "$DIR/.git" ]; then
  [ "$DIR" = "$HOME/.changologs-cli" ] || die "$DIR is a git checkout. Remove it or set CHANGOLOGS_DIR."
  say "Removing old source checkout at $DIR"
  rm -rf "$DIR"
fi

mkdir -p "$DIR" "$BIN_DIR"
say "Downloading changologs ($VERSION)"
curl -fsSL "$URL" -o "$DIR/changologs.js.tmp" || die "Download failed: $URL"
mv "$DIR/changologs.js.tmp" "$DIR/changologs.js"
chmod +x "$DIR/changologs.js"

ln -sf "$DIR/changologs.js" "$BIN_DIR/changologs"
say "Installed changologs -> $BIN_DIR/changologs"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n%s is not on your PATH. Add this to your shell profile (~/.zshrc):\n\n  export PATH="%s:$PATH"\n' "$BIN_DIR" "$BIN_DIR"
    ;;
esac

if [ -z "${HTTPS_PROXY:-}${https_proxy:-}" ]; then
  printf '\nBehind a corporate proxy? Node needs HTTPS_PROXY set to reach changologs.com.\n'
fi

printf '\nNext: run \033[1mchangologs login\033[0m\n'
