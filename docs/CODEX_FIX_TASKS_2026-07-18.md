# 修正タスク指示書（2026-07-18 コードレビュー結果）

対象プロジェクト: 口コミレビュー職人（LINE Bot / Node.js + Express 5 + Supabase + Gemini + Stripe）
このファイルの場所: `docs/CODEX_FIX_TASKS_2026-07-18.md`
プロジェクトルート: このファイルの1つ上のフォルダ

## 前提・注意事項

- ESM（`"type": "module"`）。既存のコードスタイル（インポート順、命名、日本語UI文言のトーン）に合わせること。
- 本番は Render 無料プランで稼働中。データ永続化は Supabase が本命、`data/*.json` はフォールバック。
- 動作を変えるのは下記タスクの範囲のみ。リファクタリングのついでに挙動を変えないこと。
- 各タスク完了後、`node --check <変更ファイル>` で構文確認すること（テストは存在しない）。

---

## タスク1【バグ・必須】Supabase有効時に「今日は0件」固定になる

**場所:** `services/historyStore.js` の `getSupabaseReviewStats()`（108行目付近）

**問題:** 戻り値が `todayCount: 0` のハードコード。Supabase使用時、口コミ生成後の実績メッセージ（`services/lineService.js` の `formatAchievement`）が常に「今日は0件」と表示される。

**修正:** `monthResult` と同様に、当日分のカウントクエリを追加して `todayCount` に入れる。

- 当日の境界は **Asia/Tokyo（JST）** 基準にすること。既存の `toDateKey()`（JSTでYYYY-MM-DD を返す）を利用し、JSTの当日0時〜翌日0時をISO文字列にして `created_at` を `gte`/`lt` で絞る。
- テーブル: `review_histories`、条件: `line_user_id` 一致。既存の total/month クエリと同じパターンで `{ count: "exact", head: true }` を使う。

---

## タスク2【バグ・必須】ランキング4位以下が「4位　4位　名前」と重複表示

**場所:** `services/rankingService.js` 8行目

```js
? ranking.top.map((item, index) => `${MEDALS[index] || `${item.rank}位`}　${item.rank}位　${item.displayName}　${item.count}件`).join("\n")
```

**問題:** メダルがない4位以降は `MEDALS[index]` が undefined のためフォールバックの「4位」が使われ、直後の `${item.rank}位` と重複する。

**修正:** 1〜3位は「🥇　1位　名前　N件」、4位以降は「4位　名前　N件」（順位は1回だけ）になるようにする。例:

```js
? ranking.top.map((item, index) => {
    const medal = MEDALS[index] ? `${MEDALS[index]}　` : "";
    return `${medal}${item.rank}位　${item.displayName}　${item.count}件`;
  }).join("\n")
```

---

## タスク3【バグ・必須】月間集計の境界がUTC（JSTでは毎月1日 朝9時リセットになる）

**場所:**
- `services/billingService.js` の `monthRange()`（216行目付近）
- `services/historyStore.js` の `monthRange()`（209行目付近）

**問題:** `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)` でUTC月初を計算しているため、JSTの毎月1日 0:00〜9:00 の作成分が前月扱いになる。表示用の月キー（`currentMonthKey` / `toMonthKey`）はJST基準なので不整合。ヘルプの案内「毎月1日にリセット」とも食い違う。有料プランの月間上限カウント（`getMonthlyGeneratedCount`）にも同じズレがある。

**修正:** 両ファイルの `monthRange()` を **JSTの月初〜翌月初** を返すように変更する。JSTはUTC+9固定（サマータイムなし）なので、次のような実装でよい:

```js
function monthRange() {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const monthStartUtcMs = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), 1) - JST_OFFSET_MS;
  const nextMonthStartUtcMs = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 1) - JST_OFFSET_MS;
  return {
    monthStart: new Date(monthStartUtcMs).toISOString(),
    nextMonthStart: new Date(nextMonthStartUtcMs).toISOString(),
  };
}
```

2ファイルに同じ関数が重複しているが、共通化するかどうかは任せる（重複のままでも可。挙動の一致だけ必須）。

---

## タスク4【重要・運用】セッションをSupabaseに保存する（Render揮発ディスク対策）

**場所:** `services/sessionStore.js`（現状 `data/sessions.json` のみ）

**問題:** Render無料プランはディスクが揮発的で、15分無アクセスでスピンダウンする。会話の途中（質問1〜3に回答中）で再起動が起きるとセッションが消え、ユーザーが突然最初に戻される。

**修正方針:** `historyStore.js` と同じパターンで「Supabaseが設定されていればSupabase、失敗またはは未設定ならJSONフォールバック」の二段構えにする。

1. `docs/supabase_schema.sql` に以下のテーブル定義を追記する:

```sql
create table if not exists sessions (
  line_user_id text primary key,
  session jsonb not null,
  updated_at timestamptz not null default now()
);
```

