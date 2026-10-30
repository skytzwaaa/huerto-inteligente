(() => {
'use strict';

// ================= utilidades =================
const $ = id => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const leerLS = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const espera = ms => new Promise(r => setTimeout(r, ms));
const hora = ts => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const fechaHora = ts => new Date(ts).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function haceTxt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400); return `hace ${d} día${d > 1 ? 's' : ''}`;
}
const cuando = ts => Date.now() - ts < 86400000 ? haceTxt(Date.now() - ts) : fechaHora(ts);

const MAX_PUMP_S = 30, STALE_MS = 40000;
// Duración del riego en texto corto: 45 s, 2 min, 2 min 30 s
const durTxt = s => s < 60 ? `${s} s` : (s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);
const SERIES = {
  soil1_pct: { n: 'Suelo, zona 1', u: '%', c: '#2F7FC1' },
  soil2_pct: { n: 'Suelo, zona 2', u: '%', c: '#5DAA3F' },
  temp:      { n: 'Temperatura', u: ' °C', c: '#E07A2E' },
  hum:       { n: 'Humedad del aire', u: '%', c: '#8A6BC9' },
  tank_pct:  { n: 'Tanque', u: '%', c: '#1E9AA0' }
};
const RANGO = { soil1_pct: [0, 100], soil2_pct: [0, 100], temp: [0, 45], hum: [0, 100], tank_pct: [0, 100] };
const TIPO = {
  plaga: ['i-bicho', 'var(--alerta)'], agua: ['i-tanque', 'var(--turquesa)'], suelo: ['i-gota', 'var(--lluvia)'],
  calor: ['i-sol', 'var(--naranja)'], riego: ['i-gota', 'var(--brote)'], sistema: ['i-chispa', 'var(--violeta)'], camara: ['i-cam', 'var(--tinta2)']
};
const CONSEJOS = [
  'Riega temprano en la mañana: el agua llega a las raíces antes de que el sol la evapore.',
  'Mete un dedo 2 o 3 cm en la tierra. Si sale seco, toca regar; si sale húmedo, espera.',
  'Revisa el envés de las hojas una vez por semana: ahí se esconden pulgones y mosca blanca.',
  'Una capa de paja u hojas secas sobre la tierra la mantiene húmeda el doble de tiempo.',
  'No mojes las hojas al regar: así evitas hongos como el oídio.',
  'Con más de 30 °C, una malla raschel al mediodía protege a la lechuga y al culantro.',
  'El compost casero se hace con cáscaras de fruta, borra de café y hojas secas.',
  'Las mariquitas se comen a los pulgones: si las ves, déjalas trabajar.',
  'Rota los cultivos: no siembres lo mismo en la misma zona dos veces seguidas.',
  'Limpia el sensor de humedad de vez en cuando: el barro seco altera la lectura.'
];

const S = {
  usuario: null, sesion: false, d: null, ok: false, ultimoTs: null, pumpOn: false, pumpSince: 0, enviando: false, pumpSecs: MAX_PUMP_S,
  vivo: [], hist: [], dias: null, diasN: 7, diasCargado: 0, metrica: 'soil1_pct',
  alertas: [], ultimoId: 0, noLeidas: 0, filtro: '', ia: false, cam: { hay: false, ts: null }, camMostrada: null,
  timers: [], visibles: new Set(leerLS('series', Object.keys(SERIES))), chat: [], vista: 'inicio', primera: true, chatListo: false
};

