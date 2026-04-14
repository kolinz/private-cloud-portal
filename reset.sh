#!/bin/bash
# reset.sh — DBと実Incusコンテナを同時に削除してリセットするスクリプト
# ⚠️ 警告: このスクリプトはすべてのデータを削除します。本番環境では使用しないこと。
#
# 使い方:
#   ./reset.sh          # 確認プロンプトあり
#   ./reset.sh --force  # 確認なしで実行（CI等）

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/packages/backend/.env.staging"

# .env.staging から DATABASE_PATH を読み込む
DB_PATH=""
if [ -f "$ENV_FILE" ]; then
  DB_PATH=$(grep -E '^DATABASE_PATH=' "$ENV_FILE" | cut -d'=' -f2)
fi

# 相対パスをbackendディレクトリ基準で解決
if [ -n "$DB_PATH" ]; then
  DB_PATH="$PROJECT_DIR/packages/backend/$DB_PATH"
else
  DB_PATH="$PROJECT_DIR/packages/backend/data/portal.db"
fi

echo "⚠️  リセットスクリプト"
echo "以下がすべて削除されます:"
echo "  - DBファイル: $DB_PATH"
echo "  - Incus上のすべてのコンテナ"
echo ""

# 確認プロンプト
if [ "$1" != "--force" ]; then
  read -p "本当に実行しますか？ (yes/no): " answer
  if [ "$answer" != "yes" ]; then
    echo "キャンセルしました。"
    exit 0
  fi
fi

# 1. バックエンド停止
echo ""
echo "🛑 バックエンドを停止中..."
kill $(lsof -ti:3000) 2>/dev/null && echo "  停止しました" || echo "  起動していません（スキップ）"

# 2. Incusコンテナを全削除
echo ""
echo "🗑️  Incusコンテナを削除中..."

if command -v incus &>/dev/null; then
  containers=$(incus list --format csv --columns n 2>/dev/null || echo "")
  if [ -z "$containers" ]; then
    echo "  コンテナはありません（スキップ）"
  else
    while IFS= read -r name; do
      echo "  削除: $name"
      incus stop "$name" --force 2>/dev/null || true
      incus delete "$name" 2>/dev/null || echo "  ⚠️  $name の削除に失敗しました"
    done <<< "$containers"
    echo "  完了"
  fi
else
  echo "  incus コマンドが見つかりません（スキップ）"
fi

# 3. DBファイルを削除
echo ""
echo "🗄️  DBを削除中..."
if [ -f "$DB_PATH" ]; then
  rm "$DB_PATH"
  echo "  削除しました: $DB_PATH"
else
  echo "  DBファイルが見つかりません（スキップ）"
fi

echo ""
echo "✅ リセット完了"
echo ""
echo "再起動するには:"
echo "  cd $PROJECT_DIR"
echo "  ./dev.sh --mock   # モックモードで起動"
echo "  ./dev.sh          # 実Incus接続で起動"
