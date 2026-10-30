# Huerto Inteligente · página web con motor en C

## Archivos
- `index.html`: estructura y contenido de la página.
- `style.css`: diseño (colores, tipografía, efecto vidrio, adaptable al celular).
- `script.js`: carga el motor en C, corre la simulación, dibuja los gráficos y anima la página (GSAP + ScrollTrigger + Lenis por CDN).
- `main.c`: motor de riego y pulverizador. Es la misma lógica del ESP32 del prototipo.
- `main.wasm`: `main.c` ya compilado a WebAssembly.
- La cámara (ESP32-CAM) se simula con una vista térmica: detecta la plaga sola y avisa al llegar a 40 % de confianza. El depósito se llena solo cuando baja de 10 %.

## Ver la página
Opción rápida: abre `index.html` con doble clic. `script.js` trae una copia del motor incrustada, así que funciona sin servidor.

Opción recomendada (carga `main.wasm` directamente):
```
python -m http.server 8000
```
y abre http://localhost:8000

Las animaciones y las tipografías se cargan de internet (CDN). Sin conexión, la página funciona igual, pero sin el scroll suave ni las fuentes.

## Compilar el motor en C
A WebAssembly (necesita clang con destino wasm32; viene en LLVM):
```
clang --target=wasm32 -O3 -nostdlib -ffreestanding -Wl,--no-entry -o main.wasm main.c
```
Después de recompilar, vuelve a incrustar el motor en script.js con:
```
python build.py
```
(build.py toma `script.src.js` y `main.wasm` y genera `script.js`).

Como programa de terminal (gcc o clang):
```
gcc -O2 -o huerto main.c
./huerto                  # simula 90 segundos del huerto
./huerto --bench 5000000  # mide 5 millones de decisiones
```
En Windows puedes usar MinGW (`gcc`) o WSL.
