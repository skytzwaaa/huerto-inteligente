/*
 * main.c — Motor de decisión del Huerto Inteligente
 * ------------------------------------------------------------------
 * Es la lógica de control del huerto:
 *   1. Convierte la lectura cruda del sensor capacitivo de suelo en %
 *      de humedad.
 *   2. Riega solo si la humedad de la tierra baja del umbral, con
 *      límites de seguridad (tiempo máximo de riego y pausa entre
 *      riegos).
 *   3. La cámara con IA vigila las hojas: si "ve" una plaga con
 *      suficiente confianza, avisa y espera la decisión del usuario.
 *      El pulverizador NUNCA actúa solo: exige su autorización y se
 *      bloquea si el depósito está casi vacío.
 *   4. Si el depósito se acaba, se abre la válvula de llenado y se
 *      llena solo hasta el 100 %.
 *
 * El archivo se compila de dos formas:
 *   - A WebAssembly, para que la página web lo ejecute en el navegador:
 *       clang --target=wasm32 -O3 -nostdlib -ffreestanding \
 *             -Wl,--no-entry -o main.wasm main.c
 *   - Como programa de terminal (simulación y prueba de rendimiento):
 *       gcc -O2 -o huerto main.c
 *       ./huerto              (simula 120 segundos del huerto)
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
 * 1. Configuración
 * ================================================================ */
typedef struct {
    int seco;            /* lectura cruda con el sensor al aire      -> 0 %   */
    int mojado;          /* lectura cruda en tierra empapada         -> 100 % */
    int umbral_riego;    /* empieza a regar si la humedad baja de este %      */
    int umbral_parar;    /* deja de regar al llegar a este %                  */
    int max_riego_ms;    /* límite de seguridad: riego continuo máximo        */
    int espera_ms;       /* pausa obligatoria entre dos riegos                */
    int pulveriza_ms;    /* duración de una pulverización autorizada          */
    int nivel_minimo;    /* % de depósito: bajo este valor se llena solo      */
    int camara_umbral;   /* % de confianza de la IA para avisar de una plaga  */
    int espera_aviso_ms; /* pausa antes de volver a avisar de la misma plaga  */
} Config;

static Config cfg = { 2498, 1000, 35, 60, 5000, 20000, 3000, 10, 40, 30000 };

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
    int humedad;          /* última humedad del suelo (%)                */
    int llenando;         /* 1 si la válvula de llenado está abierta     */
    int ultimo_aviso;     /* ms del último aviso de plaga y de la última decisión */
} Estado;

static Estado st = { 0, 0, -1000000, 0, 0, 0, 80, 0, 0, -1000000 };

/* Lo que ve la cámara. La infestación real (plaga) la pone el
 * simulador; la IA la va reconociendo poco a poco (confianza). */
static float plaga = 0.0f;      /* infestación real en las hojas (0-100) */
static float confianza = 0.0f;  /* confianza de la IA de que hay plaga (0-100) */

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
    EV_DESCARTADA,        /* 9: el usuario descartó el aviso de plaga   */
    EV_LLENADO_INICIO,    /* 10: depósito casi vacío, se abre la válvula */
    EV_LLENADO_FIN        /* 11: depósito lleno, se cierra la válvula   */
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

/* Núcleo del controlador. Devuelve el estado como bits:
 * bit 0 = bomba de riego, bit 1 = pulverizador, bit 2 = plaga pendiente,
 * bit 3 = válvula de llenado del depósito abierta */
