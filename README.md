# SimpleCam

## Ver. 1.0

リアカメラを全画面でプレビューする、タッチ操作専用のブラウザアプリです。録画や静止画保存は行わず、プレビュー表示と表示範囲の調整に特化しています。

## Current Spec

- 全画面プレビューがそのまま撮影範囲です。
- 対応操作は `ピンチ` によるズーム、`スワイプ` によるパンです。
- ズーム倍率は `1x` から `9x` です。
- 右上の `FULL` ボタンで全画面表示に切り替えできます。
- 操作説明テキストは常時表示せず、エラー時のみメッセージを表示します。

## Supported Devices

- iPad
- Android タブレット / Android スマートフォン

タッチ端末での利用を前提としており、マウス操作は対象外です。

## Usage

1. HTTPS または `localhost` でアプリを開きます。
2. ブラウザのカメラ権限を許可します。
3. リアカメラの全画面プレビューを確認します。
4. ピンチでズーム、スワイプで表示中心を移動します。
5. 必要に応じて `FULL` ボタンで全画面表示に切り替えます。

## Files

- `index.html`: UI 構造
- `styles.css`: 全画面表示とオーバーレイ UI
- `app.js`: カメラ起動、ズーム、パン、全画面切り替え
- `.github/workflows/deploy-pages.yml`: GitHub Pages 自動デプロイ

## Deployment

`main` ブランチへ push すると GitHub Pages に自動デプロイされます。

- Repository: `https://github.com/kobashi/simplecam`
- Publish URL: `https://kobashi.github.io/simplecam/`

GitHub 側では `Settings > Pages > Build and deployment > Source` を `GitHub Actions` に設定します。

## Notes

- カメラ利用にはセキュアコンテキストが必要です。`https://` または `localhost` でアクセスしてください。
- リアカメラは `facingMode: environment` を優先して取得します。
- ズームとパンはブラウザ上の表示変形として実装しています。
- 端末やブラウザによって、全画面 API の挙動や見た目が一部異なることがあります。
