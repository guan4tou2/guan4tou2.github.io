---
title: 一些 CTF 密碼學會用到的東西
published: 2025-06-04
description: ''
image: ''
tags: [CTF,Crypto]
category: 'CTF'
draft: false 
lang: ''
---

## 常用到的密碼學工具
- yafu
- factordb
- sagemath
- CoCalc
- CyberChef

## 常用到的 Python 函式庫
- gmpy2
- libnum
- sympy
- pycryptodome
- owiener

## 正確安裝 Crypto
```python
pip uninstall crypto pycryptodome
pip install pycryptodome
```

## crypto.bytes_to_long 原理
```python
def bytes_to_long(byte):
    result = 0
    for b in byte:
        result = result * 256 + int(b)
    return result
```

## crypto.bytes_to_long 原理
```python
def long_to_bytes(long):
    result = ""
    for i in range(len(str(long))):
        result += (chr(long >> (i * 8) & 0xff))
    return result[::-1]
```

## RSA 原理

1. 隨意選擇兩個大的質數 $p$ 和 $q$ ，$p$ 不等於 $q$ ，計算 $N=p*q$
1. 根據歐拉函數獲取 $\phi=(p-1)*(q-1)$
2. 選擇一個小於 $\phi$ 並與 $\phi$ 互質的整數 $e$ (public key) 我們通常取 65537。
3. 求得 $e$ 關於 $\phi$ 的模反元素 $d$ (private key)
4. $p,q$ 丟棄
   - 加密: $M ^ e = C(\mod N)$
   - 解密: $C ^ d = M(\mod N)$
   - 公鑰: $(N , e)$
   - 私鑰: $(N , d)$


## RSA 攻擊
### N
- p, q 質數太小
- 共用 N
- p, q 太接近

### e
- 太小 -> 沒加密到
- 太大 -> 導致 d 太小
- Wiener attack 
    1. $q < p < 2q$
    2. $d < \dfrac{1}{3} N^{\dfrac{1}{4}}$
