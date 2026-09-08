#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

GO_VERSION="1.26.8"
TOOLS_DIR="$ROOT_DIR/.tools"
BIN_DIR="$ROOT_DIR/bin"
APP_BIN="$BIN_DIR/aipm-lite-board"

if command -v go >/dev/null 2>&1; then
  GO_BIN="$(command -v go)"
else
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64) ARCH="amd64" ;;
    *) echo "暂不支持的 CPU（中央处理器）架构：$ARCH"; exit 1 ;;
  esac
  GO_ROOT="$TOOLS_DIR/go-$GO_VERSION"
  GO_BIN="$GO_ROOT/bin/go"
  if [[ ! -x "$GO_BIN" ]]; then
    mkdir -p "$TOOLS_DIR"
    ARCHIVE="$TOOLS_DIR/go${GO_VERSION}.${OS}-${ARCH}.tar.gz"
    echo "未检测到 Go（Go 语言工具链），正在下载本地版本……"
    curl -fL "https://go.dev/dl/go${GO_VERSION}.${OS}-${ARCH}.tar.gz" -o "$ARCHIVE"
    mkdir -p "$GO_ROOT"
    tar -xzf "$ARCHIVE" -C "$GO_ROOT" --strip-components=1
  fi
fi

mkdir -p "$BIN_DIR" "$ROOT_DIR/data"
echo "正在编译 AIPM 轻量产研看板……"
"$GO_BIN" build -o "$APP_BIN" ./cmd/scrumboy

URL="http://127.0.0.1:8080"
(
  sleep 1
  open "$URL" >/dev/null 2>&1 || true
) &

echo ""
echo "AIPM 轻量产研看板已启动：$URL"
echo "数据目录：$ROOT_DIR/data"
echo "停止服务：按 Control + C"
echo ""

BIND_ADDR="127.0.0.1:8080" \
DATA_DIR="$ROOT_DIR/data" \
SQLITE_PATH="$ROOT_DIR/data/app.db" \
SCRUMBOY_MODE="full" \
SCRUMBOY_MARKDOWN_NOTES_ENABLED="1" \
SCRUMBOY_MERMAID_NOTES_ENABLED="1" \
exec "$APP_BIN"
