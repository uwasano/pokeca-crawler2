# PCなしメルカリ巡回(GitHub Actions)セットアップ手順

GitHubの無料クラウドPCで、2時間ごとにメルカリを本物のChromeで巡回して、結果をGASに送る。
**PCの電源は不要。** サイトの⚙設定(自動巡回ON/OFF・夜間停止)にもちゃんと従う。

⚠️ 先にいつもの作業: 新しい GAS_Code.gs.txt を script.google.com に貼り替え→デプロイ更新しておくこと(GitHub用の受け口が入ってる)。

## 手順(スマホでもPCでもOK・10分)

### ① リポジトリを作る
1. github.com にログイン → 右上の「+」→「New repository」
2. Repository name: `pokeca-crawler`
3. **Public** を選ぶ(Publicだと実行時間が無制限で無料。コードに秘密は入ってないので安全)
4. 「Create repository」

### ② ファイル1個目: crawler.mjs
1. 「creating a new file」(または Add file → Create new file)をタップ
2. ファイル名に `crawler.mjs` と入力
3. 同梱の **crawler.mjs** の中身を全部コピーして貼り付け
4. 「Commit changes」

### ③ ファイル2個目: ワークフロー
1. Add file → Create new file
2. ファイル名に `.github/workflows/mercari.yml` と入力(スラッシュを打つとフォルダになる)
3. 同梱の **mercari.yml** の中身を全部コピーして貼り付け
4. 「Commit changes」

### ④ 合言葉を登録(2個)
1. リポジトリの Settings → 左メニューの「Secrets and variables」→「Actions」
2. 「New repository secret」で以下を1個ずつ登録:
   - Name: `GAS_URL`
     Secret: `https://script.google.com/macros/s/AKfycbyDlPSmKFsV7ggOncIziRxTOjDSXHa1_Tz9WVOG8DTYhXAumn05gLvFUUXUNCflKoxM/exec`
   - Name: `GAS_TOKEN`
     Secret: `CHANGE_ME_secret_token`

### ⑤ テスト実行(ここが本番)
1. リポジトリの「Actions」タブ →「mercari-crawl」→ 右の「Run workflow」→ 緑のボタン
2. 2〜4分待って結果を見る:
   - ✅ **緑(成功)** → ログに「合計◯商品」→ **PCなしメルカリ監視の完成**。あとは放置で2時間ごとに自動巡回。S/A検知でメール、サイトの監視候補に掲載
   - ❌ **赤(失敗)** でログに「0商品 = GitHubのIPがメルカリに弾かれている」→ この方法は不可と確定。PCの自動巡回で運用継続(それでも試す価値はあった)

## 補足
- 巡回するかどうかは毎回GASに確認する(関所方式)。サイトの⚙設定で「PC自動巡回」をOFFにすればGitHubの巡回も止まる。夜間停止(1〜7時)も同じく効く
- GitHubの仕様で、**60日間リポジトリに何も変更がないと定期実行が自動停止**する。たまに(2ヶ月に1回)READMEでも何でも1文字編集すれば延命できる。止まったらActionsタブに「有効化」ボタンが出るのでそれを押してもいい
- PCの自動巡回(タスクスケジューラ)と両方動いていても大丈夫。関所が間隔を見てるので二重巡回にはならない
- 成約相場(売り切れページ)の取得はGitHub版はやらない軽量仕様。相場を濃くしたい時は今まで通りPCで「ポケカ相場チェック.bat」を回す
