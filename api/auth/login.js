import { bd, claveUsuario, checkClave, crearCookie, espera, cuerpo } from '../_lib.js';

// POST { usuario, clave } -> inicia sesión (cookie). 5 fallos seguidos bloquean 15 min.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    const b = cuerpo(req) || {};
    const usuario = String(b.usuario || '').trim().toLowerCase();
    const clave = String(b.clave || '');

    const ruta = `usuarios/${claveUsuario(usuario)}`;
    const reg = /^[a-z0-9_.-]{1,40}$/.test(usuario) ? await bd.get(ruta) : null;
    const u = reg ? { usuario, hash: reg.hash, fallos: reg.fallos || 0, bloqueado_hasta: reg.bloqueado_hasta || 0 } : null;
    if (u && u.bloqueado_hasta > Date.now()) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    }
    if (!u || !checkClave(clave, u.hash)) {
      if (u) {
        const bloquea = u.fallos + 1 >= 5;
        await bd.patch(ruta, { bloqueado_hasta: bloquea ? Date.now() + 15 * 60e3 : 0, fallos: bloquea ? 0 : u.fallos + 1 });
      }
      await espera(800);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    if (u.fallos || u.bloqueado_hasta) await bd.patch(ruta, { fallos: 0, bloqueado_hasta: 0 });
    res.setHeader('Set-Cookie', crearCookie(u.usuario));
    return res.status(200).json({ ok: true, usuario: u.usuario });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
}