2. `sessionStore.js` の公開API（`getSession` / `saveSession` / `clearSession` / `setGenerating` / `ensureSessionStore`）のシグネチャは変えずに、内部実装を切り替える:
   - `isSupabaseConfigured()`（`./supabaseClient.js`）が true なら `sessions` テーブルに upsert / select / delete。
   - セッション本体は `session` カラム（jsonb）にそのまま格納。
   - 有効期限30分（既存の `MAX_AGE_MS`）は取得時に判定し、期限切れなら削除して null を返す。
   - Supabaseのクエリが失敗した場合は `console.error` してJSONフォールバックに落とす（既存の `historyStore.js` の書き方に合わせる）。
3. JSON実装は削除せずフォールバックとして残す。

**受け入れ条件:** Supabase未設定のローカル環境では従来どおりJSONで動くこと。

---

## タスク5【重要・コスト】push送信をreplyに置き換えてLINE無料枠(月200通)の消費を減らす

**場所:** `services/lineService.js` の `handleFeeling` / `handleRevision` / `pushReviewMessages`

**問題:** 現在は「作成しています」を reply で返し、完成した口コミ文を push で2通送っている（本文＋メタ情報）。push は無料プランで月200通までのため、月100生成で枯渇して完成文が届かなくなる。reply は無料・無制限。

**修正方針:**

1. `handleFeeling` / `handleRevision` で、中間reply（「口コミ文を作成しています…」）を送らない。代わりに **LINEのローディングアニメーションAPI** を呼ぶ:
   - `POST https://api.line.me/v2/bot/chat/loading/start`、ボディ `{ "chatId": userId, "loadingSeconds": 30 }`、ヘッダ `Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`。
   - `@line/bot-sdk` v10 にヘルパーがあれば（`showLoadingAnimation`）それを使う。なければ `fetch` で直接呼ぶ。失敗しても処理は続行（`console.warn` のみ）。
2. 生成完了後、`replyToken` を使って **reply 1回で複数メッセージ**（本文テキスト＋メタ情報テキストの2件、`messages` 配列）を送る。`reply` 関数を複数メッセージ対応に拡張するか、`replyMessages(replyToken, texts[])` を新設する。
3. reply token は発行から約1分で失効し1回しか使えない。生成が失敗した場合・replyが失効エラーになった場合のみ、従来どおり push でエラーメッセージ/結果を送るフォールバックを残す。
4. `formatAchievement`（実績メッセージ）は従来どおりメタ情報メッセージに結合する。
5. `handleRecruitBoard` 内の `await push(userId, recruitGuideText())` も push をやめ、reply 1回で「ガイドテキスト＋Flexカルーセル」の2メッセージを返す形にする。

**受け入れ条件:** 正常系（生成成功）で push が0通になること。エラー系のみ push を使うこと。

---

## タスク6【セキュリティ】本番では署名検証を強制する

**場所:** `routes/lineWebhook.js` 19行目

**問題:** `LINE_VERIFY_SIGNATURE=false` で署名検証を無効化できる。本番で誤設定すると誰でもwebhookを叩けて Gemini / Places API を浪費できる。

**修正:**

```js
const shouldVerifySignature =
  process.env.NODE_ENV === "production" || process.env.LINE_VERIFY_SIGNATURE !== "false";
```

Render では `NODE_ENV=production` が `render.yaml` で設定済み。`.env.example` のコメントにも「本番では無効化できない」旨を1行追記する。

---

## タスク7【軽微・任意】コード品質の整理

優先度は低い。タスク1〜6が終わってから着手。

1. **LINE Clientの使い回し:** `services/lineService.js` の `reply` / `replyFlex` / `push` が毎回 `new Client()` している。モジュールレベルで遅延生成のシングルトンにする（`LINE_CHANNEL_ACCESS_TOKEN` 未設定時のエラーは現状どおり投げる）。
2. **死にコード削除:** `services/lineService.js` の `helpMessage()`（カルーセルに置き換え済みで未使用）と、恒等関数 `formatCopyOnlyReview()`（呼び出し側で直接 `review` を使う）を削除。
3. **非表示店舗キーワードの環境変数化:** `services/recruitBoardService.js` の `HIDDEN_RECRUIT_LISTING_KEYWORDS = ["おかしのたいよう"]` を `RECRUIT_HIDDEN_KEYWORDS`（カンマ区切り）から読むようにし、`.env.example` と `render.yaml` に追記。未設定時は空配列（既存のハードコード値は `.env.example` のコメント例として残す）。

---

## やらないこと（スコープ外）

- 修正（revise）を課金カウント対象に含める変更（現状は意図的に create のみカウント）
- お気に入り機能の実装（準備中のまま）
- git リポジトリ化・デプロイ作業（人間が実施）

## 検証チェックリスト

- [ ] `node --check` が全変更ファイルで通る
- [ ] Supabase未設定のローカルで `npm run dev` → LINE webhook相当のフローがJSONフォールバックで動く
- [ ] ランキング表示: 1〜3位にメダル、4位以下は順位が1回だけ表示される
- [ ] 生成成功時にpush送信が発生しない（コード上で確認）
- [ ] `NODE_ENV=production` かつ `LINE_VERIFY_SIGNATURE=false` でも署名検証が有効
