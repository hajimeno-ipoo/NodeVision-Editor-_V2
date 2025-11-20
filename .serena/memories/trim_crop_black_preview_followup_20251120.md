再再修正（2025-11-20 03:50）
- メディアプレビューノードの video タグに autoplay / loop / preload=auto を追加し、確実に動画として再生されるよう変更（controls+muted+playsinlineは維持）。
- `pnpm --filter desktop-electron build` 再実行し tsc パス。