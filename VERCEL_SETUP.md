# Vercel 設定教學

這份文件是給下載/clone 這個專案、但還沒有把它架上 Vercel 的人看的完整設定教學。如果你的 Vercel 專案已經建立好、也能自動部署了,可以跳過這份文件,直接用 `/deploy_vercel` 處理之後的日常部署。

> Vercel 是**選用**的部署管道,跟 GitHub Pages(見 `.claude/commands/deploy_github_page.md`)是兩條互不影響的獨立管道,兩個都設定或只設定其中一個都可以。本機 `npm run dev` 開發跟這份文件完全無關,不設定 Vercel 一樣可以在本機玩這個遊戲。

## 1. 把專案準備成一個 GitHub repo

Vercel 是透過 GitHub 匯入專案來部署的,所以要先有一個推上 GitHub 的 repo。

- 如果你已經有推上 GitHub 的 repo,跳到第 2 節。
- 如果還沒有:
  1. 確認已經安裝並登入 GitHub CLI(`gh auth status`)。沒裝的話 Mac 用 `brew install gh`,或到 https://cli.github.com/ 下載;沒登入的話在終端機跑 `gh auth login` 走互動式登入(這一步要自己操作,不要把帳密或 token 交給別人代辦)。
  2. 在專案根目錄跑 `git init`(如果還不是 git repo 的話)、`git add`、`git commit` 建立第一個 commit。
  3. 跑 `gh repo create <repo-name> --public --source=. --remote=origin --push`(Vercel 對 Public/Private repo 都支援,可以依需求選;跟 GitHub Pages 不同,**Vercel 不要求 repo 一定要是 Public**)。

## 2. 建立 Vercel 帳號並連接 GitHub

1. 到 https://vercel.com,選擇用 **Continue with GitHub** 註冊/登入——這樣 Vercel 會直接跟你的 GitHub 帳號串接,不用另外設定 OAuth。
2. 第一次登入會問要不要授權 Vercel 存取你的 GitHub repo,選擇「All repositories」或只授權這個專案的 repo 都可以。

## 3. 匯入專案

1. Vercel 後台 → **Add New → Project**。
2. 從清單選到剛剛推上 GitHub 的 repo,點 **Import**。
3. Vercel 會自動偵測成 Vite 專案,帶出預設的 Build 設定,但**這個專案的建置輸出目錄不是預設值,必須手動改**:
   - **Framework Preset**:Vite(自動偵測,不用改)
   - **Build Command**:維持自動偵測的 `vite build`(或等同 `npm run build`),不用改
   - **Output Directory**:把預設的 `dist` **改成 `build`**——這個專案的 `vite.config.ts` 裡 `build.outDir` 設定的是 `build`,沒改這裡的話部署出來會是空白頁或找不到頁面。
4. 這時候先**不要**急著按 Deploy,繼續看第 4 節設定環境變數,一次填好再部署。

## 4. 設定環境變數

這個專案要跑起來需要 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 這兩個環境變數(功能是接 Supabase 做登入和遊戲紀錄——如果還沒有自己的 Supabase 專案,先照 `SUPABASE_SETUP.md` 走一次,拿到這兩個值再回來)。

1. 在匯入專案的畫面(或之後 **Project Settings → Environment Variables**)新增:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=你的-anon-key
   ```
2. 類型選 **Environment Variable / Config**,不要選 **Secret**——Secret 存進去之後沒辦法再讀出來確認或改類型,只能整個刪掉重建;而且這兩個值本來就是設計要曝露在前端 bundle 裡的公開資訊(不是需要嚴格保密的機密),用 Config 類型完全沒問題。
3. Environments 三個(Production / Preview / Development)都勾選,確保正式部署和之後每次 PR 的 Preview 部署都能正常運作。
4. 如果是在專案已經匯入之後才補這一步(不是匯入當下填的),存檔後要記得**重新觸發一次部署**(Deployments 頁面對最新一次部署按 **Redeploy**),環境變數的變更不會自動套用到已經部署好的版本。

## 5. 設定 Node.js 版本

這個專案本機開發用 `.nvmrc` 鎖 Node 18(是為了讓 `@supabase/supabase-js` 保持在 `2.45.4` 這個版本),但 Node 18 已經過了官方 EOL,Vercel 的建置環境不一定支援,而且這個設定只影響本機、跟 Vercel 的 build 環境無關,可以分開設定:

1. **Project Settings → General → Node.js Version**,選 20.x 或更新的版本(不要選 18.x)。

## 6. 部署與驗證

1. 前面的設定都填好後按 **Deploy**(如果已經匯入過、是後補環境變數,改成按 **Redeploy**)。
2. 等 1~2 分鐘,Deployments 頁面狀態會從 Building 變成 Ready。
3. 打開 Vercel 給的正式網址(格式像 `https://<project-name>.vercel.app`),確認:
   - 畫面正常顯示登入方式選擇畫面(選 Email 登入還是訪客模式),不是空白頁或部署錯誤頁
   - 如果畫面卡在「使用 Email 登入」按鈕不可點擊的狀態,代表環境變數沒有生效,回頭檢查第 4 節
4. 實際測試「訪客模式,直接開始」能不能正常玩一局——這個路徑完全不依賴 Supabase,是最快確認部署本身沒問題的方法。
5. 如果要測試 Email 登入,照 `SUPABASE_SETUP.md` 設定好 Supabase 之後,直接在這個正式網址上測「輸入 email → 收驗證碼 → 輸入驗證碼 → 登入成功」的完整流程。

## 之後的日常部署

第一次設定完成之後,Vercel 會自動追蹤這個 GitHub repo:**只要 push 到 `main` 分支,就會自動觸發一次新的 Production 部署**,不需要每次都手動操作。日常要推送變更並部署時,直接用專案裡的 `/deploy_vercel` 指令,它會處理「commit → 確認 → push → 等待並驗證部署」的流程,不用重新走這份文件。

## 排查清單

- **部署後空白頁或 404**:去 Deployments 頁面點進那次部署看 Build Logs 找錯誤訊息;最常見原因是 Output Directory 沒改成 `build`(見第 3 節)。
- **畫面顯示登入按鈕不可點擊/沒有 Email 選項**:代表 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 沒有生效,檢查 Project Settings → Environment Variables 裡兩個值有沒有拼錯、類型是不是選成 Secret 導致填錯,以及是否在補填之後忘記 Redeploy。
- **建置失敗,錯誤跟 Node 版本或某個套件相容性有關**:檢查 Project Settings → General → Node.js Version 是不是還停留在 18.x 或更舊的版本(見第 5 節)。
