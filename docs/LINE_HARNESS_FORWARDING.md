# LINE Harness Webhookコピー転送

LINE公式アカウントのWebhook URLは1つだけなので、レビュー職人を入口にしたままLINE Harnessにもイベントを渡す場合は、レビュー職人側でコピー転送します。

## 設定

Renderに以下のどちらかを設定してください。

```text
LINE_HARNESS_WEBHOOK_URL=https://line-harness.kataokamasanori.workers.dev/webhook
```

または:

```text
LINE_HARNESS_BASE_URL=https://line-harness.kataokamasanori.workers.dev
```

`LINE_HARNESS_WEBHOOK_URL` がある場合はそちらを優先します。`LINE_HARNESS_BASE_URL` だけの場合は末尾に `/webhook` を付けて転送します。

## 動き

レビュー職人は、LINEから届いた元のJSON本文と `X-Line-Signature` をそのままLINE Harnessへ送ります。

```text
LINE公式アカウント
  ↓
レビュー職人 /webhook/line
  ├─ 通常の口コミ作成処理
  └─ LINE Harness /webhook へコピー転送
```

転送に失敗しても、レビュー職人の通常処理は止めません。

## 注意

- LINE Harness側で自動返信やシナリオ返信を有効にすると、レビュー職人と二重返信になる可能性があります。
- CRM登録だけを目的にする場合は、LINE Harness側の自動返信を無効にして確認してください。
- `/health` の `lineHarnessForwardingConfigured` が `true` なら転送先URLが設定されています。
