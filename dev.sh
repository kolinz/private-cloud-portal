#!/bin/bash
# dev.sh — バックエンド + フロントエンドを一括起動するスクリプト
# 使い方:
#   ./dev.sh        # 検証モード（実Incus接続、staging DB）
#   ./dev.sh --mock # Incusモック（Incus不要の動作確認用）

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/packages/backend/.env.staging"

# オプション解析
if [ "$1" = "--mock" ]; then
  export INCUS_MOCK=true
  echo "🧪 モックモード（Incus不要）で起動します"
else
  export INCUS_MOCK=false
  echo "🔌 実Incus接続モードで起動します（Incusが起動している必要があります）"
fi

# .env.staging を読み込む（INCUS_MOCKはコマンドライン引数を優先）
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    key="${line%%=*}"
    [ "$key" = "INCUS_MOCK" ] && continue  # コマンドライン引数を優先
    export "$line"
  done < "$ENV_FILE"
fi

echo "📦 起動中..."
echo "  Backend:  http://localhost:${PORT:-3000}"
echo "  Frontend: http://localhost:5173"
echo "  DB:       ${DATABASE_PATH:-./data/staging.db}"
echo "  Ctrl+C で両方停止します"
echo ""

trap 'kill 0' EXIT

cd "$PROJECT_DIR"
pnpm --filter @pcp/backend dev &
pnpm --filter @pcp/frontend dev &

wait
