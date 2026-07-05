# SETUP

## 起動

```powershell
cd "C:\AI_FACTORY_HOME\AI_FACTORY（AI運用工場）\【口コミレビュー職人】"
npm install
Copy-Item .env.example .env
npm run dev
```

## 必要な環境変数

```text
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が未設定でも、従来どおり `data/histories.json` に保存して動きます。

## Supabase 設定

1. Supabase プロジェクトを作成します。
2. Project Settings > API から `Project URL` を `SUPABASE_URL` に設定します。
3. `service_role` キーを `SUPABASE_SERVICE_ROLE_KEY` に設定します。
4. Supabase SQL Editor で `docs/supabase_schema.sql` を実行します。
5. `/health` の `supabaseConfigured` が `true` になることを確認します。

`SUPABASE_SERVICE_ROLE_KEY` は管理者権限のキーです。`.env` や Render の Environment にだけ保存し、GitHub へコミットしないでください。

## ローカル確認

```powershell
Invoke-RestMethod http://localhost:3000/health
```

期待値:

```json
{
  "ok": true,
  "missingEnv": [],
  "supabaseConfigured": true
}
```

`missingEnv` に表示された項目は `.env` または Render の環境変数へ設定してください。

## LINE Webhook

LINE Developers の Webhook URL には以下を設定します。

```text
https://<公開URL>/webhook/line
```

署名検証を有効にしているため、LINE Developers から送られた正規のリクエストだけを受け付けます。
