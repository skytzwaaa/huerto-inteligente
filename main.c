/*
 * main.c — Motor de decisión del Huerto Inteligente
 * ------------------------------------------------------------------
 * Es la misma lógica que corre el ESP32 del prototipo:
 *   1. Convierte la lectura cruda del sensor capacitivo en % de humedad.
 *   2. Riega solo si la humedad baja del umbral, con límites de seguridad
 *      (tiempo máximo de riego y pausa obligatoria entre riegos).
 *   3. El pulverizador NUNCA actúa solo: espera la autorización del
 *      usuario y se bloquea si el depósito está casi vacío.
 *
 * El archivo se compila de dos formas:
 *   - A WebAssembly, para que la página web lo ejecute en el navegador:
 *       clang --target=wasm32 -O3 -nostdlib -ffreestanding \
 *             -Wl,--no-entry -o main.wasm main.c
 *   - Como programa de terminal (simulación y prueba de rendimiento):
 *       gcc -O2 -o huerto main.c
 *       ./huerto              (simula 90 segundos del huerto)
 *       ./huerto --bench 5000000
 *
 * La versión WebAssembly no usa la biblioteca estándar de C, por eso
 * todo el motor está escrito solo con enteros, floats y structs.
 */

/* Macro para exportar funciones a JavaScript según el compilador */
#if defined(__EMSCRIPTEN__)
  #include <emscripten.h>
  #define EXPORT(nombre) EMSCRIPTEN_KEEPALIVE
#elif defined(__wasm__)
  #define EXPORT(nombre) __attribute__((export_name(nombre)))
#else
  #define EXPORT(nombre)
#endif

/* ================================================================
 * 1. Configuración (mismos valores que el código del prototipo)
 * ================================================================ */
typedef struct {
    int seco;          /* lectura cruda con el sensor al aire      -> 0 %   */
    int mojado;        /* lectura cruda en tierra empapada         -> 100 % */
    int umbral_riego;  /* empieza a regar si la humedad baja de este %      */
    int umbral_parar;  /* deja de regar al llegar a este %                  */
    int max_riego_ms;  /* límite de seguridad: riego continuo máximo        */
    int espera_ms;     /* pausa obligatoria entre dos riegos                */
    int pulveriza_ms;  /* duración de una pulverización autorizada          */
    int nivel_minimo;  /* % de depósito por debajo del cual se bloquea      */
} Config;

static Config cfg = { 2498, 1000, 35, 60, 5000, 20000, 3000, 10 };

/* ================================================================
 * 2. Estado del controlador
 * ================================================================ */
typedef struct {
    int regando;          /* 1 si la bomba de riego está encendida       */
    int inicio_riego;     /* ms en que empezó el riego actual            */
    int fin_riego;        /* ms en que terminó el último riego           */
    int plaga_pendiente;  /* 1 si hay una plaga esperando autorización   */
    int pulverizando;     /* 1 si la bomba del pulverizador está activa  */
    int inicio_pulv;      /* ms en que empezó la pulverización           */
    int nivel_deposito;   /* % de líquido en el depósito                 */
    int humedad;          /* última humedad calculada (%)                */
} Estado;

static Estado st = { 0, 0, -1000000, 0, 0, 0, 80, 0 };

/* ================================================================
 * 3. Cola de eventos: la interfaz la lee para mostrar el registro
 * ================================================================ */
enum {
    EV_NINGUNO = 0,
    EV_RIEGO_INICIO,      /* 1: empezó un riego                         */
    EV_RIEGO_FIN,         /* 2: terminó porque llegó a la humedad meta  */
    EV_RIEGO_LIMITE,      /* 3: se cortó por el tiempo máximo           */
    EV_PLAGA,             /* 4: plaga detectada, espera autorización    */
    EV_PULV_INICIO,       /* 5: el usuario autorizó y empezó a pulverizar */
    EV_PULV_FIN,          /* 6: terminó la pulverización                */
    EV_BLOQUEO_DEPOSITO,  /* 7: autorización rechazada, depósito vacío  */
    EV_SIN_PLAGA,         /* 8: autorización ignorada, no había plaga   */
    EV_DESCARTADA         /* 9: el usuario descartó el aviso de plaga   */
};

#define COLA 32
static int cola_ev[COLA];
static int cola_t[COLA];
static int c_ini = 0, c_fin = 0;
static int ultimo_t = 0;

static void emitir(int ev, int t) {
    int sig = (c_fin + 1) % COLA;
    if (sig == c_ini) c_ini = (c_ini + 1) % COLA;  /* cola llena: descarta el más viejo */
    cola_ev[c_fin] = ev;
    cola_t[c_fin] = t;
    c_fin = sig;
}

static int limitar(int v, int a, int b) { return v < a ? a : (v > b ? b : v); }

