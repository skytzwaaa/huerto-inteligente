# Genera script.js (con main.wasm incrustado en base64)
import base64
b64=base64.b64encode(open('main.wasm','rb').read()).decode()
s=open('script.src.js').read().replace('__WASM_B64__',b64)
open('script.js','w').write(s)
print('script.js listo', len(s))
