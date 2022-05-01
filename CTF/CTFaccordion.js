head = '<div class="accordion" id="accordionExample">';
end='</div>';

title=[
  'CTF',
'Python Crypto Module',
'pycryptodome',
'RSA',
'bytes_to_long',
'long_to_bytes',
'pwntools',
'密碼學工具',
'# RSA攻擊',

];



content = [
  `# 一些CTF筆記`,
   `- gmpy2
- libnum
- sympy
- pycryptodome
- owiener`,
`\`\`\`
pip uninstall crypto pycryptodome
pip install pycryptodome
\`\`\`
`,
`1. 隨意選擇兩個大的質數p和q，p不等於q，計算N=p*q;
2. 根據歐拉函數獲取phi=(p-1)*(q-1)
3. 選擇一個小於phi並與phi互質的整數e(public key) e我們通常取65537。
4. 求得e關於phi的模反元素d(private key)
6. p,q丟棄
- 加密: M ^ e = C(mod N)
- 解密: C ^ d = M(mod N)
- 公鑰: (N , e)
- 私鑰: (N , d)`,
`
\`\`\`python
def bytes_to_long(byte):
    result = 0
    for b in byte:
        result = result * 256 + int(b)
    return result
\`\`\`
`,
`
\`\`\`python
def long_to_bytes(long):
    result = ""
    for i in range(len(str(long))):
        result += (chr(long >> (i * 8) & 0xff))
    return result[::-1]
\`\`\`
`,
`
\`pip install pwntools\`
\`\`\` python
from pwn import *
r=remote('ip',port)
r.recvline()
r.recvuntil(b'')
r.send(b'')#without enter
r.sendline(b'')
r.interactive()
r.close()
\`\`\`
`,
`
- yafu
- factordb
- sagemath
- CoCalc
- CryptoChef
`,
`## N
- p,q質數太小
- 共用N
- p,q太接近

## e
- 太小-沒加密到
- 太大-導致d太小
- Wiener attack 
    1. q<p<2q
    2. d<1/3 N^(1/4)
`
];





itemone = `<div class="accordion-item">\
    <h2 class="accordion-header" id="headingOne">\
      <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">\
        ${title[0]}
      </button></h2>\
    <div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#accordionExample">\
      <div class="accordion-body">\
        ${marked.parse(content[0])}
      </div></div></div>`;

accordion = head + itemone;

title.forEach((element,id) => {
  if(id===0){return;}
  accordion += `\
  <div class="accordion-item">\
    <h2 class="accordion-header" id="heading${id}">\
      <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${id}" aria-expanded="false" aria-controls="collapse${id}">\
        ${element}
      </button></h2>\
    <div id="collapse${id}" class="accordion-collapse collapse" aria-labelledby="heading${id}" data-bs-parent="#accordionExample">\
      <div class="accordion-body">\
        ${marked.parse(content[id])}
      </div></div></div>`;
});

accordion += end;
document.write(accordion);

