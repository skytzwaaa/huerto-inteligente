import { bd, auth, cuerpo, usuarioActual } from '../_lib.js';
import { nuevaAlerta } from '../_extra.js';

export const SECS_POR_DEFECTO = 30, SECS_MIN = 5, SECS_MAX = 600;
const limpiarSecs = v => Math.max(SECS_MIN, Math.min(SECS_MAX, Math.round(Number(v)) || SECS_POR_DEFECTO));

// GET          -> true / false (lo lee el ESP32)
// GET ?info=1  -> { pump_cmd, segundos }  (lo lee la app al abrirse)
// PUT          -> { pump_cmd } enciende o apaga, { segundos } cambia la duración (o ambos)
export default async function handler(req, res) {
  if (!auth(req, res)) return;
  try {
    if (req.method === 'GET') {
      if (req.query.info) {
        const c = (await bd.get('control')) || {};
        return res.status(200).json({ pump_cmd: c.pump_cmd === true, segundos: limpiarSecs(c.pump_secs) });
      }
      return res.status(200).json((await bd.get('control/pump_cmd')) === true);
    }
    if (req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH') {
      let b = cuerpo(req), segundos;
      if (b && typeof b === 'object') { segundos = b.segundos; b = b.pump_cmd; }

      if (segundos !== undefined && segundos !== null) {
        segundos = limpiarSecs(segundos);
        await bd.put('control/pump_secs', segundos);
        // cambiar solo la duración no toca la bomba
        if (b === undefined) return res.status(200).json({ ok: true, segundos });
      }

      const quiere = b === true || b === 'true' || b === 1;
      await bd.put('control/pump_cmd', quiere);
      const quien = req.headers['x-api-key'] ? null : usuarioActual(req);
      if (quien) {   // deja constancia de los riegos pedidos desde la app
        const cuanto = segundos || limpiarSecs(await bd.get('control/pump_secs'));
        try {
          await nuevaAlerta('riego', 'info', quiere ? 'Riego iniciado' : 'Riego detenido',
            quiere ? `Desde la app por ${quien}. Se apagará sola a los ${cuanto} s.` : `Desde la app por ${quien}.`);
        } catch (e) {}
      }
      return res.status(200).json(quiere);
    }
    res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
