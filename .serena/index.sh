#!/bin/bash

# NodeVision Editor _V2 - Serena Indexing Script
# このスクリプトはSerenaがプロジェクトをインデックス化するためのものです

PROJECT_ROOT="/Users/apple/Desktop/AI アプリ/NodeVision Editor _V2"

echo "🔍 Serenaプロジェクトのインデックス化を開始します..."
echo "📁 プロジェクトルート: $PROJECT_ROOT"

# プロジェクト情報を表示
echo ""
echo "📊 プロジェクト統計:"
echo "----------------------------------------"

# TypeScriptファイル数
TS_COUNT=$(find "$PROJECT_ROOT" -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | wc -l | tr -d ' ')
echo "TypeScriptファイル: $TS_COUNT"

# JavaScriptファイル数
JS_COUNT=$(find "$PROJECT_ROOT" -name "*.js" -not -path "*/node_modules/*" -not -path "*/dist/*" | wc -l | tr -d ' ')
echo "JavaScriptファイル: $JS_COUNT"

# JSONファイル数
JSON_COUNT=$(find "$PROJECT_ROOT" -name "*.json" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
echo "JSONファイル: $JSON_COUNT"

echo "----------------------------------------"
echo ""

# 主要なディレクトリ構造を表示
echo "📂 主要なディレクトリ構造:"
tree -L 2 -d "$PROJECT_ROOT/apps" 2>/dev/null || find "$PROJECT_ROOT/apps" -maxdepth 2 -type d
echo ""
tree -L 2 -d "$PROJECT_ROOT/packages" 2>/dev/null || find "$PROJECT_ROOT/packages" -maxdepth 2 -type d

echo ""
echo "✅ プロジェクト情報の収集が完了しました"
echo "💡 AntigravityでSerena MCPサーバーが起動すると、このプロジェクトを使用できます"
