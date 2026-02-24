## kiemdev05 事件：結論與建議（內部參考）

> 本文件為「後續追查 / 防範 / 交接」用整理，內容以你在四份分析筆記（EDR 時序、sup02.entrypoint、zk.entrypoint、Wmuxwilb.exe/Mkvsokp.dll）得到的**可驗證觀察**為主，推論會明確標註為推論。  
> 若要對外發布，建議先移除任何可能被濫用的操作細節（例如具體掃描/爆破/滲透指令）。

---

## 一、最終結論（TL;DR）

- **主要入侵鏈（受害端）**：使用 PowerShell payload 落地一套 Python runtime（偽裝為 `synaptics.exe`，實為 Python 3.10.11 `pythonw.exe`），建立 Startup LNK 持久化，開機後以 `-c` 參數遠端拉取並執行 GitLab 上的 `sup02.entrypoint`。
- **資料竊取與外洩（sup02.entrypoint）**：在短時間（約 2 分鐘）內，對 Chromium/Gecko 系瀏覽器與部分應用資料進行蒐集，包含密碼、cookies、信用卡資料；並針對 Facebook cookies 額外做廣告帳戶/資產資訊蒐集，最後打包 zip，透過 Telegram Bot API `sendDocument` 外洩。
- **另一條 payload（zk.entrypoint）**：以加密封裝的 stage2 執行 loader 行為，包含本地 shellcode loader 與類 process hollowing（以 `RegAsm.exe` 建立 suspended process 並置換記憶體映像），解出並載入 .NET payload（Wmuxwilb.exe）與其解密解壓後的 DLL（Mkvsokp.dll）。
- **RAT 家族指認（高度吻合）**：Wmuxwilb.exe/Mkvsokp.dll 的行為與公開報告描述的 PureHVNC loader 型態高度吻合（AES 解密、Gzip 解壓、.NET Reactor 混淆、反射載入 DLL、ProtoBuf 組態含 C2）。

---

## 二、事件時間軸（建議寫法）

> 你的筆記中多數是「相對時間」與「兩分鐘內完成」的描述。若要讓外部讀者或後續交接者更容易理解，建議用「T0 起算」的時間軸表呈現。

### 2.1 受害端（T0 起算）—建議表格欄位

- **Time (T+sec)**：例如 T+00、T+10、T+30、T+120
- **Process / Parent**：例如 `explorer.exe → synaptics.exe`
- **Action**：下載/解包/讀取 DB/殺瀏覽器/remote-debug/打包/外洩/清理
- **Artifact**：落地檔案（login_db、cards_db、All_Passwords.txt、zip）
- **Network**：目標網域/目的（gitlab 下載、facebook 查詢、ip-api、telegram 外洩）
- **Evidence source**：EDR event id、檔案時間戳、DNS log、FW log、PowerShell event

### 2.2 攻擊者基礎設施（絕對時間）—注意事項

- Telegram bot dump 中出現的 `2024-12-21`、`2025-01-04` 等時間，多屬 **bot/群組建立與遷移事件**，應註明為「攻擊者基礎設施存在時間的旁證」，**不等同感染時間**。

---

## 三、根因（Root Cause）與攻擊面分析

### 3.1 根因（最可能）

- **使用者執行惡意檔案 / 腳本導致初始落地**：bat → PowerShell（hidden, encoded）→ 解壓縮 rar → 建立 Startup LNK → 執行 Python runtime。  
  （你目前能追到的最早證據是 PowerShell encoded payload；更早的下載來源可能需看其他 artefact。）

### 3.2 為何能持久化

- 利用 Windows Startup 目錄的 `.lnk`（`WindowsSecurity.lnk`）達到每次登入/開機自動執行。
- `synaptics.exe` 以「系統/驅動風格命名」降低使用者警覺（屬推論，但常見）。

### 3.3 為何能快速完成外洩（2 分鐘內）

- 竊取邏輯與檔案路徑高度固定，且使用本地 remote-debug 取得 cookies（繞過部分加密/鎖檔問題），加上完成後立即清除落地檔案，降低留存。

---

## 四、影響範圍（Impact）判讀建議

### 4.1 可能被竊取的資料類型

- **瀏覽器密碼**（Chromium `Login Data` / Gecko `logins.json` 等）
- **Cookies**（包含 Facebook）
- **信用卡資料**（Chromium `Web Data`）
- **Facebook Ads 資產資訊**（廣告帳戶、BM、Page、Group 等）
- **加密貨幣錢包/擴充資料**（若 zk → Wmuxwilb → Mkvsokp.dll 路徑實際落地執行）

### 4.2 如何判斷「真的外洩了」而不只是嘗試

- 檢查防火牆/Proxy log 是否有對 `api.telegram.org` 的成功連線與傳輸量（尤其對應 zip 大小）。
- 檢查是否曾建立並短時間內刪除 zip 檔（磁碟鑑識：MFT/USN Journal/$LogFile）。
- 檢查 EDR 是否能還原 HTTP(S) metadata（SNI、JA3、目的 IP）與傳輸大小。

