---
title: "Docker 安全攻防全解析：從滲透測試到防禦加固"
published: 2026-01-10
description: "完整的 Docker 安全指南：攻擊者如何突破容器？防禦者如何加固？包含工具清單、CVE 分析、實戰案例與參考資料。"
image: ""
tags:
  [
    Docker,
    Security,
    Container Security,
    Penetration Testing,
    Offensive Security,
    Defensive Security,
  ]
category: "Security"
draft: true
lang: "zh-TW"
---

## 前言

這篇文章專門聚焦在 Docker 的安全攻防：我會從攻擊者視角出發，介紹常見的攻擊面、工具與逃逸技術；接著切換到防禦者視角，說明如何加固 Docker daemon、建構安全的 image pipeline、以及強化容器 runtime。

如果你對 Docker 基礎不熟，建議先看《[從 Docker 到 Die](/posts/from-docker-to-die/)》。這篇假設你已經知道 Docker 是什麼、怎麼用，現在要討論的是「它有哪些安全風險」與「如何降低這些風險」。

:::info
本文以「防禦與風險認知」為主，刻意避免提供可直接用於入侵的逐步操作指令；涉及漏洞與攻擊手法時，會用概念、威脅模型、偵測點與修補建議來呈現。
:::

## 目錄

- [第一篇：攻擊者視角（Offensive）](#第一篇攻擊者視角offensive)
  - [攻擊面概覽](#攻擊面概覽)
  - [偵察與掃描](#偵察與掃描)
  - [攻陷 Docker Daemon](#攻陷-docker-daemon)
  - [容器逃逸（Container Escape）](#容器逃逸container-escape)
  - [其他攻擊向量](#其他攻擊向量)
- [第二篇：防禦者視角（Defensive）](#第二篇防禦者視角defensive)
  - [防禦哲學：分層防禦與最小權限](#防禦哲學分層防禦與最小權限)
  - [第一道防線：保護 Docker Daemon](#第一道防線保護-docker-daemon)
  - [第二道防線：建構安全的 Image Pipeline](#第二道防線建構安全的-image-pipeline)
  - [第三道防線：強化容器執行環境](#第三道防線強化容器執行環境)
  - [前沿防禦：更安全的隔離技術](#前沿防禦更安全的隔離技術)
  - [持續監控與學習](#持續監控與學習)
- [工具與資源](#工具與資源)
- [參考資料](#參考資料)

---

# 第一篇：攻擊者視角（Offensive）

## 攻擊面概覽

Docker 不是單一程式，而是一個生態系。攻擊可以發生在生態系的任何環節：

1. **主機與 Docker Daemon**：Docker Engine 本身的設定與漏洞
2. **Docker 映像檔（Image）**：映像檔來源、內容與建構過程中的風險
3. **容器執行環境（Runtime）**：容器本身的隔離機制與權限設定
4. **網路**：容器間以及容器與外部的網路通訊
5. **應用程式**：運行在容器內的應用程式漏洞（例如 Web 漏洞）

## 偵察與掃描

攻擊的第一步是找到有漏洞的目標。

### 公網掃描

使用 **Shodan**、**Censys** 等工具協助你「盤點自己暴露在外的服務」，其中 Docker API 常見風險埠包含 **2375/2376**（管理介面）。防禦面重點是：**不應把 Docker 管理介面暴露到公網**，若必須遠端管理，務必用 TLS 與強認證。

### 內部環境枚舉

當已進入容器或內部網路後，使用工具來了解環境配置：

- **deepce**：自動列舉容器資訊、漏洞利用
- **botb**：收集、分析並試圖從容器中逸出
- **CDK**：提供 Docker / Kubernetes / containerd 攻擊模組

這些工具可以枚舉 Docker 版本、網路設定、掛載點、已啟用的 Linux Capabilities 等，幫助攻擊者找到弱點。

## 攻陷 Docker Daemon

這是最直接也最危險的攻擊路徑。一旦 Docker Daemon 失守，整個主機就岌岌可危。

### 核心弱點

未受保護的 Docker Socket（`/var/run/docker.sock`）或 TCP API。

### 攻擊手法（概念）

最常見、也最致命的一條路徑是：**容器內任意程式能存取 `docker.sock`（或未受保護的 Docker TCP API）**。一旦能呼叫 Docker Engine API，等同拿到「主機上的容器管理權」，風險通常會一路升級到主機層級的檔案與程式控制。

### Docker Daemon API 的風險本質

**埠 2375/2376 上暴露的 Docker API** 幾乎等同把「整台主機的容器管理面板」放到網路上。就算攻擊者沒有主機登入權，只要能對 API 發出未授權的管理請求，就可能做到：

- 建立/刪除容器
- 讀寫 volumes（間接影響主機檔案）
- 拉取/推送映像
- 修改網路設定

因此，防禦的優先順序是：**不暴露、最小權限、強認證、可觀測性**（看得到誰在呼叫 API、何時呼叫、呼叫了什麼）。

## 容器逃逸（Container Escape）

容器逃逸是從受限的容器環境突破，進而控制主機的過程。這是容器安全中最關鍵的議題。

### 逃逸類型與案例

#### 1. 危險的配置（Misconfigurations）

**`--privileged` 旗標**

賦予容器幾乎等同於主機的權限。通常代表容器可以取得大量敏感能力（capabilities）與裝置存取權，進而繞過隔離邊界。

**掛載敏感目錄**

如掛載主機根目錄 `/`、`/proc` 等：這會讓容器內程式「直接看到主機檔案系統」，進一步造成設定被改寫、敏感資料外洩、甚至持久化植入。

**濫用 `CAP_SYS_ADMIN` 等高權限 Capabilities**

`CAP_SYS_ADMIN` 常被稱為「近似 root 的能力集合」，一旦錯誤授權，容器內就更容易透過掛載、命名空間操作等方式突破隔離。

#### 2. 軟體漏洞（Software Vulnerabilities）

**runc 漏洞（CVE-2019-5736）**

允許惡意容器覆寫主機上的 `runc` 執行檔，當有人執行 `docker exec` 時觸發。

**WORKDIR 漏洞（CVE-2024-21626）**

`runc` 在處理工作目錄時的漏洞，可能導致目錄遍歷，進而逃逸。

**Docker Desktop API 暴露漏洞（CVE-2025-9074）⚠️ Critical**

這是 2025 年發現的嚴重漏洞（CVSS v4.0: 9.3），影響 Docker Desktop 所有版本直到 4.44.3。由安全研究員 Felix Boulet 發現。

**漏洞原理**：

Docker Desktop 內的本地 Linux 容器可以透過配置的 Docker 子網路（常見為 `192.168.65.7:2375`）在**未經授權**的情況下存取 Docker Engine API。根據公開資訊，這個問題：

- **即使啟用 Enhanced Container Isolation (ECI) 也無法防禦**
- **即使沒有啟用**「Expose daemon on tcp://localhost:2375 without TLS」也可能存在

**風險場景（概念）**：

任何在 Docker Desktop 內跑起來的容器，只要能對該內網位址發出請求，就可能碰到「管理平面被容器拿到」的問題；後果通常是容器管理權被接管（進一步影響其他容器、映像與資料卷）。

在 Docker Desktop for Windows（WSL 後端）環境下，攻擊者甚至可以掛載主機磁碟，獲得與執行 Docker Desktop 的使用者相同的權限。

**影響**：

- 未授權執行特權命令
- 控制其他容器
- 創建新容器
- 管理映像檔
- 在 Windows + WSL 環境下掛載主機磁碟

**修復**：

更新到 Docker Desktop **4.44.3 或更新版本**（2025 年 8 月 20 日發布）以修補此問題。

**防禦建議**：

- 立即更新 Docker Desktop
- 在多租戶環境中特別注意容器間的隔離
- 監控容器對 Docker Desktop 內部子網路的異常連線（例如 192.168.65.0/24）

**參考**：

- [NVD: CVE-2025-9074](https://nvd.nist.gov/vuln/detail/CVE-2025-9074)
- [Docker Security announcements](https://docs.docker.com/security/security-announcements/)

**cgroups `notify_on_release` 機制濫用**

一種較舊的概念：透過 cgroup v1 的釋放通知機制（release agent / notify_on_release）在特定錯誤配置下達到主機端程式碼執行。現代系統多已採取防護或遷移到 cgroup v2，但它仍是一個很好的「為什麼錯誤配置會讓隔離失效」的教材。

#### 3. 核心漏洞（Kernel Exploits）

由於容器與主機共享核心，主機核心的權限提升漏洞同樣可以用於容器逃逸。

### 逃逸工具

- **CDK**：Container Development Kit，提供多種逃逸模組
- **shovel**：Docker 容器逃逸工具
- **docker-escape-tool**：測試容器逃逸的工具
- **container-escape-check**：容器逃逸檢測工具

## 其他攻擊向量

### 映像檔汙染

**秘密寫死**

在映像檔中硬編碼密碼、API Key：

- 學習案例：[OWASP/wrongsecrets](https://github.com/OWASP/wrongsecrets)

**惡意基礎映像檔**

從 Docker Hub 下載來路不明的映像檔，可能內含後門或挖礦程式。

**相依套件漏洞**

映像檔的 `apt`、`npm`、`pip` 套件中存在已知漏洞。

### 網路攻擊

利用容器作為跳板，攻擊內部網路的其他服務。

- 學習平台：[DockerSecurityPlayground/DSP](https://github.com/DockerSecurityPlayground/DSP)

---

# 第二篇：防禦者視角（Defensive）

## 防禦哲學：分層防禦與最小權限

安全不是單點防護，而是從外到內的層層加固。核心原則是**最小權限原則（Principle of Least Privilege）**，只授予絕對必要的權限。

## 第一道防線：保護 Docker Daemon

確保 Docker Engine 本身的安全是基礎。

### 1. 啟用 Rootless 模式

這是最重要的防禦措施之一，讓 Docker Daemon 以非 root 使用者執行，即使被攻陷，危害也極小。

```bash
# 配置從屬 UID/GID
echo "testuser:231072:65536" | sudo tee -a /etc/subuid
echo "testuser:231072:65536" | sudo tee -a /etc/subgid

# 安裝 rootless Docker
curl -fsSL https://get.docker.com/rootless | sh

# 設定環境變數
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock

# 啟用 systemd 使用者服務
systemctl --user enable docker
```

### 2. 保護 Docker Socket

- **絕不將 TCP Socket 暴露於公網**
- 若需遠端連線，必須配置 TLS 憑證進行加密與認證
- 保護 Unix Socket（`/var/run/docker.sock`）的檔案權限
- **永遠不要隨便 mount docker.sock 進容器**

### 3. 定期更新

保持 Docker Engine 為最新版本，以修補已知漏洞。

## 第二道防線：建構安全的 Image Pipeline

確保進入生產環境的「原料」是乾淨、安全的。

### 1. 使用最小化基礎映像檔

```dockerfile
FROM alpine:latest
# 或
FROM gcr.io/distroless/static
```

減少攻擊面。

### 2. 指定非 root 使用者

```dockerfile
RUN addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser
USER appuser
```

### 3. 移除不必要帳號與工具

```dockerfile
# 刪除無用使用者
RUN userdel -r nobody

# 清除預設密碼與 SSH
RUN rm -rf /etc/ssh/*
```

### 4. 移除 setuid / setgid 權限位元

```dockerfile
RUN find / -perm /6000 -type f -exec chmod a-s {} \;
```

防止容器內程式濫用這些權限執行提權操作。

### 5. 使用多階段建置

```dockerfile
FROM golang:alpine as builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o app .

FROM alpine:latest
RUN addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser
USER appuser
COPY --from=builder /src/app /app/app
CMD ["/app/app"]
```

避免將原始碼、編譯工具等打包進最終映像檔。

### 6. 漏洞掃描

在 CI/CD 流程中整合掃描工具，自動檢測映像檔中的已知漏洞：

```bash
# 使用 Trivy 掃描
trivy image myapp:latest

# 使用 dockerscan
dockerscan image myapp:latest
```

### 7. 映像檔簽署與來源管理

- 使用 **Docker Content Trust (Notary)** 簽署映像檔
- 使用 **Harbor** 等私有倉庫來簽署和驗證映像檔，確保來源可信

## 第三道防線：強化容器執行環境

即使映像檔或應用程式有漏洞，也要限制其能造成的破壞範圍，防止逃逸。

### 1. 移除不必要的權限

**永遠不要使用 `--privileged`**

除非極度必要且了解其風險。

**預設移除所有 Capabilities**

```bash
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp
```

### 2. 啟用內建安全機制

**Seccomp**

限制容器可以使用的系統呼叫（syscall），Docker 預設有一份允許清單。可自訂更嚴格的規則：

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    { "names": ["read", "write", "open", "close"], "action": "SCMP_ACT_ALLOW" }
  ]
}
```

```bash
docker run --security-opt seccomp=/path/to/profile.json myapp
```

**AppArmor / SELinux**

限制容器對檔案系統的讀寫執行權限。

### 3. 設定資源限制

```bash
docker run --memory="512m" --cpus="1.0" myapp
```

防止 DoS 攻擊。

### 4. 使用唯讀根文件系統

```bash
docker run --read-only --tmpfs /tmp --tmpfs /var/run myapp
```

僅將必要的可寫目錄掛載為 Volume。

### 5. 管理敏感資訊

使用 **Docker Secrets** 或 **Vault** 等外部工具，絕不將密碼、Token 寫死在環境變數或映像檔中：

```bash
# 使用 Docker Secrets
echo "mypassword" | docker secret create db_password -
docker service create --secret db_password myapp
```

## 前沿防禦：更安全的隔離技術

當預設的隔離機制不足以滿足高安全需求時，可以採用更先進的技術。

### gVisor

Google 開發的應用程式核心，在使用者空間攔截並處理系統呼叫，避免容器直接與主機核心互動：

```bash
docker run --runtime=runsc myapp
```

### Sysbox

增強版的 `runc`，可以讓無根容器（rootless container）像虛擬機一樣運行 Systemd、Docker-in-Docker 等複雜負載。

## 持續監控與學習

安全是一個持續的過程。

### 監控工具

- **Falco**：容器執行時期安全工具，監控異常行為
- **Cilium Tetragon**：基於 eBPF 的監控工具

### 定期審核

- 審核 Docker 設定與容器配置
- 關注最新的 CVE 漏洞

### 學習資源

- [myugan/awesome-docker-security](https://github.com/myugan/awesome-docker-security)
- [OWASP/Docker-Security](https://github.com/OWASP/Docker-Security)
- [TryHackMe | Container Vulnerabilities](https://tryhackme.com/room/containervulnerabilitiesDG)

---

# 工具與資源

## 滲透測試工具

| 工具 / 資源                                                                     | 功能說明                                  | 攻擊面類型            |
| ------------------------------------------------------------------------------- | ----------------------------------------- | --------------------- |
| [OWASP/wrongsecrets](https://github.com/OWASP/wrongsecrets)                     | 教學用的錯誤秘密管理案例集合              | 密鑰洩露              |
| [DockerSecurityPlayground/DSP](https://github.com/DockerSecurityPlayground/DSP) | 可搭建多種攻擊模擬場景的框架              | 教學/實戰環境         |
| [deepce](https://github.com/stealthcopter/deepce)                               | 自動列舉容器資訊、漏洞利用工具            | 權限提升 / 逃逸       |
| [Gorsair](https://github.com/Ullaakut/Gorsair)                                  | 掃描 Docker API 開放 Port（`2375`）       | API 暴露 / 未授權存取 |
| [botb](https://github.com/brompwnie/botb)                                       | 收集、分析並試圖從容器中逸出              | 容器逃逸              |
| [CDK](https://github.com/cdk-team/CDK)                                          | Docker / Kubernetes / containerd 攻擊模組 | 綜合攻擊模組工具      |
| [shovel](https://github.com/SPuerBRead/shovel)                                  | Docker 容器逃逸工具                       | 容器逃逸              |
| [docker-escape-tool](https://github.com/PercussiveElbow/docker-escape-tool)     | 測試容器逃逸                              | 容器逃逸              |
| [container-escape-check](https://github.com/teamssix/container-escape-check)    | 容器逃逸檢測                              | 容器逃逸              |

## 防禦工具

| 工具                                              | 功能                                  |
| ------------------------------------------------- | ------------------------------------- |
| [Trivy](https://github.com/aquasecurity/trivy)    | 映像檔漏洞掃描                        |
| [dockerscan](https://github.com/cr0hn/dockerscan) | Docker 安全分析與掃描                 |
| [Harbor](https://github.com/goharbor/harbor)      | 私有 registry，支援映像檔簽署與掃描   |
| [gVisor](https://github.com/google/gvisor)        | 應用程式核心，提供更強隔離            |
| [Sysbox](https://github.com/nestybox/sysbox)      | 增強版 runc，支援 rootless + 複雜負載 |

## 實戰環境

- **ilolm/docker-CTF**：Docker-in-Docker CTF 環境
- **NotSoSecure Vulnerable Docker VM**：專注於錯誤配置與逃逸的練習環境
- **TryHackMe Docker Rodeo**：Docker registry 利用和容器逃逸
- **TryHackMe Container Vulnerabilities**：常見 Docker 漏洞

---

# 參考資料

## 實戰技巧與攻擊範例

- [From Containers to Host: Privilege Escalation](https://medium.com/@kankojoseph4/from-containers-to-host-privilege-escalation-techniques-in-docker-487fe2124b8e)
- [Exploit Notes - Docker Escape](https://exploit-notes.hdks.org/exploit/container/docker/docker-escape/)
- [Docker Hacking: From Shodan to Root](https://medium.com/@mudasserhussain1111/docker-hacking-from-shodan-to-root-f61d99f9c090)
- [Auto-GPT Docker Container Escape](https://positive.security/blog/auto-gpt-rce)
- [Docker hosts hacked in ongoing website traffic theft scheme](https://www.bleepingcomputer.com/news/security/docker-hosts-hacked-in-ongoing-website-traffic-theft-scheme/)

## 容器逃逸

- [Docker 逃逸漏洞彙總 | T Wiki](https://wiki.teamssix.com/cloudnative/docker/docker-escape-vulnerability-summary.html)
- [容器逃逸方法檢測指北 | T Wiki](https://wiki.teamssix.com/CloudNative/Docker/container-escape-check.html)
- [Docker 逃逸潦草筆記 | Clang 裁縫店](https://xuanxuanblingbling.github.io/ctf/pwn/2022/06/05/docker/)
- [從 0 到 1 的虛擬機逃逸三部曲](https://xz.aliyun.com/news/6941)
- [docker 逃逸常用方法 | Hexo](https://m01ly.github.io/2022/01/04/pt-docker-escape/)
- [Docker 容器逃逸案例彙集](https://www.cnblogs.com/xiaozi/p/13423853.html)
- [Docker 逃逸原理 - FreeBuf](https://www.freebuf.com/articles/container/245153.html)
- [配置不當導致的容器逃逸](https://www.kingkk.com/2021/01/%E9%85%8D%E7%BD%AE%E4%B8%8D%E5%BD%93%E5%AF%BC%E8%87%B4%E7%9A%84%E5%AE%B9%E5%99%A8%E9%80%83%E9%80%B8/)
- [docker 逃逸方法彙總與簡要分析](https://www.freebuf.com/articles/network/387464.html)
- [notify_on_release 逃逸](https://www.cnblogs.com/CVE-Lemon/p/18674802)

## CVE 漏洞分析

- [CVE-2025-9074: Docker Desktop API 暴露漏洞 (Critical)](https://nvd.nist.gov/vuln/detail/CVE-2025-9074) ⚠️ **最新**
- [Docker Desktop 4.44.3 Security Release](https://docs.docker.com/security/security-announcements/)
- [CVE-2025-9074 影片解說](https://www.youtube.com/watch?v=8J9TcqxZxdw)
- [CVE-2019-5736: RunC 漏洞](https://nvd.nist.gov/vuln/detail/CVE-2019-5736)
- [Breaking out of Docker via runC](https://unit42.paloaltonetworks.com/breaking-docker-via-runc-explaining-cve-2019-5736/)
- [CVE-2024-21626: Docker 和 runc 容器逃逸漏洞](https://www.ecloudvalley.com/tw/blog/sa-talks-in-depth-analysis-of-cve-2024-21626-docker-and-runc-container-escape-vulnerability)

## Docker Daemon 安全

- [Why is Exposing the Docker Socket a Really Bad Idea?](https://blog.quarkslab.com/why-is-exposing-the-docker-socket-a-really-bad-idea.html)
- [Protect the Docker daemon socket | Docker Docs](https://docs.docker.com/engine/security/protect-access/)
- [Docker Engine API Pentesting](https://exploit-notes.hdks.org/exploit/container/docker/docker-engine-api-pentesting/)
- [Docker Socket 安全篇](https://mskter.com/2023/08/21/dockerContext-zh/)

## 建立安全 Docker

- [Container Hardening](https://systemweakness.com/container-hardening-999acb9d2692)
- [Building Secure Docker Images - 101](https://medium.com/walmartglobaltech/building-secure-docker-images-101-3769b760ebfa)
- [How To Secure Docker Images](https://www.mend.io/blog/secure-docker-with-containerd/)
- [How to Secure Your Docker Containers Like a Hacker Would](https://freedium.cfd/https://blog.devops.dev/%EF%B8%8F-how-to-secure-your-docker-containers-like-a-hacker-would-so-they-cant-c18d3531d7b8)

## 官方文件與最佳實踐

- [Security | Docker Docs](https://docs.docker.com/engine/security/)
- [Rootless mode | Docker Docs](https://docs.docker.com/engine/security/rootless/)
- [Container Seccomp 介紹](https://ithelp.ithome.com.tw/articles/10333092)
- [OWASP Docker Security](https://ithelp.ithome.com.tw/articles/10338702)

## 學習資源

- [awesome-docker-security](https://github.com/myugan/awesome-docker-security)
- [OWASP/Docker-Security](https://github.com/OWASP/Docker-Security)
- [Docker Security 筆記](https://hackmd.io/@blueskyson/docker-security)
- [容器隔離概念介紹](https://ithelp.ithome.com.tw/articles/10316644)
- [Container Runtime - Security Container](https://ithelp.ithome.com.tw/articles/10219590)

---

## 結語

Docker 安全不是「有 or 沒有」的二元問題，而是「成本 vs 風險」的權衡：你願意付出多少成本（rootless、seccomp、掃描、監控），來降低多少風險？

攻擊者會持續找新的逃逸路徑；防禦者則要持續追蹤 CVE、更新 runtime、審核配置。這篇文章提供的是「當下的最佳實踐」，但安全是一個動態的過程，需要持續學習與調整。

記住：**最小權限 + 分層防禦 + 持續監控 = 相對安全的容器環境**。
