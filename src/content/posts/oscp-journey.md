---
title: "OSCP 考試之路：如何一週考兩次"
published: 2026-02-22
description: "關於我如何在一週內考兩次 OSCP 並成功的故事。"
image: ""
tags: [OSCP, Penetration Testing, Security, OffSec]
category: "Security"
draft: false
lang: "zh-TW"
---

## 前言

OSCP（Offensive Security Certified Professional）是滲透測試領域中相當知名的一張證照，考驗的不只是技術知識，更是在 24 小時內獨立攻破多台機器的能力。這篇文章記錄我備考的心路歷程、踩過的坑、如何在一週內考兩次 OSCP 並成功，以及對這張證照的一些看法。

## 為什麼要考 OSCP？

前年跟實驗室去資安大會的時候其他人跑去問 OffSec 的攤位，他們有問到相當不錯的價格，想說可以實驗室人手一張，不過當時我手上沒有錢就只能錯過。後來 Kazma 有揪團跟 Devcore 談團體折扣 ~~(雖然沒有比實驗室當初的折扣多)~~ ，剛好當時有實習，錢包勉強夠用，最後以 62500 的優惠價購買了 Learn one 方案 ~~(說好的 Devcore conference 門票呢)~~ 。

## 備考過程

當初選擇一年方案是想說有很多時間可以慢慢準備，結果拖著拖著就遇到實驗室一堆事情，要忙計劃、國科會、CTF 等等，就一直拖到最後兩個月才開始認真準備。我的方案是從 2025 年 2 月開始的，課程的部分都有仔細看並且跟著做實驗室的練習，但是中間因為實驗室太忙就中斷了，11 月好不容易忙完國科會可以準備 OSCP，原本是計劃 12 月看完課程內容，1 月開始挑戰 Proving Grounds 的機器。不過發現時間真的不夠，所以在 12 月中的時候就跟教授請假要完全專心準備 OSCP，才有辦法依照預期進度完成課程。

