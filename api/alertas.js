import { bd, auth, cuerpo, n, clave13 } from './_lib.js';
import { nuevaAlerta, TIPOS, NIVELES } from './_extra.js';

// GET   -> últimos avisos  (?desde=ID devuelve solo los nuevos)
// POST  -> crea un aviso   { tipo, nivel, titulo, detalle }  (ESP32, cámara o app)
// PATCH -> marca leídos    { todas: true } o { id }
export default async function handler(req, res) {
  if (!auth(req, res)) return;
  try {
    const fila = ([k, a]) => ({ id: Number(k), tipo: a.tipo, nivel: a.nivel, titulo: a.titulo, detalle: a.detalle ?? null, leida: !!a.leida, ts: n(a.ts) });

    if (req.method === 'GET') {
      const desde = Number(req.query.desde) || 0;
      if (desde) {
        const rows = await bd.lista('alertas', { startAt: clave13(desde + 1), limitToFirst: 50 });
        const rec = await bd.lista('alertas', { limitToLast: 100 });
        return res.status(200).json({ items: rows.map(fila), noLeidas: rec.filter(([, a]) => !a.leida).length });
      }
      const rec = await bd.lista('alertas', { limitToLast: 100 });
      return res.status(200).json({
        items: rec.slice(-60).reverse().map(fila),
        noLeidas: rec.filter(([, a]) => !a.leida).length
      });
    }
    if (req.method === 'POST') {
      const b = cuerpo(req) || {};
      const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'sistema';
      const nivel = NIVELES.includes(b.nivel) ? b.nivel : (tipo === 'plaga' ? 'peligro' : 'info');
      const titulo = String(b.titulo || (tipo === 'plaga' ? 'Posible plaga detectada' : 'Aviso')).slice(0, 120);
      const detalle = b.detalle ? String(b.detalle).slice(0, 500) : null;
      const id = await nuevaAlerta(tipo, nivel, titulo, detalle);
      return res.status(200).json({ ok: true, id });
    }
    if (req.method === 'PATCH') {
      const b = cuerpo(req) || {};
      if (b.todas) {
        const rec = await bd.lista('alertas', { limitToLast: 200 });
        const cambios = {};
        for (const [k, a] of rec) if (!a.leida) cambios[`${k}/leida`] = true;
        if (Object.keys(cambios).length) await bd.patch('alertas', cambios);
      } else if (b.id) {
        await bd.patch(`alertas/${clave13(Number(b.id))}`, { leida: true });
      }
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
