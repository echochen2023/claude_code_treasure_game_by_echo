---
description: 把本機的變更部署到 Vercel(push 到 main 觸發自動部署,並驗證上線結果)
---

這個專案已經完成過一次性設定:GitHub repo 是 `echochen2023/claude_code_treasure_game_by_echo`(remote `origin`,分支 `main`),Vercel 專案透過 GitHub 整合連接到這個 repo,**push 到 `main` 就會自動觸發一次新的 Production 部署**,不需要手動跑 `vercel` CLI(本機也沒有安裝)。正式網址:`https://claude-code-treasure-game-by-echo.vercel.app`。

執行 `/deploy_vercel` 時,依序做以下事情:

1. **檢查本機變更**:跑 `git status` 和 `git diff`,確認有哪些檔案異動。如果沒有任何未提交的變更,且本地 `main` 已經跟 `origin/main`同步,告知使用者「目前沒有變更需要部署」,結束。

2. **確認要提交的內容**:列出會被加入的檔案,確認沒有 `.env`、`node_modules/`、`build/` 或其他不該進版控的東西混進來(`.gitignore` 應該已經排除)。如果 `$ARGUMENTS` 有帶文字,用它當 commit message 的主要內容;沒有的話依照這個 repo 既有的 commit message 風格(簡短、說明「為什麼」而不是條列「做了什麼」)自己擬一則。

3. **在真的執行 `git push` 之前,先跟使用者確認一次**(這是會影響遠端/線上狀態的動作,不要自動跳過確認),列出 commit message 和即將 push 的內容摘要。

4. **push 到 `origin main`**。push 成功後不需要再手動觸發 Vercel——GitHub 整合的 webhook 會自動開始建置。

5. **等待並驗證部署**:提醒使用者部署通常在 1~2 分鐘內完成,可以到 Vercel 專案的 Deployments 頁面看狀態(Building → Ready)。如果有瀏覽器工具可用,等待約 30~60 秒後直接打開正式網址 `https://claude-code-treasure-game-by-echo.vercel.app`,截圖確認:
   - 畫面正常顯示「輸入 email」登入畫面,不是「需要設定 Supabase」的 fallback 訊息(代表環境變數還在)
   - 不是 Vercel 的部署錯誤頁或空白頁

6. **回報結果**給使用者:部署狀態、正式網址,以及這次改動摘要。如果畫面異常(空白、報錯、fallback 訊息),依照下面的排查清單處理而不是直接結案。

7. **最後一定要單獨把正式網址列出來**,方便使用者自己點開來看:`https://claude-code-treasure-game-by-echo.vercel.app`。這一步不管第 5 步驗證結果是否正常都要做——使用者會自己去看部署後的樣子,不是只靠我截圖確認就結束。

## 排查清單(部署後畫面不對時)

- 空白頁或 404:到 Vercel Deployments 頁面的 Build Logs 找錯誤訊息;最常見原因是 Output Directory 設定跑掉(這個專案的 `vite build` 輸出到 `build/`,不是 Vite 預設的 `dist/`,Vercel 專案設定裡要保持覆寫成 `build`)。
- 顯示「需要設定 Supabase」的 fallback 訊息:代表 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 在 Vercel 的環境變數不見了或值是空的,去 Project Settings → Environment Variables 檢查(兩者都應該是 **Config** 類型,不能是 Secret,因為 Secret 存進去後無法再讀出來確認,也無法轉換型別,只能刪掉重建)。
- 登入信的連結點了失敗:代表 Supabase 後台 **Authentication → URL Configuration → Redirect URLs** 沒有加入正式網址,或是網址有變動(例如換了自訂網域)沒有同步更新。

## 不是這個命令要處理的情境

如果 Vercel 專案本身還沒建立(第一次要幫這個專案上線)、需要重新走 git init/建 GitHub repo/匯入 Vercel 專案/設定環境變數,那是一次性的初始設定,不在這個命令的範圍內——可以直接照當初規劃部署時的對話脈絡走一次完整流程,而不是套用這裡的「日常 push 部署」步驟。