課程看完也差不多到 1 月了，就整天在宿舍專心打靶機。因為沒有訂閱 HTB，所以都只有打 OffSec 的 PG 機器，我問了一些已經考過的朋友，他們推薦去找推薦清單來打，我參考了 [Lainkusanagi OSCP Like](https://docs.google.com/spreadsheets/d/18weuz_Eeynr6sXFQ87Cd5F0slOj9Z6rt/edit?gid=487240997#gid=487240997) 跟 [NetSecFocus Trophy Room](https://docs.google.com/spreadsheets/u/1/d/1dwSMIAPIam0PuRBkCiDI88pU3yzrqqHkDtBngUHNCw8/htmlview)。一開始主要是打 Lainkusanagi 的清單，後來快打完了就再加入 NetSecFocus 的清單，兩個清單的機器有重複的部分，但也有各自獨特的機器。基本上整個 1 月都是醒來打靶機打到睡覺的流程，剛開始打的時候一台大概要打三到五個小時，後來熟悉後就可以到一兩個小時一台。

我的習慣是如果遇到卡住的地方就先花個三十分鐘嘗試，如果還是沒有想法就直接去找 writeup，看看別人是怎麼解的，然後再自己嘗試一次。如果是知道漏洞在哪裡，但是無法成功的話，就會先嘗試花一個小時自己解決，真的沒有辦法再去找 writeup。這樣不至於浪費太多時間卡關，也可以學習到，當然一開始都會很快就去找 writeup，後來慢慢就會習慣先自己嘗試，然後再去看別人的解法。多收集別人的 writeup，很常遇到到同一台機器的不同解法，甚至是同一台機器的同一個漏洞的不同利用方式，這樣就可以學習到更多不同的技巧和思路。

大概一個月內就可以把兩個清單的機器都打完了，我是先挑選 Easy 的機器，後來再 Medium 跟 Hard，主要是怕時間不夠，所以先把 Easy 的機器打完，確保自己有足夠的練習時間。後面把獨立機器都打完後就練習 Challenge lab，大概是在考試前一週開始打 Challenge lab 的機器。

### 遇到的挑戰

我原本都是在 Mac 上進行練習，在課程時都是使用 PWK 的機器練習 lab，但是越到後面就容易遇到空間不夠跟常用的工具每次都要重新安裝的問題，所以改成使用 UTM ，但是 UTM 沒有快照功能，而且在使用體驗中也不太好，像是複製貼上就會有問題。所以後面就改成 VMware Fusion，雖然可以免費但是下載很麻煩，還好用了一些黑魔法直接搞到安裝檔，安裝好之後就可以順利使用了。VMware Fusion 的使用體驗就很好，複製貼上都沒有問題。在安裝好常用工具後就進行快照，以避免出現問題的時候可以快速回到之前的狀態，這樣就不會浪費太多時間在環境配置上。

當時在猶豫考試時要使用 Mac 還是 Windows，後來決定使用 Windows，主要是因為 Windows 使用 x64 架構，如果需要編譯 exploit 的話會比較方便。所以我在考試前兩週就開始在 Windows 上練習，熟悉 Windows 的環境和工具，這樣在考試的時候就不會因為不熟悉環境而浪費時間。

### 實戰練習心得

在打靶機的過程，發現一些 OffSec 的習慣，像是如果需要編譯 exploit 的話，就會在環境中安裝 gcc，因此不太會遇到需要在自己機器上編譯的狀況，所以 Mac 理論上也可以順利考試。

然後漏洞的部分還蠻明顯的，如果是預期的洞都會有明顯能利用的地方，所以不會需要花太多時間找洞。不過也有一些機器的漏洞比較隱蔽，或者是需要一些特定的條件才能觸發的，這些就會比較花時間去找和利用。

在打 challenge lab 的時候，我先打 0 - 3 的機器，直接打到懷疑人生，題目的設計是一台接著一台，必須要在打完的機器上尋找資料才能打下一台，不然很容易出現通靈狀況。這是很現實的環境，難度也很高，越打越沒希望，感覺考試沒救了。然後去打 OSCP A - C 的機器，發現好簡單，穩了。

## 考試當天

如前面提到的，我考了兩次，因為 OSCP 到期時間是 2026 年 2 月 16 日，所以想說在 2 月初考試，如果失敗還有時間再到期前考一次。第一次是在 2 月 2 日晚上 8 點開始，因為我習慣晚上活動所以選晚上開始考，不過考試前一天我還在打靶機，加上當天早起沒有睡飽，所以精神沒有很好。

### 考前準備

因為要在考前 15 分鐘連線到監考環境並檢查，所以我就先檢查電腦跟 VMware，然後更新 Windows ......。

Windows 順利更新後檢查 VMware，機器沒有問題，時間也快到了，就連線到監考環境，然後就破防了。

一開始使用 WiFi 連線，結果連線不穩定，螢幕分享一直斷線，每次都需要重新點擊分享。最後使用有線網路才順利完成考試檢查，這時已經過去兩個小時了，**破大防**。

還有用有線連線後還是一直斷線，後來使用 Firefox 連線就比較正常了，應該是 Chrome 記憶體用太多，**破大防**。 

### 考試過程

剛開始時因為心態爆炸所以連線 VPN 拿到題目後有點呆滯，摸了十分鐘左右才開始建立文件，然後就開始打靶機了。

整個考試過程都很緊張，原本準備了一堆零食想說考試期間可以吃，結果根本沒有食慾只有一直喝水跟能量飲料。

三台獨立機器都算簡單，大概六個小時就全部打完拿到 60 分了，接下來就是 AD set，一定很順利吧？對吧？才 10 分有什麼難的。

簡單介紹一下 AD set，只有一台是唯一可以直接存取的機器，題目會給一個帳號，其他兩台都在內網。

進入機器都給帳號了，提個權有什麼難的？對吧？

然後地獄就開始了，winPEAS 跑好幾遍都沒東西，所有檔案都翻過一次，提權漏洞都嘗試一遍，沒有，死都沒有，**破大防**。這時已經過去三個小時了，死活提不上去。

後來決定放棄進入機器，查看其他台有沒有機會，一打開，某 CI/CD 工具。花了五六個小時打它的漏洞都沒效果，這時想到之前朋友跟我說過有一個 AD set 魔王題，發現就是這題，還沒聽到身邊有能解出這題的人，**破大防**。

雖然已經知道沒有希望了，但還是打算試試看，畢竟只差 10 分就能考過了，然後就熬了 24 小時的夜成功放棄，**破大防**。

## 第二次考試

考試結束後想說可以還有時間，可以下週到期前再考一次，結果發現 OSCP 考試失敗的話需要 4 週的冷卻時間才能重考，但是我的 OSCP 是 2 月 16 日到期，沒救。

所以我直接寄信詢問，希望能夠讓我在到期前重考，幸好他們同意了，讓我能夠跳過冷卻期，不過似乎以後就沒辦法再次跳過冷卻期了。總之能夠重考後我就馬上挑選日期，不過因為考試時間太近所以沒有很好的時間，最後決定第二次考試在 2 月 8 日晚上 9 點開始。

因為有第一次的經驗，所以這次就比較放鬆一點，並且考前檢查也很快就完成了，沒有遇到什麼問題。考試過程也比較順利，雖然還是有一些卡關的地方，但整體來說比第一次順利很多。

一樣還是先打三台獨立機器，前面兩台大概四五個小時搞定，不過第三台就打不動了，完全找不到漏洞。後來決定先放棄第三台，直接去打 AD set，結果很順利的就打下整個 AD，比我想像的還簡單 WTF。

目前就 80 分及格了，大概花了八九個小時，但是還有一台獨立機器沒有解出來，打算繼續嘗試。再花了快兩個小時嘗試後覺得真的沒有什麼頭緒就放棄了，反正已經過了 80 分了。然後再檢查幾次筆記跟流程，確定沒有什麼問題跟遺漏，完善筆記內的描述，就結束考試了。

這次考試只喝了一罐蠻牛，原本還多買了一罐紅牛跟兩罐魔爪。

順帶一提，我覺得考試的時候吃鱈魚香絲很適合，不會髒手而且很好拿，還可以咬很久，可以幫助保持清醒，推薦給大家。

### 報告撰寫

本來打算在考試的 24 小時搞定報告的，不過實在是太累了就先去睡覺了，差不多在考試時間結束的時候開始寫，應該是晚上十點左右。

我是使用 [sysreptor](https://sysreptor.com/) 撰寫報告，它有提供 OSCP 報告的模板，可以直接套用，當初在考試前有花了一些時間練習使用熟悉一下。整個報告撰寫的過程大概花了三四個小時，主要是把之前打靶機的筆記整理一下，然後把考試中遇到的問題和解決方案寫清楚。報告的內容主要包括了每台機器的漏洞分析、利用過程、以及最後的結論和建議。

因為我在打機器時都有做筆記截圖，所以很快就~~讓 ChatGPT 幫我~~寫完了，不過還是有花一些時間去整理和修改，確保報告的內容清晰、完整，並且符合 OSCP 的要求。最後在提交報告之前，我還有請**好朋友 aka 紅隊大師**幫我檢查了一下報告，確保沒有什麼錯誤或者遺漏的地方。

最後再丟給 ChatGPT 幫我降低 AI 度，讓報告看起來更像是人寫的，然後就提交了。

在準備考試的過程中有找到有人推薦這個工具 [Tlogger](https://ph03n1x.net/tlogger-on-steroids/)，可以記錄終端機的內容，並且顯示 VPN IP 與目前時間，這對於截圖跟指令紀錄都很好用。不過因為一些限制所以有些互動式工具會無法正常顯示，我有使用 ChatGPT 幫我修改一下，讓它排除特定工具的記錄，也可以直接暫停記錄。

這些記錄對於之後復盤或是撰寫報告都有幫助，當然前提是有開著。

## 結果

第二天凌晨交的報告，隔天就收到通過的信件了。

成功在課程到期前一週內考兩次 OSCP 並且通過，好爽。

### 給準備考 OSCP 的人

1. 多打靶機，尤其是 OffSec 的 PG 機器，當然也可以參考其他清單的機器，增加不同的練習經驗。
2. 熟悉工具的使用，盡量不要使用有疑慮的工具，減少考試中出現問題的機會。建議在考試前就熟悉好要使用的工具，確保在考試中能夠順利使用。
3. 使用 Firefox 連線到監考環境，因為 Chrome 可能會有記憶體使用過高的問題，導致連線不穩定。
4. 16 GB 的 RAM 可能會比較吃緊，建議在考試前確保有足夠的資源，或者考慮升級到 32 GB 的 RAM，以確保在考試中能夠順利運行需要的工具和環境。
5. 最好使用有線網路連線到監考環境，因為 WiFi 可能會不穩定，導致連線中斷，影響考試的進行。
6. 多起來活動，保持身體的活力和精神的清醒，尤其是在考試期間，適當的休息和活動可以幫助提高專注力和效率。
7. 如果機器環境中沒有預期的工具，那可能就不是預期的漏洞了，建議換個方向去找。
8. 永遠要把機器翻爛，所有文件都要找過，所有漏洞都要嘗試過，確保沒有遺漏任何可能的線索。

## 結語
考完的心得是，就這樣嗎？好像有點太簡單了。幾乎都是找漏洞然後利用，沒有什麼特別的技巧或者是需要特別的知識，主要就是熟悉工具和流程，然後有耐心去找漏洞和利用。當然也有一些機器的漏洞比較隱蔽或者是需要一些特定的條件才能觸發的，這些就會比較花時間去找和利用，但整體來說還是算簡單的。

## 我的靶機清單
下面是我打過的靶機清單，包含了 Linux、Windows、Treat it like a small network、Active Directory and Networks 四個類別的機器，並且標註了每台機器的難度、社區評分、以及我打完的時間。這些機器都是來自 Lainkusanagi 的 OSCP Like 清單和 NetSecFocus 的 Trophy Room 清單。
我覺得社群評分的準確度比較高，不過有幾台反而是社群評分打太難的。


| Linux     | 難度           | 社群評分         | 時間(hh:mm) | 
| ----------------- | ------------ | ------------ | --------- | 
| ClamAV        | easy         | Intermediate | 00:22     |     
| Pelican       | Intermediate | Intermediate | 00:29     |     
| Payday        | Intermediate | Intermediate | 01:03     |     
| Snookums      | Intermediate | Intermediate | 01:44     |     
| Bratarina     | easy         | Intermediate | 00:37     |     
| Pebbles       | easy         | hard         | 02:05     |     
| Nibbles       | Intermediate | Intermediate | 00:16     |     
| Hetemit       | Intermediate | very hard    | 01:49     |     
| ZenPhoto      | Intermediate | Intermediate | 00:26     |     
| Nukem         | Intermediate | hard         | 01:35     |     
| Cockpit       | Intermediate | Intermediate | 00:22     |     
| Clue          | hard         | very hard    | 01:29     |     
| Extplorer     | Intermediate | Intermediate | 01:26     |     
| Postfish      | Intermediate | very hard    | 太麻煩       |     
| Hawat         | easy         | very hard    | 01:34     |     
| Walla         | Intermediate | Intermediate | 00:54     |     
| PC            | Intermediate | Intermediate | 00:40     |    
| Apex          | Intermediate | very hard    | 02:14     |     
| Sorcerer      | Intermediate | Intermediate | 01:32     |     
| Sybaris       | Intermediate | hard         | 01:06     |     
| Peppo         | hard         | hard         | 00:51     |     
| Hunit         | Intermediate | very hard    | 01:08     |     
| Readys        | Intermediate | very hard    | 01:51     |     
| Astronaut     | easy         | Intermediate | 00:21     |     
| bullybox      | Intermediate | Intermediate | 01:12     |     
| Marketing     | Intermediate | very hard    | 02:01     |     
| Exfiltrated   | easy         | Intermediate | 00:57     |     
| Fanatastic    | easy         | hard         | 01:47     |     
| QuackerJack   | Intermediate | Intermediate | 00:43     |     
| Wombo         | easy         | Intermediate | 00:17     |     
| Flu           | Intermediate | Intermediate | 01:05     |     
| Roquefort     | Intermediate | hard         | 01:46     |     
| Levram        | easy         | easy         | 00:29     |     
| MZEEAV        | Intermediate | Intermediate | 00:43     |     
| LaVita        | Intermediate | hard         | 02:32     |     
| Xposedapi     | intermediate | hard         | 02:42     |     
| Zipper        | hard         | very hard    | 01:30     |     
| Workaholic    | intermediate | hard         | 03:03     |    
| Fired         | intermediate | hard         | 01:10     |     
| Scrutiny      | intermediate | very hard    | 02:02     |     
| SPX           | intermediate | very hard    | 01:26     |     
| Vmdak         | intermediate | hard         | 01:14     |     
| Mantis        | intermediate | very hard    | 02:15     |     
| BitForge      | intermediate | very hard    | 02:16     |     
| WallpaperHub  | intermediate | very hard    | 01:48     |     
| Zab           | intermediate | hard         | 02:46     |     
| SpiderSociety | intermediate | intermediate | 01:33     |     
| Twiggy        | easy         | intermediate | 00:24     |     
| Blackgate     | hard         | intermediate | 00:30     |     
| Boolean       | intermediate | very hard    | 01:18     |     
| Codo          | easy         | easy         | 00:55     |     
| Crane         | intermediate | easy         | 00:14     |     
| image         | intermediate | intermediate | 00:12     |     
| law           | intermediate | intermediate | 00:11     |     
| press         | intermediate | easy         | 00:25     |     
| RubyDome      | easy         | intermediate | 01:02     |     
| pyLoader      | intermediate | easy         | 00:10     |     
| plum          | intermediate | intermediate | 00:44     |     
| Jordak        | intermediate | easy         | 00:20     |     
| Ochima        | intermediate | intermediate | 00:44     |     
| CVE-2023-6019 | intermediate | easy         | 00:11     |     
| Sea           | intermediate | intermediate | 01:21     |     

| Windows                      | 難度           | 社群評分         | 時間        |
| ------------------------------------- | ------------ | ------------ | --------- |
| Kevin                             | easy         | easy         | 00:35     |
| Internal                          | easy         | easy         | 00:52     |
| algernon                          | easy         | easy         | 00:24     |
| Jacko                             | Intermediate | hard         | 02:42     |
| Craft                             | Intermediate | hard         | 02:03     |
| Squid                             | easy         | hard         | 02:04     |
| Nickel                            | Intermediate | hard         | 01:51     |
| MedJed                            | Intermediate | hard         | 01:03     |
| Billyboss                         | Intermediate | hard         | 01:08     |
| Shenzi                            | Intermediate | hard         | 01:17     |
| AuthBy                            | Intermediate | hard         | 02:26     |
| Slort                             | Intermediate | Intermediate | 02:18     |
| Hepet                             | Intermediate | very hard    | 02:04     |
| DVR4                              | Intermediate | hard         | 01:23     |
| Mice                              | easy         | hard         | 01:11     |
| Monster                           | easy         | very hard    | 01:38     |
| Fish                              | Intermediate | hard         | 01:38     |
| Resourced                         | Intermediate | very hard    | 02:41     |
| Hutch                             | Intermediate | hard         | 01:39     |

| Treat it like a small network | 難度           | 社群評分         | 時間(hh:mm) |
| ------------------------------------- | ------------ | ------------ | --------- |
| SkillForge                        | intermediate | very hard    | 02:57     |

| Active Directory and Networks     | 難度           | 社群評分         | 時間(hh:mm) |
| ------------------------------------- | ------------ | ------------ | --------- |
| Access                            | intermediate | very hard    | 02:00     |
| Nagoya                            | hard         | very hard    | 03:05     |
| Hokkaido                          | intermediate | very hard    | 02:16     |
| Vault                             | hard         | hard         | 01:57     |
| Heist                             | hard         | very hard    | 01:23     |
