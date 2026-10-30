import { bd, auth, cuerpo, usuarioActual } from './_lib.js';
import { nuevaAlerta } from './_extra.js';

// Asistente con IA (opcional). Si en Vercel existe GEMINI_API_KEY responde con Gemini;
// si no, la app usa su asistente local.
// GET  -> { ia: true/false }
// POST { mensaje, contexto, chat }  -> { texto }
// POST { accion: 'analizar' }       -> revisa la última foto buscando plagas

const SISTEMA = `Eres "Brote", el asistente del Huerto Inteligente: un huerto casero en Lima (Perú) con un ESP32
que mide humedad del suelo en 2 zonas (sensores capacitivos, %), temperatura y humedad del aire (DHT22),
nivel del tanque (sensor ultrasónico HC-SR04) y controla una bomba de agua con un relé. El usuario elige cuánto dura el riego (5 s a 3 min) con el deslizador "Duración del riego" en Inicio, y el propio ESP32 apaga la bomba al cumplirse ese tiempo; el valor exacto está en el contexto como riegoTxt.
Hay una cámara ESP32-CAM opcional para detectar plagas. La app tiene: Inicio, Gráficos (en vivo y por día + historial),
Cámara, Avisos y Guía.
Reglas: responde en español claro y cercano, tuteando, en 2 a 6 frases o una lista corta. Usa los datos del
CONTEXTO cuando pregunten por el huerto; si un valor es null significa que ese sensor no está dando lectura
(sugiere revisar cableado). Rangos orientativos: suelo 45-80 % ideal, <25 % seco; temperatura 18-30 °C;
humedad del aire 40-80 %; tanque <20 % bajo. Para plagas da remedios caseros/ecológicos primero (jabón potásico,
aceite de neem, trampas amarillas, retirar a mano) y cuándo ir a un especialista. No inventes datos que no estén
en el contexto. Usa **negritas** para lo importante. No puedes encender la bomba tú: si te lo piden, di que
pulsen "Regar ahora" en Inicio.`;

async function gemini(contents, sistema, json = false) {
  const modelo = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const cfg = { temperature: 0.5, maxOutputTokens: 900 };
  if (/2\.5/.test(modelo)) cfg.thinkingConfig = { thinkingBudget: 0 };
  if (json) cfg.responseMimeType = 'application/json';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents, generationConfig: cfg })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || ('IA ' + r.status));
  return ((d.candidates?.[0]?.content?.parts) || []).map(p => p.text || '').join('').trim();
}

export default async function handler(req, res) {
  if (!auth(req, res)) return;
  const ia = !!process.env.GEMINI_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ ia });
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!ia) return res.status(501).json({ error: 'IA no configurada' });
  if (!usuarioActual(req)) return res.status(403).json({ error: 'solo para personas con sesión' });

  try {
    const b = cuerpo(req) || {};
    if (b.accion === 'analizar') {
      const f = await bd.get('camara');
      if (!f || !f.img) return res.status(404).json({ error: 'todavía no hay fotos de la cámara' });
      const txt = await gemini([{ role: 'user', parts: [
        { inline_data: { mime_type: 'image/jpeg', data: f.img } },
        { text: 'Analiza esta foto de un huerto. Responde SOLO un JSON: {"plaga": true|false, "tipo": "nombre de la plaga o problema o vacío", "confianza": 0-100, "descripcion": "qué ves en 1 frase", "consejo": "qué hacer en 1-2 frases"}. Si la foto no muestra plantas o no se ve bien, plaga=false y explícalo en descripcion.' }
      ] }], SISTEMA, true);
      let r; try { r = JSON.parse(txt.replace(/^```json|```$/g, '')); } catch { r = { plaga: false, descripcion: txt.slice(0, 300) }; }
      if (r.plaga && Number(r.confianza || 0) >= 50) {
        await nuevaAlerta('plaga', 'peligro', `Posible plaga: ${String(r.tipo || 'sin identificar').slice(0, 60)}`,
          `${r.descripcion || ''} ${r.consejo || ''}`.trim().slice(0, 480));
      }
      return res.status(200).json(r);
    }

    const mensaje = String(b.mensaje || '').slice(0, 800);
    if (!mensaje) return res.status(400).json({ error: 'mensaje vacío' });
    const chat = Array.isArray(b.chat) ? b.chat.slice(-8) : [];
    const contents = chat.map(m => ({ role: m.de === 'bot' ? 'model' : 'user', parts: [{ text: String(m.texto || '').slice(0, 800) }] }));
    contents.push({ role: 'user', parts: [{ text: `CONTEXTO (datos en vivo): ${JSON.stringify(b.contexto || {}).slice(0, 3000)}\n\nPREGUNTA: ${mensaje}` }] });
    const texto = await gemini(contents, SISTEMA);
    return res.status(200).json({ texto: texto || 'No tengo una respuesta para eso ahora mismo.' });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
