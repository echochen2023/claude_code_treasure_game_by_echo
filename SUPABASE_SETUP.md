# Supabase 設定教學

這份文件是給下載/clone 這個專案、但還沒有自己的 Supabase 專案的人看的完整設定教學。如果你已經有 `.env`,而且裡面填的是你自己 Supabase 專案的值,可以跳過這份文件。

> **沒有設定 Supabase 完全不影響遊戲本身。** `.env` 沒填的話,App 會自動退回「未設定」狀態:登入頁的「使用 Email 登入 / 註冊」按鈕會顯示不可點擊,但**訪客模式一樣可以正常玩**,只是不會保留任何暱稱、分數或遊戲紀錄。想要保留這些資料,才需要照著下面的步驟設定 Supabase。

## 1. 建立 Supabase 帳號與專案

1. 到 https://supabase.com 註冊帳號(可以直接用 GitHub 帳號登入)。
2. 建立一個新專案(New Project):選一個離你近的地區,設一組資料庫密碼(之後步驟用不到,但務必記下來保存好)。
3. 專案建立後通常要等 1~2 分鐘 provisioning,完成後會進到專案後台首頁。

## 2. 取得 API 金鑰,填進 `.env`

1. 專案後台左側選單 → **Project Settings → API**。
2. 複製 **Project URL**(格式像 `https://xxxxx.supabase.co`)。
3. 複製 **anon public** 這把 key(不是 `service_role` key——那把只能在伺服器端用,絕對不能填進前端專案的 `.env`,這個專案也用不到它)。
4. 在專案根目錄把 `.env.example` 複製一份成 `.env`(`.env` 已經被 `.gitignore` 排除,不會被 commit 上去):
   ```
   cp .env.example .env
   ```
5. 把 `.env` 裡的兩個值換成剛剛複製的內容:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=你的-anon-key
   ```
6. 存檔後重新啟動 `npm run dev`,登入頁的「使用 Email 登入 / 註冊」按鈕就會從不可點擊變成正常可用。

> `VITE_SUPABASE_ANON_KEY` 雖然叫 anon key,但它設計上就是要曝露在前端程式碼裡的公開金鑰(打包後任何人都看得到原始值),真正的存取控制是靠下面第 3 步設定的 RLS(Row Level Security)規則,不是靠隱藏這把 key。

## 3. 建立資料表與 RLS 規則

到專案後台 **SQL Editor**,貼上以下整段 SQL 執行一次:

```sql
-- players:一個帳號(owner_uid)底下可以有多個暱稱(profile)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  nickname text not null unique,
  created_at timestamptz not null default now()
);

