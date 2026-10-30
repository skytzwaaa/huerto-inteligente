import { bd, claveUsuario, hashClave, igual, espera, cuerpo } from '../_lib.js';

// POST { usuario, clave, codigo }  -> crea una cuenta. El código es la API_KEY.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  try {
    const b = cuerpo(req) || {};
    const usuario = String(b.usuario || '').trim().toLowerCase();
    const clave = String(b.clave || '');
    const codigo = String(b.codigo || '');

    if (!process.env.API_KEY || !igual(codigo, process.env.API_KEY)) {
      await espera(1000);
      return res.status(403).json({ error: 'Código de instalación incorrecto' });
    }
    if (!/^[a-z0-9_.-]{3,30}$/.test(usuario)) {
      return res.status(400).json({ error: 'Usuario: 3 a 30 caracteres (letras, números, . _ -)' });
    }
    if (clave.length < 8 || clave.length > 100) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    const ruta = `usuarios/${claveUsuario(usuario)}`;
    if (await bd.get(ruta)) return res.status(409).json({ error: 'Ese usuario ya existe' });
    await bd.put(ruta, { hash: hashClave(clave), fallos: 0, bloqueado_hasta: 0, creado: Date.now() });
    return res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
}
