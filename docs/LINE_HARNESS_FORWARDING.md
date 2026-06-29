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

## 口コミ生成完了時のタグ付け

レビュー職人で口コミ文の生成または修正が完了したら、LINE Harness側の友だちに以下のタグを付けます。

- `口コミ作成_完了`
- `口コミ下書き生成済み`
- `Google投稿案内済み`

Renderには以下も設定してください。

```text
LINE_HARNESS_API_KEY=<LINE HarnessのAPIキー>
LINE_HARNESS_FRIEND_LOOKUP_LIMIT=1000
```

`LINE_HARNESS_WEBHOOK_URL` または `LINE_HARNESS_BASE_URL` と、`LINE_HARNESS_API_KEY` の両方が設定されると、`/health` の `lineHarnessTaggingConfigured` が `true` になります。

内部ではLINE Harnessの既存APIを使います。

```text
GET  /api/tags
POST /api/tags
GET  /api/friends?limit=1000&includeTags=false
POST /api/friends/:id/tags
```

LINE Harness OSSには現時点で `lineUserId` から友だちを1件取得する専用APIがないため、友だち一覧から `lineUserId` が一致する行を探しています。友だち数が増えたら、Harness側に `GET /api/friends/by-line-user-id/:lineUserId` のようなAPIを追加するのが安全です。

## 利用回数・ランク・達成タグ

口コミ文の新規生成が完了して `review_histories` に保存された後、Supabase `users` に以下を同期します。

```text
review_count
last_review_generated_at
rank
milestone_tags_synced
```

ランク条件:

```text
0-4回: 見習い職人
5-19回: レビュー職人
20-49回: 上級職人
50-99回: 師範
100-299回: 名人
300-999回: 家元
1000回以上: 伝説の職人
```

達成時にLINE Harnessへ同期するタグ:

```text
レビュー職人_初回利用
レビュー職人_5回達成
レビュー職人_10回達成
レビュー職人_20回達成
レビュー職人_50回達成
レビュー職人_100回達成
レビュー職人_300回達成
レビュー職人_1000回達成
```

同期済みタグは `users.milestone_tags_synced` に保存し、同じ達成タグを何度も付けないようにします。タグ付け失敗時は口コミ生成やLINE返信を止めません。

将来のジャンルタグ設計:

```text
ジャンル_飲食店
ジャンル_美容院
ジャンル_ホームセンター
ジャンル_病院
ジャンル_ホテル
ジャンル_スーパー
ジャンル_観光地
ジャンル_その他
```

ジャンル自動判定は今後、Google PlacesのtypesやprimaryType、review_histories.category_codeをもとに追加します。