-- plays:每一局遊戲紀錄,掛在某個 player(暱稱)底下,不直接掛帳號
create table public.plays (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  score integer not null,
  played_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.plays enable row level security;

-- 只能看到/操作自己帳號底下的暱稱
create policy "players_select_own" on public.players
  for select using (owner_uid = auth.uid());
create policy "players_insert_own" on public.players
  for insert with check (owner_uid = auth.uid());
create policy "players_update_own" on public.players
  for update using (owner_uid = auth.uid());

-- plays 沒有 owner_uid 欄位,透過 player_id 反查回 players 確認擁有權
create policy "plays_select_own" on public.plays
  for select using (
    exists (select 1 from public.players p where p.id = plays.player_id and p.owner_uid = auth.uid())
  );
create policy "plays_insert_own" on public.plays
  for insert with check (
    exists (select 1 from public.players p where p.id = plays.player_id and p.owner_uid = auth.uid())
  );
```

## 4. 設定 Email 驗證碼登入

這個專案的登入是「寄一組驗證碼、使用者輸入驗證碼」,不是點信裡的連結,也不需要設定 Redirect URLs。唯一要做的設定:

1. **Authentication → Providers → Email**,確認 Email 這個 provider 是開啟的(預設就是開的,通常不用改)。
2. **Authentication → Emails → Templates**,選 **Magic link or OTP** 這個樣板,把內文裡的 `{{ .ConfirmationURL }}` 換成 `{{ .Token }}`(可以從編輯器旁的 Template variables 清單插入),存檔。這樣使用者收到的信裡才會顯示 6 碼驗證碼,而不是一個連結。範例內文:
   ```html
   <h2>歡迎進入寶箱遊戲!</h2>
   <p>你的驗證碼是:</p>
   <h1>{{ .Token }}</h1>
   <p>請回到遊戲頁面輸入這組驗證碼。這組驗證碼將在數分鐘後失效。</p>
   ```
3. **不需要**動 **Authentication → URL Configuration → Redirect URLs**——這條登入流程完全不會觸發跳轉,這份清單留空或留著舊資料都不影響功能。

## 5.(選用)設定自訂 SMTP,改用 Gmail 寄信

Supabase 內建的 email 服務有嚴格的寄送速率限制(免費方案大約每小時只能寄幾封,測試時很容易卡住)。如果想要穩定測試或正式上線用,建議設定自己的 SMTP,這裡示範用 Gmail。

### 5-1. 到 Google 帳號申請「應用程式密碼」(App Password)

Gmail 不允許直接用登入密碼讓第三方服務(像 Supabase)寄信,必須先開通兩步驟驗證,再另外產生一組專用密碼:

1. 前往 https://myaccount.google.com/security,確認「兩步驟驗證」已經開啟——沒開的話要先開,才能產生應用程式密碼。
2. 前往 https://myaccount.google.com/apppasswords(需要先登入,且已開兩步驟驗證才能看到這頁)。
3. 「應用程式名稱」欄位輸入一個好辨識的名稱,例如 `Supabase`,建立。
4. Google 會產生一組 16 碼密碼(格式像 `abcd efgh ijkl mnop`),記下來——這組密碼**只會顯示這一次**,關掉視窗後就看不到了,只能重新產生一組新的。

### 5-2. 在 Supabase 填入 SMTP 設定

1. 專案後台 **Project Settings → Authentication**(有些版本介面在 **Authentication → Emails → SMTP Settings**),找到 **SMTP Settings** 區塊,打開 **Enable Custom SMTP**。
2. 依序填入:
   - **Sender email**:你的 Gmail 完整地址(例如 `yourname@gmail.com`)——這欄必須跟下面的 Username 是同一個帳號,Gmail 不允許用別的地址冒充寄件人。
   - **Sender name**:信件顯示的寄件人名稱,自己取,例如 `寶箱遊戲`。
   - **Host**:`smtp.gmail.com`
   - **Port**:`587`
   - **Username**:同樣是你的 Gmail 完整地址
   - **Password**:5-1 拿到的 16 碼應用程式密碼(貼上時中間的空格通常不用管;如果送出後出錯,試著把空格拿掉再貼一次)
3. 存檔。

### 5-3. 驗證 SMTP 設定生效

回到 App 重新走一次「輸入 email → 寄送驗證碼」,收到的信寄件人應該會顯示你剛剛設定的名稱和 Gmail 地址(而不是 Supabase 預設的寄件位址)。如果送出後 Supabase 顯示寄信失敗,回頭檢查:

- Username/Password 打錯,或 Password 貼到的是一般登入密碼而不是應用程式密碼(Gmail 一律會拒絕,沒有例外)
- Sender email 跟 Username 對不起來(Gmail 要求兩者一致)
- 兩步驟驗證後來被關掉,導致應用程式密碼失效——需要重新開啟兩步驟驗證,再重新申請一組新的應用程式密碼

> Gmail 一般帳號的寄送量上限大約是每天 500 封(Google Workspace 帳號則是 2000 封),對這種小專案通常綽綽有餘;流量變大的話再考慮改用 Resend、SendGrid 這類專門的交易信件服務。

## 6. 驗證設定成功

1. `npm run dev`,選「使用 Email 登入 / 註冊」,輸入你自己的信箱送出。
2. 應該會跳出 toast 提示「驗證碼已寄出」,並且真的收到一封含 6 碼驗證碼的信。
3. 輸入驗證碼後應該直接進到「取暱稱」畫面(全新帳號)或直接進遊戲(已經有暱稱的帳號)。
4. 玩一局之後,「遊戲紀錄」側欄應該要出現剛剛那一局的分數——代表資料庫寫入和 RLS 都設定正確。

卡住的話回頭檢查:

- **收不到信**:如果還在用 Supabase 內建的 email 服務,先確認沒有超過速率限制(見上面第 5 節),或到 **Authentication → Emails** 確認寄送紀錄有沒有錯誤。如果已經設定了自訂 SMTP,照第 5-3 節的清單排查。
- **送出後畫面沒反應或報錯**:打開瀏覽器主控台看看是不是 `.env` 的兩個值貼錯或多了空白字元。
- **驗證碼一直顯示錯誤**:確認信裡收到的是純數字驗證碼而不是一個連結——如果還是連結,代表第 4 步的樣板沒有改成功。
