#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <RTClib.h>
#include <DHT.h>

// ---------- WiFi y API (Vercel + Neon) ----------
const char* WIFI_SSID = "TU_WIFI";
const char* WIFI_PASS = "TU_CLAVE";
const char* DB_URL    = "https://huerto-inteligente-psi.vercel.app/api";   // sin "/" al final
const char* API_KEY   = "tu-clave-secreta";                      // igual que API_KEY en Vercel

// ---------- Pines ----------
#define PIN_SOIL1   34
#define PIN_SOIL2   35
#define PIN_DHT     4
#define PIN_TRIG    5
#define PIN_ECHO    18
#define PIN_RELAY1  23
#define PIN_SDA     21
#define PIN_SCL     22
#define DHTTYPE DHT22

// ---------- Configuración ----------
const bool RELAY_ACTIVE_LOW = true;
const unsigned long BOMBA_TOPE_MS    = 600000;  // tope de seguridad: 10 min, pase lo que pase
const unsigned long BOMBA_DEF_MS     = 30000;   // si el servidor no responde, riega 30 s
const unsigned long INTERVALO_SUBIDA = 10000;   // sube sensores (y recibe la orden de la bomba) cada 10 s
const unsigned long INTERVALO_REGANDO = 3000;   // mientras riega, cada 3 s para poder detenerla rápido
const unsigned long INTERVALO_HIST   = 300000;  // guarda historial cada 5 min

// Calibración (ajústala con tus sensores)
int SOIL1_SECO = 3200, SOIL1_HUMEDO = 1400;
int SOIL2_SECO = 3200, SOIL2_HUMEDO = 1400;
float TANQUE_VACIO_CM = 20.0, TANQUE_LLENO_CM = 3.0;

DHT dht(PIN_DHT, DHTTYPE);
RTC_DS3231 rtc;

bool bombaOn = false;
unsigned long bombaMaxMs = BOMBA_DEF_MS;   // lo manda la app; el ESP32 es quien apaga
bool rtcOk = false;
bool inicializado = false;
unsigned long bombaInicio = 0, tSubida = 0, tHist = 0;

// ---------- Bomba ----------
void setBomba(bool on) {
  bombaOn = on;
  digitalWrite(PIN_RELAY1, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
  if (on) bombaInicio = millis();
}

// ---------- Nube (Vercel) ----------
// Envía datos a la API y guarda la respuesta del servidor
bool dbEnviarResp(const char* metodo, const String& ruta, const String& cuerpo, String& resp) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  client.setInsecure();                       // prototipo: no valida el certificado
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, String(DB_URL) + ruta)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  int code = http.sendRequest(metodo, cuerpo);
  if (code > 0) resp = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

bool dbEnviar(const char* metodo, const String& ruta, const String& cuerpo) {
  String nada;
  return dbEnviarResp(metodo, ruta, cuerpo, nada);
}

bool dbLeer(const String& ruta, String& salida) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(client, String(DB_URL) + ruta)) return false;
  http.addHeader("x-api-key", API_KEY);
  int code = http.GET();
  if (code == 200) salida = http.getString();
  http.end();
  salida.trim();
  return code == 200;
}

// ---------- Sensores ----------
int leerSuelo(int pin) {
  long suma = 0;
  for (int i = 0; i < 10; i++) { suma += analogRead(pin); delay(5); }
  return suma / 10;
}

int aPorcentaje(int raw, int seco, int humedo) {
  return constrain(map(raw, seco, humedo, 0, 100), 0, 100);
}

float leerDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long dur = pulseIn(PIN_ECHO, HIGH, 30000);
  if (dur == 0) return -1;
  return dur * 0.0343 / 2.0;
}

String numOnull(float v, int dec = 1) { return isnan(v) ? "null" : String(v, dec); }

