---
description: 把本機的變更部署到 GitHub Pages(build → push 到 gh-pages 分支,並驗證上線結果);如果還沒登入 GitHub 帳號或還沒有對應的 repo,會先引導完成這些前置設定
---

這個專案的部署方式是用 `gh-pages` npm 套件把 `vite build` 的輸出(`build/` 目錄)推到 `gh-pages` 分支,GitHub Pages 再從那個分支發布靜態網站。這是**第二個**部署目標,跟既有的 `/deploy_vercel`(push 到 `main` 自動觸發 Vercel)並存、互不影響——兩者是獨立的部署管道。

目前已知的正式設定(如果 repo 已經存在,以下就是現況):GitHub repo `echochen2023/claude_code_treasure_game_by_echo`(Public,GitHub Pages 在 Free 方案下無法用於 Private repo),正式網址 `https://echochen2023.github.io/claude_code_treasure_game_by_echo/`。但不要假設這一定已經設定好——如果換了一台新機器、還沒登入過 `gh`,或是這個 repo 因故不存在了,先照下面「Step 0」處理,不要直接跳到日常部署步驟。

## Step 0:確認 GitHub 帳號與 repo 是否就緒

執行 `/deploy_github_page` 一開始,先做以下檢查,不要假設環境已經設定好。如果檢查結果一切正常(已登入、repo 也存在),整個 Step 0 只是走個過場,直接進入下面「日常部署」的步驟 1 即可。

### 0-1. 確認 `gh` CLI 已安裝且已登入

跑 `gh auth status` 確認登入狀態:

