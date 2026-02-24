---
title: 一些 CTF 密碼學會用到的東西
published: 2025-06-04
description: ""
image: ""
tags: [CTF, Crypto]
category: "CTF"
draft: false
lang: ""
---

## 常用到的密碼學工具

- **yafu**：大整數分解工具
- **factordb**：質因數分解資料庫
- **sagemath**：數學計算軟體，常用於密碼學計算
- **CoCalc**：線上 SageMath 環境
- **CyberChef**：編碼解碼和數據分析工具

## 常用到的 Python 函式庫

- **gmpy2**：高精度數學運算庫
- **libnum**：數論和密碼學工具庫
- **sympy**：符號數學庫
- **pycryptodome**：密碼學函式庫（Crypto 模組）
- **owiener**：Wiener attack 實現

## 正確安裝 Crypto

如果遇到 `ModuleNotFoundError: No module named 'Crypto'` 錯誤，通常是因為安裝了錯誤的 `crypto` 套件。正確的安裝方式：

```python
pip uninstall crypto pycryptodome
pip install pycryptodome
```

## crypto.bytes_to_long 原理

```python
def bytes_to_long(bytes_data):
    result = 0
    for b in bytes_data:
        result = result * 256 + b
    return result
```

## crypto.long_to_bytes 原理

```python
def long_to_bytes(long_val):
    if long_val == 0:
        return b'\x00'
    result = bytearray()
    while long_val > 0:
        result.append(long_val & 0xff)
        long_val >>= 8
    return bytes(result[::-1])
```

## RSA 原理

1. 隨意選擇兩個大的質數 $p$ 和 $q$，$p$ 不等於 $q$，計算 $N = p \times q$
2. 根據歐拉函數獲取 $\phi = (p-1) \times (q-1)$
3. 選擇一個小於 $\phi$ 並與 $\phi$ 互質的整數 $e$ (public key)，我們通常取 65537
4. 求得 $e$ 關於 $\phi$ 的模反元素 $d$ (private key)，即 $ed \equiv 1 \pmod{\phi}$
5. $p, q$ 丟棄（保留 $N, e, d$）
   - 加密: $C \equiv M^e \pmod{N}$
   - 解密: $M \equiv C^d \pmod{N}$
   - 公鑰: $(N, e)$
   - 私鑰: $(N, d)$

## RSA 攻擊

### 針對 N 的攻擊

- **p, q 質數太小**：可以使用分解工具（如 yafu、factordb）直接分解
- **共用 N**：如果多個密文使用相同的 $N$，可以通過最大公因數找到 $p$ 和 $q$
- **p, q 太接近**：可以使用費馬分解法（Fermat's factorization method）

### 針對 e 的攻擊

- **e 太小**：如果 $e$ 很小且 $M^e < N$，則 $C = M^e$，可以直接開方還原明文
- **e 太大導致 d 太小**：可以使用 Wiener attack 或 Boneh-Durfee attack
- **Wiener attack**：當滿足以下條件時可以使用
  1. $q < p < 2q$
  2. $d < \dfrac{1}{3} N^{\dfrac{1}{4}}$
