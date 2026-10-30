import { bd, auth, cuerpo, n, clave13 } from './_lib.js';

const r1 = v => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
const CAMPOS = ['soil1_pct', 'soil2_pct', 'temp', 'hum', 'tank_pct'];
const diaLima = ms => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);   // Lima = UTC-5, sin horario de verano
const reg = ([k, r]) => ({ soil1_pct: n(r.soil1_pct), soil2_pct: n(r.soil2_pct), temp: n(r.temp), hum: n(r.hum), tank_pct: n(r.tank_pct), ts: Number(k) });
const met = m => (m && m.c ? { avg: r1(m.sum / m.c), min: r1(m.min), max: r1(m.max) } : { avg: null, min: null, max: null });

// GET          -> últimos 96 registros (orden cronológico)
// GET ?horas=N -> registros de las últimas N horas (para el gráfico en vivo)
// GET ?dias=N  -> resumen por día (promedio, mínimo y máximo), hora de Lima
// POST         -> el ESP32 guarda un registro cada 5 min (y se actualiza el resumen del día)
export default async function handler(req, res) {
  if (!auth(req, res)) return;
  try {
    if (req.method === 'GET' && req.query.dias) {
      const dias = Math.min(Math.max(parseInt(req.query.dias) || 7, 1), 90);
      const desde = diaLima(Date.now() - (dias - 1) * 86400e3);
      const rows = await bd.lista('resumen', { startAt: desde });
      return res.status(200).json(rows.map(([dia, r]) => ({
        dia, n: r.n || 0,
        soil1_pct: met(r.soil1_pct), soil2_pct: met(r.soil2_pct), temp: met(r.temp), hum: met(r.hum), tank_pct: met(r.tank_pct)
      })));
    }
    if (req.method === 'GET' && req.query.horas) {
      const horas = Math.min(Math.max(parseInt(req.query.horas) || 2, 1), 48);
      const rows = await bd.lista('historial', { startAt: clave13(Date.now() - horas * 3600e3), limitToLast: 1000 });
      return res.status(200).json(rows.map(reg));
    }
    if (req.method === 'GET') {
      const rows = await bd.lista('historial', { limitToLast: 96 });
      return res.status(200).json(rows.map(reg));
    }
    if (req.method === 'POST') {
      const b = cuerpo(req) || {};
      const ts = Date.now();
      const fila = {};
      for (const c of CAMPOS) if (b[c] !== undefined && b[c] !== null) fila[c] = Number(b[c]);
      await bd.put(`historial/${clave13(ts)}`, fila);
      // resumen del día: así los gráficos por día no tienen que leer todos los registros
      const dia = diaLima(ts);
      const r = (await bd.get(`resumen/${dia}`)) || { n: 0 };
      r.n = (r.n || 0) + 1;
      for (const c of CAMPOS) {
        if (fila[c] === undefined) continue;
        const m = r[c] || { c: 0, sum: 0, min: fila[c], max: fila[c] };
        m.c++; m.sum += fila[c]; m.min = Math.min(m.min, fila[c]); m.max = Math.max(m.max, fila[c]);
        r[c] = m;
      }
      await bd.put(`resumen/${dia}`, r);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
