# Stripe課金設定メモ

口コミレビュー職人は、現在はエンドユーザーが無料で利用できる公式LINEツールです。
そのため、通常運用では口コミ文作成の途中で決済案内を出しません。

## 現在の運用ルール

- レビュー職人本体: 無料
- `FREE_MONTHLY_QUOTA=0`: 無料で制限なし
- `FREE_MONTHLY_QUOTA=1` 以上: 月ごとの無料作成数として扱う
- `PAID_MONTHLY_QUOTA`: 将来、有料枠を使う場合の月間作成数
- カウント対象: `review_histories.type = 'create'` の口コミ文作成

`FREE_MONTHLY_QUOTA=0` は「0件まで」ではなく「無料で制限なし」です。
Renderや環境変数でこの値を0にしておけば、LINE上で「契約者向け」「決済リンク未準備」と表示されず、通常どおり口コミ文作成まで進みます。

## Render環境変数

```text
PUBLIC_BASE_URL=https://review-ai-line-bot.onrender.com
FREE_MONTHLY_QUOTA=0
PAID_MONTHLY_QUOTA=30
```

Stripe課金を将来有効にする場合のみ、以下を追加します。

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://review-ai-line-bot.onrender.com/billing/success
STRIPE_CANCEL_URL=https://review-ai-line-bot.onrender.com/billing/cancel
STRIPE_ALLOW_PROMOTION_CODES=false
```

## Stripeを使う場合のWebhook

Webhook URL:

```text
https://review-ai-line-bot.onrender.com/webhook/stripe
```

受け取るイベント:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## 注意

レビュー職人を無料ツールとして公開する間は、`FREE_MONTHLY_QUOTA=0` のままにします。
誤って `FREE_MONTHLY_QUOTA` を小さい数値にすると、その回数を超えた利用者に決済案内が表示されます。
