import crypto from 'node:crypto';

// ---------- Firebase Realtime Database (por REST, sin librerías) ----------
// Variables de Vercel:
//   FIREBASE_DB_URL           ej. https://mi-proyecto-default-rtdb.firebaseio.com
//   FIREBASE_SERVICE_ACCOUNT  el JSON completo de la cuenta de servicio
const DB_URL = String(process.env.FIREBASE_DB_URL || '').replace(/\/+$/, '');
let tokenCache = { t: null, exp: 0 };

async function token() {
  if (process.env.RTDB_LOCAL) return null;               // pruebas locales
  if (tokenCache.t && Date.now() < tokenCache.exp - 60000) return tokenCache.t;
  const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!cred.client_email || !cred.private_key) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64({ alg: 'RS256', typ: 'JWT' });
  const cla = b64({
    iss: cred.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600
  });
  const firma = crypto.createSign('RSA-SHA256').update(`${cab}.${cla}`).sign(cred.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cab}.${cla}.${firma}` })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Firebase: no se pudo obtener acceso');
  tokenCache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.t;
}

async function rtdb(metodo, ruta, cuerpoJson, consulta = {}) {
  if (!DB_URL) throw new Error('Falta FIREBASE_DB_URL');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) q.set(k, typeof v === 'string' && k !== 'limitToLast' && k !== 'limitToFirst' ? JSON.stringify(v) : String(v));
  const t = await token();
  const r = await fetch(`${DB_URL}/${ruta}.json${q.toString() ? '?' + q : ''}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: cuerpoJson === undefined ? undefined : JSON.stringify(cuerpoJson)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Firebase ${r.status}: ${txt.slice(0, 120)}`);
  return txt ? JSON.parse(txt) : null;
}
export const bd = {
  get: (ruta, consulta) => rtdb('GET', ruta, undefined, consulta),
  put: (ruta, v) => rtdb('PUT', ruta, v),
  patch: (ruta, v) => rtdb('PATCH', ruta, v),
  del: ruta => rtdb('DELETE', ruta),
  // devuelve [[clave, valor], ...] ordenado por clave
  async lista(ruta, consulta) {
    const o = await rtdb('GET', ruta, undefined, { orderBy: '$key', ...consulta });
    return o ? Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) : [];
  }
};
// claves: "." no se permite en Firebase; los usuarios no pueden llevar "," así que es seguro
export const claveUsuario = u => String(u).replace(/\./g, ',');
// claves numéricas de ancho fijo (orden cronológico)
export const clave13 = ms => String(ms).padStart(13, '0');

// ---------- utilidades ----------
export const n = v => (v === null || v === undefined ? null : Number(v));

// El cuerpo puede llegar ya parseado (objeto/booleano) o como texto
export function cuerpo(req) {
  const b = req.body;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return b; } }
  return b;
}

export function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const espera = ms => new Promise(r => setTimeout(r, ms));

// ---------- usuarios ----------
export function hashClave(clave) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(clave, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function checkClave(clave, guardado) {
  const [tipo, s, h] = String(guardado).split('$');
  if (tipo !== 'scrypt' || !s || !h) return false;
  const calc = crypto.scryptSync(clave, Buffer.from(s, 'hex'), 64);
  const esp = Buffer.from(h, 'hex');
  return calc.length === esp.length && crypto.timingSafeEqual(calc, esp);
}

// ---------- sesión (cookie firmada) ----------
const SEMANA = 7 * 24 * 3600;
const secreto = () => crypto.createHmac('sha256', process.env.API_KEY || '').update('huerto-sesion-v1').digest();
const firmar = b => crypto.createHmac('sha256', secreto()).update(b).digest('base64url');

export function crearCookie(usuario) {
  const b = Buffer.from(JSON.stringify({ u: usuario, exp: Date.now() + SEMANA * 1000 })).toString('base64url');
  return `sesion=${b}.${firmar(b)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SEMANA}`;
}
export const borrarCookie = 'sesion=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}

export function usuarioActual(req) {
  if (!process.env.API_KEY) return null;
  const t = leerCookie(req, 'sesion');
  if (!t) return null;
  const [b, f] = t.split('.');
  if (!b || !f || !igual(f, firmar(b))) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp > Date.now() ? p.u : null;
  } catch { return null; }
}

// Acepta al ESP32 (x-api-key) o a una persona con sesión iniciada
export function auth(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = req.headers['x-api-key'];
  if (process.env.API_KEY && key && igual(key, process.env.API_KEY)) return true;
  if (usuarioActual(req)) {
    // contra CSRF: las escrituras con cookie deben ser JSON (un formulario ajeno no puede)
    const escribe = req.method !== 'GET' && req.method !== 'HEAD';
    if (escribe && !String(req.headers['content-type'] || '').includes('application/json')) {
      res.status(400).json({ error: 'solicitud no válida' });
      return false;
    }
    return true;
  }
  res.status(401).json({ error: 'no autorizado' });
  return false;
}
