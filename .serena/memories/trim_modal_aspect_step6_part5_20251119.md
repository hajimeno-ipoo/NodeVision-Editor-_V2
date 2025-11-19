Step5: Playwright 比率テスト
- `tmp/nodevision-preview.html` を Playwright で開き、doc/ハロウィン.png を読み込み。
- アスペクト比 [square, 4:3, 16:9, 9:16] × ハンドル [n,s,e,w,nw,ne,sw,se] を順番にリセット→選択→ステージ端までドラッグ。
- 取得した `window.__ratioResults` では、square=1.000、4:3=1.333、16:9=1.778、9:16=0.563 (四捨五入で 9/16=0.5625) を全ハンドルで維持しており、比率崩れは再現せず。