/* ================================================================
 * 4. Lógica de decisión
 * ================================================================ */

/* Igual que map() + constrain() en Arduino: lectura cruda -> % */
EXPORT("hi_humedad")
int hi_humedad(int crudo) {
    int rango = cfg.mojado - cfg.seco;
    if (rango == 0) return 0;
    return limitar((crudo - cfg.seco) * 100 / rango, 0, 100);
}

/* Núcleo del riego. Devuelve el estado como bits:
 * bit 0 = bomba de riego, bit 1 = pulverizador, bit 2 = plaga pendiente */
static int decidir(Estado *e, int crudo, int ahora, int con_eventos) {
    int h = hi_humedad(crudo);
    e->humedad = h;

    /* Riego autónomo con histéresis: empieza bajo un umbral, para sobre otro */
    if (!e->regando) {
        if (h < cfg.umbral_riego && ahora - e->fin_riego >= cfg.espera_ms) {
            e->regando = 1;
            e->inicio_riego = ahora;
            if (con_eventos) emitir(EV_RIEGO_INICIO, ahora);
        }
    } else if (h >= cfg.umbral_parar) {
        e->regando = 0;
        e->fin_riego = ahora;
        if (con_eventos) emitir(EV_RIEGO_FIN, ahora);
    } else if (ahora - e->inicio_riego >= cfg.max_riego_ms) {
        /* Límite de seguridad: nunca riega más de max_riego_ms seguidos */
        e->regando = 0;
        e->fin_riego = ahora;
        if (con_eventos) emitir(EV_RIEGO_LIMITE, ahora);
    }

    /* El pulverizador solo se apaga por tiempo; encenderlo exige autorización */
    if (e->pulverizando && ahora - e->inicio_pulv >= cfg.pulveriza_ms) {
        e->pulverizando = 0;
        if (con_eventos) emitir(EV_PULV_FIN, ahora);
    }
    return e->regando | (e->pulverizando << 1) | (e->plaga_pendiente << 2);
}

/* Un ciclo del controlador real: se llama cada 100 ms desde la web */
EXPORT("hi_paso")
int hi_paso(int crudo, int ahora) { return decidir(&st, crudo, ahora, 1); }

/* La cámara (IA) reporta una posible plaga: queda esperando al usuario */
EXPORT("hi_reportar_plaga")
void hi_reportar_plaga(int ahora) {
    if (!st.plaga_pendiente) {
        st.plaga_pendiente = 1;
        emitir(EV_PLAGA, ahora);
    }
}

/* El usuario toca "Autorizar pulverizador" en la app. Devuelve 1 si se aceptó */
EXPORT("hi_autorizar")
int hi_autorizar(int ahora) {
    if (!st.plaga_pendiente) { emitir(EV_SIN_PLAGA, ahora); return 0; }
    if (st.nivel_deposito < cfg.nivel_minimo) { emitir(EV_BLOQUEO_DEPOSITO, ahora); return 0; }
    st.plaga_pendiente = 0;
    st.pulverizando = 1;
    st.inicio_pulv = ahora;
    emitir(EV_PULV_INICIO, ahora);
    return 1;
}

/* El usuario revisa la foto y decide que no hace falta tratar */
EXPORT("hi_descartar")
void hi_descartar(int ahora) {
    if (st.plaga_pendiente) { st.plaga_pendiente = 0; emitir(EV_DESCARTADA, ahora); }
}

EXPORT("hi_nivel_deposito")
void hi_nivel_deposito(int porcentaje) { st.nivel_deposito = limitar(porcentaje, 0, 100); }

/* Cambia los umbrales desde la interfaz (con valores siempre válidos) */
EXPORT("hi_umbrales")
void hi_umbrales(int riego, int parar, int max_riego_ms) {
    cfg.umbral_riego = limitar(riego, 5, 90);
    cfg.umbral_parar = limitar(parar, cfg.umbral_riego + 5, 100);
    cfg.max_riego_ms = limitar(max_riego_ms, 1000, 30000);
}

/* Saca el siguiente evento de la cola (0 si no hay). Su tiempo queda en hi_evento_t() */
EXPORT("hi_evento")
int hi_evento(void) {
    if (c_ini == c_fin) return EV_NINGUNO;
    int ev = cola_ev[c_ini];
    ultimo_t = cola_t[c_ini];
    c_ini = (c_ini + 1) % COLA;
    return ev;
}

EXPORT("hi_evento_t")
int hi_evento_t(void) { return ultimo_t; }

EXPORT("hi_humedad_calc")
int hi_humedad_calc(void) { return st.humedad; }

/* ================================================================
 * 5. Simulador del suelo (solo para la demo web y la terminal)
 *    En el huerto real este dato viene del sensor capacitivo.
 * ================================================================ */