async function api(ruta, metodo = 'GET', cuerpo) {
  const r = await fetch(ruta, {
    method: metodo, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  if (r.status === 401 && S.sesion) { cerrarVista(); throw new Error('401'); }
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error((d && d.error) || ('Error ' + r.status));
  return d;
}

// ================= planta (logo vivo) =================
let nPlanta = 0;
function plantaSVG() {
  const g = 'hg' + (++nPlanta);
  return `<svg class="planta" viewBox="0 0 200 200" aria-hidden="true">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BDB68"/><stop offset="1" stop-color="#3E8B2C"/></linearGradient></defs>
  <ellipse class="sombra" cx="100" cy="178" rx="72" ry="8"/>
  <g class="gotas"><path class="gota" d="M78 18c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z"/><path class="gota" d="M104 6c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z"/><path class="gota" d="M130 20c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z"/></g>
  <path class="tallo" d="M100 150 C101 128 97 110 100 88"/>
  <g class="hoja hi"><g><path d="M100 96 C80 99 56 88 46 60 C74 52 97 68 100 96Z" fill="url(#${g})"/><path class="nervio" d="M98 92 C84 82 68 72 56 64"/></g></g>
  <g class="hoja hd"><g><path d="M100 88 C104 60 128 40 160 42 C160 74 134 94 100 88Z" fill="url(#${g})"/><path class="nervio" d="M103 85 C116 70 132 56 152 49"/></g></g>
  <path class="tierra" d="M28 174 C30 148 60 132 100 132 C140 132 170 148 172 174 Z"/>
  <path class="brillo" d="M52 150 C64 140 82 136 98 136 C78 140 64 146 56 156Z"/>
  <g class="piedras"><circle cx="70" cy="158" r="3.2"/><circle cx="116" cy="150" r="2.6"/><circle cx="140" cy="163" r="3.2"/><circle cx="92" cy="166" r="2.2"/></g>
</svg>`;
}
$$('[data-planta]').forEach(el => { el.innerHTML = plantaSVG(); });
$$('[data-planta=login] .planta,[data-planta=hero] .planta,[data-planta=splash] .planta').forEach(p => p.classList.add('crece'));

function mezclar(a, b, t) {
  const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const A = h(a), B = h(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const minSuelo = d => { const s = [d?.soil1_pct, d?.soil2_pct].filter(x => x != null); return s.length ? Math.min(...s) : null; };

function pintarPlantas() {
  const min = minSuelo(S.d);
  const caida = !S.d ? 0.12 : min == null ? 0.08 : min < 25 ? 0.85 : min < 45 ? 0.35 : 0;
  const tierra = min == null ? '#7A4B32' : mezclar('#B4895F', '#4E2E1D', Math.min(1, min / 100));
  $$('#app .planta').forEach(p => {
    p.style.setProperty('--caida', caida);
    p.style.setProperty('--tierra-planta', tierra);
    p.classList.toggle('regando', S.pumpOn);
  });
}

// ================= números animados =================
function contar(el, val, dec = 0) {
  if (!el) return;
  cancelAnimationFrame(el._raf);
  if (val == null || isNaN(val)) { el.textContent = '--'; el._v = null; return; }
  const desde = el._v ?? val; el._v = val;
  if (desde === val) { el.textContent = Number(val).toFixed(dec); return; }
  const t0 = performance.now(), dur = 800;
  const paso = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = (desde + (val - desde) * e).toFixed(dec);
    if (p < 1) el._raf = requestAnimationFrame(paso);
  };
  el._raf = requestAnimationFrame(paso);
}

// ================= inicio =================
function estadoDe(k, v) {
  if (v == null) return ['Sin lectura', 'mal'];
  if (k.startsWith('soil')) return v < 25 ? ['Seca, necesita riego', 'mal'] : v < 45 ? ['Algo seca', 'ojo'] : v <= 80 ? ['Humedad adecuada', 'bien'] : ['Muy mojada', 'ojo'];
  if (k === 'temp') return v > 35 ? ['Demasiado calor', 'mal'] : v > 30 ? ['Calurosa', 'ojo'] : v < 10 ? ['Muy frío', 'mal'] : v < 18 ? ['Fresca', 'ojo'] : ['Agradable', 'bien'];
  if (k === 'hum') return v > 85 ? ['Muy húmedo, ojo con hongos', 'ojo'] : v < 35 ? ['Aire seco', 'ojo'] : ['En buen rango', 'bien'];
  return v < 20 ? ['Rellena el tanque', 'mal'] : v < 45 ? ['Queda poca agua', 'ojo'] : ['Nivel correcto', 'bien'];
}
function spark(k) {
  const p = S.vivo.slice(-40).map(x => x[k]).filter(x => x != null);
  if (p.length < 2) return '';
  let lo = Math.min(...p), hi = Math.max(...p); if (hi - lo < 2) { lo -= 1; hi += 1; }
  return p.map((v, i) => `${(i / (p.length - 1) * 100).toFixed(1)},${(22 - (v - lo) / (hi - lo) * 20).toFixed(1)}`).join(' ');
}
const PREG = { tank_pct: 'El tanque no marca', soil1_pct: 'El sensor de suelo no marca', soil2_pct: 'El sensor de suelo no marca', temp: 'La temperatura no marca', hum: 'La humedad del aire no marca' };
function pintarSensores() {
  const d = S.d || {};
  $$('.celda').forEach(c => {
    const k = c.dataset.k, v = d[k] ?? null;
    contar(c.querySelector('[data-v]'), v, k === 'temp' ? 1 : 0);
    c.classList.toggle('sin', v == null && !!S.d); c.classList.toggle('con', v != null);
    const [txt, cls] = S.d ? estadoDe(k, v) : ['Esperando lectura', ''];
    const e = c.querySelector('[data-e]'); e.textContent = txt; e.className = 'estado ' + cls;
    const m = c.querySelector('[data-m]');
    if (m && v != null) { const [a, b] = RANGO[k]; m.style.left = Math.max(0, Math.min(100, (v - a) / (b - a) * 100)) + '%'; }
    let rep = c.querySelector('.reparar');
    if (v == null && S.d) {
      if (!rep) { rep = document.createElement('button'); rep.className = 'reparar'; rep.textContent = '¿Por qué no marca?'; rep.onclick = () => preguntar(PREG[k]); e.after(rep); }
    } else if (rep) rep.remove();
    const s = c.querySelector('[data-s]'); if (s) s.setAttribute('points', spark(k));
  });
  const tk = d.tank_pct;
  $('agua').style.transform = `translateY(${tk == null ? 200 : 186 - 1.82 * Math.max(0, Math.min(100, tk))}px)`;
}
function salud(d) {
  if (!d) return null;
  const r = (v, lo, hi, span) => v == null ? null : (v >= lo && v <= hi ? 100 : Math.max(0, Math.round(100 - (v < lo ? lo - v : v - hi) * 100 / span)));
  const p = [r(d.soil1_pct, 45, 80, 40), r(d.soil2_pct, 45, 80, 40), r(d.temp, 18, 30, 15), r(d.hum, 40, 80, 40), r(d.tank_pct, 30, 100, 30)].filter(x => x != null);
  return p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null;
}
function pintarHero() {
  const h = new Date().getHours();
  $('saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${S.usuario}`;
  const d = S.d; let tit, res;
  if (!d) { tit = 'Esperando noticias del ESP32'; res = 'Aún no llega ninguna lectura. Enciende el ESP32 y revisa su WiFi.'; }
  else {
    const min = minSuelo(d), suelos = [d.soil1_pct, d.soil2_pct].filter(x => x != null);
    if (!S.ok) { tit = 'El ESP32 se desconectó'; res = `La última lectura llegó ${d.ts ? haceTxt(Date.now() - d.ts) : 'hace mucho'}. Lo que ves abajo puede estar desactualizado.`; }
    else if (S.pumpOn) { tit = 'Regando ahora mismo'; res = 'La bomba está encendida y se apagará sola en unos segundos.'; }
    else if (min != null && min < 25) { tit = 'Tu huerto tiene sed'; res = `La tierra bajó a ${min} % de humedad. Es buen momento para regar.`; }
    else if (d.tank_pct != null && d.tank_pct < 20) { tit = 'Al tanque le queda poca agua'; res = `Queda ${d.tank_pct} %. Rellénalo antes del próximo riego.`; }
    else if (d.temp != null && d.temp > 35) { tit = 'Hace demasiado calor'; res = `${d.temp.toFixed(1)} °C. Dale sombra y riega temprano o al atardecer.`; }
    else if (min != null && min > 90) { tit = 'La tierra está muy mojada'; res = `Humedad de ${suelos.join(' % y ')} %. No hace falta regar; si nunca baja, revisa la calibración del sensor.`; }
    else if (min == null) { tit = 'Tu huerto está en línea'; res = 'Los sensores de suelo no dan lectura; conéctalos para saber cuándo regar.'; }
    else { tit = 'Tu huerto está bien'; res = `Tierra al ${suelos.join(' % y ')} %${d.temp != null ? `, ${d.temp.toFixed(1)} °C` : ''}. No hace falta hacer nada.`; }
    const falt = Object.keys(SERIES).filter(k => d[k] == null).length;
    if (falt && S.ok) res += ` ${falt} sensor${falt > 1 ? 'es no dan' : ' no da'} lectura.`;
  }
  const t = $('titular');
  if (t.textContent !== tit) { t.textContent = tit; t.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' }); }
  $('resumen').textContent = res;
  const sa = salud(d), an = $('anilloSalud');
  an.style.setProperty('--off', sa == null ? 100 : 100 - sa);
  an.style.setProperty('--c', sa == null ? 'var(--linea)' : sa >= 75 ? 'var(--brote)' : sa >= 50 ? 'var(--sol)' : 'var(--alerta)');
  contar($('saludNum'), sa);
  $('visto').textContent = d && d.ts ? `Última lectura ${haceTxt(Date.now() - d.ts)}` : 'Sin lecturas todavía';
}
function conexion(ok, txt) { const c = $('conn'); c.classList.toggle('ok', ok); c.classList.toggle('mal', !ok); $('connTxt').textContent = txt; }
function pintarBomba() {
  const b = $('pbtn');
  b.classList.toggle('on', S.pumpOn);
  $('pbtnTxt').textContent = S.pumpOn ? 'Detener' : 'Regar ahora';
  $('ps').textContent = S.pumpOn ? 'Regando' : 'Apagada';
  b.disabled = !S.ok || S.enviando;
  if (!S.pumpOn) $('pinfo').textContent = S.ok ? `Se apaga sola a ${durTxt(S.pumpSecs)}` : 'Disponible cuando el ESP32 esté en línea';
  const ult = S.alertas.find(a => a.tipo === 'riego' && /iniciad/i.test(a.titulo));
  $('pUlt').textContent = S.pumpOn ? 'Ahora mismo' : ult ? cuando(ult.ts) : 'Todavía ninguno';
  const tk = S.d && S.d.tank_pct;
  $('pTanque').textContent = tk == null ? 'Sin lectura' : tk < 20 ? `${tk} %, rellénalo` : `${tk} %, alcanza`;
}
const esHoy = ts => new Date(ts).toDateString() === new Date().toDateString();

// Resumen de hoy: todo sale de lo que ya está en memoria, sin pedir nada más
function pintarResumenHoy() {
  const hoy = S.alertas.filter(a => esHoy(a.ts));
  const arranques = hoy.filter(a => a.tipo === 'riego' && /iniciad/i.test(a.titulo));
  const paradas = hoy.filter(a => a.tipo === 'riego' && /detenid/i.test(a.titulo)).map(a => a.ts).sort((x, y) => x - y);
  let seg = 0;
  arranques.forEach(r => {
    const fin = paradas.find(t => t > r.ts);                    // si lo pararon antes, cuenta lo que duró
    seg += Math.min(S.pumpSecs, fin ? Math.max(1, Math.round((fin - r.ts) / 1000)) : S.pumpSecs);
  });
  if (S.pumpOn) seg += Math.min(S.pumpSecs, Math.round((Date.now() - S.pumpSince) / 1000));
  const m = Math.floor(seg / 60), s = seg % 60;
  const v = {
    riegos: arranques.length,
    tiempo: seg ? (m ? `${m}:${String(s).padStart(2, '0')}` : s + ' s') : '0',
    avisos: hoy.filter(a => a.tipo !== 'riego').length,
    lecturas: S.vivo.length
  };
  $$('#resumenHoy [data-r]').forEach(el => {
    const nuevo = String(v[el.dataset.r]);
    if (el.textContent === nuevo) return;
    el.textContent = nuevo;
    el.animate?.([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  });
}

// Lista de arranque: se cierra sola en cuanto llega la primera lectura
function pintarPrimerosPasos() {
  const caja = $('primerosPasos');
  caja.hidden = !!S.d;
  if (caja.hidden) return;
  const pasos = [
    [true, 'Crea tu cuenta', 'Listo, ya entraste a la app.'],
    [S.ok, 'Enciende el ESP32', 'Con WiFi de 2,4 GHz. Arriba dirá «ESP32 en línea».'],
    [!!S.d, 'Recibe la primera lectura', 'En cuanto suba datos verás los sensores abajo.'],
    [leerLS('notif', false), 'Activa los avisos', 'Para enterarte de plagas o tanque bajo.']
  ];
  const hechos = pasos.filter(p => p[0]).length;
  $('ppBarra').style.width = hechos / pasos.length * 100 + '%';
  $('ppCuenta').textContent = `${hechos} de ${pasos.length}`;
  $('ppLista').innerHTML = pasos.map(([ok, t, d]) =>
    `<li class="${ok ? 'ok' : ''}"><span class="tic">${ok ? '✓' : ''}</span><div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('');
}

// Resumen de la semana: 7 columnas de mínimo a máximo, con el promedio marcado
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const claveDia = f => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
function pintarSemana() {
  const por = Object.fromEntries((S.dias || []).map(x => [x.dia, x]));
  const hoy = new Date();
  let suma = 0, n = 0, seco = null, cols = '';
  for (let i = 6; i >= 0; i--) {
    const f = new Date(hoy); f.setDate(hoy.getDate() - i);
    const d = por[claveDia(f)];
    const m = d && (d.soil1_pct && d.soil1_pct.avg != null ? d.soil1_pct : d.soil2_pct);
    const hay = !!(m && m.avg != null);
    let barra = '';
    if (hay) {
      suma += m.avg; n++;
      if (m.min != null && (!seco || m.min < seco.min)) seco = { min: m.min, dia: f.getDay() };
      const lo = Math.max(0, Math.min(100, m.min ?? m.avg)), hi = Math.max(0, Math.min(100, m.max ?? m.avg));
      barra = `<u style="bottom:${lo}%;height:${Math.max(4, hi - lo)}%"></u><i style="bottom:calc(${Math.max(0, Math.min(100, m.avg))}% - 1.5px)"></i>`;
    }
    cols += `<div class="sem-dia${hay ? '' : ' sin'}${i === 0 ? ' hoy' : ''}">
      <div class="sem-pista">${barra}</div><span>${DIA_CORTO[f.getDay()]}</span><b>${hay ? Math.round(m.avg) : '–'}</b></div>`;
  }
  $('semBarras').innerHTML = cols;
  $('semPie').textContent = n
    ? `Promedio de la tierra: ${Math.round(suma / n)} %.` + (seco ? ` El día más seco fue el ${DIA_LARGO[seco.dia]}, con ${Math.round(seco.min)} %.` : '')
    : 'Todavía no hay días guardados. El ESP32 guarda un registro cada 5 minutos y mañana ya verás la primera barra.';
}

// Panel lateral: el resumen siempre visible, aunque estés en otra pantalla
const COLOR_EST = { bien: 'var(--brote)', ojo: 'var(--sol)', mal: 'var(--alerta)', '': 'var(--linea)' };
function pintarRiel() {
  const d = S.d || {}, sa = salud(S.d), an = $('reAnillo');
  an.style.setProperty('--off', sa == null ? 100 : 100 - sa);
  an.style.setProperty('--c', sa == null ? 'var(--linea)' : sa >= 75 ? 'var(--brote)' : sa >= 50 ? 'var(--sol)' : 'var(--alerta)');
  contar($('reSalud'), sa);
  $('reVisto').textContent = S.d && S.d.ts ? 'Lectura ' + haceTxt(Date.now() - S.d.ts) : 'Sin lecturas';
  const filas = { suelo: [minSuelo(S.d), 'soil1_pct', 100, '%'], temp: [d.temp ?? null, 'temp', 45, '°'], tank: [d.tank_pct ?? null, 'tank_pct', 100, '%'] };
  $$('.re-barras li').forEach(li => {
    const [v, ref, max, u] = filas[li.dataset.re];
    li.style.setProperty('--c', COLOR_EST[v == null ? '' : estadoDe(ref, v)[1]]);
    li.querySelector('u').style.width = (v == null ? 0 : Math.max(3, Math.min(100, v / max * 100))) + '%';
    li.querySelector('b').textContent = v == null ? '--' : (li.dataset.re === 'temp' ? v.toFixed(1) + u : Math.round(v) + u);
  });
  const ult = S.alertas.find(a => a.tipo === 'riego' && /iniciad/i.test(a.titulo));
  $('reBomba').classList.toggle('on', S.pumpOn);
  $('reBombaTxt').textContent = S.pumpOn ? 'Regando ahora' : 'Bomba apagada';
  $('reBombaSub').textContent = S.pumpOn ? `Se apaga sola a ${durTxt(S.pumpSecs)}` : ult ? 'Último riego ' + cuando(ult.ts) : 'Todavía ningún riego';
}

function pintarInicio() { pintarSensores(); pintarHero(); pintarPlantas(); pintarBomba(); pintarPrimerosPasos(); pintarResumenHoy(); pintarRiel(); }

setInterval(() => {
  if (!S.pumpOn) return;
  const r = Math.max(0, S.pumpSecs - (Date.now() - S.pumpSince) / 1000);
  $('pinfo').textContent = `Se apagará en ${Math.ceil(r)} s`;
  $('pbtn').querySelector('.cuenta-atras circle').style.strokeDashoffset = 100 - r / S.pumpSecs * 100;
}, 250);

async function regar(quiere) {
  S.enviando = true; pintarBomba();
  $('pmsg').textContent = quiere ? 'Enviando la orden de regar…' : 'Enviando la orden de parar…';
  try {
    await api('/api/control/pump_cmd', 'PUT', quiere);
    $('pmsg').textContent = quiere ? `Orden enviada. Regará ${durTxt(S.pumpSecs)}.` : 'Listo, la bomba se detendrá en unos segundos.';
    setTimeout(() => { $('pmsg').textContent = ''; }, 7000);
    setTimeout(leerAlertas, 800);
    return true;
  } catch (e) {
    $('pmsg').textContent = 'No se pudo enviar la orden. Revisa tu internet e inténtalo otra vez.';
    return false;
  } finally { S.enviando = false; pintarBomba(); }
}
$('pbtn').onclick = () => regar(!S.pumpOn);

// ---------- duración del riego ----------
// El deslizador manda el valor al servidor; el ESP32 lo lee en su siguiente subida
// y es él quien apaga la bomba, así se corta igual aunque se caiga el internet.
const pSecs = $('pSecs');
function pintarSlider() {
  pSecs.value = S.pumpSecs;
  pSecs.style.setProperty('--p', (S.pumpSecs - pSecs.min) / (pSecs.max - pSecs.min) * 100 + '%');
  $('pSecsTxt').textContent = durTxt(S.pumpSecs);
  if (!S.pumpOn) pintarBomba();
}
let guardaSecs = null;
pSecs.oninput = () => {
  S.pumpSecs = +pSecs.value; pintarSlider();
  clearTimeout(guardaSecs);
  $('pSecsMsg').textContent = 'Guardando…';
  guardaSecs = setTimeout(async () => {
    try {
      await api('/api/control/pump_cmd', 'PUT', { segundos: S.pumpSecs });
      $('pSecsMsg').textContent = `Guardado. El ESP32 regará ${durTxt(S.pumpSecs)} y se apagará solo.`;
      pintarRiel();
    } catch { $('pSecsMsg').textContent = 'No se pudo guardar. Revisa tu internet.'; }
  }, 600);
};

// ---------- mantener la pantalla encendida ----------
let bloqueo = null, bloqueoFin = null, bloqueoTimer = null;
const puedeBloquear = () => 'wakeLock' in navigator;
async function tomarBloqueo() {
  if (bloqueo || document.hidden) return;
  try {
    bloqueo = await navigator.wakeLock.request('screen');
    bloqueo.addEventListener('release', () => { bloqueo = null; });
  } catch { bloqueo = null; }
}
async function soltarBloqueo() { try { await bloqueo?.release(); } catch {} bloqueo = null; }
function textoBloqueo() {
  if (!$('optPantalla').checked) return 'Útil mientras riegas y miras la app desde el huerto.';
  if (!bloqueoFin) return 'La pantalla seguirá encendida mientras la app esté abierta.';
  const min = Math.max(0, Math.ceil((bloqueoFin - Date.now()) / 60000));
  return `La pantalla no se apagará durante ${min} min más.`;
}
async function pantallaActiva(on) {
  clearInterval(bloqueoTimer); bloqueoTimer = null; bloqueoFin = null;
  if (!on) { await soltarBloqueo(); $('pantallaMsg').textContent = textoBloqueo(); return; }
  if (!puedeBloquear()) {
    $('optPantalla').checked = false;
    $('pantallaMsg').textContent = 'Este navegador no deja mantener la pantalla encendida. Instala la app en tu pantalla de inicio o súbele el tiempo de apagado al celular.';
    return;
  }
  await tomarBloqueo();
  const min = +$('pantallaMin').value;
  if (min > 0) bloqueoFin = Date.now() + min * 60000;
  $('pantallaMsg').textContent = textoBloqueo();
  bloqueoTimer = setInterval(() => {
    if (bloqueoFin && Date.now() >= bloqueoFin) {
      $('optPantalla').checked = false; pantallaActiva(false);
      tostada('Se acabó el tiempo', 'La pantalla vuelve a apagarse sola.', 'i-sol');
      return;
    }
    $('pantallaMsg').textContent = textoBloqueo();
  }, 20000);
}
$('optPantalla').onchange = e => pantallaActiva(e.target.checked);
$('pantallaMin').onchange = () => { if ($('optPantalla').checked) pantallaActiva(true); };

async function leerSensores() {
  if (document.hidden && !S.primera) return;      // sin pantalla no gastamos peticiones
  try {
    const d = await api('/api/sensores');
    S.d = d;
    if (d) {
      const ok = (d.ts ? Date.now() - d.ts : Infinity) < STALE_MS;
      if (!S.primera && S.ok && !ok) tostada('El ESP32 se desconectó', 'Revisa que esté encendido y con WiFi.', 'i-chispa', 'var(--alerta)');
      if (!S.primera && !S.ok && ok) tostada('El ESP32 volvió a conectarse', 'Las lecturas llegan otra vez.', 'i-hoja');
      S.ok = ok;
      conexion(ok, ok ? 'ESP32 en línea' : 'ESP32 sin conexión');
      if (d.ts && d.ts !== S.ultimoTs) {
        S.ultimoTs = d.ts;
        if (!S.vivo.length || S.vivo[S.vivo.length - 1].ts < d.ts) { S.vivo.push({ ...d }); if (S.vivo.length > 240) S.vivo.shift(); actualizarVivo(); }
      }
      const on = d.pump === 1; if (on && !S.pumpOn) S.pumpSince = Date.now(); S.pumpOn = on;
    } else { S.ok = false; conexion(false, 'Sin datos aún'); }
    S.primera = false;
    pintarInicio();
  } catch (e) { if (e.message !== '401') conexion(false, 'Sin acceso al servidor'); }
}

// ================= avisos =================
function pintarBurbujas() {
  $$('[data-cuenta]').forEach(b => { b.textContent = S.noLeidas > 9 ? '9+' : S.noLeidas; b.hidden = !S.noLeidas; });
}
function itemAviso(a, clase) {
  const [ico, c] = TIPO[a.tipo] || TIPO.sistema;
  return `<li class="${clase} ${a.leida ? '' : 'nueva'} n-${a.nivel}" style="--c:${c}"><span class="ico-ev"><svg><use href="#${ico}"/></svg></span>
    <div><${clase === 'aviso' ? 'h3' : 'b'}>${esc(a.titulo)}</${clase === 'aviso' ? 'h3' : 'b'}>${a.detalle ? `<${clase === 'aviso' ? 'p' : 'span'}>${esc(a.detalle)}</${clase === 'aviso' ? 'p' : 'span'}>` : ''}</div>
    <time datetime="${new Date(a.ts).toISOString()}">${cuando(a.ts)}</time></li>`;
}
const GRUPO = { '': null, plaga: ['plaga'], agua: ['agua', 'suelo', 'calor'], riego: ['riego'], sistema: ['sistema', 'camara'] };
function pintarAvisos() {
  const g = GRUPO[S.filtro];
  const l = S.alertas.filter(a => !g || g.includes(a.tipo));
  $('listaAvisos').innerHTML = l.length ? l.map(a => itemAviso(a, 'aviso')).join('')
    : `<li class="vacio">${S.filtro ? 'No hay avisos de este tipo.' : 'Todo tranquilo. Cuando haya plagas, poca agua, tierra seca o un riego, lo verás aquí.'}</li>`;
}
function pintarActividad() {
  const l = S.alertas.slice(0, 5), el = $('actividad');
  el.classList.toggle('vacia', !l.length);
  el.innerHTML = l.length
    ? l.map((a, i) => itemAviso(a, '').replace('<li ', `<li style="animation-delay:${i * 60}ms" `)).join('')
    : `<li class="act-vacio"><span class="ilu"><svg><use href="#i-hoja"/></svg></span>
       <b>Todavía no pasa nada</b><p>Aquí aparecerá cada riego y cada aviso del huerto, con su hora exacta.</p>
       <span class="fantasma"><span></span><span></span><span></span></span></li>`;
  pintarResumenHoy(); pintarBomba(); pintarRiel();
}
let ultimaAlerta = 0;
async function leerAlertas() {
  if (document.hidden && Date.now() - ultimaAlerta < 60000) return;   // en segundo plano, una vez por minuto
  ultimaAlerta = Date.now();
  try {
    const d = await api('/api/alertas' + (S.ultimoId ? `?desde=${S.ultimoId}` : ''));
    const nuevos = d.items || [];
    if (!S.ultimoId) {
      S.alertas = nuevos;
      const plaga = nuevos.find(a => a.tipo === 'plaga' && !a.leida && Date.now() - a.ts < 6 * 3600000);
      if (plaga) modalPlaga(plaga);
    } else if (nuevos.length) {
      S.alertas = [...nuevos.slice().reverse(), ...S.alertas].slice(0, 120);
      nuevos.forEach(notificar);
    }
    if (S.alertas.length) S.ultimoId = Math.max(S.ultimoId, ...S.alertas.map(a => a.id));
    S.noLeidas = d.noLeidas || 0;
    pintarAvisos(); pintarActividad(); pintarBurbujas();
  } catch {}
}
function notificar(a) {
  const [ico, c] = TIPO[a.tipo] || TIPO.sistema;
  if (a.tipo === 'plaga') { modalPlaga(a); if ($('optSonido').checked) sonar(); }
  else tostada(a.titulo, a.detalle, ico, c);
  if (a.nivel !== 'info') notifSistema(a);
}
async function notifSistema(a) {
  if (!leerLS('notif', false) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const op = { body: a.detalle || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'huerto-' + a.id, vibrate: [200, 100, 200] };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) return reg.showNotification(a.titulo, op);
    new Notification(a.titulo, op);
  } catch {}
}
function sonar() {
  try {
    const ctx = S.audio || (S.audio = new (window.AudioContext || window.webkitAudioContext)());
    const t = ctx.currentTime;
    [0, .2, .4, .75, .95, 1.15].forEach((dt, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = i % 3 === 2 ? 988 : 784;
      g.gain.setValueAtTime(.0001, t + dt); g.gain.exponentialRampToValueAtTime(.22, t + dt + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dt + .18);
      o.connect(g).connect(ctx.destination); o.start(t + dt); o.stop(t + dt + .2);
    });
  } catch {}
}
async function marcarLeidas() {
  if (!S.noLeidas) return;
  try { await api('/api/alertas', 'PATCH', { todas: true }); } catch { return; }
  S.alertas.forEach(a => { a.leida = true; }); S.noLeidas = 0;
  pintarBurbujas(); setTimeout(() => { pintarAvisos(); pintarActividad(); }, 1500);
}
$('marcarLeidas').onclick = marcarLeidas;
$('filtros').onclick = e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  S.filtro = b.dataset.f; $$('#filtros .chip').forEach(x => x.classList.toggle('act', x === b)); pintarAvisos();
};
$('probarAlerta').onclick = () => notificar({ id: 0, tipo: 'plaga', nivel: 'peligro', titulo: 'Prueba: posible pulgón en la zona 1', detalle: 'Así se verá un aviso real cuando la cámara detecte una plaga.', ts: Date.now() });
$('optSonido').checked = leerLS('sonido', true);
$('optSonido').onchange = e => guardarLS('sonido', e.target.checked);
$('optNotif').checked = leerLS('notif', false) && ('Notification' in window) && Notification.permission === 'granted';
$('optNotif').onchange = async e => {
  if (!e.target.checked) { guardarLS('notif', false); return; }
  if (!('Notification' in window)) { e.target.checked = false; tostada('Este navegador no permite notificaciones', 'Prueba con Chrome o instala la app en tu pantalla de inicio.'); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') { guardarLS('notif', true); tostada('Notificaciones activadas', 'Te avisaremos de plagas, tanque bajo y tierra seca.', 'i-hoja'); }
  else { e.target.checked = false; guardarLS('notif', false); tostada('Notificaciones bloqueadas', 'Actívalas en los permisos del sitio de tu navegador.', 'i-campana', 'var(--alerta)'); }
};

function modalPlaga(a) {
  $('mpTit').textContent = a.titulo;
  $('mpTxt').textContent = a.detalle || 'Revisa tus plantas lo antes posible.';
  $('modalPlaga').hidden = false; $('mpOk').focus();
  $('mpBot').onclick = () => { $('modalPlaga').hidden = true; preguntar(`Tengo una plaga: ${a.titulo}. ¿Qué hago?`); };
}
$('mpOk').onclick = () => { $('modalPlaga').hidden = true; };
$('mpCam').onclick = () => { $('modalPlaga').hidden = true; ir('camara'); };

function tostada(t, x, ico = 'i-chispa', c) {
  const el = document.createElement('div');
  el.className = 'tostada'; if (c) el.style.setProperty('--c', c);
  el.innerHTML = `<svg><use href="#${ico}"/></svg><div><b>${esc(t)}</b>${x ? `<span>${esc(x)}</span>` : ''}</div>`;
  $('tostadas').append(el);
  setTimeout(() => { el.classList.add('sale'); setTimeout(() => el.remove(), 320); }, 5200);
}

// ================= gráficos =================
let gVivo = null, gDias = null;
function asegurarGraficos() {
  if (gVivo) return true;
  if (!window.Chart) {
    ['vacioVivo', 'vacioDias'].forEach(id => { $(id).hidden = false; $(id).textContent = 'No se pudo cargar la librería de gráficos. Revisa tu internet y recarga la página.'; });
    return false;
  }
  const cs = getComputedStyle(document.body), txt = cs.getPropertyValue('--tinta2').trim(), lin = cs.getPropertyValue('--linea').trim();
  Chart.defaults.font.family = "'Atkinson Hyperlegible', system-ui, sans-serif";
  Chart.defaults.color = txt; Chart.defaults.borderColor = lin;
  const tip = { backgroundColor: '#1F3B2C', padding: 12, cornerRadius: 12, titleFont: { weight: '700' }, boxPadding: 6 };
  gVivo = new Chart($('gVivo'), {
    type: 'line',
    data: { labels: [], datasets: Object.entries(SERIES).map(([k, s]) => ({
      label: s.n, key: k, data: [], borderColor: s.c, backgroundColor: s.c + '1f', borderWidth: 2.5, tension: .35,
      pointRadius: 0, pointHoverRadius: 5, spanGaps: true, fill: k === 'tank_pct' ? 'origin' : false,
      yAxisID: k === 'temp' ? 'y2' : 'y', hidden: !S.visibles.has(k) })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y == null ? 'sin lectura' : c.parsed.y + SERIES[c.dataset.key].u}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { min: 0, max: 100, grid: { color: lin }, ticks: { callback: v => v + ' %' } },
        y2: { position: 'right', suggestedMin: 10, suggestedMax: 35, grid: { display: false }, ticks: { callback: v => v + ' °C' } }
      }
    }
  });
  gDias = new Chart($('gDias'), {
    data: { labels: [], datasets: [
      { type: 'bar', label: 'Rango', data: [], borderRadius: 8, borderSkipped: false, barPercentage: .55, order: 2 },
      { type: 'line', label: 'Promedio', data: [], borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#fff', pointBorderWidth: 2.5, tension: .35, order: 1, spanGaps: true }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: c => {
        const u = SERIES[S.metrica].u;
        if (c.datasetIndex === 0) return c.raw ? ` Mínimo ${c.raw[0]}${u}, máximo ${c.raw[1]}${u}` : ' Sin datos';
        return ` Promedio ${c.parsed.y}${u}`;
      } } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: lin } } }
    }
  });
  $('chipsVivo').innerHTML = Object.entries(SERIES).map(([k, s]) =>
    `<button class="chip ${S.visibles.has(k) ? 'act' : 'off'}" data-k="${k}" style="--c:${s.c}" aria-pressed="${S.visibles.has(k)}"><i></i>${s.n}</button>`).join('');
  actualizarVivo();
  return true;
}
$('chipsVivo').onclick = e => {
  const b = e.target.closest('[data-k]'); if (!b || !gVivo) return;
  const k = b.dataset.k, on = !S.visibles.has(k);
  on ? S.visibles.add(k) : S.visibles.delete(k);
  guardarLS('series', [...S.visibles]);
  b.classList.toggle('act', on); b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on);
  gVivo.data.datasets.find(d => d.key === k).hidden = !on; gVivo.update();
};
function actualizarVivo() {
  if (!gVivo) return;
  const p = S.vivo.slice(-120);
  gVivo.data.labels = p.map(x => new Date(x.ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  gVivo.data.datasets.forEach(ds => { ds.data = p.map(x => x[ds.key]); });
  gVivo.update();
  const v = $('vacioVivo');
  v.hidden = p.length >= 2;
  if (!v.hidden) v.textContent = 'Aún no hay suficientes lecturas. Con el ESP32 en línea, la línea avanza cada 10 segundos.';
  $('nVivo').textContent = p.length ? `${p.length} lecturas, la última a las ${hora(p[p.length - 1].ts)}` : 'Se actualiza con cada lectura del ESP32';
}

$('selMetrica').innerHTML = Object.entries(SERIES).map(([k, s]) => `<option value="${k}">${s.n}</option>`).join('');
$('selMetrica').onchange = e => { S.metrica = e.target.value; pintarDias(); };
$('segDias').onclick = e => {
  const b = e.target.closest('[data-d]'); if (!b) return;
  $$('#segDias button').forEach(x => x.classList.toggle('act', x === b));
  S.diasN = +b.dataset.d; cargarDias(true);
};
async function cargarDias(forzar) {
  if (!forzar && S.dias && Date.now() - S.diasCargado < 300000) return pintarDias();
  try { S.dias = await api(`/api/historial?dias=${S.diasN}`); S.diasCargado = Date.now(); pintarDias(); pintarSemana(); }
  catch { $('vacioDias').hidden = false; $('vacioDias').textContent = 'No se pudo cargar el resumen por día.'; }
}
function pintarDias() {
  if (!gDias || !S.dias) return;
  const k = S.metrica, s = SERIES[k], por = Object.fromEntries(S.dias.map(x => [x.dia, x]));
  const etiquetas = [], rango = [], prom = [];
  for (let i = S.diasN - 1; i >= 0; i--) {
    const f = new Date(); f.setDate(f.getDate() - i);
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    etiquetas.push(i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : f.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }));
    const m = por[clave] && por[clave][k];
    rango.push(m && m.min != null ? [m.min, m.max === m.min ? m.max + .3 : m.max] : null);
    prom.push(m && m.avg != null ? m.avg : null);
  }
  gDias.data.labels = etiquetas;
  Object.assign(gDias.data.datasets[0], { data: rango, backgroundColor: s.c + '45', hoverBackgroundColor: s.c + '70' });
  Object.assign(gDias.data.datasets[1], { data: prom, borderColor: s.c, pointBorderColor: s.c });
  const pct = k !== 'temp';
  gDias.options.scales.y.min = pct ? 0 : undefined; gDias.options.scales.y.max = pct ? 100 : undefined;
  gDias.options.scales.y.ticks = { callback: v => v + s.u };
  gDias.update();
  const con = prom.filter(x => x != null);
  const v = $('vacioDias'); v.hidden = con.length > 0;
  if (!v.hidden) v.textContent = 'Todavía no hay registros de estos días. El ESP32 guarda uno cada 5 minutos: vuelve en un rato.';
  const f = x => x == null ? '--' : (+x).toFixed(k === 'temp' ? 1 : 0) + s.u;
  const mins = rango.filter(Boolean).map(r => r[0]), maxs = rango.filter(Boolean).map(r => r[1]);
  const set = (c, t, cl = '') => { const el = $('cifras').querySelector(`[data-c=${c}]`); el.textContent = t; el.className = cl; };
  set('avg', f(con.length ? con.reduce((a, b) => a + b, 0) / con.length : null));
  set('min', f(mins.length ? Math.min(...mins) : null));
  set('max', f(maxs.length ? Math.max(...maxs) : null));
  if (con.length >= 2) { const dlt = con[con.length - 1] - con[con.length - 2]; set('tend', (dlt >= 0 ? '+' : '') + dlt.toFixed(1) + s.u, dlt > 0 ? 'sube' : dlt < 0 ? 'baja' : ''); }
  else set('tend', '--');
}
async function leerHistorial() {
  try { S.hist = await api('/api/historial') || []; } catch { return; }
  const f = (v, d = 0) => v == null ? '<td class="nd">—</td>' : `<td>${(+v).toFixed(d)}</td>`;
  const filas = S.hist.slice().reverse();
  $('tablaHist').innerHTML = filas.length ? filas.map(r => `<tr><td>${fechaHora(r.ts)}</td>${f(r.soil1_pct)}${f(r.soil2_pct)}${f(r.temp, 1)}${f(r.hum)}${f(r.tank_pct)}</tr>`).join('')
    : '<tr><td colspan="6" class="nd">Aún no hay registros. El primero se guarda a los 5 minutos de encender el ESP32.</td></tr>';
}
$('btnCsv').onclick = () => {
  if (!S.hist.length) return tostada('No hay datos para descargar', 'El historial todavía está vacío.');
  const n = v => v == null ? '' : v;
  const lineas = ['fecha,suelo_zona1_pct,suelo_zona2_pct,temperatura_c,humedad_aire_pct,tanque_pct',
    ...S.hist.map(r => [new Date(r.ts).toLocaleString('sv-SE'), n(r.soil1_pct), n(r.soil2_pct), n(r.temp), n(r.hum), n(r.tank_pct)].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `historial-huerto-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ================= cámara =================
async function leerCamara(forzar) {
  try {
    const d = await api('/api/camara?info=1'); S.cam = d;
    if (d.hay) {
      $('sinSenal').hidden = true; $('camSello').hidden = false;
      $('camHora').textContent = 'Foto de las ' + hora(d.ts);
      if (forzar || d.ts !== S.camMostrada) {
        const img = $('camImg'); img.onload = () => { img.hidden = false; };
        img.src = '/api/camara?t=' + d.ts; S.camMostrada = d.ts;
      }
      const edad = Date.now() - d.ts;
      $('camEstado').textContent = edad < 120000 ? `Cámara en línea. Última foto ${haceTxt(edad)}.` : `La última foto llegó ${haceTxt(edad)}. Revisa que la cámara siga encendida.`;
    } else {
      $('sinSenal').hidden = false; $('camImg').hidden = true; $('camSello').hidden = true;
      $('camEstado').textContent = 'Aún no llega ninguna foto. Sigue los pasos de abajo para conectar la cámara.';
    }
  } catch (e) { if (e.message !== '401') $('camEstado').textContent = 'No se pudo consultar la cámara.'; }
}
$('camRefrescar').onclick = () => leerCamara(true);
$('camAmpliar').onclick = () => { const v = $('visor'); (v.requestFullscreen || v.webkitRequestFullscreen || (() => {})).call(v); };
$('camBajar').onclick = async () => {
  if (!S.cam.hay) return tostada('Aún no hay fotos', 'Conecta la cámara para poder guardar fotos.');
  const b = await (await fetch('/api/camara?t=' + Date.now(), { credentials: 'same-origin' })).blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = `huerto-${new Date(S.cam.ts).toISOString().slice(0, 16).replace(':', '-')}.jpg`; a.click();
};
$('camAnalizar').onclick = async () => {
  const an = $('analisis'), btn = $('camAnalizar');
  const mostrar = (cls, h) => { an.hidden = false; an.className = 'analisis ' + cls; an.innerHTML = h; };
  if (!S.cam.hay) return mostrar('', '<h3>Primero conecta la cámara</h3><p>Sin fotos no hay nada que revisar. Sigue los pasos de abajo.</p>');
  if (!S.ia) return mostrar('', '<h3>Falta activar la inteligencia artificial</h3><p>Para buscar plagas en la foto, agrega la variable <code>GEMINI_API_KEY</code> en Vercel y vuelve a desplegar. Mientras tanto, mira la foto y cuéntale a Brote lo que ves.</p>');
  $('visor').classList.add('analizando'); btn.disabled = true; an.hidden = true;
  try {
    const r = await api('/api/bot', 'POST', { accion: 'analizar' });
    mostrar(r.plaga ? 'plaga' : '', `<h3>${r.plaga ? 'Posible plaga: ' + esc(r.tipo || 'sin identificar') : 'No se ven plagas'}</h3>
      <p>${esc(r.descripcion || '')}</p>${r.consejo ? `<p><b>Qué hacer:</b> ${esc(r.consejo)}</p>` : ''}
      ${r.confianza != null ? `<p class="nota">Seguridad del análisis: ${esc(r.confianza)} %</p>` : ''}`);
    leerAlertas();
  } catch (e) { mostrar('', `<h3>No se pudo analizar la foto</h3><p>${esc(e.message)}</p>`); }
  $('visor').classList.remove('analizando'); btn.disabled = false;
};

// ================= navegación =================
const VISTAS = ['inicio', 'graficos', 'camara', 'alertas', 'guia'];
function ir(v) {
  if (!VISTAS.includes(v)) v = 'inicio';
  S.vista = v;
  $$('.vista').forEach(x => x.classList.toggle('act', x.id === 'v-' + v));
  $$('.riel-nav [data-ir], .tabbar [data-ir]').forEach(b => { b.classList.toggle('act', b.dataset.ir === v); b.toggleAttribute('aria-current', b.dataset.ir === v); });
  window.scrollTo({ top: 0 });
  if (v === 'graficos' && asegurarGraficos()) { actualizarVivo(); leerHistorial(); cargarDias(); }
  if (v === 'camara') leerCamara();
  if (v === 'alertas' && S.noLeidas) setTimeout(() => { if (S.vista === 'alertas') marcarLeidas(); }, 2500);
  try { history.replaceState(null, '', '#' + v); } catch {}
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]'); if (b) { ir(b.dataset.ir); if (innerWidth < 900) cerrarChat(); }
  const p = e.target.closest('[data-preguntar]'); if (p) preguntar(p.dataset.preguntar);
  if (e.target.closest('[data-salir]')) salir();
});

// ================= recorrido guiado =================
const PASOS = [
  { t: 'Bienvenido a tu huerto', x: 'Te muestro en un minuto dónde está cada cosa. Puedes saltarlo cuando quieras y repetirlo desde la Guía.' },
  { sel: '.hero', t: 'Tu planta te habla', x: 'La planta cambia con el huerto: se marchita si la tierra está seca y gotea cuando riegas. Al lado tienes el resumen y la salud general.' },
  { sel: '#tablero', t: 'Los cinco sensores', x: 'Humedad de las dos zonas, temperatura, humedad del aire y agua del tanque. La franja verde de cada regla es el rango ideal.' },
  { sel: '#cBomba', t: 'Riega con un toque', x: 'Pulsa el botón y el ESP32 enciende la bomba. Por seguridad se apaga sola a los 30 segundos.' },
  { sel: '[data-ir=graficos]', t: 'Gráficos e historial', x: 'Uno en vivo y otro con el promedio, mínimo y máximo de cada día. El historial se descarga para Excel.' },
  { sel: '[data-ir=camara]', t: 'Cámara', x: 'Cuando conectes la ESP32-CAM verás aquí las fotos y podrás buscar plagas.' },
  { sel: '#campana', t: 'Avisos', x: 'Si hay plagas, poca agua, tierra seca o mucho calor, te avisamos aquí y con una notificación.' },
  { sel: '#botBtn', t: 'Brote, tu asistente', x: 'Pregúntale lo que quieras: cómo está el huerto, si debes regar o qué hacer con una plaga.' }
];
let tourI = 0;
const visibleDe = sel => $$(sel).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
function tour() { ir('inicio'); cerrarChat(); tourI = 0; $('tour').hidden = false; pasoTour(); }
function finTour() { $('tour').hidden = true; guardarLS('tourVisto', true); }
function pasoTour() {
  const p = PASOS[tourI];
  $('tourPaso').textContent = `Paso ${tourI + 1} de ${PASOS.length}`;
  $('tourTit').textContent = p.t; $('tourTxt').textContent = p.x;
  $('tourAtras').hidden = tourI === 0;
  $('tourSig').textContent = tourI === PASOS.length - 1 ? 'Empezar' : 'Siguiente';
  colocarTour(); $('tourSig').focus();
}
function colocarTour() {
  if ($('tour').hidden) return;
  const p = PASOS[tourI], el = p.sel ? visibleDe(p.sel) : null, foco = $('tourFoco'), caja = $('tourCaja');
  const cw = caja.offsetWidth, ch = caja.offsetHeight;
  if (!el) {
    foco.style.cssText = `left:${innerWidth / 2}px;top:${innerHeight / 2}px;width:0;height:0`;
    caja.style.left = (innerWidth - cw) / 2 + 'px'; caja.style.top = (innerHeight - ch) / 2 + 'px'; return;
  }
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(), pad = 8;
  foco.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  let top = r.bottom + 18;
  if (top + ch > innerHeight - 12) top = r.top - ch - 18;
  if (top < 12) top = Math.max(12, innerHeight - ch - 12);
  caja.style.top = top + 'px';
  caja.style.left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12) + 'px';
}
$('tourSig').onclick = () => { if (tourI < PASOS.length - 1) { tourI++; pasoTour(); } else finTour(); };
$('tourAtras').onclick = () => { if (tourI > 0) { tourI--; pasoTour(); } };
$('tourSaltar').onclick = finTour;
$('btnTour').onclick = tour;
addEventListener('resize', colocarTour);
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('tour').hidden) finTour(); else if (!$('modalPlaga').hidden) $('modalPlaga').hidden = true; else if (!$('chat').hidden) cerrarChat();
});

// ================= asistente =================
function contexto() {
  const d = S.d, edad = d && d.ts ? Date.now() - d.ts : null;
  return { d, ok: S.ok, edadTxt: edad == null ? null : haceTxt(edad), usuario: S.usuario, ia: S.ia, alertas: S.alertas, riegoSecs: S.pumpSecs, riegoTxt: durTxt(S.pumpSecs),
    dias: S.dias, salud: salud(d), camara: S.cam.hay, camaraTxt: S.cam.ts ? haceTxt(Date.now() - S.cam.ts) : null };
}
function contextoIA(c) {
  const d = c.d;
  return {
    hora_local: new Date().toLocaleString('es-PE'), usuario: c.usuario, esp32_en_linea: c.ok, ultima_lectura: c.edadTxt,
    sensores: d ? { suelo_zona1_pct: d.soil1_pct, suelo_zona2_pct: d.soil2_pct, temperatura_c: d.temp, humedad_aire_pct: d.hum, tanque_pct: d.tank_pct } : null,
    bomba_encendida: S.pumpOn, salud_0_100: c.salud, camara_conectada: c.camara,
    avisos_recientes: S.alertas.slice(0, 6).map(a => `${a.titulo} (${cuando(a.ts)})`),
    resumen_por_dia: (S.dias || []).slice(-7)
  };
}
function formatear(t) {
  const lineas = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').split('\n');
  let h = '', lista = false;
  for (const l of lineas) {
    if (/^\s*[-•*]\s+/.test(l)) { if (!lista) { h += '<ul>'; lista = true; } h += '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>'; }
    else { if (lista) { h += '</ul>'; lista = false; } if (l.trim()) h += '<p>' + l + '</p>'; }
  }
  return h + (lista ? '</ul>' : '');
}
function agregarMsg(de, texto) {
  const m = document.createElement('div');
  m.className = 'msg ' + de; m.innerHTML = de === 'yo' ? esc(texto) : formatear(texto);
  $('chatMsgs').append(m); $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
  S.chat.push({ de: de === 'yo' ? 'yo' : 'bot', texto }); if (S.chat.length > 30) S.chat.shift();
  return m;
}
const CHIPS = ['¿Cómo está el huerto?', '¿Debo regar?', 'Tengo una plaga', '¿Qué puedes hacer?'];
function chips(l) {
  $('chatChips').innerHTML = (l || []).map(c => `<button type="button">${esc(c)}</button>`).join('');
}
$('chatChips').onclick = e => { const b = e.target.closest('button'); if (b) enviar(b.textContent); };
const NOMBRES = { graficos: 'Abrir gráficos', camara: 'Abrir cámara', alertas: 'Ver avisos', guia: 'Abrir la guía' };
function decir(r) {
  const m = agregarMsg('bot', r.texto);
  if (r.accion) {
    const box = document.createElement('div'); box.className = 'acciones-msg';
    if (r.accion === 'regar' || r.accion === 'apagar') {
      const si = document.createElement('button'); si.className = 'btn-principal';
      si.textContent = r.accion === 'regar' ? 'Sí, regar ahora' : 'Sí, detener';
      const no = document.createElement('button'); no.className = 'btn-suave'; no.textContent = 'Mejor no';
      si.onclick = async () => {
        box.remove();
        const ok = await regar(r.accion === 'regar');
        decir({ texto: ok ? (r.accion === 'regar' ? '¡Listo! Mandé la orden. El ESP32 enciende la bomba en unos segundos y la apaga sola a los 30. 💧' : 'Listo, mandé la orden de parar.') : 'No pude enviar la orden. Revisa tu internet e inténtalo otra vez.' });
      };
      no.onclick = () => { box.remove(); decir({ texto: 'Perfecto, no toco nada. 👍' }); };
      box.append(si, no);
    } else if (r.accion.startsWith('ir:')) {
      const v = r.accion.slice(3), b = document.createElement('button'); b.className = 'btn-suave';
      b.textContent = NOMBRES[v] || 'Abrir'; b.onclick = () => { ir(v); if (innerWidth < 900) cerrarChat(); };
      box.append(b);
    }
    if (box.children.length) m.append(box);
  }
  chips(r.chips || CHIPS);
  $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
}
async function enviar(texto) {
  texto = String(texto || '').trim(); if (!texto) return;
  agregarMsg('yo', texto); chips([]); $('chatInput').value = '';
  const t = document.createElement('div'); t.className = 'msg bot escribiendo'; t.innerHTML = '<i></i><i></i><i></i>';
  $('chatMsgs').append(t); $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
  const c = contexto(), inicio = Date.now();
  let r = window.Cerebro ? Cerebro.responder(texto, c) : { texto: 'No pude cargar mi cerebro. Recarga la página.' };
  if (S.ia && !r.accion) {
    try { const d = await api('/api/bot', 'POST', { mensaje: texto, contexto: contextoIA(c), chat: S.chat.slice(-9, -1) }); if (d && d.texto) r = { texto: d.texto, chips: r.chips }; } catch {}
  }
  await espera(Math.max(0, 600 - (Date.now() - inicio)));
  t.remove(); decir(r);
}
function abrirChat() {
  $('chat').hidden = false; $('botBtn').hidden = true; $('botBtn').classList.remove('nuevo');
  if (!S.chatListo) { S.chatListo = true; decir(Cerebro.responder('hola', contexto())); }
  if (innerWidth >= 900) setTimeout(() => $('chatInput').focus(), 60);
}
function cerrarChat() { $('chat').hidden = true; $('botBtn').hidden = false; }
function preguntar(t) { const nuevo = !S.chatListo; abrirChat(); setTimeout(() => enviar(t), nuevo ? 700 : 0); }
$('botBtn').onclick = abrirChat;
$('chatCerrar').onclick = cerrarChat;
$('chatForm').onsubmit = e => { e.preventDefault(); enviar($('chatInput').value); };

// ================= sesión =================
function iniciar(usuario) {
  S.usuario = usuario; S.sesion = true;
  document.body.classList.remove('fuera');
  $$('[data-usuario]').forEach(e => { e.textContent = usuario; });
  $$('[data-inicial]').forEach(e => { e.textContent = usuario[0].toUpperCase(); });
  const hp = $$('[data-planta=hero] .planta')[0];
  if (hp) { hp.classList.remove('crece'); void hp.getBoundingClientRect(); hp.classList.add('crece'); }
  const dia = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const tip = CONSEJOS[dia % CONSEJOS.length];
  $('consejo').textContent = tip; $('reTip').textContent = CONSEJOS[(dia + 3) % CONSEJOS.length];
  pintarInicio(); pintarActividad(); pintarSemana();
  ir(location.hash.slice(1) || 'inicio');
  api('/api/historial?horas=2').then(r => { if (Array.isArray(r) && r.length) { S.vivo = [...r, ...S.vivo.filter(x => x.ts > r[r.length - 1].ts)]; pintarSensores(); actualizarVivo(); } }).catch(() => {});
  leerSensores(); leerAlertas(); leerCamara(); cargarDias();
  pintarSlider();
  api('/api/control/pump_cmd?info=1').then(d => { if (d && d.segundos) { S.pumpSecs = d.segundos; pintarSlider(); } }).catch(() => {});
  api('/api/bot').then(d => { S.ia = !!(d && d.ia); $('botModo').textContent = S.ia ? 'Asistente con inteligencia artificial' : 'Asistente del huerto'; }).catch(() => {});
  S.timers.forEach(clearInterval);
  S.timers = [
    setInterval(leerSensores, 5000),
    setInterval(leerAlertas, 15000),
    setInterval(() => { if (S.vista === 'camara') leerCamara(); }, 5000),
    setInterval(() => { if (S.vista !== 'camara') leerCamara(); }, 60000),
    setInterval(() => { if (S.vista === 'graficos') { leerHistorial(); cargarDias(); } }, 60000),
    setInterval(pintarHero, 15000)
  ];
  if (!leerLS('tourVisto', false)) setTimeout(tour, 2800); else $('botBtn').classList.add('nuevo');
}
function cerrarVista() {
  S.timers.forEach(clearInterval); S.timers = []; S.sesion = false;
  $('optPantalla').checked = false; pantallaActiva(false);
  cerrarChat(); $('tour').hidden = true; $('modalPlaga').hidden = true;
  document.body.classList.add('fuera');
}
async function salir() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
  cerrarVista();
  Object.assign(S, { d: null, ok: false, vivo: [], alertas: [], ultimoId: 0, noLeidas: 0, chat: [], chatListo: false, dias: null, primera: true });
  $('chatMsgs').innerHTML = '';
}

async function post(ruta, obj) {
  const r = await fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error(d.error || ('Error ' + r.status));
  return d;
}
let modo = 'entrar';
function modoForm(m) {
  modo = m;
  $('tEntrar').classList.toggle('act', m === 'entrar'); $('tCrear').classList.toggle('act', m === 'crear');
  $('tEntrar').setAttribute('aria-selected', m === 'entrar'); $('tCrear').setAttribute('aria-selected', m === 'crear');
  $('fCodigo').hidden = m !== 'crear'; $('lcodigo').required = m === 'crear';
  $('lbtn').textContent = m === 'crear' ? 'Crear cuenta' : 'Entrar';
  $('lTitulo').textContent = m === 'crear' ? 'Crea tu cuenta' : 'Entra a tu huerto';
  $('lclave').autocomplete = m === 'crear' ? 'new-password' : 'current-password';
  $('lmsg').textContent = '';
}
$('tEntrar').onclick = () => modoForm('entrar');
$('tCrear').onclick = () => modoForm('crear');
$('verClave').onclick = () => {
  const i = $('lclave'), ver = i.type === 'password';
  i.type = ver ? 'text' : 'password'; $('verClave').textContent = ver ? 'Ocultar' : 'Ver';
  $('verClave').setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
};
$('lform').onsubmit = async e => {
  e.preventDefault();
  const b = $('lbtn'); b.disabled = true; $('lmsg').textContent = '';
  const original = b.textContent; b.textContent = modo === 'crear' ? 'Creando cuenta…' : 'Entrando…';
  const usuario = $('luser').value.trim(), clave = $('lclave').value;
  try {
    if (modo === 'crear') await post('/api/auth/registro', { usuario, clave, codigo: $('lcodigo').value });
    const d = await post('/api/auth/login', { usuario, clave });
    $('lclave').value = ''; $('lcodigo').value = '';
    if (modo === 'crear') guardarLS('tourVisto', false);
    iniciar(d.usuario);
  } catch (err) {
    $('lmsg').textContent = err.message;
    $('lform').animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
  }
  b.disabled = false; b.textContent = original;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (S.sesion) { leerSensores(); leerAlertas(); }
  if ($('optPantalla').checked) tomarBloqueo();   // el sistema lo suelta al minimizar
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// ================= pantalla de arranque =================
// Se mantiene hasta saber si hay sesión, así nadie ve el login parpadear.
const arrancoEn = performance.now();
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
function cerrarArranque() {
  const a = $('arranque');
  if (!a || a.classList.contains('va')) return;
  a.classList.add('va');
  setTimeout(() => a.remove(), 650);
}
setTimeout(cerrarArranque, 5000);   // por si el servidor tarda demasiado

fetch('/api/auth/yo', { credentials: 'same-origin', cache: 'no-store' })
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d && d.usuario) iniciar(d.usuario); })
  .catch(() => {})
  .finally(() => setTimeout(cerrarArranque, Math.max(0, (sinMovimiento ? 200 : 1700) - (performance.now() - arrancoEn))));
})();
