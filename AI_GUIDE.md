# 給 AI 助手看的專案說明

如果你想改這個 App，把這個檔案連同專案一起丟給 Claude / ChatGPT / Gemini，
它就能理解架構、避開已知的坑。

---

## 這是什麼

一個記錄飲食、體重、喝水的 PWA。**沒有框架、沒有 build step、沒有後端**——
三個檔案就是全部，用瀏覽器直接開就會動。

```
index.html    畫面結構（所有 DOM 都在這，JS 只負責填內容）
styles.css    樣式（含 iOS 安全區、44px 觸控區）
app.js        全部邏輯，約 1500 行，無模組化
sw.js         Service Worker，離線快取
manifest.json PWA 設定
icons/        圖示（make_icons.py 可重新產生，純 Python 無相依）
```

改完直接把資料夾丟到任何靜態主機（Cloudflare Pages、Netlify、Vercel、GitHub Pages）就能用。

## 資料模型

全部存在 `localStorage` 的單一 key `nutri-tracker-v1`，結構是一個物件 `D`：

```js
D = {
  days: {                       // 每一天一筆，key 是 'YYYY-MM-DD'
    '2026-08-14': {
      f: [ {n, k, p, c, f, fi, su, na, sa, ch, po, ca, fe, va, vc, m, tag} ],
      s: { s1: true },          // 保健品組打勾狀態
      sn: { s1: {t, n, mi} },   // ★ 打勾當下的組合快照，見下方「最重要的設計」
      w: 55,                    // 體重
      wa: 1500                  // 喝水 ml
    }
  },
  presets: [...],               // 常吃清單
  supps:   [...],               // 保健品組合（現行設定）
  inbody:  [...],               // 體組成紀錄
  targets: {...},               // 每日目標
  api:     { key: '' },         // 使用者自己的 Gemini 金鑰
  freq:    {}                   // 常吃項目點擊次數，用來排序
}
```

食物欄位縮寫：`k` 熱量、`p` 蛋白質、`c` 碳水、`f` 脂肪、`fi` 纖維、`su` 糖、
`na` 鈉、`sa` 飽和脂肪、`ch` 膽固醇、`po` 鉀、`ca` 鈣、`fe` 鐵。
`m` 是餐別（b 早餐／l 午餐／d 晚餐／sn 點心／sup 保健品），`tag` 是 `sup:<組id>`。

---

## ★ 最重要的設計：設定 vs 已記錄的事實

**這是這個專案踩過最痛的坑，改任何東西前先讀懂。**

`D.supps` 是「**現在**的保健品設定」。早期版本渲染每一天時直接拿它來畫，
結果使用者改一次設定，**過去每一天的顯示全部跟著變**——歷史被回溯改寫，而且原始值沒存過、救不回來。

現在的作法：**打勾的當下，把那一刻的 `{時段, 名稱, 維他命%}` 存進那一天的 `day.sn[id]`**。

相關函式：

| 函式 | 用途 |
|---|---|
| `markSupp(d, id)` | 打勾：記錄狀態 + 存快照 |
| `unmarkSupp(d, id)` | 取消打勾：清掉快照 |
| `suppView(d, s)` | 有快照用快照，沒有才退回現行設定 |
| `suppsFor(d)` | 這一天該列的組合（含「設定已刪但當天有記錄」的） |

**任何新增打勾的地方都要用 `markSupp()`，不要直接寫 `d.s[id] = true`。**
渲染、維他命加總、CSV 匯出都要走 `suppsFor(d)`，不要走 `supps()`。

> 通則：**凡是拿「現行設定」去渲染「歷史資料」的地方，都是在等著回溯改寫。**
> 食物的營養值一開始就是複製進 `d.f` 的快照，所以沒事；保健品組合當初漏掉了。
> 之後加任何「可編輯的預設集」都要一併考慮這件事。

---

## 其他已知的坑

### 1. Service Worker 必須 network-first

早期用 cache-first，結果 `index.html` 更新了但 `styles.css` / `app.js` 還是舊快取——
**同一支 App 混著兩個版本的檔案**，版面跑掉、改的東西沒生效，超難查。

現在：App 本體 network-first（有網路以伺服器為準），圖示／字型才 cache-first。
`install` 直接 `skipWaiting()`，不用使用者點「更新」。

**改完務必實測**：塞一份假的舊快取進去再重載，不要只清快取測——清過快取測不出這個問題。

### 2. 改 `DEFAULT_*` 常數對既有使用者無效

`DEFAULT_PRESETS` / `DEFAULT_SUPPS` 只是**初值**。存檔一旦建立，
之後讀的都是 `D.presets` / `D.supps`，改常數對已經在用的人完全沒作用。

要讓既有使用者也生效，得在 `normalize()` 裡寫一次性搬遷，配一個版本欄位。
**搬遷要寫成「舊值完全相符才換」**，這樣使用者自己改過的不會被蓋掉，重複執行也安全。

⚠️ 版本欄位在 `DEFAULTS` 裡**必須是「未搬遷」的值（通常 0）**，
搬遷完成的值只能在 `normalize()` 裡寫。否則全新安裝會被誤判成「已搬遷」而跳過。

### 3. `normalize()` 是最後防線

它保證載入的資料一定是合法形狀、**絕不出現 undefined**。
新增任何欄位都要在裡面補預設值和型別檢查，不然舊存檔載入會壞。

### 4. 版本號要一起改

改動 `app.js` 或 `index.html` 後，`APP_VER`（app.js）和 `VER`（sw.js）**要一起 bump**，
否則 Service Worker 快取不會失效。

---

## AI 估算怎麼運作

沒有後端。使用者在設定頁填自己的 Gemini 金鑰，**瀏覽器直接呼叫 Google 的 API**。

- 金鑰存在 `D.api.key`（使用者自己的 localStorage）
- `askProxy(payload)` 組請求，`AI_PROMPT` 和 `AI_SCHEMA` 是寫死的
- 用 Gemini 的 `responseSchema` 做結構化輸出，省掉解析字串的麻煩
- 模型在 `GEMINI_MODEL` 常數，想換版本改那一行

⚠️ Gemini 的 `responseSchema` **不支援 `additionalProperties`**，別照 OpenAI/Anthropic 的 schema 抄。

### 想改成有後端的版本？

如果你要多人共用一把金鑰，就得把金鑰放伺服器端（絕不能放前端）。
作法是加一個 Cloudflare Pages Function（`functions/api/estimate.js`），
前端改成 POST 給 `/api/estimate`，金鑰放環境變數。
記得驗證輸入、寫死 model/prompt/schema，不然端點會被當成免費的通用 LLM 用。

---

## 開發慣例

- UI 文字繁體中文，語氣簡短口語
- 註解寫「為什麼」不寫「做什麼」，繞路的地方要交代原因
- 所有可點元素最小 44px 觸控區
- 沒有測試框架。改資料搬遷類的東西，建議寫個純函式的小腳本跑過再上線
- 驗證方式：瀏覽器實測（清 SW 快取再重載），別只看程式碼

## 產品營養數值的原則

**一律查官方標示，不要憑印象填。** 這個專案發生過兩次：
一次把某綜合維他命的營養素全部算成官方值的一半（誤以為標示是雙倍份量的），
一次把某飲品記成 30 大卡／8.8g 蛋白質（實際是 6 大卡／0g）。
兩次都是去查官網才發現。標示上的「每一份量」和「本包裝含X份」要看清楚。