String armarJson(bool conPump) {
  int s1 = aPorcentaje(leerSuelo(PIN_SOIL1), SOIL1_SECO, SOIL1_HUMEDO);
  int s2 = aPorcentaje(leerSuelo(PIN_SOIL2), SOIL2_SECO, SOIL2_HUMEDO);
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  float dist = leerDistanciaCm();
  int nivel = -1;
  if (dist >= 0) {
    nivel = constrain(map((long)(dist * 10), (long)(TANQUE_VACIO_CM * 10),
                          (long)(TANQUE_LLENO_CM * 10), 0, 100), 0, 100);
  }

  String j = "{";
  j += "\"soil1_pct\":" + String(s1) + ",";
  j += "\"soil2_pct\":" + String(s2) + ",";
  j += "\"temp\":" + numOnull(t) + ",";
  j += "\"hum\":" + numOnull(h) + ",";
  j += "\"tank_pct\":" + (nivel < 0 ? String("null") : String(nivel)) + ",";
  if (conPump) j += "\"pump\":" + String(bombaOn ? 1 : 0) + ",";
  if (j.endsWith(",")) j.remove(j.length() - 1);   // la hora la pone el servidor
  j += "}";
  return j;
}

// ---------- Lógica ----------
// Sube las lecturas y, en la misma respuesta, recibe la orden de la bomba
void subirSensores() {
  String json = armarJson(true), resp;
  bool ok = dbEnviarResp("PATCH", "/sensores", json, resp);
  Serial.println(ok ? "Sensores subidos" : "Error al subir sensores");
  Serial.println(json);
  if (!ok || !inicializado) return;
  // La app manda cuántos segundos debe durar el riego
  int ps = resp.indexOf("\"pump_secs\":");
  if (ps >= 0) {
    long seg = resp.substring(ps + 12).toInt();
    if (seg >= 5 && seg <= 600) bombaMaxMs = (unsigned long)seg * 1000UL;
  }
  bool quiere = resp.indexOf("\"pump_cmd\":true") >= 0;
  if (quiere != bombaOn) {
    setBomba(quiere);
    if (bombaOn) { Serial.print("Bomba ENCENDIDA por "); Serial.print(bombaMaxMs / 1000); Serial.println(" s"); }
    else Serial.println("Bomba APAGADA");
    tSubida = 0;   // vuelve a subir enseguida para que la app vea el cambio
  }
}

void subirHistorial() {
  String json = armarJson(false);
  dbEnviar("POST", "/historial", json);
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando a WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) {
    delay(500); Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi OK" : "\nSin WiFi (reintentará)");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELAY1, OUTPUT);
  setBomba(false);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_SOIL1, ADC_11db);
  analogSetPinAttenuation(PIN_SOIL2, ADC_11db);
  Wire.begin(PIN_SDA, PIN_SCL);
  rtcOk = rtc.begin();
  dht.begin();
  conectarWiFi();
}

void loop() {
  // Reconexión WiFi
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long ultimoIntento = 0;
    if (millis() - ultimoIntento > 15000) {
      ultimoIntento = millis();
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
  }

  // Al arrancar: la orden de la bomba queda en "false"
  if (!inicializado && WiFi.status() == WL_CONNECTED) {
    inicializado = dbEnviar("PUT", "/control/pump_cmd", "false");
  }

  // Seguridad: apaga la bomba al cumplirse el tiempo elegido (o el tope)
  unsigned long tope = bombaMaxMs < BOMBA_TOPE_MS ? bombaMaxMs : BOMBA_TOPE_MS;
  if (bombaOn && millis() - bombaInicio > tope) {
    setBomba(false);
    dbEnviar("PUT", "/control/pump_cmd", "false");
    dbEnviar("PATCH", "/sensores", "{\"pump\":0}");
    Serial.println("Bomba apagada por tiempo máximo");
  }

  unsigned long intervalo = bombaOn ? INTERVALO_REGANDO : INTERVALO_SUBIDA;
  if (tSubida == 0 || millis() - tSubida >= intervalo) {
    tSubida = millis();
    subirSensores();
  }

  if (millis() - tHist >= INTERVALO_HIST) {
    tHist = millis();
    subirHistorial();
  }
}