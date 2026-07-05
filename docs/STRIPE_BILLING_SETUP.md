# Stripe課金設定

レビュー職人LINE Botの口コミ文作成に月間上限を付け、上限超過時にStripe Checkoutへ案内する設定です。

## 料金ルール

- 無料枠: `FREE_MONTHLY_QUOTA` 件/月。初期値は0件。
- 有料枠: `PAID_MONTHLY_QUOTA` 件/月。初期値は30件。
- カウント対象: `review_histories.type = 'create'` の新規口コミ文作成。
- 修正生成も上限チェック対象です。ただしカウントは新規作成数を基準にします。
- レビュー職人は口コミブースター契約者向け機能として扱い、未契約者は1回目からStripe Checkoutへ案内します。

## Stripeで作るもの

1. 商品を作成する。
2. 月額のPriceを作成する。
3. Price IDを控える。例: `price_...`
4. Webhook endpointを作成する。

Webhook URL:

```text
https://review-ai-line-bot.onrender.com/webhook/stripe
```

受けるイベント:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Webhook signing secretを控える。例: `whsec_...`

## Render環境変数

```text
PUBLIC_BASE_URL=https://review-ai-line-bot.onrender.com
FREE_MONTHLY_QUOTA=0
PAID_MONTHLY_QUOTA=30
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://review-ai-line-bot.onrender.com/billing/success
STRIPE_CANCEL_URL=https://review-ai-line-bot.onrender.com/billing/cancel
STRIPE_ALLOW_PROMOTION_CODES=false
```

## Supabase反映

`docs/supabase_schema.sql` をSupabase SQL Editorで再実行します。
既存テーブルへ `plan`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `review_histories.type` が追加されます。

## 動作

1. 未契約ユーザーが口コミ文を作ろうとする。
2. BotがStripe Checkout URLをLINEで返す。
3. Stripe決済完了後、Webhookで `users.plan = 'paid'`, `users.subscription_status = 'active'` に更新する。
4. 以後、有料枠まで口コミ文を作成できる。

## 注意

Stripeアカウントが審査中の場合、本番決済や入金が一時制限されることがあります。
その場合でも、テストモードのキーとPrice IDで動作確認は可能です。