---

## 五、建議的處置流程（Containment → Eradication → Recovery）

### 5.1 立即處置（Containment）

- **隔離主機**：先從網路隔離（避免再次外洩與橫向移動）。
- **阻擋外連**：暫時封鎖 `api.telegram.org`、已知 C2（例如 `38.180.225.150:56001`）與相關 IoC 網域（視組織政策）。
- **保全證據**：保留 EDR telemetry、PowerShell event log、DNS/Proxy/Firewall log、以及磁碟鏡像（至少 $MFT、$LogFile、USN Journal）。

### 5.2 清除（Eradication）

- 移除 Startup `.lnk` 與落地目錄（`C:\Users\Public\ChromeApplication\`）。
- 清除可疑排程、Run keys、Startup folder 內其他未知捷徑（擴大搜一遍）。
- 搜索同一批樣本可能使用的多個落地名稱（同家族常見變體）。

### 5.3 復原（Recovery）

- **重設密碼**：以「所有曾在該主機登入過的帳號」為範圍，特別是瀏覽器自動儲存的帳密。
- **撤銷 Session**：針對 Facebook/Google/Microsoft 等帳號做「登出所有裝置 / revoke sessions」。
- **廣告帳戶風險處理**：Facebook Ads/BM 資產檢查（管理員名單、付款方式、投放活動、連結像素/網域、API token）。
- **錢包資產風險處理**：若偵測到錢包擴充被蒐集，視情況轉移資產與重建錢包環境。

---

## 六、偵測與預防建議（Detection Engineering）

### 6.1 端點偵測（EDR/Sigma）

- **可疑 Python runtime 落地到公用路徑**：例如 `C:\Users\Public\ChromeApplication\*` 內含 `python*.dll`、`Lib\`、`vcruntime*.dll`、且主程式命名為常見驅動/系統元件。
- **Startup folder 新增 `.lnk`** 指向非預期路徑，且參數含 `-c`、`import requests`、`exec(requests.get(...))` 之類字串（可用正則/字串規則）。
- **瀏覽器被非互動方式終止**：短時間內多次 `taskkill /F /IM chrome.exe|msedge.exe|firefox.exe`。
- **本地 remote-debug 行為**：本機 `127.0.0.1:9222` 被存取，並伴隨 headless 啟動參數與短時間大量外連。

### 6.2 網路偵測（Proxy/DNS）

- GitLab raw content 被直接拉取並立即執行（User-Agent、可疑 TLS 指紋、無瀏覽器行為）。
- 對 Telegram Bot API 的檔案上傳行為（`sendDocument` 端點特徵）。
- `ip-api.com` 的固定查詢欄位（你筆記中用 `fields=8195`）。

### 6.3 政策/流程

- 對「encoded PowerShell」與「隱藏視窗執行」提高管控（Applocker/WDAC/ASR 規則視情況）。
- 對使用者下載並執行壓縮檔/腳本（特別是帶密碼 rar/zip）做安全教育與郵件閘道強化。

---

## 七、IoC（建議維護成可機器讀的清單）

> 建議另外維護一份 `ioc.json` / `ioc.csv` 給 SOC / 防火牆 / EDR 批次匯入；文章中保留「人看得懂」版本即可。

### 7.1 路徑/檔名（觀察）

- `C:\Users\Public\ChromeApplication\synaptics.exe`
- `C:\Users\*\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\WindowsSecurity.lnk`
- `%TEMP%\login_db`
- `%TEMP%\cards_db`
- `%TEMP%\*\All_Passwords.txt`
- `%TEMP%\*\Facebook_Cookies.txt`
- `%TEMP%\[TW_*] *.zip`

### 7.2 網域/服務（觀察）

- `gitlab.com`（payload 來源）
- `api.telegram.org`（資料外洩）
- `ip-api.com`（IP/地理查詢）
- Facebook 相關：`adsmanager.facebook.com`、`graph.facebook.com`、`mbasic.facebook.com`、`www.facebook.com`
- 本機：`127.0.0.1:9222`（remote-debug）

### 7.3 C2（觀察）

- `38.180.225.150:56001`（從 Mkvsokp.dll ProtoBuf 組態解出）

---

## 八、後續待辦（你目前證據缺口）

> 這些是你筆記裡提到「到這邊就找不下去了」的地方，建議列成缺口，讓後續鑑識/追查有目標。

- **最初投遞載體**：bat 檔如何進入、如何被使用者執行（郵件？下載？USB？即時通訊？）
- `Document_Secure\securedoc.rar` 是否仍可回收（磁碟鑑識、備份、EDR fileless artefact）
- 是否存在更早的 loader（例如 MSI/EXE）在落地 PowerShell 之前執行
- zip 外洩檔能否復原：透過 $LogFile / USN Journal / MFT 交叉還原檔案存在區段與刪除時間
