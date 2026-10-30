import { borrarCookie } from '../_lib.js';

// POST -> cierra la sesión
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  res.setHeader('Set-Cookie', borrarCookie);
  res.status(200).json({ ok: true });
}
