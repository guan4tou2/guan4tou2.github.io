# kiemdev05：去武器化程式碼附錄（分析用）

> 目的：把「分析流程會用到的程式」整理成可重現的附錄，但**不提供可直接執行的惡意行為**。  
> 原則：移除/替換下列能力：下載遠端 payload、持久化、資料竊取、外洩、注入/Process Hollowing、載入並執行二進位。

---

## 1) Stage 1 解包（base85 → zlib → marshal）

> 這段只把 stage1 payload 解成 `code object` 或輸出 disassembly，不執行 code object。

```python
from __future__ import annotations

import base64
import dis
import marshal
import zlib
from pathlib import Path
from types import CodeType


def unpack_stage1_to_codeobj(stage1_b85: str) -> CodeType:
    raw = base64.b85decode(stage1_b85)
    decompressed = zlib.decompress(raw)
    codeobj = marshal.loads(decompressed)
    if not isinstance(codeobj, CodeType):
        raise TypeError(f"decoded object is not code: {type(codeobj)!r}")
    return codeobj


def write_disassembly(codeobj: CodeType, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        f.write(dis.code_info(codeobj))
        f.write("\n\nDisassembled bytecode:\n")
        dis.dis(codeobj, file=f)


if __name__ == "__main__":
    # TODO: 由你自行貼入 stage1 payload（b85 字串）
    STAGE1_PAYLOAD_B85 = "<REDACTED>"

    # 注意：marshal 格式與 bytecode opcode 會受 Python 版本影響。
    # 依你的分析，此樣本需用 Python 3.10.x 解析最穩。
    code = unpack_stage1_to_codeobj(STAGE1_PAYLOAD_B85)
    write_disassembly(code, Path("artifacts/sup02_stage1_dis.txt"))
    print("ok: wrote artifacts/sup02_stage1_dis.txt")
```

---

## 2) Stage 2（stealer）來源碼：去武器化骨架

> 這段是你手工反編譯後的「結構骨架」，**刻意移除所有資料讀取與外洩行為**，只保留函式邊界與資料流說明，方便對照 bytecode。

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass(frozen=True)
class TargetProfile:
    name: str
    base_path: str


def installed_chromium_like_profiles() -> list[TargetProfile]:
    # 原始樣本：枚舉大量 Chromium/Discord 變體路徑
    # 去武器化：只回傳空清單，避免掃描受害端環境
    return []


def installed_gecko_like_profiles() -> list[TargetProfile]:
    # 原始樣本：Firefox/Pale Moon/SeaMonkey/Waterfox/Mercury
    return []


def collect_summary_only() -> dict:
    # 原始樣本：收集 login/cookie/ccard 數量 + 系統資訊
    # 去武器化：只回傳空摘要
    return {"logins": 0, "cookies": 0, "ccards": 0}


def build_archive_placeholder(summary: dict) -> bytes:
    # 原始樣本：打包 TEMP 目錄下產物為 zip
    # 去武器化：回傳空 bytes
    return b""


def exfiltrate_disabled(*_args, **_kwargs) -> None:
    # 原始樣本：requests.post(Telegram Bot API /sendDocument)
    raise RuntimeError("exfiltration disabled in appendix")


def main() -> None:
    summary = collect_summary_only()
    _archive = build_archive_placeholder(summary)
    # exfiltrate_disabled(...)  # deliberately disabled
    print("ok: deweaponized stage2 skeleton executed (no-op)")


if __name__ == "__main__":
    main()
```

---

## 3) Wmuxwilb.exe（PureHVNC loader）常見解包邏輯：僅解密/解壓，不載入 DLL

> 這段示意「AES 解密 → 取得 gzip buffer → 解壓得到 DLL bytes」的流程，但**不做 Assembly.Load / 反射呼叫**。

```python
from __future__ import annotations

import base64
import gzip
import io
from dataclasses import dataclass

try:
    from Crypto.Cipher import AES  # pycryptodome
except Exception as e:  # pragma: no cover
    raise SystemExit("need pycryptodome for this snippet") from e


@dataclass(frozen=True)
class AesBlob:
    key_b64: str
    iv_b64: str
    encrypted: bytes


def aes_cbc_decrypt(blob: AesBlob) -> bytes:
    key = base64.b64decode(blob.key_b64)
    iv = base64.b64decode(blob.iv_b64)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return cipher.decrypt(blob.encrypted)


def maybe_gunzip_with_len_prefix(buf: bytes) -> bytes:
    # 你的分析：前 4 bytes 可能是長度/欄位，接著是 gzip magic 1f8b
    start = 0
    if len(buf) >= 6 and buf[4:6] == b"\x1f\x8b":
        start = 4
    gz = gzip.GzipFile(fileobj=io.BytesIO(buf[start:]))
    return gz.read()


if __name__ == "__main__":
    # TODO: 由你自行放入對應樣本抽出的 encrypted bytes（不要從文章直接提供）
    blob = AesBlob(
        key_b64="<REDACTED>",
        iv_b64="<REDACTED>",
        encrypted=b"<REDACTED_BYTES>",
    )
    decrypted = aes_cbc_decrypt(blob)
    dll_bytes = maybe_gunzip_with_len_prefix(decrypted)
    print("ok: got dll bytes", len(dll_bytes))
```

---

## 4) ProtoBuf 組態（C2）解析：只示意「欄位存在」不提供 exploit

> 你在筆記中用線上 decoder 解出 `field1=ip`、`field2=port`、`field3=certificate` 等。  
> 這裡建議保留「結果」在文章/筆記即可；若要離線解析，請在內部環境用 protobuf schema 對照（此處不附完整 schema 以免引導濫用）。
