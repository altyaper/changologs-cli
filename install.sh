#!/bin/sh
# Install or update the changologs CLI:
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/altyaper/changologs-cli/main/install.sh)"
#
# Overrides: CHANGOLOGS_DIR (checkout, default ~/.changologs-cli),
#            CHANGOLOGS_BIN_DIR (symlink target, default ~/.local/bin),
#            CHANGOLOGS_REPO, CHANGOLOGS_BRANCH.
set -eu

REPO="${CHANGOLOGS_REPO:-https://github.com/altyaper/changologs-cli.git}"
BRANCH="${CHANGOLOGS_BRANCH:-main}"
DIR="${CHANGOLOGS_DIR:-$HOME/.changologs-cli}"
BIN_DIR="${CHANGOLOGS_BIN_DIR:-$HOME/.local/bin}"
MIN_NODE="24.5.0"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required."
command -v node >/dev/null 2>&1 || die "Node.js >= $MIN_NODE is required (https://nodejs.org)."
command -v npm >/dev/null 2>&1 || die "npm is required."

# The CLI's shebang uses --use-env-proxy, which needs Node 24.5+.
node -e '
  const [a, b, c] = process.versions.node.split(".").map(Number);
  const [x, y, z] = process.argv[1].split(".").map(Number);
  process.exit(a !== x ? +(a < x) : b !== y ? +(b < y) : +(c < z));
' "$MIN_NODE" || die "Node.js >= $MIN_NODE is required (found $(node -v))."

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH"
  git -C "$DIR" reset --quiet --hard "origin/$BRANCH"
elif [ -e "$DIR" ]; then
  die "$DIR exists and is not a git checkout. Remove it or set CHANGOLOGS_DIR."
else
  say "Cloning into $DIR"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi

say "Installing dependencies and building"
(cd "$DIR" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error && npm run build --silent)
chmod +x "$DIR/dist/index.js"

mkdir -p "$BIN_DIR"
ln -sf "$DIR/dist/index.js" "$BIN_DIR/changologs"
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