static int decidir(Estado *e, int crudo, int ahora, int con_eventos) {
    int h = hi_humedad(crudo);
    e->humedad = h;

    if (!e->regando) {
        /* Riego autónomo con histéresis: empieza bajo un umbral, para sobre otro */
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
    /* sigue pulverizando hasta que la cámara ya no ve plaga (tope: 20 s) */
    if (e->pulverizando && ahora - e->inicio_pulv >= cfg.pulveriza_ms &&
        (plaga <= 0.0f || ahora - e->inicio_pulv >= 20000)) {
        e->pulverizando = 0;
        if (con_eventos) emitir(EV_PULV_FIN, ahora);
    }

    /* Llenado automático: la válvula se abre bajo el nivel mínimo y se cierra al llegar a 100 % */
    if (!e->llenando) {
        if (e->nivel_deposito < cfg.nivel_minimo) {
            e->llenando = 1;
            if (con_eventos) emitir(EV_LLENADO_INICIO, ahora);
        }
    } else if (e->nivel_deposito >= 100) {
        e->llenando = 0;
        if (con_eventos) emitir(EV_LLENADO_FIN, ahora);
    }

    /* Cámara con IA: si ve una plaga con suficiente confianza, avisa y espera al usuario.
     * No vuelve a avisar mientras hay un aviso abierto, se pulveriza o no pasó la pausa. */
    if (con_eventos && !e->plaga_pendiente && !e->pulverizando &&
        confianza >= (float)cfg.camara_umbral && ahora - e->ultimo_aviso >= cfg.espera_aviso_ms) {
        e->plaga_pendiente = 1;
        e->ultimo_aviso = ahora;
        emitir(EV_PLAGA, ahora);
    }

    return e->regando | (e->pulverizando << 1) | (e->plaga_pendiente << 2) | (e->llenando << 3);
}

/* Un ciclo del controlador real: se llama cada 100 ms desde la web */
EXPORT("hi_paso")
int hi_paso(int crudo, int ahora) { return decidir(&st, crudo, ahora, 1); }

/* Aviso directo de plaga (sin pasar por la cámara): queda esperando al usuario */
EXPORT("hi_reportar_plaga")
void hi_reportar_plaga(int ahora) {
    if (!st.plaga_pendiente) {
        st.plaga_pendiente = 1;
        st.ultimo_aviso = ahora;
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
    st.ultimo_aviso = ahora;
    emitir(EV_PULV_INICIO, ahora);
    return 1;
}

/* El usuario revisa la foto y decide que no hace falta tratar */
EXPORT("hi_descartar")
void hi_descartar(int ahora) {
    if (st.plaga_pendiente) {
        st.plaga_pendiente = 0;
        st.ultimo_aviso = ahora;
        emitir(EV_DESCARTADA, ahora);
    }
}

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
 * 5. Simulador del huerto (solo para la demo web y la terminal)
 *    En el huerto real estos datos vienen de los sensores: un
 *    capacitivo de suelo, un DHT22 (temperatura y humedad del aire),
 *    un ultrasónico que mide el nivel del depósito y la cámara.
 * ================================================================ */
#define TANQUE_VACIO_CM 20.0f   /* distancia del sensor al agua con el depósito vacío */
#define TANQUE_LLENO_CM  3.0f   /* distancia con el depósito lleno */
#define LLENADO_PCT_S    2.0f   /* cuánto sube el depósito por segundo con la válvula abierta */

static float suelo = 42.0f;          /* humedad real simulada del suelo (%) */
static float tanque = 80.0f;         /* nivel real del depósito (%), con decimales */
static float temp_c = 21.0f;         /* temperatura real del aire (°C) */
static float aire = 70.0f;           /* humedad real del aire (%) */
static int temp_x10_ult = 210;       /* lo que mide el DHT22, con ruido (°C x10) */
static int aire_ult = 70;            /* lo que mide el DHT22, con ruido (%) */
static unsigned semilla = 20261121u; /* fecha de la feria como semilla */

static unsigned azar(unsigned *s) {   /* generador congruencial lineal */
    *s = *s * 1664525u + 1013904223u;
    return *s >> 8;
}

/* Avanza el huerto dt_ms. sol: 0-100 (evaporación). bomba: 0/1.
 * Devuelve la lectura cruda del sensor de suelo (±8 de ruido). */
EXPORT("hi_simular")
int hi_simular(int dt_ms, int sol, int bomba) {
    float dt = (float)dt_ms / 1000.0f;

    /* La bomba solo moja si el depósito tiene agua */
    int agua = bomba && tanque > 0.0f;

    suelo -= (0.25f + (float)sol * 0.03f) * dt;           /* evaporación */
    if (agua) {
        suelo += 7.0f * dt;                               /* caudal de la bomba de riego */
        tanque -= 0.15f * dt;                             /* gasto del depósito */
    }
    if (st.pulverizando) tanque -= 0.30f * dt;
    if (st.llenando) tanque += LLENADO_PCT_S * dt;        /* válvula de llenado abierta */
    if (suelo < 0.0f) suelo = 0.0f;
    if (suelo > 100.0f) suelo = 100.0f;
    if (tanque < 0.0f) tanque = 0.0f;
    if (tanque > 100.0f) tanque = 100.0f;
    st.nivel_deposito = (int)(tanque + 0.5f);

    /* Plaga: si no se trata se va extendiendo; el pulverizador la combate */
    if (plaga > 0.0f) plaga += 0.3f * dt;
    if (st.pulverizando) plaga -= 40.0f * dt;
    if (plaga < 0.0f) plaga = 0.0f;
    if (plaga > 100.0f) plaga = 100.0f;
    confianza += (plaga - confianza) * 0.6f * dt;         /* la IA tarda un par de segundos en reconocerla */

    /* El aire se acerca poco a poco a lo que pide el sol */
    float objetivo_t = 16.0f + (float)sol * 0.17f;
    float objetivo_a = 80.0f - (float)sol * 0.45f;
    temp_c += (objetivo_t - temp_c) * 0.05f * dt;
    aire += (objetivo_a - aire) * 0.05f * dt;

    float crudo = (float)cfg.seco + (float)(cfg.mojado - cfg.seco) * suelo / 100.0f;
    int ruido = (int)(azar(&semilla) % 17u) - 8;
    temp_x10_ult = (int)((temp_c + (float)((int)(azar(&semilla) % 11u) - 5) * 0.02f) * 10.0f);
    aire_ult = (int)(aire + (float)((int)(azar(&semilla) % 11u) - 5) * 0.2f);
    return (int)crudo + ruido;
}

/* Humedad real del suelo, multiplicada por 10 (un decimal) */
EXPORT("hi_suelo_x10")
int hi_suelo_x10(void) { return (int)(suelo * 10.0f); }

/* Lo que mide el DHT22: temperatura (°C x10) y humedad del aire (%) */
EXPORT("hi_temp_x10")
int hi_temp_x10(void) { return temp_x10_ult; }

EXPORT("hi_aire")
int hi_aire(void) { return aire_ult; }

/* Nivel del depósito (%) y distancia que mide el ultrasónico (cm x10) */
EXPORT("hi_nivel")
int hi_nivel(void) { return st.nivel_deposito; }

EXPORT("hi_distancia_x10")
int hi_distancia_x10(void) {
    return (int)((TANQUE_VACIO_CM - tanque / 100.0f * (TANQUE_VACIO_CM - TANQUE_LLENO_CM)) * 10.0f);
}

/* Fija el nivel del depósito (deslizador de la demo) */
EXPORT("hi_nivel_deposito")
void hi_nivel_deposito(int porcentaje) {
    st.nivel_deposito = limitar(porcentaje, 0, 100);
    tanque = (float)st.nivel_deposito;
}

/* Agrega agua de golpe al suelo (botón "Lluvia" de la demo) */
EXPORT("hi_lluvia")
void hi_lluvia(int puntos) {
    suelo += (float)puntos;
    if (suelo > 100.0f) suelo = 100.0f;
}

/* Llegan plagas a las hojas (botón "Simular plaga" de la demo).
 * La cámara no avisa al instante: la IA tarda unos segundos en reconocerlas. */
EXPORT("hi_infestar")
void hi_infestar(int puntos) {
    plaga += (float)puntos;
    if (plaga > 100.0f) plaga = 100.0f;
}

/* Lo que ve la cámara: confianza de la IA (%) y cuántas plagas se distinguen (0 a 12) */
EXPORT("hi_confianza")
int hi_confianza(void) { return (int)(confianza + 0.5f); }

EXPORT("hi_plagas")
int hi_plagas(void) { return (int)(plaga * 0.12f + 0.99f); }

/* ================================================================
 * 6. Prueba de rendimiento: n decisiones completas sobre lecturas
 *    sintéticas, sin tocar el estado real. Devuelve cuántas veces
 *    quedó encendida la bomba (así el compilador no la elimina).
 * ================================================================ */
EXPORT("hi_bench")
int hi_bench(int n) {
    Estado e = { 0, 0, -1000000, 0, 0, 0, 80, 0, 0, -1000000 };
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
        case EV_PLAGA:            return "La cámara detectó una plaga: esperando autorización";
        case EV_PULV_INICIO:      return "Pulverización autorizada e iniciada";
        case EV_PULV_FIN:         return "Pulverización terminada";
        case EV_BLOQUEO_DEPOSITO: return "Bloqueado: depósito casi vacío";
        case EV_SIN_PLAGA:        return "Autorización ignorada: no hay plaga";
        case EV_DESCARTADA:       return "Aviso de plaga descartado";
        case EV_LLENADO_INICIO:   return "Depósito casi vacío: se abre la válvula de llenado";
        case EV_LLENADO_FIN:      return "Depósito lleno: se cierra la válvula";
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

    printf("Simulación de 120 s del Huerto Inteligente (sol = 50 %%)\n");
    printf("  t(s)  suelo%%  temp  aire%%  depós%%  cámara%%  bomba\n");
    int bomba = 0;
    for (int t = 0; t <= 120000; t += 100) {
        int crudo = hi_simular(100, 50, bomba);
        if (t == 40000) hi_infestar(55);              /* llegan plagas: la cámara las reconoce sola */
        if (t == 50000) hi_autorizar(t);              /* el usuario autoriza el pulverizador */
        if (t == 70000) hi_nivel_deposito(5);         /* el depósito casi se acaba: se llena solo */
        int estado = hi_paso(crudo, t);
        bomba = estado & 1;
        if (t % 5000 == 0)
            printf("  %4d  %5.1f  %4.1f   %3d    %3d     %3d    %s\n", t / 1000,
                   hi_suelo_x10() / 10.0, hi_temp_x10() / 10.0,
                   hi_aire(), hi_nivel(), hi_confianza(), bomba ? "ON" : "off");
        int ev;
        while ((ev = hi_evento()) != EV_NINGUNO)
            printf("        [%5.1f s] %s\n", hi_evento_t() / 1000.0, nombre_evento(ev));
    }
    return 0;
}
#endif
