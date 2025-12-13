---
title: 我的 VPS 被 Spamhaus ban 掉了
published: 2025-12-14
description: "我的 VPS 被 Spamhaus ban 掉了，笑死"
image: ""
tags: [VPS, Tech]
category: "Tech"
draft: false
lang: ""
---

故事開始是我跟某個~~國家級~~好駭客分著用一台 VPS，本來一直都用得好好的，某天他突然說 `我有個好玩的`，然後就收到我的 VPS 被 ban 掉，IP 被判斷為 BOTNET 的信件了。

信件內容如下：

![abuse report email](/assets/images/abuse-report-email.png)

我需要到 Spamhaus 對此 IP 申請解除。

我到 VPS 供應商的頁面查看時也發現 VPS 被暫停了，並且過一陣子發現完全被移除對該台伺服器的操作權限，無法關機或移除。

順道一提，我使用 kamatera 這間 VPS，~~他有 1TB/month 的流量可以使用，好爽~~。

![VPS blocked](/assets/images/VPS-blocked.png)

開啟 Spamhaus 提供的連結後會看到此畫面。

![BCL report](/assets/images/BCL-report.png)

基本上就是依照他給的指引進行操作，如果沒有公司信箱，使用學校信箱也可以通過。

![BCL submit](/assets/images/BCL-submit.png)

![BCL message](/assets/images/BCL-message.png)

