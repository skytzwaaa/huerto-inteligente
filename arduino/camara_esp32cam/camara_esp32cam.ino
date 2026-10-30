/*  Huerto Inteligente — Cámara ESP32-CAM (AI Thinker)
    Toma una foto cada INTERVALO_FOTO y la sube a la app.
    La app la muestra sola en la sección "Cámara". No hay que cambiar nada en la app.

    En Arduino IDE:
      - Placa: "AI Thinker ESP32-CAM"
      - PSRAM: Enabled (si aparece la opción)
      - Para subir: conecta GPIO0 a GND, pulsa RESET, sube el código,
        quita el puente GPIO0-GND y pulsa RESET otra vez.
*/
#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ---------- Rellena esto ----------
const char* WIFI_SSID = "TU_WIFI";          // red de 2.4 GHz
const char* WIFI_PASS = "TU_CLAVE";
const char* API_URL   = "https://huerto-inteligente-psi.vercel.app/api/camara";
const char* API_KEY   = "tu-clave-secreta";  // la misma API_KEY del huerto
const unsigned long INTERVALO_FOTO = 15000;  // una foto cada 15 s

// ---------- Pines de la AI Thinker (no cambiar) ----------
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define FLASH_LED_PIN      4

unsigned long tFoto = 0;

bool iniciarCamara() {
  camera_config_t c;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer   = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM; c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.grab_mode = CAMERA_GRAB_LATEST;
  if (psramFound()) {
    c.frame_size = FRAMESIZE_VGA;    // 640x480: buena calidad y pesa ~30-60 KB
    c.jpeg_quality = 12;             // 10 = mejor calidad, 20 = más liviana
    c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    c.frame_size = FRAMESIZE_QVGA;
    c.jpeg_quality = 15;
    c.fb_count = 1;
    c.fb_location = CAMERA_FB_IN_DRAM;
  }
  return esp_camera_init(&c) == ESP_OK;
}

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Conectando a WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " WiFi OK" : " sin WiFi (reintentará)");
}

void subirFoto() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { Serial.println("No se pudo tomar la foto"); return; }
  WiFiClientSecure cliente;
  cliente.setInsecure();               // prototipo: no valida el certificado
  HTTPClient http;
  http.setTimeout(15000);
  if (http.begin(cliente, API_URL)) {
    http.addHeader("Content-Type", "image/jpeg");
    http.addHeader("x-api-key", API_KEY);
    int code = http.POST(fb->buf, fb->len);
    if (code == 200) Serial.printf("Foto subida (%u bytes)\n", fb->len);
    else Serial.printf("Error al subir la foto: %d %s\n", code, http.getString().c_str());
    http.end();
  }
  esp_camera_fb_return(fb);
}

void setup() {
  Serial.begin(115200);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);    // flash apagado
  if (!iniciarCamara()) {
    Serial.println("Cámara no encontrada: revisa el cable plano de la cámara y reinicia.");
    delay(5000); ESP.restart();
  }
  Serial.println("Cámara lista");
  conectarWiFi();
}

void loop() {
  conectarWiFi();
  if (WiFi.status() == WL_CONNECTED && millis() - tFoto >= INTERVALO_FOTO) {
    tFoto = millis();
    subirFoto();
  }
  delay(50);
}

/*  Opcional — avisar una plaga desde otro programa o modelo de IA:
    POST https://huerto-inteligente-psi.vercel.app/api/alertas
    Cabeceras: Content-Type: application/json, x-api-key: TU_API_KEY
    Cuerpo:    {"tipo":"plaga","titulo":"Posible pulgón","detalle":"Zona 1"}
    La app mostrará la alerta roja con sonido y notificación.
*/
