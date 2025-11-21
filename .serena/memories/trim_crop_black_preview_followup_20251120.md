対策追加（2025-11-20 04:05）
- 保存時に regionSpace==='stage' の場合、__NODEVISION_LAST_STAGE_METRICS（トリムモーダルで記録）を使って画像座標へ変換してから FFmpeg に渡すよう変更。変換後は settings.regionSpace='image' に正規化。
- MediaPreview の CSS クロップ変換で cropZoom を掛けないようにし、実ファイル側ズームと二重適用を防止。
- ビルド: `pnpm --filter desktop-electron build` パス。