static float suelo = 42.0f;          /* humedad real simulada (%) */
static unsigned semilla = 20261121u; /* fecha de la feria como semilla */

static unsigned azar(unsigned *s) {   /* generador congruencial lineal */
    *s = *s * 1664525u + 1013904223u;
    return *s >> 8;
}

/* Avanza el suelo dt_ms. sol: 0-100 (evaporación). bomba: 0/1.
 * Devuelve la lectura cruda que daría el sensor, con ruido de ±8 */
EXPORT("hi_simular")
int hi_simular(int dt_ms, int sol, int bomba) {
    float dt = (float)dt_ms / 1000.0f;
    suelo -= (0.25f + (float)sol * 0.03f) * dt;  /* evaporación */
    if (bomba) suelo += 7.0f * dt;               /* caudal de la bomba de riego */
    if (suelo < 0.0f) suelo = 0.0f;
    if (suelo > 100.0f) suelo = 100.0f;
    float crudo = (float)cfg.seco + (float)(cfg.mojado - cfg.seco) * suelo / 100.0f;
    int ruido = (int)(azar(&semilla) % 17u) - 8;
    return (int)crudo + ruido;
}

/* Humedad real del suelo simulado, multiplicada por 10 (un decimal) */
EXPORT("hi_suelo_x10")
int hi_suelo_x10(void) { return (int)(suelo * 10.0f); }

/* Agrega agua de golpe (botón "Lluvia" de la demo) */
EXPORT("hi_lluvia")
void hi_lluvia(int puntos) {
    suelo += (float)puntos;
    if (suelo > 100.0f) suelo = 100.0f;
}

/* ================================================================
 * 6. Prueba de rendimiento: n decisiones completas sobre lecturas
 *    sintéticas, sin tocar el estado real. Devuelve cuántas veces
 *    quedó encendida la bomba (así el compilador no la elimina).
 * ================================================================ */
EXPORT("hi_bench")
int hi_bench(int n) {
    Estado e = { 0, 0, -1000000, 0, 0, 0, 80, 0 };
    unsigned s = 7u;
    int encendida = 0;
    for (int i = 0; i < n; i++) {
        int crudo = cfg.mojado + (int)(azar(&s) % (unsigned)(cfg.seco - cfg.mojado + 1));
        encendida += decidir(&e, crudo, i * 10, 0) & 1;
    }
    return encendida;
}

/* ================================================================
 * 7. Programa de terminal (no se incluye en WebAssembly)
 * ================================================================ */
#ifndef __wasm__
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const char *nombre_evento(int ev) {
    switch (ev) {
        case EV_RIEGO_INICIO:     return "Riego iniciado";
        case EV_RIEGO_FIN:        return "Riego terminado: humedad alcanzada";
        case EV_RIEGO_LIMITE:     return "Riego cortado por tiempo máximo";
        case EV_PLAGA:            return "Plaga detectada: esperando autorización";
        case EV_PULV_INICIO:      return "Pulverización autorizada e iniciada";
        case EV_PULV_FIN:         return "Pulverización terminada";
        case EV_BLOQUEO_DEPOSITO: return "Bloqueado: depósito casi vacío";
        case EV_SIN_PLAGA:        return "Autorización ignorada: no hay plaga";
        case EV_DESCARTADA:       return "Aviso de plaga descartado";
        default:                  return "?";
    }
}

int main(int argc, char **argv) {
    if (argc > 2 && strcmp(argv[1], "--bench") == 0) {
        int n = atoi(argv[2]);
        clock_t t0 = clock();
        int on = hi_bench(n);
        double s = (double)(clock() - t0) / CLOCKS_PER_SEC;
        printf("%d decisiones en %.3f s  (%.1f millones por segundo)  bomba encendida %d veces\n",
               n, s, s > 0 ? n / s / 1e6 : 0.0, on);
        return 0;
    }

    printf("Simulación de 90 s del Huerto Inteligente (sol = 50 %%)\n");
    printf("  t(s)  suelo%%  crudo  humedad%%  bomba\n");
    int bomba = 0;
    for (int t = 0; t <= 90000; t += 100) {
        int crudo = hi_simular(100, 50, bomba);
        if (t == 40000) hi_reportar_plaga(t);
        if (t == 45000) hi_autorizar(t);
        int estado = hi_paso(crudo, t);
        bomba = estado & 1;
        if (t % 5000 == 0)
            printf("  %4d  %5.1f   %4d   %5d     %s\n", t / 1000, hi_suelo_x10() / 10.0,
                   crudo, hi_humedad_calc(), bomba ? "ON" : "off");
        int ev;
        while ((ev = hi_evento()) != EV_NINGUNO)
            printf("        [%5.1f s] %s\n", hi_evento_t() / 1000.0, nombre_evento(ev));
    }
    return 0;
}
#endif
