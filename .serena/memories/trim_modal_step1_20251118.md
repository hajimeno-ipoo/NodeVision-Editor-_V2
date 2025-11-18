## Step1 完了 (2025-11-18)
- 既存のトリムノードUIから黒い時間入力/白いスライダーを撤去し、画像トリム・動画トリム起動ボタン＋編集ステータス表示を追加。`trim.ts`/`trim-shared.ts`/`nodes/types.ts`/`i18n.ts`/`ui-template.ts` などを更新。
- `NodeRendererContext` に `openTrimModal` を追加し、現状はスタブでログのみ。ノードUIは `.trim-launcher` としてボタンを描画し、クリックで今後のモーダルに繋げられるよう仕込み済み。
- テスト: `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅（jsdomのDOMExceptionとcanvas警告は既知）。