- **沒安裝 `gh`**:告知使用者需要先安裝 GitHub CLI(Mac 用 `brew install gh`,或到 https://cli.github.com/ 下載),安裝完再重新執行這個指令。不要試圖用其他方式(例如裸 `curl` 配 `git credential fill` 之類的操作)繞過去處理帳號認證。
- **已安裝但未登入**(`gh auth status` 顯示類似 `You are not logged into any GitHub hosts`):**這一步一定要使用者自己動手完成**,不要代替使用者輸入帳號密碼或貼 token。請使用者在對話框輸入 `! gh auth login`,這會啟動互動式登入流程(可以選瀏覽器登入,或貼上 personal access token),完成後回來說一聲,再重新執行 `/deploy_github_page`。
- **已登入**:把 `gh auth status` 顯示的帳號(`Logged in to github.com as <username>`)告知使用者,讓他確認這是要用的帳號——避免不小心用錯帳號建立 repo。

### 0-2. 確認本機是 git repo,且連到一個真的存在的 GitHub repo

- 如果目前資料夾還不是 git repo(`git status` 報錯):跑 `git init`。
- 如果有 `origin` remote,先跑 `gh repo view`(或 `git ls-remote origin`)確認這個 remote 指向的 repo **真的存在**、而且**目前登入的帳號存取得到**——不要只看本機 `git remote -v` 有設定值就假設沒問題,repo 有可能已經在 GitHub 上被刪除、改名,或轉移給別的帳號。
- 如果**沒有 `origin` remote**,或確認後發現 remote 指向的 repo 不存在,代表還沒有對應的 GitHub repo,需要建立一個新的:
  1. 跟使用者確認三件事:repo 名稱(可以先建議用目前資料夾名稱,或沿用這份文件記錄的既有名稱 `claude_code_treasure_game_by_echo`)、要建在 0-1 確認過的哪個帳號/組織下、Public 還是 Private——並提醒使用者 **GitHub Pages 在 Free 方案下必須是 Public repo** 才能用,如果使用者堅持要 Private,GitHub Pages 這個部署目標就沒辦法用。
  2. **在真的執行建立 repo 之前,先跟使用者確認一次**(這會建立一個新的、可能公開的遠端資源,是不可逆的公開動作,不要自動跳過確認),列出即將執行的指令、repo 名稱和可見度。
  3. 確認後執行 `gh repo create <repo-name> --public --source=. --remote=origin`。如果本機已經有 commit,可以加 `--push` 一併推上去;如果還沒有任何 commit,建立完 remote 後,讓後面「日常部署」的步驟 2 去處理 commit + push。
  4. 如果這個專案本身也還沒做過 GitHub Pages 的技術設定(`vite.config.ts` 沒有條件式 `base`、`package.json` 沒有 `gh-pages` 依賴和 `predeploy`/`deploy` scripts),用剛剛確認好的 repo 名稱組出 base path(`/<repo-name>/`),照下面「這個專案的 GitHub Pages 特殊設定」那節的模式補上,而不是假設它已經存在——這通常只會發生在把這份指令當範本套用到全新專案的情況,不是這個 repo 目前的狀態。
- 如果 remote 存在,而且確認 repo 真的存在、存取得到:略過上面建立 repo 的流程,直接進入下面「日常部署」的步驟 1。

## 這個專案的 GitHub Pages 特殊設定(不要動)

- `vite.config.ts` 的 `base` 是條件式的:`process.env.GH_PAGES === 'true' ? '/claude_code_treasure_game_by_echo/' : '/'`。因為 GitHub Pages 是 project page(網址帶 repo 名稱路徑),資產路徑必須加上這個前綴,否則畫面會空白(assets 404)。一般的 `npm run build`(給 Vercel 用)維持 `base: '/'` 不受影響。
- `package.json` 的 `predeploy` 腳本是 `GH_PAGES=true vite build`,`deploy` 腳本是 `gh-pages -d build`。`npm run deploy` 會自動先跑 `predeploy` 再推分支。

## 日常部署

在 Step 0 確認帳號與 repo 都就緒之後,依序做以下事情:

1. **檢查本機變更**:跑 `git status` 和 `git diff`,確認有哪些檔案異動。如果 `main` 分支沒有任何未提交的變更且已跟 `origin/main` 同步,只需要重新發布 gh-pages(例如上次部署失敗、或想強制重跑),可以直接跳到步驟 4;如果連 gh-pages 都不需要重跑,告知使用者「目前沒有變更需要部署」並結束。

2. **確認要提交的內容並提交到 `main`**:列出會被加入的檔案,確認沒有 `.env`、`node_modules/`、`build/` 混進去(`.gitignore` 已排除)。如果 `$ARGUMENTS` 有帶文字,用它當 commit message;沒有的話依照這個 repo 既有風格(簡短、說明「為什麼」)自己擬一則。

3. **在真的執行 `git push` 或 `npm run deploy` 之前,先跟使用者確認一次**(這兩個都是會讓內容公開上線的動作,不要自動跳過確認),列出 commit message 和即將發布的內容摘要。

4. **push 到 `origin main`**(如果有新 commit 的話),接著跑 `npm run deploy`。這會用 `GH_PAGES=true` 重新 build 一次(確保 base path 正確),再用 `gh-pages` 套件把 `build/` 推到 `origin` 的 `gh-pages` 分支。

5. **等待並驗證部署**:GitHub Pages 通常在 1~2 分鐘內生效。如果有瀏覽器工具可用,等待約 60~90 秒後打開正式網址 `https://echochen2023.github.io/claude_code_treasure_game_by_echo/`,截圖確認:
   - 畫面正常顯示登入方式選擇畫面,不是空白頁或 assets 404(代表 base path 設定跑掉)
   - 不是 GitHub 的 404 頁面(代表 Pages 還沒生效或 Source 設定不對)

6. **回報結果**給使用者:部署狀態、正式網址,以及這次改動摘要。如果畫面異常,依照下面的排查清單處理而不是直接結案。

7. **最後一定要單獨把正式網址列出來**,方便使用者自己點開來看:`https://echochen2023.github.io/claude_code_treasure_game_by_echo/`。這一步不管第 5 步驗證結果是否正常都要做。

## 排查清單(部署後畫面不對時)

- GitHub 的 404 頁面(不是這個 app 的畫面):到 repo 的 **Settings → Pages** 確認 Source 是設成「Deploy from a branch」、分支選 `gh-pages`、資料夾選 `/ (root)`。實測第一次跑 `npm run deploy` 建立 `gh-pages` 分支後,GitHub 有自動偵測並啟用這個設定,但如果第一次部署後還是 404,還是去這裡確認一次。剛啟用時網站生效也可能要等 1~2 分鐘。
- 空白頁,主控台看到 assets 404(路徑對不到 `/claude_code_treasure_game_by_echo/...`):代表這次是用一般 `npm run build`(base `/`)build 出來的,不是用 `npm run deploy`/`predeploy` 的 `GH_PAGES=true` 版本。重新跑 `npm run deploy` 而不是手動 `gh-pages -d build` 配上舊的 `build/`。
- 登入後沒反應,或收不到驗證碼信:現在的登入是輸入驗證碼,不是點信裡的連結,跟這個部署管道的 base path/redirect 設定無關——Supabase 的 Redirect URLs 允許清單已經不是這條登入流程需要的東西了(舊的 magic-link 設定就算還留著也不影響)。這類問題是 Supabase Email Template 或寄信本身的問題,不是 GitHub Pages 部署失敗,不用往 base path 那個方向排查。
- repo 被改回 Private:GitHub Pages 在 Free 方案的 Private repo 上會直接失效,網站會 404;這種情況照 Step 0-2 的邏輯會被 `gh repo view` 抓到(repo 存在但可能行為異常),但保險起見還是直接去 repo 的 **Settings → General → Danger Zone** 確認可見度。

## 不是這個命令要處理的情境

跟 GitHub Pages 部署無關的事不在這個命令範圍內,例如 Vercel 那條部署管道的初始設定(那是 `/deploy_vercel` 的事)、Supabase 後台的 Email Template/Auth 設定。GitHub 帳號登入和 repo 建立已經在 Step 0 處理,不算例外情境了。
