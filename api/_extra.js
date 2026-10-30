import { bd, clave13 } from './_lib.js';

export const TIPOS = ['plaga', 'agua', 'suelo', 'calor', 'riego', 'sistema', 'camara'];
export const NIVELES = ['info', 'aviso', 'peligro'];

let ultimoId = 0;
// Inserta un aviso; si "cadaHoras" > 0 no repite el mismo título en ese plazo.
// El id es la hora en milisegundos (creciente), así la app puede pedir "los nuevos desde X".
export async function nuevaAlerta(tipo, nivel, titulo, detalle, cadaHoras = 0) {
  if (cadaHoras > 0) {
    const recientes = await bd.lista('alertas', { limitToLast: 40 });
    const limite = Date.now() - cadaHoras * 3600e3;
    if (recientes.some(([, a]) => a.titulo === titulo && a.ts > limite)) return null;
  }
  const ts = Date.now();
  const id = Math.max(ts, ultimoId + 1);
  ultimoId = id;
  await bd.put(`alertas/${clave13(id)}`, { tipo, nivel, titulo, detalle: detalle ?? null, ts, leida: false });
  return id;
}

// Revisa una lectura del ESP32 y crea avisos si algo va mal (máx. uno cada 2 h por tipo)
export async function revisarLectura(b) {
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const tk = num(b.tank_pct), s1 = num(b.soil1_pct), s2 = num(b.soil2_pct), t = num(b.temp);
  const avisos = [];
  if (tk !== null && tk < 20) avisos.push(['agua', 'aviso', 'Al tanque le queda poca agua', `Nivel: ${tk} %. Rellénalo para que la bomba no trabaje en seco.`]);
  if (s1 !== null && s1 < 25) avisos.push(['suelo', 'aviso', 'La zona 1 está seca', `Humedad del suelo: ${s1} %. Conviene regar.`]);
  if (s2 !== null && s2 < 25) avisos.push(['suelo', 'aviso', 'La zona 2 está seca', `Humedad del suelo: ${s2} %. Conviene regar.`]);
  if (t !== null && t > 35) avisos.push(['calor', 'aviso', 'Hace demasiado calor', `${t.toFixed(1)} °C. Dale sombra al huerto y riega temprano o al atardecer.`]);
  for (const a of avisos) await nuevaAlerta(...a, 2);
}
