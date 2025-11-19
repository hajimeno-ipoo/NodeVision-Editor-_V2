Step3: クランプ後の再チェック
- 候補評価時に `convertImageRegionToStageRegion` → `convertStageRegionToImageRegion` へ往復し、クランプ後の比率で誤差を算出するよう更新。これでステージ端で寸法が変わっても再計測され、比率維持が保証されるようになった。