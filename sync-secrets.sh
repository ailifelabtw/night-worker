#!/usr/bin/env bash
# 讀 .env 的 keys 設定 GitHub Repository Secrets
# 用法：./sync-secrets.sh
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ 找不到 .env"
  exit 1
fi

REPO="ailifelabtw/night-worker"

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  key="${key// /}"
  # 跳過範例佔位符
  if [[ "$value" == *"貼這裡"* ]]; then
    echo "⚠ 跳過 $key（還沒填 key）"
    continue
  fi
  echo "→ 上傳 $key 到 $REPO"
  echo "$value" | gh secret set "$key" -R "$REPO"
done < .env

echo ""
echo "✅ 完成。已設定的 secrets："
gh secret list -R "$REPO"
