import { usuarioActual } from '../_lib.js';

// GET -> quién tiene la sesión iniciada (o 401)
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const u = usuarioActual(req);
  if (!u) return res.status(401).json({ error: 'sin sesión' });
  res.status(200).json({ usuario: u });
}
