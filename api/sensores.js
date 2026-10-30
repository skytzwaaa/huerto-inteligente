import { bd, auth, cuerpo, n } from './_lib.js';
import { revisarLectura } from './_extra.js';

// GET   -> última lectura (ts en milisegundos)
// PATCH -> el ESP32 sube lecturas o actualiza solo "pump"; responde con la orden de la bomba
export default async function handler(req, res) {
  if (!auth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const r = await bd.get('sensores');
      return res.status(200).json(r ? {
        soil1_pct: n(r.soil1_pct), soil2_pct: n(r.soil2_pct), temp: n(r.temp),
        hum: n(r.hum), tank_pct: n(r.tank_pct), pump: n(r.pump), ts: n(r.ts)
      } : null);
    }
    if (req.method === 'PATCH' || req.method === 'POST' || req.method === 'PUT') {
      const b = cuerpo(req) || {};
      const lectura = b.soil1_pct !== undefined;   // solo las lecturas completas refrescan "ts"
      const cambios = {};
      const poner = (k, v) => { if (v !== undefined && v !== null) cambios[k] = Number(v); };
      poner('soil1_pct', b.soil1_pct); poner('soil2_pct', b.soil2_pct); poner('pump', b.pump);
      if (lectura) {
        cambios.soil2_pct = b.soil2_pct ?? null; cambios.temp = b.temp ?? null; cambios.hum = b.hum ?? null; cambios.tank_pct = b.tank_pct ?? null;
        cambios.ts = Date.now();
      }
      if (Object.keys(cambios).length) await bd.patch('sensores', cambios);
      if (lectura) { try { await revisarLectura(b); } catch (e) { /* los avisos nunca bloquean la subida */ } }
      // De paso le devolvemos al ESP32 la orden de la bomba y cuánto debe regar
      const c = (await bd.get('control')) || {};
      return res.status(200).json({
        ok: true,
        pump_cmd: c.pump_cmd === true,
        pump_secs: Math.max(5, Math.min(600, Math.round(Number(c.pump_secs)) || 30))
      });
    }
    res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
