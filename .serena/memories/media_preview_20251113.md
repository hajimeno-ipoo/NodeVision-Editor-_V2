## 2025-11-13 メディア/プレビュー E章完了
- packages/engine/src/ffmpeg/builder.ts に Load→Trim→Resize→Export のFFmpegプラン生成とSAR=1/VFR→CFR/bicubic指定を実装。builder.test.ts で8ケース（連続トリム・strict start/range・preview override 等）を追加してカバレッジ100%。
- packages/engine/src/preview/progress-bridge.ts で PreviewProgressBridge を導入し、プレビューフレーム到着時に JobProgress を1フレーム以内へ補正するテスト（progress-bridge.test.ts）を作成。
- packages/editor/src/templates.ts に Overlay/Text/Crop/Speed/ChangeFPS テンプレを追加し、templates.test.ts で typeId/nodeVersionを検証。`pnpm test` で全パッケージ100%カバレッジを維持。
- doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md のE章を更新し、証跡を追記。