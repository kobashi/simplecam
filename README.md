# Camera Frame Preview

リアカメラを全画面プレビューしながら、ピンチでズーム、スワイプで撮影範囲を移動する iPad 向けのブラウザアプリです。録画機能は含みません。

## Files

- `index.html`: アプリ本体
- `styles.css`: 全画面プレビューとオーバーレイ UI
- `app.js`: カメラ起動とジェスチャー制御

## Usage

1. HTTPS または `localhost` で配信します。
2. Safari で開いてカメラ権限を許可します。
3. ピンチでズーム、スワイプで撮影範囲を移動します。

## GitHub Pages

`.github/workflows/deploy-pages.yml` を追加してあり、`main` ブランチへの push でそのまま GitHub Pages にデプロイされます。

1. GitHub で空のリポジトリを作成します。
2. このディレクトリをそのリポジトリに push します。
3. GitHub の `Settings > Pages` で `Build and deployment` の `Source` を `GitHub Actions` にします。
4. `main` に push すると Actions が走り、公開 URL が発行されます。

公開後は `https://<user>.github.io/<repo>/` でアクセスできます。カメラを使うため、GitHub Pages の HTTPS 配信と相性が良い構成です。

## Note

- iPad Safari では `getUserMedia` のためにセキュアコンテキストが必要です。
- ブラウザが `MediaTrackCapabilities.zoom` をサポートしている場合はネイティブズームを使い、未対応時は CSS ズームにフォールバックします。
