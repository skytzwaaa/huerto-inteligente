import { bd, auth } from './_lib.js';
import { nuevaAlerta } from './_extra.js';

// GET           -> última foto (image/jpeg)
// GET ?info=1   -> { hay, ts }
// POST / PUT    -> la ESP32-CAM sube una foto JPEG (cuerpo binario + cabecera x-api-key)
export default async function handler(req, res) {
  if (req.method === 'POST' || req.method === 'PUT') {
    // solo la cámara (con su clave) puede subir fotos
    if (!req.headers['x-api-key']) return res.status(401).json({ error: 'falta x-api-key' });
    if (!auth(req, res)) return;
    try {
      const partes = []; let total = 0;
      for await (const c of req) { total += c.length; if (total > 3_000_000) return res.status(413).json({ error: 'foto muy grande' }); partes.push(c); }
      const buf = Buffer.concat(partes);
      if (buf.length < 100 || buf[0] !== 0xFF || buf[1] !== 0xD8) return res.status(400).json({ error: 'no es un JPEG' });
      const prev = await bd.get('camara/ts');
      await bd.put('camara', { img: buf.toString('base64'), ts: Date.now() });
      if (!prev) await nuevaAlerta('camara', 'info', 'Cámara conectada', 'Llegó la primera foto de la ESP32-CAM.');
      return res.status(200).json({ ok: true, bytes: buf.length });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }
  if (!auth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });
  try {
    if (req.query.info) {
      const ts = await bd.get('camara/ts');
      return res.status(200).json({ hay: !!ts, ts: ts ? Number(ts) : null });
    }
    const r = await bd.get('camara');
    if (!r || !r.img) return res.status(404).json({ error: 'todavía no hay fotos' });
    const buf = Buffer.from(r.img, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).end(buf);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
