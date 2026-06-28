# レビューAI公式LINE Bot

Google口コミ用の文章をLINE上で作成するMVPです。

このBotは口コミを自動投稿しません。ユーザー本人の実体験メモをもとに口コミ文を整え、本人が確認・コピーして投稿するための補助ツールです。

## 概要

基本フロー:

1. ユーザーが「開始」と送る
2. Botが店名・地域の入力を促す
3. Google Places APIで店舗候補を最大5件表示
4. ユーザーが番号で店舗を選ぶ
5. Botが体験メモの入力を促す
6. Gemini APIでGoogle口コミ文を作成
7. コピー用本文、文字数、投稿前チェック、Google口コミ投稿URLを返す
8. 「修正：もっと自然に」などで再生成できる

## セットアップ手順

```powershell
cd "C:\AI_FACTORY_HOME\AI_FACTORY（AI運用工場）\【レビューAI公式LINE Bot】"
npm install
Copy-Item .env.example .env
```

`.env` に以下を設定します。

```text
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
```

## LINE Developers設定

1. LINE DevelopersでMessaging APIチャネルを作成
2. Channel access tokenを発行
3. Channel secretを確認
4. `.env` に設定
5. Webhook URLを設定

ngrok利用時の例:

```text
https://xxxx.ngrok-free.app/webhook/line
```

## Gemini APIキー取得

Google AI StudioでAPIキーを作成し、`.env` の `GEMINI_API_KEY` に設定します。

## Google Places APIキー取得

Google CloudでPlaces APIを有効化し、APIキーを作成します。

このMVPでは Places API Text Search を使います。

必要な環境変数:

```text
GOOGLE_PLACES_API_KEY=
```

## ngrokでのローカルテスト方法

```powershell
npm run dev
ngrok http 3000
```

ngrokのHTTPS URLに `/webhook/line` を付けて、LINE DevelopersのWebhook URLへ登録します。

## 動作確認手順

LINEで以下の順に送ります。

```text
開始
匝瑳市 ブリッジ
1
ハンバーグがおいしかった。味噌汁が具沢山。ボリュームが多くて満足。
修正：もっと自然に
```

## 注意事項

- 自動投稿はしません
- 口コミ投稿前に必ず本人が内容を確認してください
- 実体験にない内容を追加しないでください
- 星評価や高評価を誘導しません
- 投稿先サービスの規約を守ってください