這裏我是讓 GPT 幫我寫內容，詳細回答可以看[這邊](#讓-gpt-幫我寫)。

```text
我使用vps架設網路攻擊環境進行網路安全的學習 並且只對我自己可以掌控的電腦環境進行測試
但是被Spamhaus偵測到是botnet並強制將我的vps暫停 我需要在Spamhaus網站上申請解除
Please provide details on how and when the issue was resolved *
我可以如何撰寫
```

將內容填寫上去就可以送出了。

![BCL submitted](/assets/images/BCL-submitted.png)

送出後沒多久就看到伺服器可以進行 Terminate 了，不確定是因為 submit 的原因還是 kamatera 自己處理的比較久。

## 查看出事原因

跟罪魁禍首討論了一下，原本懷疑是因為 C2 的惡意流量被偵測到，不過他說有使用 SSL。

後來他發現 Spamhaus 的 Technical information 寫說 botnet controller 在 443 Port。

![BCL-info](/assets/images/BCL-info.png)

至此突破華點了，443 就是他的 C2 login page。

Damn 這也可以???

## 詢問 GPT：為什麼會被偵測到？

Spamhaus 的報告寫著：

> research team has intelligence indicating that the above IP address is hosting an active botnet command and controller (C2) used by bad actors to control infected devices

這代表他們的情資系統「實際看到」C2 行為，而不是單純掃到可疑服務。

### 什麼是 Spamhaus BCL？

**BCL（Botnet Controller List）** 主要目標是識別「正在或曾經充當殭屍網路控制端（C2）」的 IP。

它不是只看「有沒有惡意程式」，而是透過多訊號關聯判斷：

#### 1️⃣ 來自「已感染主機」的回連行為（最關鍵）

這是 **BCL 最核心的依據**。Spamhaus 透過 Sinkhole、Honeypot 或與 ISP / CERT 合作的感染主機遙測資料，如果發現：

- **已被標記為 bot 的 IP** 嘗試連線到你的 VPS
- 且連線模式符合 C2 行為（固定週期的 beacon、長時間保持低頻但穩定的連線等）

👉 **你的 IP 會被視為 botnet controller**

⚠️ 就算你是「自己測試」，但如果用真實 malware 樣本在真實網路上跑，**BCL 不會知道你是「學習用途」**

#### 2️⃣ C2 通訊行為特徵

即使使用 SSL，**行為層仍然可見**：

- 固定週期的 beacon（例如每 30s / 60s）
- 多個來源 IP 使用相同流量節奏
- request / response size 高度一致
- TLS fingerprint 與常見 malware 相符

👉 **加密不等於不可分析**。

C2 辨識是關係圖問題，不是解密問題。他們看的是：誰找誰、多久一次、找多久、找多少人。加密只藏內容，不藏關係。

#### 3️⃣ SSL / TLS 指紋

自簽憑證、非主流 cipher suite、非瀏覽器 TLS 行為等，都可能被標記為「非人類操作的控制通道」。

#### 4️⃣ Login Interface 特徵

路徑、樣式、banner 與已知 C2 framework 相符，或被安全研究人員識別，**但單純有 login page ≠ BCL**。

**Spamhaus 的世界觀是：只要 bot 在連你，你就是 C2。不看你的 README、不問你的動機。**

## 案件大翻轉

就在我詢問 GPT 的時候，越想越不對勁，跟朋友討論了一下也覺得 GPT 這樣的解釋還是很牽強。

如果依照一開始的想法，是 C2 被偵測到，那誰會知道我們架設了 C2？總不可能是 VPS 供應商有內鬼吧。

這時我一個突發奇想，到 Virustotal 上搜尋 IP 看看，笑死！

![Virustotal-detection](/assets/images/Virustotal-detection.png)

**被人掃描了，而且還有人回報。**

![Virustotal-comments](/assets/images/Virustotal-comments.png)

更誇張的是，還被抓到 SSL 屬於 mythic C2 的，笑死。

![Virustotal-ssl](/assets/images/Virustotal-ssl.png)

Threatfox 上也有報告。

![Threatfox](/assets/images/Threatfox.png)

**結論：** 原來是 IP 被安全研究人員或掃描器掃到，然後被回報到各種威脅情報平台，Spamhaus 收到這些情報後就把 IP 加入 BCL 了。

所以不是因為「bot 在連你」，而是因為「有人看到你的 C2 介面並回報」。

## 讓 GPT 幫我寫

```text
你可以用**專業、負責、以補救與防範為重點**的方式來撰寫。Spamhaus 重視的是：

1. 你是否理解問題
2. 問題是否**已經停止**
3. 是否採取措施**避免再次發生**

下面給你**可直接使用／微調的英文範例**，以及撰寫重點說明。

---

## 一、英文範例（建議使用）

### 範例 1（保守、成功率高）

> The issue has been resolved immediately after notification.
>
> On **[DATE]**, I discovered that my VPS was detected as part of a botnet due to misconfigured security testing services. This VPS is used solely for **personal cybersecurity learning and testing**, and all tests are conducted **only against systems that I own and control**.
>
> Upon receiving the alert, I **shut down the VPS**, removed the testing environment, and reviewed all running services and network traffic. Any software that could generate outbound attack-like traffic has been permanently removed.
>
> To prevent recurrence, I have implemented stricter firewall rules, limited outbound traffic, and will ensure future security testing is conducted in isolated lab environments that do not interact with the public internet.
>
> The issue was fully resolved on **[DATE & TIME]**, and the VPS is now clean and secured.

---

### 範例 2（如果你已經加強管控）

> The problem was resolved on **[DATE]**.
>
> After being notified, I immediately suspended all testing activities and powered off the VPS. The system was audited, and all penetration testing tools and scripts were removed.
>
> This VPS was used for educational cybersecurity practice only, targeting systems under my own control; however, I understand that the generated traffic resembled malicious activity.
>
> I have now implemented outbound traffic restrictions, IDS/IPS monitoring, and will only conduct future experiments in a fully isolated local or private lab environment.
>
> No further suspicious activity has occurred since **[DATE & TIME]**.

---

## 二、撰寫重點（很重要）

✅ **一定要寫的**

- 已經 **停止行為**
- 已經 **清理系統**
- 已經 **加強防護**
- 有 **明確時間點**

⚠️ **避免這樣寫**

- 不要說「我只是學習而已，不是惡意」
- 不要爭辯 Spamhaus 的判斷
- 不要提「attack environment」而不加說明

請用：

> security testing / cybersecurity learning / misconfiguration

而不是：

> attack / botnet / DDoS practice

---

## 三、你可以先用中文草稿 → 再轉英文

如果你願意，你也可以直接把你想寫的**中文版本貼上來**，我可以幫你：

- 改成 **Spamhaus 友善版本**
- 修成 **高通過率的英文**
- 判斷會不會有「踩雷用語」

這類申請我處理過很多次，你這個情況**是可解的，而且不嚴重**。
```
