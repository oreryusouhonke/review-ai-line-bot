# Render デプロイ手順

## 目的

ngrokの一時URLではなく、Renderの固定URLでLINE Webhookを運用します。

Webhook URLの形:

```text
https://<render-service-name>.onrender.com/webhook/line
```

## 事前確認

ローカルで以下が動いていることを確認します。

```powershell
cd "C:\AI_FACTORY_HOME\AI_FACTORY（AI運用工場）\【口コミレビュー職人】"
npm start
```

別PowerShellで確認:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## Renderに設定する環境変数

RenderのEnvironmentに以下を設定します。

```text
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest
NODE_ENV=production
```

`.env` の値はRender画面に手入力します。`.env` ファイル自体はアップロード・公開しません。

## Renderでの作成

1. Renderにログイン
2. New + を押す
3. Web Service を選ぶ
4. このプロジェクトを接続する
5. Build Command に以下を設定

```text
npm install
```

6. Start Command に以下を設定

```text
npm start
```

7. Environmentに必要な環境変数を登録
8. Deployを実行

## LINE Developers設定

RenderのURLが発行されたら、LINE DevelopersのWebhook URLを以下に変更します。

```text
https://<render-service-name>.onrender.com/webhook/line
```

その後:

1. 保存
2. 検証
3. LINEで「開始」と送信

## 注意

- Render Freeプランは一定時間アクセスがないとスリープする場合があります。
- スリープ復帰の初回返信は遅くなることがあります。
- 現在のJSON保存はMVP用です。Renderでは再デプロイや環境によってデータが消える可能性があります。
- 本番運用ではPostgreSQL、Redis、Google Sheetsなど外部保存への移行を検討してください。
