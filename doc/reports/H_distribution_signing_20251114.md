# H-02 配布/署名ドキュメント（2025-11-14）

## 目的
- Doc §8 / チェックリスト H-02 の要件に沿って、Windows コード署名と macOS notarization の具体的な手順を残す。
- Electron バンドルの署名/公証フローを毎リリースで再現できるよう、証跡（コマンド、入力ファイル、検証方法）を一箇所に集約。

## Windows: コード署名フロー
1. **証明書の準備**
   - EV コードサイニング証明書（USBトークン）を推奨。CI では `YubiKey + Azure Key Vault` を使った「証明書の鍵をクラウドに置かない」構成を採用。
   - ローカル検証用: `certmgr.msc` で「個人」ストアにインポート、秘密鍵はエクスポート不可に設定。
2. **ビルド成果物**
   - `pnpm run build` 後、`dist/NodeVisionEditor-win32-x64/NodeVision Editor.exe` を対象にする。
   - DLL など中間ファイルもサイニング対象。PowerShell 例: `Get-ChildItem dist/NodeVisionEditor-win32-x64 -Recurse -Include *.exe,*.dll`。
3. **署名コマンド**
   ```powershell
   $timestamp = 'http://timestamp.digicert.com'
   signtool sign `
     /fd SHA256 `
     /tr $timestamp `
     /td SHA256 `
     /n "NodeVision KK" `
     "dist/NodeVisionEditor-win32-x64/NodeVision Editor.exe"
   ```
   - USBトークン使用時は PIN 入力を求められる。CI では `AzureSignTool` 経由で HSM にリクエスト。
4. **検証**
   ```powershell
   signtool verify /pa /v "dist/NodeVisionEditor-win32-x64/NodeVision Editor.exe"
   ```
   - `Verified` を確認し、失敗時は `signtool verify /kp` でカーネルポリシー視点もチェック。
5. **ログ保管**
   - `out/signing/windows/YYYYMMDD-HHmm.log` に標準出力を保存し、Doc/checklist H-02 の証跡に添付する。

## macOS: Notarization & Staple フロー
1. **前提**
   - Apple Developer Program の Team ID（例: `ABCDE12345`）。Xcode 15+ / Command Line Tools を準備。
   - App 用の `NodeVision Editor.app` と `.dmg` を `pnpm run build:mac` で生成。
2. **署名**
   ```bash
   codesign \
     --deep --force --options runtime \
     --sign "Developer ID Application: NodeVision KK (ABCDE12345)" \
     "dist/mac/NodeVision Editor.app"
   codesign --verify --deep --strict --verbose=2 "dist/mac/NodeVision Editor.app"
   ```
3. **notarytool 送信**
   ```bash
   xcrun notarytool submit dist/mac/NodeVisionEditor.dmg \
     --apple-id "$APPLE_ID" \
     --team-id ABCDE12345 \
     --password "$APP_SPECIFIC_PW" \
     --wait
   ```
   - `status: Accepted` を得たら JSON レポートを `out/signing/macos/notarytool-YYYYMMDD.json` に保存。
4. **staple / 検証**
   ```bash
   xcrun stapler staple dist/mac/NodeVisionEditor.dmg
   spctl --assess --type open --verbose dist/mac/NodeVisionEditor.dmg
   ```
   - `accepted` を確認。CI ログを Doc/checklist の証跡リンクに貼る。
5. **トラブルシュート**
   - `Ticket Submission Failed` 時は `xcrun notarytool history` でログを確認。
   - Gatekeeper で失敗した場合は `sudo xattr -dr com.apple.quarantine` で一度属性をリセットして再評価。

## 運用メモ
- 署名／notary のシークレット (`APPLE_ID`, `APP_SPECIFIC_PW`, `WINDOWS_CERT_THUMBPRINT`) は `.kamui/manager/.env.signing` にのみ保存し、CI では OIDC 経由で一時発行。
- 週次で証明書の有効期限を `serena project index` のヘルスチェックに入れ、期限60日前に更新タスクを起票する。
- すべてのステップを GitHub Actions の `release-signing.yml` に組み込み、`release/*` タグ作成時に自動実行する。
