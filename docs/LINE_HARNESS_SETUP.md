# LINE Harness OSS 導入メモ

## 目的

レビュー職人LINE Botの既存Webhookを壊さず、LINE Harness OSSをCRM基盤として別環境に導入するための手順と設計案です。

この段階では、レビュー職人のWebhook URLは変更しません。

既存のレビュー職人Webhook:

```text
https://review-ai-line-bot.onrender.com/webhook/line
```

LINE Harnessは、別LINE公式アカウント、別Messaging API channel、別Webhook URLで先に検証します。

## 現在のレビュー職人構成

- Runtime: Node.js / Express
- Hosting: Render Web Service
- Webhook: `POST /webhook/line`
- AI生成: Gemini API
- 店舗検索: Google Places API
- 保存: JSON fallback + Supabase対応
- 既存機能:
  - 口コミ作成
  - マイページ
  - 履歴
  - ランキング
  - お気に入り
  - バッジ

## LINE Harness OSSの概要

参考OSS:

```text
https://github.com/Shudesu/line-harness-oss
```

README上の構成:

- Cloudflare Workers + D1 SQLite
- Cloudflare Pages / Next.js 管理画面
- LINE公式アカウントCRM
- タグ
- ステップ配信
- セグメント配信
- リッチメニュー切替
- LIFFフォーム
- スコアリング
- IF-THEN自動化
- Webhook IN/OUT

## 導入方針

### Phase 1: 別環境でLINE Harnessを単独導入

レビュー職人とは別のLINE公式アカウントを用意します。

```text
LINE公式アカウントA: レビュー職人Bot 本番
LINE公式アカウントB: LINE Harness 検証用
```

この段階でレビュー職人のWebhook URLは変更しません。

### Phase 2: LINE HarnessのCRM機能を検証

LINE Harness側で以下を確認します。

- 友だち登録
- タグ付け
- ステップ配信
- リッチメニュー
- LIFFフォーム
- 管理画面ログイン
- Webhook受信

### Phase 3: レビュー職人との連携方式を選ぶ

WebhookをいきなりLINE Harnessへ切り替えず、まずはAPI連携またはイベント連携で統合します。

## 必要な環境変数

### LINE Harness側

LINE HarnessのCLIまたはCloudflare側で設定します。実際の名称はLINE Harnessのセットアップ結果に合わせて確認します。

```text
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LIFF_ID=
DATABASE_URL または D1 binding
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

### レビュー職人側の将来連携用

レビュー職人側では、現時点で以下を空欄のまま追加しています。

```text
LINE_HARNESS_BASE_URL=
LINE_HARNESS_API_KEY=
LINE_HARNESS_ACCOUNT_ID=
LINE_HARNESS_WEBHOOK_SECRET=
```

この4つはまだコードから使用しません。Webhook切替前の連携準備です。

## Cloudflare設定手順

1. Cloudflareアカウントを作成またはログイン
2. ローカルでNode.js 22以上を用意
3. LINE Harness OSSの推奨CLIを実行

```powershell
npx create-line-harness
```

4. CLIの案内に従ってCloudflareへログイン
5. D1 Databaseを作成
6. Workerをデプロイ
7. Pages管理画面をデプロイ
8. 管理画面URLを控える

想定URL:

```text
https://<your-name>-admin.pages.dev
https://<your-worker>.<account>.workers.dev
```

## LINE Developers設定手順

LINE Harness検証用の別LINE公式アカウントで行います。

1. LINE Official Account Managerで検証用アカウントを作成
2. Messaging APIを有効化
3. Channel secretを控える
4. Channel access tokenを発行
5. Webhook URLにLINE Harness WorkerのURLを設定
6. Webhookの利用をON
7. 応答メッセージをOFF
8. あいさつメッセージは必要に応じてOFF
9. 検証ボタンで200応答を確認

## Messaging API設定

レビュー職人本番アカウントとLINE Harness検証アカウントを混同しないようにします。

```text
レビュー職人本番:
Webhook URL = https://review-ai-line-bot.onrender.com/webhook/line

LINE Harness検証:
Webhook URL = https://<line-harness-worker-url>/webhook
```

実際のLINE Harness Webhook pathは導入後のWorker設定で確認します。

## 連携設計案

### 案A: レビュー職人を主Webhookのまま、LINE Harnessへイベント送信

レビュー職人が口コミ生成完了時にLINE Harness APIへイベントを送ります。

例:

```json
{
  "event": "review_created",
  "lineUserId": "Uxxxxxxxx",
  "placeName": "ブリッジ",
  "monthlyCount": 3,
  "tags": ["review_created", "monthly_3"]
}
```

メリット:

- 既存Webhookを壊さない
- 口コミ生成フローがそのまま残る
- CRMタグ付けやステップ配信だけLINE Harnessへ任せられる

デメリット:

- LINE Harness側APIの仕様確認が必要

### 案B: LINE Harnessを主Webhookにして、レビュー職人へ中継

LINE HarnessがLINE Webhookを受け、口コミ作成コマンドだけレビュー職人APIへ中継します。

メリット:

- CRM、タグ、リッチメニュー、LIFFを一元管理しやすい

デメリット:

- Webhook切替リスクが高い
- 中継処理の設計が必要
- 本番前の検証が必須

### 推奨

まずは案Aを推奨します。

レビュー職人は既存のWebhookを維持し、口コミ作成完了時にLINE Harnessへ「タグ付け用イベント」を送る構成が安全です。

## レビュー職人側で将来追加する連携ポイント

既存の口コミ作成処理を壊さず、以下のタイミングで任意連携します。

- 店舗候補を選択した時
- 口コミ文を作成した時
- 修正再生成した時
- マイページを表示した時
- 履歴を表示した時

最初に実装するなら、口コミ作成完了時だけで十分です。

## Webhookを切り替える前のチェック項目

切替前に必ず確認します。

- LINE Harness検証用アカウントでWebhook検証が成功している
- タグ付けが管理画面に反映される
- ステップ配信が意図したタイミングで動く
- リッチメニュー切替が動く
- LIFFフォームがLINE内で開く
- レビュー職人の「開始」が従来どおり動く
- レビュー職人の「口コミ作成」が従来どおり動く
- レビュー職人の「マイページ」が従来どおり動く
- レビュー職人の「履歴」が従来どおり動く
- エラー時に「リセット」で復旧できる
- LINE Developersで本番Webhook URLを戻せる手順を控えている

## まだ手動で必要な作業

- LINE Harness OSSを別ディレクトリまたは別リポジトリへ導入
- Cloudflareアカウント認証
- D1 Database作成
- Worker / Pagesデプロイ
- LINE Harness検証用LINE公式アカウント作成
- LINE Harness側Webhook URL設定
- LIFFアプリ作成
- 管理画面の初回ログイン設定

## 禁止事項

- レビュー職人本番Webhook URLをいきなりLINE Harnessへ変更しない
- レビュー職人のLINEチャネルsecret/tokenをLINE Harness検証環境に流用しない
- `.env` やAPIキーをGitHubへコミットしない
- 口コミ作成、マイページ、履歴の既存挙動を確認なしに変更しない
