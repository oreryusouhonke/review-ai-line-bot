# SETUP

## 起動

```powershell
cd "C:\AI_FACTORY_HOME\AI_FACTORY（AI運用工場）\【レビューAI公式LINE Bot】"
npm install
Copy-Item .env.example .env
npm run dev
```

## 必須環境変数

```text
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
```

## ローカル確認

```powershell
Invoke-RestMethod http://localhost:3000/health
```

`missingEnv` に表示された項目は `.env` へ設定してください。

## LINE Webhook

LINE DevelopersのWebhook URLには以下を設定します。

```text
https://<ngrokのURL>/webhook/line
```

LINE署名検証を有効にしているため、LINE Developersから送られた正規リクエストだけを受け付けます。
