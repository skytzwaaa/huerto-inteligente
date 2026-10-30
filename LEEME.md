# Huerto Inteligente · Neon + Vercel

ESP32 / App web  →  API en Vercel (carpeta api/)  →  Neon (Postgres)

## Pasos
1. Neon: abre el SQL Editor y ejecuta schema.sql (una vez).
2. Vercel: sube esta carpeta como proyecto nuevo.
   Variables de entorno:
     DATABASE_URL = cadena de conexión de Neon (con ?sslmode=require)
     API_KEY      = una clave inventada por ti (ej. huerto-2026-xyz)
3. Arduino: abre arduino/huerto_neon/huerto_neon.ino y cambia
     WIFI_SSID, WIFI_PASS, DB_URL (https://TU-PROYECTO.vercel.app/api) y API_KEY.
4. App: abre https://TU-PROYECTO.vercel.app, pon la API_KEY en ⚙ y listo.
