# thamit-world.github.io

thamit(https://thamit.app)の VRChat ワールド用の配信データを置くリポジトリです。
GitHub Pages(`https://thamit-world.github.io/`)で配信し、VRChat ワールドが固定の URL で読みます。

**M0(技術検証)の間は、合成データだけを置いています。** 実在の人・店・イベントのデータは含みません。

## 禁止事項(焼き込んだ URL を壊さない・乗っ取らせないため)

- 独自ドメインを付けない(付けると 301 になり、VRChat はリダイレクトを追わない)
- 組織名・リポジトリ名を変えない・消さない。旧名は誰でも取れるようになり、焼き込んだ URL に任意の JSON を置かれる
- やめるときも組織は残し、停止用ファイルを置いたままにする
- gh-pages ブランチ方式を使わない(Actions の artifact でデプロイする。git 履歴に配信データを残さない)
- ディレクトリで終わる URL を使わない(ファイル名まで書く。ディレクトリ URL は 301)
- トークンを書かない(公開リポジトリに push したトークンは即座に自動失効する)
- `pull_request` / `pull_request_target` で動くワークフローを置かない
- 個人のメールアドレスでコミットしない(GitHub の noreply のアドレスを使う)

## 構成(M0)

| パス | 中身 |
| --- | --- |
| `m0/generate-synthetic-calendar.mjs` | 合成データのジェネレーター(Node 22・依存ゼロ) |
| `m0/lib/` | 乱数・文章の素・日程・直列化・分割・検証・PNG |
| `m0/qr-fixtures.json` | QR の行列(`uqr` 0.1.3 で作った結果) |
| `m0/tools/make-qr-fixtures.mjs` | 上を作る使い捨ての道具(リポジトリの外で実行する) |
| `m0/test/` | `node --test "m0/test/*.test.mjs"` |
| `static/` | `robots.txt`・`index.html`(`site/` にコピーされる) |
| `.github/workflows/build.yml` | build → deploy → report |

```sh
node m0/generate-synthetic-calendar.mjs --out site --active sixty --mode refresh
node --test "m0/test/*.test.mjs"
```
