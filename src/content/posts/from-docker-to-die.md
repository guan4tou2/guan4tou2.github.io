---
title: "從 Docker 到 Die：從容器原理到實戰與安全"
published: 2026-01-10
description: "一篇給實驗室 meeting 用的容器筆記：從 Namespace/Cgroup、Docker 架構與 Dockerfile/Compose，到常見攻擊面與 Podman 比較。"
image: ""
tags: [Docker, Container, Linux, Security, Podman]
category: "Tech"
draft: true
lang: "zh-TW"
---

## 前言

~~「在這篇文章中，我們將探討從 Docker 到 Die 的過程……」~~（以上發言都是 Copilot 的產物，深得我心）

這篇是我為了實驗室 meeting 整理的容器筆記：從「為什麼要用容器」一路走到 Docker 的元件與底層、Dockerfile 與 Compose 的實務，再補上攻擊面/防禦觀點，最後用 Podman 當作對照組收尾。

「Die」在這裡不是某個新產品，而是我對「容器玩到最後會踩到的坑」的自嘲：你以為只是 `docker run`，結果一路碰到 kernel、檔案系統、網路、供應鏈與權限邊界。

## 目錄

- [為什麼要 Container？](#為什麼要-container)
- [Docker 與容器生態：架構演進](#docker-與容器生態架構演進)
- [容器底層：Namespace 與 Cgroup](#容器底層namespace-與-cgroup)
- [Docker 元件與架構：Image/Container/Volume/Network](#docker-元件與架構imagecontainervolumenetwork)
- [Docker 安裝指南（Linux/Windows/macOS）](#docker-安裝指南linuxwindowsmacos)
- [Docker 基本操作：images/containers/network](#docker-基本操作imagescontainersnetwork)
- [撰寫 Dockerfile：把「可重現」做出來](#撰寫-dockerfile把可重現做出來)
- [Docker Compose：多容器管理](#docker-compose多容器管理)
- [Docker 的攻擊與防禦（Offensive/Defensive）](#docker-的攻擊與防禦offensivedefensive)
- [Podman vs Docker：什麼時候該換？](#podman-vs-docker什麼時候該換)

## 為什麼要 Container？

容器（container）最直覺的價值是：**用「接近 process 的成本」得到「接近 VM 的隔離體驗」**。你不需要每次都起一台完整 OS 的 VM，就能快速拿到一個可重現的執行環境（尤其是在 CI/CD、測試、微服務部署上）。

### Container vs VM vs QEMU

- **VM（虛擬機）**：靠 Hypervisor（KVM/VirtualBox…）在宿主機上跑完整 OS，隔離強、啟動慢、資源開銷大。
- **Container（容器）**：靠 Linux kernel 的 **Namespace + Cgroup** 做隔離，直接跑在宿主機 kernel 上，啟動快、資源省，但隔離邊界與 kernel 風險需要更小心。
- **QEMU（模擬器）**：靠二進位轉譯模擬不同硬體架構（例如 x86 模擬 ARM），跨架構最強，但效能通常最差（除非有 KVM 加速）。

:::info
容器不是要取代 VM，而是讓「需要一致環境、快速啟動、成本敏感」的場景更划算。
:::

## Docker 與容器生態：架構演進

:::warning
**Container 是概念，Docker 是其中一種實作。**
:::

Docker 早期依賴 LXC，後來逐步演進（大方向）：

- LXC（<0.7）
- libcontainer（>=0.7,<1.11）
- containerd / runc（>=1.11，朝 OCI 標準靠攏）

### OCI（Open Container Initiative）

OCI 最重要的兩個規範：

- **Runtime spec**：容器「怎麼跑起來」
- **Image spec**：映像「長什麼樣子」

而 **runc** 是 OCI runtime spec 的參考實作之一；因此你會看到很多容器系統最後都能落到「OCI runtime + OCI image」。

### 2017 後的 Docker：Moby / Docker CE / Docker EE

- **Moby**：模組化的開源架構（比較像積木）
- **Docker CE**：社群版產品
- **Docker EE**：企業版（現由 Mirantis 維護）

## 容器底層：Namespace 與 Cgroup

容器之所以「看起來像一台小 Linux」，主要靠兩件事：

- **Namespace**：隔離視圖（你看到什麼）
- **Cgroup**：限制/管理資源（你能用多少）

### Namespace：把「視圖」切開

| Namespace | 隔離內容 | 常見關鍵字 |
| --- | --- | --- |
| UTS | hostname/domain | `CLONE_NEWUTS` |
| IPC | 共享記憶體/訊號量 | `CLONE_NEWIPC` |
| PID | 行程 ID 視圖 | `CLONE_NEWPID` |
| MNT | 掛載點/檔案系統視圖 | `CLONE_NEWNS` |
| NET | 網路介面、IP、Port | `CLONE_NEWNET` |
| USER | UID/GID 對映 | `CLONE_NEWUSER` |
| CGROUP | cgroup 視圖 | `CLONE_NEWCGROUP` |

快速體驗（以 Linux 為例）：

```bash
# 進入一個新的 cgroup namespace
sudo unshare --cgroup --mount-proc bash
cat /proc/self/cgroup
# 會看到類似：0::/

exit

# 回到原本的 namespace
cat /proc/self/cgroup
# 會看到完整路徑，例如：0::/user.slice/user-1000.slice/session-123.scope
```

這個實驗展示了 namespace 如何「切割視圖」：同一台機器上，不同 namespace 裡的 process 看到的 cgroup 路徑完全不同。

### Cgroup：把「資源」管起來

Cgroup（Control Group）是一套把 process 分組、並對該組做資源管理的機制：

- **限制資源上限**：例如最多用 512MB 記憶體、1 個 CPU 核心
- **設定優先權**：高優先權的 cgroup 可以搶到更多 CPU 時間
- **統計使用量**：追蹤實際用了多少資源
- **資源隔離**：避免某個 process 吃光所有資源

容器的「資源限制」（`docker run --memory 512m --cpus 1.0`）大多都依賴 Cgroup。

:::info
**Cgroup v1 vs v2**：現代 Linux 發行版大多已切換到 cgroup v2（unified hierarchy），它把所有控制器整合成單一階層，更簡潔也更強大。
:::

### chroot vs pivot_root

- **chroot**：只改當前 process 的根目錄（偏「檔案系統視圖」），不是完整隔離。例如：

```bash
chroot /path/to/new/root /bin/bash
```

但它無法防止 process 用 `..` 跳出去，也不會真的隔離 mount namespace。

- **pivot_root**：更貼近容器啟動時「切換 root filesystem」的做法，搭配 mount namespace 才像真的容器根目錄切換。Docker/containerd 在啟動容器時會用 `pivot_root` 來真正「切換根目錄」。

## Docker 元件與架構：Image/Container/Volume/Network

### 核心元件：Client / Daemon / Container

Docker 安裝好後，基本上是 Client/Server 架構：

- **Docker Client（CLI）**：`docker ...`
- **Docker Daemon（dockerd）**：管理 image/container/network/volume，並提供 API
- **Container**：實際跑起來的「被隔離的一組 process + 檔案系統/網路視圖」

Client 與 Daemon 常透過 Unix socket 溝通：

```text
/var/run/docker.sock
```

:::warning
這條 socket 也是 Docker 安全最常被提到的「核彈引信」：誰能控制 daemon，誰就差不多能控制 host。
:::

### Image：分層、唯讀、可被重用

- 多個容器可共用同一組 image layers
- 容器只有最上層可寫（container writable layer）
- 底層常見是 OverlayFS/UnionFS（疊加視圖）

### Container：Image + 可寫層（短命）

> Image（唯讀） + Container Writable Layer（可寫、跟著容器生命週期走）

因此要「持久化」資料，請用 **Volume / Bind mount**，不要把資料寫在可寫層裡。

### Registry / Repository / Tag / Digest（概念版）

- **Registry**：放 image 的地方（例如 Docker Hub、Harbor）
- **Repository**：一個 repo 裡有多個版本（tags）
- **Tag**：版本標籤（預設常見 `latest`）
- **Digest**：內容雜湊（用來確保拿到的是同一份內容）

### Volume：容器生命週期之外的資料

- **Volume**：由 Docker 管理，適合正式部署
- **Bind mount**：把本機路徑掛進容器，適合開發掛原始碼
- **tmpfs**：在記憶體中，適合敏感/暫存資料

### Network：bridge/host/container/none

- **bridge（預設）**：用 `docker0` bridge + NAT；同網段容器可互通，可用 `-p` 映射 port
- **host**：共用主機網路（高效能但 port 容易衝突）
- **container**：跟另一個容器共用 network namespace（sidecar 概念）
- **none**：只有 lo，不給外網

## Docker 安裝指南（Linux/Windows/macOS）

### Ubuntu（官方 repo 方式）

```bash
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove $pkg
done

sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo \"${UBUNTU_CODENAME:-$VERSION_CODENAME}\") stable" | \
sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo docker run hello-world
```

### 非 root 使用者（docker group）

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
docker run hello-world
```

### Windows / macOS

主流都是 Docker Desktop（Windows 搭配 WSL2）。macOS 背後也是用輕量 VM 來提供 Linux kernel。

## Docker 基本操作：images/containers/network

### Image

```bash
docker images            # 或 docker image ls
docker search keyword
docker pull ubuntu:22.04
docker build -t myapp:latest .
docker rmi myapp:latest
docker tag ubuntu:22.04 myrepo/ubuntu:custom
docker save -o ubuntu.tar ubuntu:22.04
docker load -i ubuntu.tar
docker history ubuntu:22.04
docker system df
```

:::info
registry 上看到的大小通常是「壓縮後」；本地 `docker images` 看到的是解壓縮後的大小。
:::

#### Image ID vs Digest

```bash
docker images --digests
```

你會看到兩個欄位：

- **IMAGE ID**：該映像的 `config.json` 的 SHA256 雜湊（由 `docker build` 時產生）
- **DIGEST**：該映像的 `manifest.json` 的 SHA256 雜湊（通常在 `docker push` 到 registry 時由 registry 計算並返回）

簡單理解：

- **操作映像檔**用 Image ID（本地識別）
- **驗證映像檔**用 Digest（確保內容一致，即使 tag 被覆蓋）

```bash
# 用 digest 拉取映像，確保拿到完全相同的內容
docker pull ubuntu@sha256:abcd1234...
```

#### Dangling Image

「沒有任何 tag 指向它的映像檔」就是 dangling image。通常是執行 `docker build` 或 `docker pull` 過程中產生的中間產物：

```bash
# 列出 dangling images
docker images -f dangling=true

REPOSITORY   TAG       IMAGE ID       CREATED         SIZE
<none>       <none>    43b46e5a5e4b   2 hours ago     130MB
<none>       <none>    21e3f6b2b9e9   2 days ago      350MB

# 清理 dangling images
docker image prune
```

#### docker history：看 image 怎麼來的

```bash
docker history --no-trunc python:3.11
```

會顯示這個 image 是如何一層一層建構出來的（每個 `RUN`、`COPY` 都是一層），可以用來理解別人的 Dockerfile 或是偵測潛在的資安問題（例如哪一層引入了大檔案或敏感資訊）。

### Container

```bash
docker ps -a
docker run -it --rm ubuntu:22.04 bash
docker exec -it <container> bash
docker logs <container>
docker stop <container>
docker rm <container>
```

#### `docker run` 常見參數

- `-d`：背景執行
- `-it`：互動式終端
- `--rm`：退出後自動刪除
- `-v`：掛載 volume 或路徑
- `-p`：port mapping（`host:container`）

#### `attach` vs `exec`

- `attach`：附加到主行程；主行程結束就結束（退出通常用 Ctrl-p Ctrl-q）
- `exec`：在容器內開新行程；通常更常用

### Network

```bash
docker network ls
docker network create --driver bridge mynet
docker network inspect mynet
docker network rm mynet
```

## 撰寫 Dockerfile：把「可重現」做出來

Dockerfile 的目標是把建置流程變成可重現、可讀、可審。比起 `docker commit` 這種「不透明快照」，Dockerfile 更適合長期維護與資安審核。

### 常用指令速查（重點版）

- **FROM**：指定 base image（支援多階段）
- **RUN**：執行指令並形成新 layer（RUN 太多會增加層數；可用 `&&` 合併）
- **COPY / ADD**：放檔案進 image（一般優先 COPY；ADD 多了自動解 tar、支援 URL）
- **CMD / ENTRYPOINT**：定義容器啟動行為（ENTRYPOINT 偏「主程式固定」）
- **ENV / ARG**：ENV 是 runtime；ARG 是 build-time
- **WORKDIR / USER / EXPOSE / HEALTHCHECK**：把 image 做得更像產品

### Context 與 `.dockerignore`

`docker build .` 的 `.` 是 context：Docker client 會把 context 打包送去 engine。COPY/ADD 只能拿到 context 內的檔案，因此請用 `.dockerignore` 排除 `.git/`、`node_modules/`、大檔案等。

### 多階段建置（multi-stage build）

```Dockerfile
FROM golang:alpine as builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /src/app /app/app
CMD ["/app/app"]
```

### 多架構（multi-arch）

容器共用 kernel，因此 image 必須與 host 架構相容；官方常提供 multi-arch manifest，可以用：

```bash
docker manifest inspect golang:alpine
```

## Docker Compose：多容器管理

Compose 用 YAML 描述一組服務，讓整套環境能被版本控制與一鍵啟停。

```yaml
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - db
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: example
      MYSQL_DATABASE: mydb
    volumes:
      - db_data:/var/lib/mysql
volumes:
  db_data:
```

```bash
docker compose up -d
docker compose down
docker compose logs -f
docker compose restart
docker compose build
docker compose config
```

## Docker 的攻擊與防禦（Offensive/Defensive）

Docker 的安全議題很少是「神秘 0day」；更多時候是 **暴露 API、掛錯東西、權限開太大、供應鏈沒管**。

### 攻擊面概覽（攻擊者視角）

常見攻擊面：

1. Host 與 Docker Daemon（設定/漏洞）
2. Image（來源不可信、內含 secrets、相依套件漏洞）
3. Runtime（隔離/權限設定錯誤）
4. Network（暴露管理介面、容器內橫移）
5. App（容器內跑的服務本身有漏洞）

#### 偵察：找暴露的 Docker API

常見是用 Shodan/Censys 找 2375/2376（未加密/或 TLS 設錯）。若打進內網，也會用列舉工具（例如 deepce、botb、CDK）去找掛載點、capabilities、網路模式與疑似逃逸路徑。

#### 入侵入口：docker.sock / 未保護的 Docker API

如果攻擊者在容器內拿到 shell，又發現能存取 `/var/run/docker.sock`，那通常可以直接控制 host daemon，接著用「掛 host 根目錄」或開 privileged container 的方式拿到 host 權限。

#### 容器逃逸（Escape）

三大類：

- **錯誤配置**：`--privileged`、掛載敏感目錄、亂給 `CAP_SYS_ADMIN`…
- **runtime 漏洞**：例如 runc 的歷史 CVE（CVE-2019-5736）、較新的工作目錄相關漏洞（CVE-2024-21626）
- **kernel 漏洞**：共享 kernel 的代價

### 防禦視角：最小權限 + 分層防禦（可落地版）

- **保護 Docker daemon**
  - 不暴露 Docker API 到公網；需要遠端請上 TLS 與認證
  - 保護 `/var/run/docker.sock`，不要隨便 mount 進容器
  - 盡可能使用 rootless（降低 daemon 被打穿後的危害半徑）
- **建構安全的 image pipeline**
  - 用最小化 base image（alpine/distroless）
  - Dockerfile 指定非 root `USER`
  - 多階段建置，避免把編譯器/原始碼打到 runtime image
  - CI/CD 做漏洞掃描（例如 Trivy），私有 registry（例如 Harbor）做簽署/掃描
- **強化 runtime**
  - 永遠不要隨便 `--privileged`
  - `--cap-drop=ALL` 後逐一加回必要能力
  - 收緊 seccomp、AppArmor/SELinux
  - `--read-only` + 必要可寫目錄用 volume
  - secrets 不要寫死在 image 或 env（用 secrets 管理）
- **持續監控**
  - Falco、Cilium Tetragon（eBPF）等監控異常 syscall 與行為

:::tip
想了解更多深入的 Docker 攻防細節（包含最新漏洞 CVE-2025-9074）、詳細工具清單與 CVE 分析，請參考專題文章：《[Docker 安全攻防全解析：從滲透測試到防禦加固](/posts/docker-security-offensive-defensive/)》。
:::

## Podman vs Docker：什麼時候該換？

Podman 常見賣點是 **daemonless** 與 **rootless** 體驗：

- **Docker**：需要 `dockerd`（daemon），容器 process 是 daemon 的 child process
- **Podman**：直接跟 OCI runtime 互動，容器 process 是 podman 的 child process

差異會延伸到治理方式：

- Docker 很習慣「daemon 提供 restart policy」
- Podman 更常用「systemd unit 管理自動啟動」來補足

## 結語

Docker 從「包環境」出發，最後總會碰到兩件事：**可重現**（Dockerfile/Compose）與 **邊界**（隔離與安全）。把最小權限與供應鏈治理做起來，你就能從 Docker 到（不那麼）Die。
