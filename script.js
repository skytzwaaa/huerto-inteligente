/* =====================================================================
   Huerto Inteligente · script.js
   1. Carga el motor escrito en C (main.c -> main.wasm).
   2. Corre la simulación del huerto: cada 100 ms el motor decide. Todo
      es simulado: un sensor de suelo, un DHT22 (temperatura y humedad del aire),
      nivel del depósito y pulverizador.
   3. Dibuja el corte del huerto (hero), el gráfico de 60 s y el historial.
   4. Mide el rendimiento: C/WebAssembly frente a JavaScript.
   5. Animaciones: Lenis (scroll suave) + GSAP ScrollTrigger, cursor
      personalizado y tarjetas con inclinación 3D.
   ===================================================================== */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* -------------------------------------------------------------------
     1. MOTOR
     main.wasm se compila desde main.c. Una copia va incrustada abajo en
     base64, así la página también funciona al abrir index.html con doble
     clic (los navegadores no cargan .wasm desde file://).
     ------------------------------------------------------------------- */
  const WASM_B64 = "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";

  /* Copia exacta de la lógica de main.c en JavaScript. Se usa para la
     comparación de rendimiento y como respaldo si WebAssembly no carga. */
  class MotorJS {
    constructor() {
      const f = Math.fround;
      this.cfg = { seco: 2498, mojado: 1000, umbral_riego: 35, umbral_parar: 60, max_riego_ms: 5000, espera_ms: 20000, pulveriza_ms: 3000, nivel_minimo: 10 };
      this.st = this.estadoInicial();
      this.cola = [];
      this.ultimoT = 0;
      this.reloj = 0;
      this.suelo = f(42);
      this.tanque = f(80);
      this.tempC = f(21);
      this.aire = f(70);
      this.temp10 = 210;
      this.aireLec = 70;
      this.vacioAvisado = 0;
      this.semilla = 20261121 >>> 0;
    }
    estadoInicial() {
      return { regando: 0, inicio_riego: 0, fin_riego: -1000000, plaga_pendiente: 0, pulverizando: 0, inicio_pulv: 0, nivel_deposito: 80, humedad: 0 };
    }
    static limitar(v, a, b) { return v < a ? a : v > b ? b : v; }
    static azar(obj, key) { obj[key] = (Math.imul(obj[key], 1664525) + 1013904223) >>> 0; return obj[key] >>> 8; }
    emitir(ev, t) { this.cola.push([ev, t]); if (this.cola.length > 31) this.cola.shift(); }
    hi_humedad(crudo) {
      const r = this.cfg.mojado - this.cfg.seco;
      if (r === 0) return 0;
      return MotorJS.limitar(Math.trunc(((crudo - this.cfg.seco) * 100) / r), 0, 100);
    }
    decidir(e, crudo, ahora, conEventos) {
      const c = this.cfg;
      const h = this.hi_humedad(crudo);
      e.humedad = h;
      if (conEventos) this.reloj = ahora;
      if (!e.regando) {
        if (h < c.umbral_riego && ahora - e.fin_riego >= c.espera_ms) {
          e.regando = 1; e.inicio_riego = ahora;
          if (conEventos) this.emitir(1, ahora);
        }
      } else if (h >= c.umbral_parar) {
        e.regando = 0; e.fin_riego = ahora;
        if (conEventos) this.emitir(2, ahora);
      } else if (ahora - e.inicio_riego >= c.max_riego_ms) {
        e.regando = 0; e.fin_riego = ahora;
        if (conEventos) this.emitir(3, ahora);
      }
      if (e.pulverizando && ahora - e.inicio_pulv >= c.pulveriza_ms) {
        e.pulverizando = 0;
        if (conEventos) this.emitir(6, ahora);
      }
      return e.regando | (e.pulverizando << 1) | (e.plaga_pendiente << 2);
    }
    hi_paso(crudo, ahora) { return this.decidir(this.st, crudo, ahora, true); }
    hi_reportar_plaga(t) { if (!this.st.plaga_pendiente) { this.st.plaga_pendiente = 1; this.emitir(4, t); } }
    hi_autorizar(t) {
      const s = this.st;
      if (!s.plaga_pendiente) { this.emitir(8, t); return 0; }
      if (s.nivel_deposito < this.cfg.nivel_minimo) { this.emitir(7, t); return 0; }
      s.plaga_pendiente = 0; s.pulverizando = 1; s.inicio_pulv = t; this.emitir(5, t); return 1;
    }
    hi_descartar(t) { if (this.st.plaga_pendiente) { this.st.plaga_pendiente = 0; this.emitir(9, t); } }
    hi_umbrales(r, p, m) {
      const c = this.cfg;
      c.umbral_riego = MotorJS.limitar(r, 5, 90);
      c.umbral_parar = MotorJS.limitar(p, c.umbral_riego + 5, 100);
      c.max_riego_ms = MotorJS.limitar(m, 1000, 30000);
    }
    hi_evento() { const x = this.cola.shift(); if (!x) return 0; this.ultimoT = x[1]; return x[0]; }
    hi_evento_t() { return this.ultimoT; }
    hi_humedad_calc() { return this.st.humedad; }
    hi_simular(dtMs, sol, bomba) {
      const f = Math.fround;
      const dt = f(dtMs / 1000);
      let agua = bomba;
      if (bomba && this.tanque <= 0) {
        agua = 0;
        if (!this.vacioAvisado) { this.vacioAvisado = 1; this.emitir(10, this.reloj); }
      }
      const evap = f(f(0.25) + f(sol * f(0.03)));
      let s = f(this.suelo - f(evap * dt));
      if (agua) {
        s = f(s + f(f(7) * dt));
        this.tanque = f(this.tanque - f(f(0.04) * dt));
      }
      if (this.st.pulverizando) this.tanque = f(this.tanque - f(f(0.1) * dt));
      s = Math.min(100, Math.max(0, s));
      this.suelo = s;
      if (this.tanque < 0) this.tanque = 0;
      this.st.nivel_deposito = Math.trunc(f(this.tanque + f(0.5)));
      const objT = f(f(16) + f(sol * f(0.17)));
      const objA = f(f(80) - f(sol * f(0.45)));
      this.tempC = f(this.tempC + f(f(f(objT - this.tempC) * f(0.05)) * dt));
      this.aire = f(this.aire + f(f(f(objA - this.aire) * f(0.05)) * dt));
      const c = this.cfg;
      const crudo = f(c.seco + f(f(f(c.mojado - c.seco) * s) / 100));
      const ruido = (MotorJS.azar(this, "semilla") % 17) - 8;
      const rt = (MotorJS.azar(this, "semilla") % 11) - 5;
      this.temp10 = Math.trunc(f(f(this.tempC + f(rt * f(0.02))) * f(10)));
      const ra = (MotorJS.azar(this, "semilla") % 11) - 5;
      this.aireLec = Math.trunc(f(this.aire + f(ra * f(0.2))));
      return Math.trunc(crudo) + ruido;
    }
    hi_suelo_x10() { return Math.trunc(Math.fround(this.suelo * 10)); }
    hi_temp_x10() { return this.temp10; }
    hi_aire() { return this.aireLec; }
    hi_nivel() { return this.st.nivel_deposito; }
    hi_distancia_x10() {
      const f = Math.fround;
      return Math.trunc(f(f(20 - f(f(this.tanque / 100) * 17)) * 10));
    }
    hi_nivel_deposito(p) {
      this.st.nivel_deposito = MotorJS.limitar(p, 0, 100);
      this.tanque = Math.fround(this.st.nivel_deposito);
      if (this.tanque > 0) this.vacioAvisado = 0;
    }
    hi_lluvia(p) {
      const f = Math.fround;
      this.suelo = Math.min(100, f(this.suelo + p));
    }
    hi_bench(n) {
      const e = this.estadoInicial();
      const rng = { s: 7 };
      const c = this.cfg;
      const span = c.seco - c.mojado + 1;
      let on = 0;
      for (let i = 0; i < n; i++) {
        const crudo = c.mojado + (MotorJS.azar(rng, "s") % span);
        on += this.decidir(e, crudo, i * 10, false) & 1;
      }
      return on;
    }
  }

  function bytesDesdeBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* Intenta: 1) main.wasm del servidor, 2) copia incrustada, 3) respaldo JS */
  async function cargarMotor() {
    if (typeof WebAssembly === "object") {
      try {
        const res = await fetch("main.wasm");
        if (!res.ok) throw new Error("sin main.wasm");
        const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
        return { motor: instance.exports, tipo: "wasm", origen: "main.wasm" };
      } catch (_) { /* sigue con la copia incrustada */ }
      try {
        const { instance } = await WebAssembly.instantiate(bytesDesdeBase64(WASM_B64), {});
        return { motor: instance.exports, tipo: "wasm", origen: "copia incrustada" };
      } catch (_) { /* sigue con el respaldo */ }
    }
    return { motor: new MotorJS(), tipo: "js", origen: "respaldo" };
  }

  /* -------------------------------------------------------------------
     2. SIMULACIÓN COMPARTIDA (hero + laboratorio)
     ------------------------------------------------------------------- */
  const TICK = 100;                 // ms simulados por ciclo del motor
  const HIST = 600;                 // 60 s de historia (600 ciclos)
  const MUESTRA_MS = 300000;        // el ESP32 guarda una muestra cada 5 min
  const HIST5 = 13;                 // 13 muestras = la última hora
  const sim = {
    t: 0, ciclos: 0, riegos: 0, bomba: 0, pulv: 0, plaga: 0,
    crudo: 0, humedad: 0, suelo: 42, sol: 30, velocidad: 1,
    temp: 21, aire: 70, nivel: 80,
    hist: [], hist5: [], muestraNueva: false, silencio: false, acum: 0,
  };
  let M = null;                     // motor activo (wasm o js)

  const EVENTOS = {
    1: ["Riego iniciado: la humedad bajó del umbral", "ev-riego"],
    2: ["Riego terminado: se alcanzó la humedad meta", "ev-ok"],
    3: ["Riego cortado por el tiempo máximo de seguridad", "ev-riego"],
    4: ["Posible plaga detectada: esperando tu autorización", "ev-plaga"],
    5: ["Pulverización autorizada e iniciada", "ev-plaga"],
    6: ["Pulverización terminada", "ev-ok"],
    7: ["Orden rechazada: depósito con menos de 10 %", "ev-bloqueo"],
    8: ["Autorización ignorada: no había plaga pendiente", "ev-bloqueo"],
    9: ["Aviso de plaga descartado por el usuario", "ev-ok"],
    10: ["Depósito vacío: la bomba giró sin agua", "ev-bloqueo"],
    100: ["Lluvia simulada: entró agua a la tierra", "ev-riego"],  // eventos de la demo, no del motor
    101: ["Depósito rellenado al 100 %", "ev-ok"],
  };

  const fmt1 = (n) => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* Tiempo simulado: segundos, mm:ss o h:mm:ss según lo largo que sea */
  function fmtTiempo(ms) {
    const s = ms / 1000;
    if (s < 60) return `${fmt1(s)} s`;
    const m = Math.floor(s / 60), seg = String(Math.floor(s % 60)).padStart(2, "0");
    if (m < 60) return `${m}:${seg}`;
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${seg}`;
  }
  /* Versión larga para el cuadro de estadísticas: "1 h 05 min" */
  function fmtTiempoLargo(ms) {
    const s = ms / 1000;
    if (s < 60) return `${fmt1(s)} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${String(Math.floor(s % 60)).padStart(2, "0")} s`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  }

  function paso() {
    sim.crudo = M.hi_simular(TICK, sim.sol, sim.bomba);
    const est = M.hi_paso(sim.crudo, sim.t);
    if ((est & 1) && !sim.bomba) sim.riegos++;
    sim.bomba = est & 1;
    sim.pulv = (est >> 1) & 1;
    sim.plaga = (est >> 2) & 1;
    sim.humedad = M.hi_humedad_calc();
    sim.suelo = M.hi_suelo_x10() / 10;
    sim.temp = M.hi_temp_x10() / 10;
    sim.aire = M.hi_aire();
    sim.nivel = M.hi_nivel();
    sim.ciclos++;
    sim.hist.push([sim.suelo, sim.bomba, sim.pulv]);
    if (sim.hist.length > HIST) sim.hist.shift();
    if (sim.t % MUESTRA_MS === 0) guardarMuestra();
    let ev;
    while ((ev = M.hi_evento()) !== 0) registrar(ev, M.hi_evento_t());
    sim.t += TICK;
  }

  /* Igual que el ESP32: una muestra de todos los sensores cada 5 minutos */
  function guardarMuestra() {
    sim.hist5.push({ s1: sim.suelo, tk: sim.nivel, temp: sim.temp, aire: sim.aire });
    if (sim.hist5.length > HIST5) sim.hist5.shift();
    sim.muestraNueva = true;
  }

  function registrar(ev, t) {
    const info = EVENTOS[ev];
    if (!info) return;
    const log = $("#log");
    const vacio = log.querySelector(".empty");
    if (vacio) vacio.remove();
    const li = document.createElement("li");
    li.className = info[1];
    li.innerHTML = `<time>t = ${fmtTiempo(t)}</time><span class="dot"></span><span></span>`;
    li.lastChild.textContent = info[0];
    log.prepend(li);
    while (log.children.length > 12) log.lastChild.remove();
    if (!sim.silencio && !reduceMotion && window.gsap) gsap.from(li, { x: -14, opacity: 0, duration: 0.45, ease: "power3.out" });
  }

  /* Salta hacia adelante sin dibujar cada ciclo (para "Avanzar 30 min" y para llenar el historial) */
  function avanzar(ms) {
    sim.silencio = true;
    for (let i = 0, n = Math.round(ms / TICK); i < n; i++) paso();
    sim.silencio = false;
    actualizarTextos();
    dibujarGrafico();
    dibujarHistorial();
    sim.muestraNueva = false;
  }

  function actualizarTextos() {
    const lect = {
      suelo: `${sim.humedad} %`,
      temp: `${fmt1(sim.temp)} °C`,
      aire: `${sim.aire} %`,
      tank: `${sim.nivel} %`,
    };
    $$("[data-v]").forEach((el) => { el.textContent = lect[el.dataset.v]; });
    const rp = $("#r-pump");
    rp.textContent = sim.bomba ? "Regando" : "Apagada";
    rp.classList.toggle("on", !!sim.bomba);
    $("#s-time").textContent = fmtTiempoLargo(sim.t);
    $("#s-cycles").textContent = sim.ciclos.toLocaleString("es-PE");
    $("#s-raw").textContent = `${sim.crudo}`;
    $("#s-irr").textContent = sim.riegos;
    $("#pest-card").hidden = !sim.plaga;

    // Depósito: el nivel baja solo con el uso; el deslizador lo sigue (salvo que lo estés moviendo)
    const tank = $("#in-tank");
    if (document.activeElement !== tank && +tank.value !== sim.nivel) tank.value = sim.nivel;
    $("#o-tank").textContent = `${sim.nivel} %`;
    $("#o-cm").textContent = `Sensor ultrasónico: ${fmt1(M.hi_distancia_x10() / 10)} cm hasta el agua`;
  }

  /* -------------------------------------------------------------------
     3a. CORTE DEL HUERTO (canvas del hero)
     ------------------------------------------------------------------- */
  const soil = { cv: null, ctx: null, w: 0, h: 0, gotas: [], niebla: [], lluvia: 0, lluviaGotas: [], visible: true, ola: 0 };
  const COL = {
    agua: "#55e0f2", clorofila: "#b4f06e", sol: "#ffb84d", texto: "#e7f3ec",
    dim: "#9bb2a6", linea: "rgba(170,255,220,0.14)", tierra: "#23170f", noche: "#0b1d16",
    agua2: "#c9f6ff", alerta: "#ff7a6b",
  };

  function ajustarCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function mezclar(a, b, t) {
    const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
    const pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
  }

  /* Textura de la tierra: degradado, granos, piedritas, raíces y brotes.
     Se genera con una semilla fija para que siempre se vea igual. */
  function crearTierra(w, h, ground) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const prof = h - ground;
    const alto = prof + 12;                      // 12 px extra para el borde y los brotes
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * dpr); cv.height = Math.round(alto * dpr);
    const c = cv.getContext("2d");
    c.scale(dpr, dpr);
    let semilla = 1121;
    const rnd = () => ((semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0) / 4294967296);
    const top = 12;

    // Cuerpo de la tierra con borde superior irregular
    const g = c.createLinearGradient(0, top, 0, alto);
    g.addColorStop(0, "#4b3321");
    g.addColorStop(0.35, "#36251a");
    g.addColorStop(1, "#1d130c");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, alto);
    for (let x = 0; x <= w; x += 6) c.lineTo(x, top + Math.sin(x * 0.11) * 1.6 + (rnd() - 0.5) * 3);
    c.lineTo(w, alto);
    c.closePath();
    c.fill();

    // Capas: franjas suaves que dan profundidad
    for (let i = 1; i <= 3; i++) {
      const y = top + prof * (i / 4) + (rnd() - 0.5) * 8;
      c.strokeStyle = `rgba(0,0,0,${0.12 + i * 0.03})`;
      c.lineWidth = 6;
      c.beginPath();
      for (let x = 0; x <= w; x += 10) {
        const yy = y + Math.sin(x * 0.02 + i) * 4;
        x === 0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
      }
      c.stroke();
    }

    // Granos de tierra
    const tonos = ["#6b4c30", "#5a3f28", "#7d5d3e", "#2a1c12", "#8a6a48"];
    const granos = Math.round((w * prof) / 45);
    for (let i = 0; i < granos; i++) {
      const x = rnd() * w, y = top + rnd() * prof;
      c.globalAlpha = 0.35 + rnd() * 0.5;
      c.fillStyle = tonos[(rnd() * tonos.length) | 0];
      c.beginPath();
      c.arc(x, y, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // Piedritas con un brillo arriba
    for (let i = 0; i < 16; i++) {
      const x = rnd() * w, y = top + 10 + rnd() * (prof - 16);
      const rx = 3 + rnd() * 5, ry = rx * (0.6 + rnd() * 0.3);
      c.fillStyle = ["#6f6a60", "#857c70", "#55504a"][(rnd() * 3) | 0];
      c.beginPath(); c.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.beginPath(); c.ellipse(x - rx * 0.25, y - ry * 0.35, rx * 0.45, ry * 0.3, 0, 0, Math.PI * 2); c.fill();
    }

    // Raíces que bajan desde la planta
    const px = w * 0.42;
    c.lineCap = "round";
    const raices = [[-0.16, 0.42], [-0.07, 0.55], [0.0, 0.62], [0.08, 0.5], [0.15, 0.38], [-0.11, 0.3], [0.11, 0.28]];
    raices.forEach(([dx, dy], i) => {
      const x2 = px + dx * w, y2 = top + prof * dy;
      c.strokeStyle = "rgba(222,196,150,0.55)";
      c.lineWidth = i < 5 ? 2 : 1.2;
      c.beginPath();
      c.moveTo(px, top);
      c.bezierCurveTo(px + dx * w * 0.2, top + prof * dy * 0.4, x2 - dx * w * 0.3, y2 - prof * 0.08, x2, y2);
      c.stroke();
      // Raicillas
      c.lineWidth = 0.8;
      c.strokeStyle = "rgba(222,196,150,0.35)";
      for (let k = 0; k < 3; k++) {
        const t = 0.4 + k * 0.2;
        const bx = px + (x2 - px) * t, by = top + (y2 - top) * t;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + (rnd() - 0.5) * 18, by + 6 + rnd() * 10); c.stroke();
      }
    });

    // Brotes de pasto en la superficie (lejos de la planta y del sensor)
    c.strokeStyle = "#6fae5c";
    c.lineWidth = 1.4;
    [0.08, 0.15, 0.24, 0.58, 0.63, 0.9, 0.95].forEach((fx) => {
      const x = fx * w;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.moveTo(x + k * 3, top + 1);
        c.quadraticCurveTo(x + k * 3 + (k - 1) * 2, top - 4, x + k * 3 + (k - 1) * 4, top - 7 - rnd() * 4);
        c.stroke();
      }
    });

    return { cv, w, h };
  }

  function dibujarHuerto(dt) {
    const { ctx, w, h } = soil;
    if (!ctx) return;
    const suelo = sim.suelo / 100;
    const ground = h * 0.42;
    ctx.clearRect(0, 0, w, h);

    // Cielo nocturno con un sol que crece según la evaporación
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, "#0d2a20");
    sky.addColorStop(1, COL.noche);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, ground);
    const solR = 10 + sim.sol * 0.16;
    const sg = ctx.createRadialGradient(w * 0.84, h * 0.1, 0, w * 0.84, h * 0.1, solR * 3);
    sg.addColorStop(0, "rgba(255,184,77,0.9)");
    sg.addColorStop(0.35, "rgba(255,184,77,0.25)");
    sg.addColorStop(1, "rgba(255,184,77,0)");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(w * 0.84, h * 0.1, solR * 3, 0, Math.PI * 2); ctx.fill();

    // Manguera de goteo
    const tuboY = ground - h * 0.27;
    ctx.strokeStyle = "rgba(85,224,242,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, tuboY); ctx.lineTo(w * 0.42, tuboY); ctx.stroke();
    ctx.fillStyle = sim.bomba ? COL.agua : "rgba(85,224,242,0.4)";
    ctx.fillRect(w * 0.42 - 4, tuboY - 3, 8, 10);

    // Depósito de agua con el sensor ultrasónico arriba; de él sale la manguera
    {
      const tw = 46, th = Math.max(26, Math.min(54, tuboY - 24)), tx = 14, ty = tuboY - 8 - th;
      const frac = sim.nivel / 100;
      ctx.fillStyle = sim.nivel < 10 ? "rgba(255,122,107,0.55)" : "rgba(85,224,242,0.42)";
      ctx.fillRect(tx + 2, ty + th - 2 - (th - 4) * frac, tw - 4, (th - 4) * frac);
      ctx.strokeStyle = "rgba(170,255,220,0.5)";
      ctx.lineWidth = 1.5;
      rectRedondo(ctx, tx, ty, tw, th, 6);
      ctx.stroke();
      ctx.fillStyle = COL.dim;
      ctx.fillRect(tx + tw / 2 - 8, ty - 9, 16, 6);               // sensor ultrasónico
      ctx.strokeStyle = "rgba(180,240,110,0.55)";
      ctx.lineWidth = 1;
      for (let k = 1; k <= 2; k++) {                              // ondas hacia el agua
        ctx.beginPath(); ctx.arc(tx + tw / 2, ty - 3, 4 + k * 5, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(85,224,242,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx + tw / 2, ty + th); ctx.lineTo(tx + tw / 2, tuboY); ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = sim.nivel < 10 ? COL.alerta : COL.texto;
      ctx.font = "600 12px 'Chakra Petch', sans-serif";
      ctx.fillText(`Depósito ${sim.nivel} %`, tx + tw + 10, ty + 18);
      ctx.fillStyle = COL.dim;
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillText(`${fmt1(M.hi_distancia_x10() / 10)} cm`, tx + tw + 10, ty + 34);
    }

    // Tierra con textura (dibujada una sola vez en un canvas aparte)
    const prof = h - ground;
    if (!soil.tierra || soil.tierra.w !== w || soil.tierra.h !== h) soil.tierra = crearTierra(w, h, ground);
    ctx.drawImage(soil.tierra.cv, 0, ground - 12, w, prof + 12);

    // Frente de humedad: la tierra mojada se oscurece y toma un brillo cian
    const frente = h - prof * suelo;
    soil.ola += dt * 0.002;
    const borde = (x) => frente + Math.sin(x * 0.03 + soil.ola) * 3;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, borde(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(4,16,20,0.38)";
    ctx.fill();
    const wet = ctx.createLinearGradient(0, frente, 0, h);
    wet.addColorStop(0, "rgba(85,224,242,0.22)");
    wet.addColorStop(1, "rgba(85,224,242,0.06)");
    ctx.fillStyle = wet;
    ctx.fill();
    ctx.strokeStyle = COL.agua;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COL.agua; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) x === 0 ? ctx.moveTo(x, borde(x)) : ctx.lineTo(x, borde(x));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Escala de humedad a la izquierda (0 a 100 %)
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = COL.dim;
    ctx.strokeStyle = COL.linea;
    ctx.lineWidth = 1;
    for (let p = 0; p <= 100; p += 25) {
      const y = h - prof * (p / 100);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(10, y); ctx.stroke();
      const ty = Math.min(h - 4, Math.max(ground + 12, y + 4));
      ctx.fillStyle = "rgba(6,18,14,0.6)";
      ctx.fillRect(12, ty - 11, ctx.measureText(`${p}%`).width + 6, 15);
      ctx.fillStyle = COL.dim;
      ctx.fillText(`${p}%`, 15, ty);
    }

    // Planta: las hojas caen y pierden color cuando falta agua
    const px = w * 0.42;
    const vigor = Math.min(1, Math.max(0, (sim.suelo - 10) / 50));
    const caida = (1 - vigor) * 0.55;
    const hoja = mezclar("c9b458", "b4f06e", vigor);
    ctx.strokeStyle = mezclar("8a7a45", "7fc59b", vigor);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(px, ground); ctx.lineTo(px, ground - h * 0.2); ctx.stroke();
    const hojas = [[-1, 0.06], [1, 0.11], [-1, 0.16], [1, 0.2]];
    hojas.forEach(([lado, alt], i) => {
      const y = ground - h * alt;
      // Ángulo negativo = hoja levantada; positivo = hoja caída por falta de agua
      const base = -0.35 + caida * 1.6 + Math.sin(soil.ola * 1.4 + i) * 0.03;
      ctx.save();
      ctx.translate(px, y);
      ctx.rotate(lado * base);
      ctx.fillStyle = hoja;
      ctx.beginPath();
      const L = w * 0.13 * (0.8 + i * 0.06);
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(lado * L * 0.5, -L * 0.42, lado * L, 0);
      ctx.quadraticCurveTo(lado * L * 0.5, L * 0.22, 0, 0);
      ctx.fill();
      ctx.restore();
    });

    // Sensor capacitivo de suelo clavado en la tierra
    {
      const sx = w * 0.64;
      const sy = ground - h * 0.08, alto = h * 0.08 + prof * 0.55;
      ctx.fillStyle = "#1c3b2c";
      ctx.strokeStyle = COL.clorofila;
      ctx.lineWidth = 1.2;
      rectRedondo(ctx, sx - 9, sy, 18, alto, 4);
      ctx.fill(); ctx.stroke();
      const nivel = (alto - 6) * (sim.humedad / 100);            // el sensor "se llena" con la humedad
      ctx.fillStyle = "rgba(85,224,242,0.55)";
      ctx.fillRect(sx - 6, sy + alto - 3 - nivel, 12, nivel);
      ctx.textAlign = "center";
      ctx.fillStyle = COL.texto;
      ctx.font = "600 12px 'Chakra Petch', sans-serif";
      ctx.fillText(`Suelo · ${sim.humedad} %`, sx, sy - 18);
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillStyle = COL.dim;
      ctx.fillText(`crudo ${sim.crudo}`, sx, sy - 5);
      ctx.textAlign = "left";
    }

    // DHT22 en un poste sobre la tierra: mide temperatura y humedad del aire
    {
      const dx = Math.min(w * 0.87, w - 50), bw = 28, bh = 36;
      const topPoste = ground - h * 0.11, by = topPoste - bh;
      ctx.strokeStyle = "#6f8a7d";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(dx, ground); ctx.lineTo(dx, topPoste); ctx.stroke();
      ctx.fillStyle = "#e6f0ec";                                  // cuerpo claro con rejilla, como el DHT22 real
      rectRedondo(ctx, dx - bw / 2, by, bw, bh, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,70,60,0.55)";
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) {
        const yy = by + 7 + k * 5;
        ctx.beginPath(); ctx.moveTo(dx - bw / 2 + 5, yy); ctx.lineTo(dx + bw / 2 - 5, yy); ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = COL.texto;
      ctx.font = "600 12px 'Chakra Petch', sans-serif";
      ctx.fillText("DHT22", dx, by - 18);
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillStyle = COL.dim;
      ctx.fillText(`${fmt1(sim.temp)} °C · ${sim.aire} %`, dx, by - 5);
      ctx.textAlign = "left";
    }

    // Lluvia: líneas que caen sobre todo el huerto durante 1,5 s
    if (soil.lluvia > 0) {
      soil.lluvia -= dt || 16;
      for (let i = 0; i < 4; i++) soil.lluviaGotas.push({ x: Math.random() * w, y: -10, v: 0.5 + Math.random() * 0.3 });
    }
    ctx.strokeStyle = "rgba(85,224,242,0.7)";
    ctx.lineWidth = 1.4;
    soil.lluviaGotas = soil.lluviaGotas.filter((g) => {
      g.y += g.v * (dt || 16);
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x - 2, g.y + 12); ctx.stroke();
      return g.y < ground;
    });

    // Gotas de riego cuando la bomba está encendida
    if (sim.bomba && soil.gotas.length < 60 && Math.random() < 0.6) {
      soil.gotas.push({ x: px + (Math.random() - 0.5) * 10, y: tuboY + 8, v: 0.05 + Math.random() * 0.05 });
    }
    ctx.fillStyle = COL.agua;
    soil.gotas = soil.gotas.filter((g) => {
      g.v += 0.0009 * dt; g.y += g.v * dt;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 2, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      return g.y < ground;
    });

    // Niebla del pulverizador sobre las hojas
    if (sim.pulv && soil.niebla.length < 90) {
      for (let i = 0; i < 3; i++) soil.niebla.push({ x: px + w * 0.16, y: ground - h * 0.22, vx: -0.06 - Math.random() * 0.06, vy: (Math.random() - 0.5) * 0.05, vida: 1 });
    }
    soil.niebla = soil.niebla.filter((n) => {
      n.x += n.vx * dt; n.y += n.vy * dt; n.vida -= 0.0012 * dt;
      ctx.fillStyle = `rgba(255,184,77,${Math.max(0, n.vida) * 0.55})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, 3 + (1 - n.vida) * 6, 0, Math.PI * 2); ctx.fill();
      return n.vida > 0;
    });
    if (sim.pulv) {
      ctx.fillStyle = COL.sol;
      ctx.fillRect(px + w * 0.16, ground - h * 0.23, 12, 8);
    }
  }

  /* -------------------------------------------------------------------
     3b. GRÁFICO DEL LABORATORIO
     ------------------------------------------------------------------- */
  const chart = { cv: null, ctx: null, w: 0, h: 0 };

  function dibujarGrafico() {
    const { ctx, w, h } = chart;
    if (!ctx) return;
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const W = w - pad.l - pad.r, H = h - pad.t - pad.b;
    const X = (i) => pad.l + (i / (HIST - 1)) * W;
    const Y = (v) => pad.t + H - (v / 100) * H;
    ctx.clearRect(0, 0, w, h);

    // Cuadrícula y escala (0, 25, 50, 75, 100 %)
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = COL.dim;
    ctx.strokeStyle = COL.linea;
    ctx.lineWidth = 1;
    for (let p = 0; p <= 100; p += 25) {
      const y = Y(p);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(`${p}%`, 2, y + 4);
    }
    ctx.fillText("−60 s", pad.l, h - 6);
    const ahora = "ahora";
    ctx.fillText(ahora, w - pad.r - ctx.measureText(ahora).width, h - 6);

    // Bandas de bomba y pulverizador
    const off = HIST - sim.hist.length;
    sim.hist.forEach(([, b, p], i) => {
      const x = X(i + off), x2 = X(i + off + 1);
      if (b) { ctx.fillStyle = "rgba(180,240,110,0.22)"; ctx.fillRect(x, pad.t, x2 - x + 0.5, H); }
      if (p) { ctx.fillStyle = "rgba(255,184,77,0.30)"; ctx.fillRect(x, pad.t + H * 0.82, x2 - x + 0.5, H * 0.18); }
    });

    // Umbrales (líneas punteadas)
    const ur = +$("#in-riego").value, up = +$("#in-parar").value;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COL.dim;
    [[ur, "regar"], [up, "parar"]].forEach(([v, t]) => {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(t, w - pad.r - ctx.measureText(t).width, Y(v) - 5);
    });
    ctx.setLineDash([]);

    // Línea de humedad del suelo
    if (sim.hist.length > 1) {
      ctx.strokeStyle = COL.agua;
      ctx.lineWidth = 2;
      ctx.shadowColor = COL.agua; ctx.shadowBlur = 8;
      ctx.beginPath();
      sim.hist.forEach(([s], i) => { const x = X(i + off), y = Y(s); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.shadowBlur = 0;
      const [ult] = sim.hist[sim.hist.length - 1];
      ctx.fillStyle = COL.agua;
      ctx.beginPath(); ctx.arc(X(HIST - 1), Y(ult), 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* -------------------------------------------------------------------
     3c. HISTORIAL: una muestra cada 5 minutos, la última hora
     Humedades y depósito en % (eje izquierdo); temperatura en °C (derecho)
     ------------------------------------------------------------------- */
  const hs = { cv: null, ctx: null, w: 0, h: 0 };

  function dibujarHistorial() {
    const { ctx, w, h } = hs;
    if (!ctx) return;
    const pad = { l: 40, r: 44, t: 10, b: 24 };
    const W = w - pad.l - pad.r, H = h - pad.t - pad.b;
    const X = (i) => pad.l + (i / (HIST5 - 1)) * W;
    const Y = (v) => pad.t + H - (v / 100) * H;
    const YT = (c) => pad.t + H - (c / 40) * H;
    ctx.clearRect(0, 0, w, h);

    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.strokeStyle = COL.linea;
    ctx.lineWidth = 1;
    for (let p = 0; p <= 100; p += 25) {
      const y = Y(p);
      ctx.fillStyle = COL.dim;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(`${p}%`, 2, y + 4);
      ctx.fillStyle = COL.sol;
      ctx.fillText(`${p * 0.4}°`, w - pad.r + 8, y + 4);
    }
    ctx.fillStyle = COL.dim;
    ctx.fillText("−60 min", pad.l, h - 6);
    const ahora = "ahora";
    ctx.fillText(ahora, w - pad.r - ctx.measureText(ahora).width, h - 6);

    const m = sim.hist5;
    if (m.length < 1) return;
    const off = HIST5 - m.length;
    const linea = (valor, escala, color, ancho, guion) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      ctx.setLineDash(guion);
      ctx.beginPath();
      m.forEach((q, i) => { const x = X(i + off), y = escala(valor(q)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    linea((q) => q.tk, Y, COL.texto, 1.6, [2, 4]);          // depósito
    linea((q) => q.temp, YT, COL.sol, 1.8, []);             // temperatura
    linea((q) => q.aire, Y, COL.agua2, 1.8, [5, 4]);        // humedad del aire (DHT22)
    ctx.shadowColor = COL.agua; ctx.shadowBlur = 8;
    linea((q) => q.s1, Y, COL.agua, 2.2, []);               // humedad del suelo
    ctx.shadowBlur = 0;
    ctx.fillStyle = COL.agua;
    ctx.beginPath(); ctx.arc(X(HIST5 - 1), Y(m[m.length - 1].s1), 4, 0, Math.PI * 2); ctx.fill();
  }

  /* -------------------------------------------------------------------
     Bucle principal: un solo requestAnimationFrame para todo
     ------------------------------------------------------------------- */
  let ultimo = performance.now();
  function bucle(ahora) {
    const dt = Math.min(64, ahora - ultimo);
    ultimo = ahora;
    if (M && sim.velocidad > 0) {
      sim.acum += dt * sim.velocidad;
      let cambios = false;
      while (sim.acum >= TICK) { paso(); sim.acum -= TICK; cambios = true; }
      if (cambios) {
        actualizarTextos(); dibujarGrafico();
        if (sim.muestraNueva) { dibujarHistorial(); sim.muestraNueva = false; }
      }
    }
    if (soil.visible && !document.hidden) dibujarHuerto(reduceMotion ? 0 : dt);
    requestAnimationFrame(bucle);
  }

  function prepararCanvas() {
    soil.cv = $("#soil");
    Object.assign(soil, ajustarCanvas(soil.cv));
    chart.cv = $("#chart");
    Object.assign(chart, ajustarCanvas(chart.cv));
    dibujarGrafico();
    hs.cv = $("#hist");
    Object.assign(hs, ajustarCanvas(hs.cv));
    dibujarHistorial();
  }

  /* -------------------------------------------------------------------
     Controles del laboratorio
     ------------------------------------------------------------------- */
  function conectarControles() {
    const sol = $("#in-sol"), riego = $("#in-riego"), parar = $("#in-parar"), max = $("#in-max"), tank = $("#in-tank");
    const aplicar = () => {
      if (+parar.value < +riego.value + 5) parar.value = Math.min(95, +riego.value + 5);
      sim.sol = +sol.value;
      M.hi_umbrales(+riego.value, +parar.value, +max.value * 1000);
      $("#o-sol").textContent = `${sol.value} %`;
      $("#o-riego").textContent = `${riego.value} %`;
      $("#o-parar").textContent = `${parar.value} %`;
      $("#o-max").textContent = `${max.value} s`;
      dibujarGrafico();
    };
    [sol, riego, parar, max].forEach((el) => el.addEventListener("input", aplicar));
    aplicar();

    // El nivel del depósito lo mueve el uso de las bombas; el deslizador lo fija a mano
    M.hi_nivel_deposito(+tank.value);
    tank.addEventListener("input", () => {
      M.hi_nivel_deposito(+tank.value);
      sim.nivel = +tank.value;
      actualizarTextos();
    });

    // Lluvia: suma agua al suelo y se ve al instante, incluso con la simulación en pausa
    $("#b-rain").addEventListener("click", () => {
      M.hi_lluvia(20);
      soil.lluvia = 1500;
      registrar(100, sim.t);
      paso();
      actualizarTextos();
      dibujarGrafico();
    });
    $("#b-pest").addEventListener("click", () => { M.hi_reportar_plaga(sim.t); paso(); actualizarTextos(); });

    $("#b-fill").addEventListener("click", () => {
      M.hi_nivel_deposito(100);
      registrar(101, sim.t);
      paso();
      actualizarTextos();
    });
    $("#b-avanzar").addEventListener("click", () => avanzar(30 * 60 * 1000));
    $("#b-auth").addEventListener("click", () => { M.hi_autorizar(sim.t); paso(); actualizarTextos(); });
    $("#b-dismiss").addEventListener("click", () => { M.hi_descartar(sim.t); paso(); actualizarTextos(); });

    $$(".speed .chip").forEach((b) => b.addEventListener("click", () => {
      sim.velocidad = +b.dataset.speed;
      $$(".speed .chip").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
    }));
  }

  /* -------------------------------------------------------------------
     4. RENDIMIENTO: C/WebAssembly frente a JavaScript
     ------------------------------------------------------------------- */
  let wasmBench = null;             // instancia separada para no tocar la simulación
  const jsBench = new MotorJS();

  function mejorTiempo(fn, n) {
    fn(Math.min(n, 200000));        // calentamiento
    let mejor = Infinity, r = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      r = fn(n);
      mejor = Math.min(mejor, performance.now() - t0);
    }
    return { ms: Math.max(mejor, 0.01), r };
  }

  function conectarBenchmark() {
    const boton = $("#b-bench");
    if (!boton) return;            // la sección de rendimiento es opcional
    boton.addEventListener("click", () => {
      const n = +$("#in-n").value;
      boton.disabled = true;
      boton.textContent = "Midiendo…";
      $("#v-c").textContent = $("#v-js").textContent = "Midiendo…";
      // Se deja pintar el estado "Midiendo…" antes del cálculo pesado
      setTimeout(() => {
        const js = mejorTiempo((k) => jsBench.hi_bench(k), n);
        const c = wasmBench ? mejorTiempo((k) => wasmBench.hi_bench(k), n) : null;
        const tasa = (r) => n / r.ms / 1000;  // millones de decisiones por segundo
        const max = Math.max(tasa(js), c ? tasa(c) : 0);
        const txt = (r) => `${r.ms.toFixed(1).replace(".", ",")} ms · ${fmt1(tasa(r))} M/s`;
        $("#v-js").textContent = txt(js);
        $("#bar-js").style.width = `${(tasa(js) / max) * 100}%`;
        if (c) {
          $("#v-c").textContent = txt(c);
          $("#bar-c").style.width = `${(tasa(c) / max) * 100}%`;
          const iguales = c.r === js.r ? "Las dos versiones dieron el mismo resultado" : "Atención: los resultados no coinciden";
          const veces = tasa(c) / tasa(js);
          const comparacion = veces >= 1
            ? `C/WebAssembly fue ${fmt1(veces)} veces más rápido que JavaScript`
            : `JavaScript fue ${fmt1(1 / veces)} veces más rápido que C/WebAssembly`;
          $("#bench-note").textContent = `${iguales} (bomba encendida en ${c.r.toLocaleString("es-PE")} decisiones). En este dispositivo, ${comparacion}. Los resultados cambian según el equipo y el navegador.`;
        } else {
          $("#v-c").textContent = "No disponible";
          $("#bench-note").textContent = "Este navegador no pudo cargar WebAssembly, así que solo se midió la versión en JavaScript.";
        }
        boton.disabled = false;
        boton.textContent = "Medir otra vez";
      }, 60);
    });
  }

  /* -------------------------------------------------------------------
     5. CÓDIGO: resaltado de sintaxis simple y pasos al hacer scroll
     ------------------------------------------------------------------- */
  function resaltarC() {
    const KW = /\b(int|static|return|if|else|for|unsigned|float|void|typedef|struct)\b/g;
    $$("#code-excerpt .ln").forEach((ln) => {
      let html = ln.innerHTML;
      html = html.replace(/(\/\*.*?\*\/)/g, '<span class="tk-com">$1</span>');
      if (!html.includes("tk-com")) {
        html = html.replace(KW, '<span class="tk-kw">$1</span>')
          .replace(/\b(Estado|Config)\b/g, '<span class="tk-ty">$1</span>')
          .replace(/\b(\d+)\b/g, '<span class="tk-num">$1</span>')
          .replace(/\b(hi_humedad|hi_autorizar|decidir|limitar)\b/g, '<span class="tk-fn">$1</span>');
      } else {
        const [antes, resto] = html.split('<span class="tk-com">');
        html = antes.replace(KW, '<span class="tk-kw">$1</span>') + '<span class="tk-com">' + resto;
      }
      ln.innerHTML = html;
    });
  }

  function activarPaso(n) {
    $$(".dstep").forEach((d) => d.classList.toggle("is-active", d.dataset.step === String(n)));
    const code = $(".decide-code .code");
    code.classList.add("has-step");
    $$("#code-excerpt .ln").forEach((ln) => ln.classList.toggle("on", ln.dataset.s === String(n)));
  }

  /* -------------------------------------------------------------------
     6. ANIMACIONES: Lenis + GSAP ScrollTrigger
     ------------------------------------------------------------------- */
  function animar() {
    const hayGsap = typeof window.gsap === "object" && typeof window.ScrollTrigger === "function";
    let lenis = null;

    if (!reduceMotion && typeof window.Lenis === "function") {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (hayGsap) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }

    // Enlaces internos con desplazamiento suave (deja espacio para la cabecera)
    $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
      const destino = document.querySelector(a.getAttribute("href"));
      if (!destino) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(destino, { offset: -72 });
      else window.scrollTo({ top: destino.getBoundingClientRect().top + window.scrollY - 72, behavior: reduceMotion ? "auto" : "smooth" });
    }));

    if (hayGsap) gsap.registerPlugin(ScrollTrigger);

    if (!hayGsap || reduceMotion) return;

    // Secuencia de carga del hero: las líneas del título suben, luego el panel
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.from(".hero-title .line > span", { yPercent: 105, duration: 1, stagger: 0.09 })
      .from(".hero-tag, .lead, .cta", { y: 18, opacity: 0, duration: 0.7, stagger: 0.08 }, "-=0.6")
      .from(".hero-live", { scale: 0.94, opacity: 0, duration: 1 }, "-=0.9");

    // Entradas al hacer scroll: parten visibles (no desde opacidad 0)
    $$("[data-reveal], .panel, .feat, .filecard, .download, .terminal").forEach((el) => {
      gsap.from(el, { y: 36, opacity: 0.35, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
    });

    // Las barras del rendimiento brillan al entrar
    if ($(".bars")) gsap.from(".bars", { scrollTrigger: { trigger: ".bars", start: "top 85%" }, opacity: 0.4, duration: 0.8 });
  }

  /* -------------------------------------------------------------------
     Micro-interacciones: cursor, brillo de botones e inclinación 3D
     ------------------------------------------------------------------- */
  function microInteracciones() {
    // Brillo que sigue al puntero en los botones
    $$(".btn").forEach((b) => b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", `${e.clientX - r.left}px`);
      b.style.setProperty("--my", `${e.clientY - r.top}px`);
    }));

    if (!finePointer || reduceMotion) return;

    // Cursor: un anillo que sigue al mouse y crece sobre lo que se puede tocar
    const cur = $(".cursor");
    const mover = window.gsap
      ? { x: gsap.quickTo(cur, "x", { duration: 0.25, ease: "power3" }), y: gsap.quickTo(cur, "y", { duration: 0.25, ease: "power3" }) }
      : { x: (v) => (cur.style.left = `${v}px`), y: (v) => (cur.style.top = `${v}px`) };
    window.addEventListener("pointermove", (e) => { cur.classList.add("is-visible"); mover.x(e.clientX); mover.y(e.clientY); });
    document.addEventListener("pointerleave", () => cur.classList.remove("is-visible"));
    document.addEventListener("pointerover", (e) => {
      cur.classList.toggle("is-hover", !!e.target.closest("a, button, input, select, [data-tilt]"));
    });

    // Tarjetas con inclinación 3D según la posición del puntero
    $$("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const t = `perspective(800px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateZ(0)`;
        if (window.gsap) gsap.to(card, { transform: t, duration: 0.4, ease: "power2.out" });
        else card.style.transform = t;
      });
      card.addEventListener("pointerleave", () => {
        if (window.gsap) gsap.to(card, { transform: "perspective(800px) rotateY(0deg) rotateX(0deg)", duration: 0.6, ease: "power3.out" });
        else card.style.transform = "";
      });
    });
  }

  /* Botón "Copiar comandos" */
  function conectarCopiar() {
    $$(".copy").forEach((b) => b.addEventListener("click", async () => {
      const texto = document.getElementById(b.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(texto);
        b.textContent = "Copiado";
      } catch (_) {
        const sel = window.getSelection();
        const rango = document.createRange();
        rango.selectNodeContents(document.getElementById(b.dataset.copy));
        sel.removeAllRanges(); sel.addRange(rango);
        b.textContent = "Texto seleccionado";
      }
      setTimeout(() => (b.textContent = "Copiar comandos"), 1800);
    }));
  }

  /* -------------------------------------------------------------------
     Inicio
     ------------------------------------------------------------------- */
  async function iniciar() {
    $("#log").innerHTML = '<li class="empty">Aquí aparecerán los eventos que emite el motor.</li>';
    resaltarC();
    prepararCanvas();
    microInteracciones();
    conectarCopiar();
    animar();

    const { motor, tipo, origen } = await cargarMotor();
    M = motor;
    $("#r-engine").textContent = tipo === "wasm" ? "C · WebAssembly" : "JS de respaldo";
    $("#r-engine").title = `Motor cargado desde: ${origen}`;
    if (tipo === "wasm" && $("#b-bench")) {
      try { wasmBench = (await WebAssembly.instantiate(bytesDesdeBase64(WASM_B64), {})).instance.exports; }
      catch (_) { wasmBench = null; }
    }
    conectarControles();
    conectarBenchmark();
    // Arranca con una hora de huerto ya simulada, para que el historial no salga vacío
    avanzar(60 * 60 * 1000);

    const io = new IntersectionObserver((ents) => ents.forEach((en) => (soil.visible = en.isIntersecting)));
    io.observe(soil.cv);
    let rz;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(prepararCanvas, 120); });
    requestAnimationFrame(bucle);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
