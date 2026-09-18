---
description: 把本機的變更部署到 GitHub Pages(build → push 到 gh-pages 分支,並驗證上線結果)
---

這個專案已經完成過一次性設定:GitHub repo `echochen2023/claude_code_treasure_game_by_echo` 已設為 Public(GitHub Pages 在 Free 方案下無法用於 Private repo)。部署方式是用 `gh-pages` npm 套件把 `vite build` 的輸出(`build/` 目錄)推到 `gh-pages` 分支,GitHub Pages 再從那個分支發布靜態網站。正式網址:`https://echochen2023.github.io/claude_code_treasure_game_by_echo/`。

這是**第二個**部署目標,跟既有的 `/deploy_vercel`(push 到 `main` 自動觸發 Vercel)並存、互不影響——兩者是獨立的部署管道。

### 這個專案的 GitHub Pages 特殊設定(不要動)

- `vite.config.ts` 的 `base` 是條件式的:`process.env.GH_PAGES === 'true' ? '/claude_code_treasure_game_by_echo/' : '/'`。因為 GitHub Pages 是 project page(網址帶 repo 名稱路徑),資產路徑必須加上這個前綴,否則畫面會空白(assets 404)。一般的 `npm run build`(給 Vercel 用)維持 `base: '/'` 不受影響。
- `package.json` 的 `predeploy` 腳本是 `GH_PAGES=true vite build`,`deploy` 腳本是 `gh-pages -d build`。`npm run deploy` 會自動先跑 `predeploy` 再推分支。

執行 `/deploy_github_page` 時,依序做以下事情:

1. **檢查本機變更**:跑 `git status` 和 `git diff`,確認有哪些檔案異動。如果 `main` 分支沒有任何未提交的變更且已跟 `origin/main` 同步,只需要重新發布 gh-pages(例如上次部署失敗、或想強制重跑),可以直接跳到步驟 4;如果連 gh-pages 都不需要重跑,告知使用者「目前沒有變更需要部署」並結束。

2. **確認要提交的內容並提交到 `main`**:列出會被加入的檔案,確認沒有 `.env`、`node_modules/`、`build/` 混進去(`.gitignore` 已排除)。如果 `$ARGUMENTS` 有帶文字,用它當 commit message;沒有的話依照這個 repo 既有風格(簡短、說明「為什麼」)自己擬一則。

3. **在真的執行 `git push` 或 `npm run deploy` 之前,先跟使用者確認一次**(這兩個都是會讓內容公開上線的動作,不要自動跳過確認),列出 commit message 和即將發布的內容摘要。

4. **push 到 `origin main`**(如果有新 commit 的話),接著跑 `npm run deploy`。這會用 `GH_PAGES=true` 重新 build 一次(確保 base path 正確),再用 `gh-pages` 套件把 `build/` 推到 `origin` 的 `gh-pages` 分支。

5. **等待並驗證部署**:GitHub Pages 通常在 1~2 分鐘內生效。如果有瀏覽器工具可用,等待約 60~90 秒後打開正式網址 `https://echochen2023.github.io/claude_code_treasure_game_by_echo/`,截圖確認:
   - 畫面正常顯示「輸入 email」登入畫面,不是空白頁或 assets 404(代表 base path 設定跑掉)
   - 不是 GitHub 的 404 頁面(代表 Pages 還沒生效或 Source 設定不對)

6. **回報結果**給使用者:部署狀態、正式網址,以及這次改動摘要。如果畫面異常,依照下面的排查清單處理而不是直接結案。

7. **最後一定要單獨把正式網址列出來**,方便使用者自己點開來看:`https://echochen2023.github.io/claude_code_treasure_game_by_echo/`。這一步不管第 5 步驗證結果是否正常都要做。

## 排查清單(部署後畫面不對時)

- GitHub 的 404 頁面(不是這個 app 的畫面):到 repo 的 **Settings → Pages** 確認 Source 是設成「Deploy from a branch」、分支選 `gh-pages`、資料夾選 `/ (root)`。實測第一次跑 `npm run deploy` 建立 `gh-pages` 分支後,GitHub 有自動偵測並啟用這個設定,但如果第一次部署後還是 404,還是去這裡確認一次。剛啟用時網站生效也可能要等 1~2 分鐘。
- 空白頁,主控台看到 assets 404(路徑對不到 `/claude_code_treasure_game_by_echo/...`):代表這次是用一般 `npm run build`(base `/`)build 出來的,不是用 `npm run deploy`/`predeploy` 的 `GH_PAGES=true` 版本。重新跑 `npm run deploy` 而不是手動 `gh-pages -d build` 配上舊的 `build/`。
- 登入信的連結點了失敗、跳回 `localhost:3000` 並帶著 `#access_token=...`,或是跳到 `https://echochen2023.github.io/`(帶 token 但 404,因為 GitHub Pages 的帳號根目錄本來就沒有網站):代表 Supabase 後台 **Authentication → URL Configuration → Redirect URLs** 裡的網址跟 app 實際送出的 `emailRedirectTo`(`src/lib/player.ts` 裡是 `window.location.origin + window.location.pathname`)沒有逐字對上。GitHub Pages 這筆**必須是帶完整路徑、且結尾有斜線**的 `https://echochen2023.github.io/claude_code_treasure_game_by_echo/`(不是不帶路徑的 bare origin)。Vercel 那筆同理,結尾也要有斜線:`https://claude-code-treasure-game-by-echo.vercel.app/`。對不上的話 Supabase 不會報錯,只會悄悄 fallback 回 Site URL(`http://localhost:3000`)。改完設定後要重新請求一次新的登入信,舊信裡的連結網址已經定型了。
- repo 被改回 Private:GitHub Pages 在 Free 方案的 Private repo 上會直接失效,網站會 404。

## 不是這個命令要處理的情境

如果 GitHub Pages 本身還沒設定過(repo 還是 Private、`gh-pages` 套件還沒裝、`vite.config.ts` 還沒加條件式 `base`),那是一次性的初始設定,不在這個命令的範圍內——需要先把 repo 設為 Public、安裝 `gh-pages`、設定 `base` 和 scripts,再走一次完整流程,而不是套用這裡的「日常 push 部署」步驟。
