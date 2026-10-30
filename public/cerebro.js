/* Brote: asistente local del Huerto Inteligente.
   Entiende frases sueltas (con faltas de ortografía), usa los datos en vivo
   y puede pedir acciones a la app (regar, abrir una sección). */
(function () {
  'use strict';

  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  // [intención, palabras clave, peso]
  const INTENCIONES = [
    ['saludo', ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'holi', 'saludos'], 1],
    ['gracias', ['gracias', 'genial', 'perfecto', 'excelente', 'chevere', 'bacan', 'buenazo'], 1],
    ['adios', ['adios', 'chau', 'chao', 'hasta luego', 'nos vemos', 'bye'], 1],
    ['quien', ['quien eres', 'que eres', 'como te llamas', 'tu nombre', 'eres un bot', 'eres una ia', 'eres ia'], 1.2],
    ['regar_accion', ['riega', 'regar', 'regar ahora', 'riegalo', 'riegala', 'enciende la bomba', 'prende la bomba', 'activa la bomba', 'activa el riego', 'prender la bomba', 'encender la bomba', 'enciende el riego', 'echale agua', 'dale agua'], 1],
    ['apagar', ['apaga', 'apagar', 'deten', 'detener', 'para la bomba', 'parar la bomba', 'corta el agua', 'deja de regar'], 1.1],
    ['debo_regar', ['debo regar', 'necesita agua', 'tengo que regar', 'hay que regar', 'cuando regar', 'cuando riego', 'le falta agua', 'necesita riego', 'toca regar', 'riego hoy', 'cada cuanto riego', 'cuanto regar'], 1],
    ['plaga', ['plaga', 'bicho', 'insecto', 'pulgon', 'mosca blanca', 'mosquita', 'arana roja', 'acaro', 'trips', 'babosa', 'caracol', 'gusano', 'oruga', 'hongo', 'oidio', 'moho', 'manchas', 'hojas comidas', 'agujeros', 'hojas amarillas', 'minador', 'hormiga', 'cochinilla', 'gorgojo'], 1.1],
    ['suelo', ['suelo', 'tierra', 'zona', 'humedad del suelo', 'maceta', 'seco', 'seca', 'mojado', 'encharcado', 'sustrato'], 1],
    ['temp', ['temperatura', 'calor', 'frio', 'grados', 'caliente', 'clima', 'termometro', 'dht'], 1],
    ['hum', ['humedad del aire', 'aire', 'ambiente', 'humedad relativa', 'humedad ambiental'], 1],
    ['tanque', ['tanque', 'agua', 'cuanta agua', 'agua queda', 'queda agua', 'deposito', 'nivel de agua', 'reserva', 'balde', 'bidon', 'rellenar', 'recargar', 'ultrasonico'], 1],
    ['bomba', ['bomba', 'rele', 'motor', '30 segundos', 'cuanto riega', 'cuanto tiempo riega', 'duracion del riego', 'duracion riego', 'cambiar el tiempo', 'regar mas tiempo', 'regar menos tiempo'], 1],
    ['camara', ['camara', 'foto', 'video', 'esp32 cam', 'imagen', 'ver el huerto'], 1],
    ['graficos', ['grafico', 'historial', 'estadistica', 'promedio', 'ayer', 'semana', 'dias anteriores', 'tendencia', 'registro', 'csv', 'excel'], 1],
    ['alertas', ['alerta', 'notificacion', 'aviso', 'avisame', 'campana', 'notifica'], 1],
    ['problema', ['no marca', 'no funciona', 'no sale', 'no aparece', 'error', 'falla', 'rayita', 'guion', 'sin lectura', 'null', 'siempre 100', 'no lee', 'no mide', 'malogrado', 'descalibrado', 'calibrar', 'calibracion', 'sin datos', 'no cambia', 'raro'], 1.3],
    ['conexion', ['wifi', 'conexion', 'desconectado', 'sin conexion', 'offline', 'en linea', 'esp32', 'internet', 'no conecta'], 1],
    ['cultivo', ['lechuga', 'tomate', 'albahaca', 'culantro', 'cilantro', 'fresa', 'frutilla', 'aji', 'rocoto', 'menta', 'hierbabuena', 'espinaca', 'rabanito', 'rabano', 'perejil', 'cebolla china', 'sembrar', 'cultivar', 'que plantar', 'que sembrar'], 1.1],
    ['abono', ['abono', 'fertilizante', 'fertilizar', 'compost', 'humus', 'nutriente', 'nitrogeno'], 1],
    ['luz', ['luz', 'sol', 'sombra', 'iluminacion', 'horas de sol'], 1],
    ['cuenta', ['contrasena', 'clave', 'cuenta', 'usuario', 'cerrar sesion', 'seguridad', 'registrar', 'codigo de instalacion'], 1],
    ['hora', ['que hora', 'fecha', 'que dia es', 'hoy es'], 1],
    ['chiste', ['chiste', 'broma', 'hazme reir', 'algo gracioso'], 1],
    ['instalar', ['instalar', 'app en el celular', 'pantalla de inicio', 'descargar la app', 'aplicacion'], 1],
    ['estado', ['estado', 'como esta', 'como va', 'resumen', 'reporte', 'todo bien', 'situacion', 'como anda', 'informe', 'salud', 'huerto'], 0.5],
    ['tutorial', ['tutorial', 'ayuda', 'como uso', 'como funciona', 'guia', 'que puedo hacer', 'instrucciones', 'manual', 'que haces', 'que sabes'], 0.7]
  ];

  function clasificar(texto) {
    const t = ' ' + norm(texto) + ' ';
    const toks = t.trim().split(' ').filter(Boolean);
    let mejor = null, max = 0;
    for (const [id, claves, peso] of INTENCIONES) {
      let s = 0;
      for (const k of claves) {
        if (k.includes(' ')) { if (t.includes(' ' + k + ' ') || t.includes(' ' + k)) s += 2; continue; }
        for (const w of toks) {
          if (w === k || (k.length >= 4 && w.startsWith(k)) || (k.length >= 5 && w.length >= 4 && lev(w, k) <= 1)) { s += 1; break; }
        }
      }
      s *= peso;
      if (s > max) { max = s; mejor = id; }
    }
    return max > 0 ? mejor : null;
  }

  // ---------- conocimiento ----------
  const PLAGAS = [
    { k: ['pulgon', 'pulgones'], n: 'Pulgón', s: 'bichitos verdes o negros en brotes y bajo las hojas; hojas enrolladas y pegajosas.',
      r: ['Lava con agua y **jabón potásico** (1 cucharada por litro) al atardecer, 3 días seguidos.', 'Aceite de **neem** cada 7 días.', 'Las mariquitas son tus aliadas: no las espantes.'] },
    { k: ['mosca blanca', 'mosquita', 'mosquitas'], n: 'Mosca blanca', s: 'mosquitas blancas que vuelan al mover la planta; hojas amarillentas.',
      r: ['Pon **trampas amarillas** pegajosas cerca de las plantas.', 'Jabón potásico o neem en el envés de las hojas.', 'Evita exceso de abono nitrogenado.'] },
    { k: ['arana roja', 'acaro', 'acaros', 'aranita'], n: 'Araña roja', s: 'puntitos amarillos en las hojas y telitas finas; aparece con calor y aire seco.',
      r: ['Sube la humedad: pulveriza agua en las hojas al atardecer.', 'Azufre mojable o neem.', 'Retira las hojas muy dañadas.'] },
    { k: ['trips'], n: 'Trips', s: 'manchas plateadas y puntitos negros en las hojas.',
      r: ['Trampas **azules** pegajosas.', 'Jabón potásico + neem alternados cada 5 días.'] },
    { k: ['babosa', 'babosas', 'caracol', 'caracoles'], n: 'Babosas y caracoles', s: 'hojas comidas de noche y rastros brillantes.',
      r: ['Retíralos a mano de noche con linterna.', 'Trampa de cerveza: un vasito enterrado a ras del suelo.', 'Barrera de cáscara de huevo triturada o ceniza alrededor.'] },
    { k: ['gusano', 'gusanos', 'oruga', 'orugas', 'gusanito'], n: 'Gusanos y orugas', s: 'agujeros grandes en las hojas y bolitas oscuras (excremento).',
      r: ['Revisa el envés de las hojas y retíralos a mano.', '**Bacillus thuringiensis** (Bt) es ecológico y muy eficaz.'] },
    { k: ['hongo', 'hongos', 'oidio', 'moho', 'ceniza', 'polvillo'], n: 'Hongos (oídio)', s: 'polvillo blanco o manchas cafés en las hojas.',
      r: ['No mojes las hojas al regar y riega temprano.', 'Spray de **leche** (1 parte por 9 de agua) o bicarbonato (1 cucharadita por litro).', 'Mejora la ventilación y retira hojas enfermas.'] },
    { k: ['minador', 'minadora', 'caminitos'], n: 'Minador', s: 'caminitos blancos dibujados dentro de la hoja.',
      r: ['Corta y bota las hojas con galerías.', 'Trampas amarillas para los adultos.', 'Neem cada 7 días.'] },
    { k: ['hormiga', 'hormigas'], n: 'Hormigas', s: 'suelen «cuidar» pulgones a cambio de su melaza.',
      r: ['Controla primero los pulgones.', 'Canela en polvo o borra de café alrededor.'] },
    { k: ['cochinilla', 'cochinillas', 'algodon'], n: 'Cochinilla', s: 'bolitas blancas algodonosas o escamitas en tallos.',
      r: ['Algodón con alcohol para quitarlas una por una.', 'Jabón potásico + aceite de neem.'] }
  ];

  const CULTIVOS = [
    { k: ['lechuga'], n: 'Lechuga', s: '60–80 %', t: '15–22 °C', x: 'Riego frecuente y poco a la vez; con más de 25 °C se espiga. Cosecha en 45–60 días.' },
    { k: ['tomate', 'tomates'], n: 'Tomate', s: '60–70 %', t: '20–28 °C', x: 'Riego profundo y regular (los cambios bruscos rajan el fruto). Necesita tutor y 6 h de sol.' },
    { k: ['albahaca'], n: 'Albahaca', s: '50–70 %', t: '20–30 °C', x: 'Le encanta el sol. Corta las flores para que siga dando hojas.' },
    { k: ['culantro', 'cilantro'], n: 'Culantro', s: '55–75 %', t: '15–25 °C', x: 'Siémbralo directo (no le gusta el trasplante). Con calor fuerte florece rápido.' },
    { k: ['fresa', 'fresas', 'frutilla'], n: 'Fresa', s: '60–75 %', t: '15–26 °C', x: 'Riega al pie, sin mojar el fruto. Cubre el suelo con paja para que no se pudra.' },
    { k: ['aji', 'rocoto'], n: 'Ají / rocoto', s: '55–70 %', t: '20–30 °C', x: 'Deja secar un poco entre riegos; el exceso de agua tumba las flores.' },
    { k: ['menta', 'hierbabuena'], n: 'Hierbabuena', s: '65–85 %', t: '15–25 °C', x: 'Muy invasiva: mejor en maceta aparte. Aguanta media sombra.' },
    { k: ['espinaca'], n: 'Espinaca', s: '60–80 %', t: '10–22 °C', x: 'Prefiere el clima fresco del invierno limeño.' },
    { k: ['rabanito', 'rabano', 'rabanitos'], n: 'Rabanito', s: '60–75 %', t: '10–22 °C', x: 'El más rápido: en 25–30 días ya lo cosechas. Ideal para empezar.' },
    { k: ['perejil'], n: 'Perejil', s: '55–75 %', t: '15–25 °C', x: 'Germina lento (2–4 semanas); remoja la semilla una noche antes.' },
    { k: ['cebolla china'], n: 'Cebolla china', s: '55–75 %', t: '13–25 °C', x: 'Corta las hojas a 3 cm del suelo y vuelve a crecer.' }
  ];

  const CHISTES = [
    '¿Qué le dijo una planta a otra? «¿Qué hay de brote?» 🌱',
    '¿Por qué el tomate no sale de fiesta? Porque siempre termina hecho salsa. 🍅',
    'Soy un asistente de huerto: mis chistes son de la variedad «cosecha propia».',
    '¿Qué hace una lechuga en el gimnasio? Hojas-tensiones. 🥬'
  ];

  // ---------- ayudantes ----------
  const v = (x, u, dec = 0) => x == null ? 'sin lectura' : `**${Number(x).toFixed(dec)}${u}**`;
  const estSuelo = x => x == null ? 'sin lectura' : x < 25 ? 'seca 🥵' : x < 45 ? 'algo seca' : x <= 80 ? 'con buena humedad 👌' : 'muy mojada 💦';
  const elegir = a => a[Math.floor(Math.random() * a.length)];

  function sinDatos(c) {
    if (!c.d) return 'Todavía no me llegan datos del ESP32. Revisa que esté encendido y con WiFi.';
    if (!c.ok) return `⚠️ El ESP32 no manda datos desde hace ${c.edadTxt}; lo que te digo es la **última lectura** guardada.`;
    return '';
  }

  function resumen(c) {
    if (!c.d) return sinDatos(c);
    const d = c.d, l = [];
    const aviso = sinDatos(c);
    if (aviso) l.push(aviso);
    l.push(`- Zona 1: ${v(d.soil1_pct, ' %')} (${estSuelo(d.soil1_pct)})`);
    l.push(`- Zona 2: ${v(d.soil2_pct, ' %')} (${estSuelo(d.soil2_pct)})`);
    l.push(`- Temperatura: ${v(d.temp, ' °C', 1)}`);
    l.push(`- Humedad del aire: ${v(d.hum, ' %')}`);
    l.push(`- Tanque: ${v(d.tank_pct, ' %')}`);
    l.push(`- Bomba: ${d.pump === 1 ? '**regando** 💧' : 'apagada'}`);
    if (c.salud != null) l.push(`\nSalud general: **${c.salud}/100**.`);
    const falt = ['soil1_pct', 'soil2_pct', 'temp', 'hum', 'tank_pct'].filter(k => d[k] == null).length;
    if (falt) l.push(`\nHay ${falt} sensor${falt > 1 ? 'es' : ''} sin lectura. Si quieres te digo cómo revisarlo${falt > 1 ? 's' : ''}.`);
    return l.join('\n');
  }

  function decidirRiego(c) {
    if (!c.d) return { texto: sinDatos(c) };
    const { soil1_pct: a, soil2_pct: b, tank_pct: tk, temp: t } = c.d;
    const vals = [a, b].filter(x => x != null);
    if (!vals.length) return { texto: 'No puedo saberlo: los dos sensores de suelo están sin lectura. Mientras tanto, mete un dedo 2–3 cm en la tierra: si sale seco, riega.' };
    const min = Math.min(...vals);
    if (tk != null && tk < 10) return { texto: `El tanque está casi vacío (${tk} %). **Rellénalo antes de regar** para no dañar la bomba.` };
    if (vals.every(x => x >= 95)) return { texto: `Los sensores marcan ${vals.join(' % y ')} %: o la tierra está empapada o el sensor está descalibrado. **No riegues** por ahora; si la tierra se ve seca, revisa la calibración (pregúntame «calibrar sensor»).` };
    if (min < 25) return { texto: `**Sí, toca regar.** La tierra está seca (${min} %).${t != null && t > 28 ? ' Con este calor, mejor ahora o al atardecer.' : ''}`, accion: 'regar' };
    if (min < 45) return { texto: `Está **algo seca** (${min} %). Puedes dar un riego corto; si es de noche, mejor espera a la mañana.`, accion: 'regar' };
    if (min > 80) return { texto: `**No hace falta.** La tierra está muy húmeda (${min} %). Regar más podría pudrir las raíces.` };
    return { texto: `**No por ahora.** La humedad está bien (${vals.join(' % y ')} %). Te aviso cuando baje de 25 %.` };
  }

  function problema(t, c) {
    const d = c.d || {};
    if (/temp|dht|humedad del aire|aire|grado/.test(t) || (d.temp == null && d.hum == null && !/suelo|zona|tanque|bomba|camara|wifi/.test(t))) {
      return '**Temperatura y humedad del aire sin lectura** (sensor DHT22). Revisa:\n- Cable de datos en el **GPIO 4**.\n- Alimentación a **3.3 V** y GND.\n- Una **resistencia de 10 kΩ** entre datos y 3.3 V (si tu módulo no la trae).\n- Que en el código diga `DHT22` (no DHT11).\nTras corregir, reinicia el ESP32 y en 10 s debería aparecer.';
    }
    if (/tanque|ultra|nivel|agua/.test(t)) {
      return '**Tanque sin lectura** (sensor ultrasónico HC-SR04):\n- TRIG al **GPIO 5** y ECHO al **GPIO 18**.\n- El HC-SR04 necesita **5 V** (pin VIN del ESP32).\n- Pon un **divisor de voltaje** en ECHO (1 kΩ y 2 kΩ) para bajar a 3.3 V.\n- Que apunte recto al agua, sin tocar paredes.\n- Ajusta `TANQUE_VACIO_CM` y `TANQUE_LLENO_CM` midiendo tu tanque.';
    }
    if (/bomba|rele|motor/.test(t)) {
      return '**Si la bomba no arranca:**\n- Relé al **GPIO 23**; el código asume relé activo en bajo (`RELAY_ACTIVE_LOW = true`).\n- ¿Escuchas el «clic» del relé al pulsar Regar? Si no, revisa VCC/GND del relé.\n- Si hace clic pero no bombea: revisa la fuente de la bomba y que haya agua en el tanque.\n- El ESP32 revisa la orden cada pocos segundos, así que espera un momento.';
    }
    if (/camara|foto/.test(t)) return elegirCamara(c);
    return '**Si el suelo marca siempre 100 % (o 0 %):** el sensor está descalibrado o mal conectado.\n- Zona 1 al **GPIO 34**, zona 2 al **GPIO 35**, alimentados a 3.3 V.\n- Para calibrar: abre el Monitor Serie, anota el valor con el sensor **al aire** (seco) y **dentro de un vaso de agua** (húmedo).\n- Pon esos números en `SOIL1_SECO` / `SOIL1_HUMEDO` (y los de la zona 2) y vuelve a subir el código.\nSi aún falla, prueba el sensor en el otro pin para descartar el cable.';
  }

  function elegirCamara(c) {
    if (c.camara) return `La cámara está conectada; la última foto llegó ${c.camaraTxt}. En la sección **Cámara** puedes verla y pedir que busque plagas.`;
    return 'La cámara todavía **no está conectada**. Cuando tengas la ESP32-CAM:\n- Abre `camara_esp32cam.ino`, pon tu WiFi y la misma API_KEY.\n- Placa: **AI Thinker ESP32-CAM**.\n- Súbelo y en unos segundos la foto aparecerá sola en la sección Cámara.\nNo hay que cambiar nada en la app.';
  }

  // ---------- respuesta principal ----------
  function responder(texto, c) {
    const t = norm(texto);
    const id = clasificar(texto);
    const d = c.d || {};
    const R = (texto, extra) => Object.assign({ texto }, extra || {});

    switch (id) {
      case 'saludo': {
        const h = new Date().getHours();
        const s = h < 12 ? '¡Buenos días' : h < 19 ? '¡Buenas tardes' : '¡Buenas noches';
        return R(`${s}, ${c.usuario || ''}! 🌱 Soy **Brote**.\n\n${resumen(c)}`, { chips: ['¿Debo regar?', 'Plagas comunes', '¿Qué puedes hacer?'] });
      }
      case 'gracias': return R(elegir(['¡De nada! Aquí sigo cuidando el huerto contigo. 🌿', '¡Con gusto! Si algo cambia, te aviso.', '¡Para eso estoy! 💚']));
      case 'adios': return R('¡Hasta luego! Yo sigo vigilando el huerto. Si pasa algo, te llega un aviso. 👋');
      case 'quien': return R(`Soy **Brote**, el asistente de tu huerto. Leo los sensores en vivo, te digo si toca regar, te ayudo con plagas y cultivos, y te explico la app.${c.ia ? ' Ahora mismo estoy usando IA para entenderte mejor.' : ''}`);
      case 'regar_accion':
        if (d.pump === 1) return R(`La bomba **ya está regando**. Se apagará sola a ${c.riegoTxt || '30 s'}.`, { accion: 'apagar' });
        if (!c.ok) return R('El ESP32 no está en línea, así que la orden no llegaría ahora. Revisa que esté encendido y con WiFi.');
        if (d.tank_pct != null && d.tank_pct < 10) return R(`Ojo: el tanque está casi vacío (${d.tank_pct} %). Si riegas igual, la bomba podría trabajar en seco.`, { accion: 'regar' });
        return R(`¿Enciendo la bomba? Regará **${c.riegoTxt || '30 s'}** y se apagará sola.`, { accion: 'regar' });
      case 'apagar':
        if (d.pump !== 1) return R('La bomba ya está **apagada**. 👍');
        return R('¿Detengo el riego ahora?', { accion: 'apagar' });
      case 'debo_regar': return R(decidirRiego(c).texto, { accion: decidirRiego(c).accion });
      case 'plaga': {
        const p = PLAGAS.find(p => p.k.some(k => t.includes(k)));
        if (p) return R(`**${p.n}**: ${p.s}\n\nQué hacer:\n${p.r.map(x => '- ' + x).join('\n')}\n\nSi en una semana no mejora, lleva una hoja a un vivero o agrónomo.`, { chips: ['Ver cámara', 'Otras plagas'] });
        if (/amarill/.test(t)) return R('**Hojas amarillas** pueden ser:\n- **Exceso de riego** (tierra siempre mojada): espacia los riegos.\n- **Falta de nitrógeno** (hojas viejas amarillas): agrega compost o humus.\n- **Plagas** chupadoras: mira el envés de las hojas buscando pulgón o mosca blanca.\n- **Falta de luz**: necesita 4–6 h de sol.');
        if (/agujer|comid/.test(t)) return R('**Hojas comidas** casi siempre son **gusanos/orugas** o **babosas**. Revisa de noche con linterna: si ves rastros brillantes son babosas; si hay bolitas oscuras, orugas. Pregúntame por cualquiera de las dos y te digo cómo tratarlas.');
        return R(`Las plagas más comunes en huertos de Lima:\n${PLAGAS.slice(0, 7).map(p => `- **${p.n}**: ${p.s}`).join('\n')}\n\nDime cuál crees que tienes (o describe lo que ves) y te digo qué hacer.${c.camara ? ' También puedo revisar la última foto de la cámara.' : ''}`, { chips: ['Pulgón', 'Mosca blanca', 'Hongos', 'Hojas amarillas'] });
      }
      case 'suelo': {
        if (!c.d) return R(sinDatos(c));
        const z = /\b(1|uno)\b/.test(t) ? [1] : /\b(2|dos)\b/.test(t) ? [2] : [1, 2];
        const l = z.map(i => `Zona ${i}: ${v(d['soil' + i + '_pct'], ' %')}, ${estSuelo(d['soil' + i + '_pct'])}.`);
        return R(`${sinDatos(c)}${sinDatos(c) ? '\n\n' : ''}${l.join('\n')}\n\nLo ideal está entre **45 % y 80 %**; por debajo de 25 % la planta empieza a sufrir.`, { chips: ['¿Debo regar?', 'Calibrar sensor'] });
      }
      case 'temp': {
        if (d.temp == null) return R('La temperatura está **sin lectura**: el DHT22 no responde.\n\n' + problema('dht', c));
        const x = d.temp;
        const com = x > 35 ? 'Hace **demasiado calor**: dale sombra (malla raschel) y riega temprano.' : x > 28 ? 'Está calurosa; vigila que la tierra no se seque rápido.' : x < 10 ? 'Está **muy frío** para la mayoría de hortalizas; protégelas de noche.' : 'Es una temperatura **cómoda** para casi todas las hortalizas. 👌';
        return R(`${sinDatos(c)}${sinDatos(c) ? '\n\n' : ''}Temperatura: ${v(x, ' °C', 1)}. ${com}`);
      }
      case 'hum': {
        if (d.hum == null) return R('La humedad del aire está **sin lectura** (la mide el mismo DHT22 que la temperatura).\n\n' + problema('dht', c));
        const x = d.hum;
        return R(`Humedad del aire: ${v(x, ' %')}. ${x > 85 ? 'Muy alta: ojo con los **hongos**, ventila y no mojes las hojas.' : x < 35 ? 'Aire muy seco: favorece a la **araña roja**; pulveriza agua al atardecer.' : 'Está en buen rango.'}`);
      }
      case 'tanque': {
        if (d.tank_pct == null) return R('El tanque está **sin lectura**.\n\n' + problema('tanque', c));
        const x = d.tank_pct;
        return R(`El tanque está al ${v(x, ' %')}. ${x < 20 ? '**Rellénalo pronto**; con menos de 10 % la bomba puede trabajar en seco.' : x < 50 ? 'Aguanta unos riegos más.' : 'Hay agua de sobra. 💧'}`);
      }
      case 'bomba': return R(`La bomba está ${d.pump === 1 ? '**regando ahora**' : '**apagada**'}. Se enciende con el botón **Regar ahora** (o pidiéndomelo) y se apaga sola a **${c.riegoTxt || '30 s'}**, aunque se te olvide. Ese tiempo lo cambias con el deslizador **Duración del riego**, en Inicio: de 5 segundos a 3 minutos. Quien apaga la bomba es el propio ESP32, así que se corta igual si se cae el internet.`, { accion: d.pump === 1 ? 'apagar' : null });
      case 'camara': return R(elegirCamara(c), { accion: 'ir:camara' });
      case 'graficos': {
        const dd = c.dias || [];
        let txt = 'En **Gráficos** tienes dos: uno **en vivo** con las últimas lecturas y otro **por día** con promedio, mínimo y máximo. Abajo está el historial, que puedes descargar en CSV para Excel.';
        if (dd.length) {
          const prom = k => { const a = dd.map(x => x[k] && x[k].avg).filter(x => x != null); return a.length ? (a.reduce((p, q) => p + q, 0) / a.length) : null; };
          const pt = prom('temp'), ps = prom('soil1_pct');
          txt += `\n\nEn los últimos ${dd.length} día${dd.length > 1 ? 's' : ''}: temperatura media ${pt == null ? 'sin datos' : '**' + pt.toFixed(1) + ' °C**'}, humedad media de la zona 1 ${ps == null ? 'sin datos' : '**' + ps.toFixed(0) + ' %**'}.`;
        }
        return R(txt, { accion: 'ir:graficos' });
      }
      case 'alertas': {
        const n = (c.alertas || []).filter(a => !a.leida).length;
        return R(`Te aviso con la **campana** de arriba y, si lo activas, con notificaciones del navegador cuando hay: **plagas**, tanque bajo, tierra seca o mucho calor.${n ? ` Ahora tienes **${n} sin leer**.` : ' Ahora no tienes avisos pendientes. 👍'}`, { accion: 'ir:alertas' });
      }
      case 'problema': return R(problema(t, c));
      case 'conexion':
        return R(c.ok ? `El ESP32 está **en línea** ✅ (última lectura ${c.edadTxt}).` : `El ESP32 está **sin conexión** (última lectura ${c.edadTxt || 'nunca'}). Revisa:\n- Que esté encendido.\n- Que el WiFi sea de **2.4 GHz** (el ESP32 no ve redes de 5 GHz).\n- Usuario y clave del WiFi en el código.\n- Abre el Monitor Serie a 115200: debe decir «WiFi OK».`);
      case 'cultivo': {
        const cu = CULTIVOS.find(x => x.k.some(k => t.includes(k)));
        if (cu) return R(`**${cu.n}**\n- Humedad del suelo ideal: **${cu.s}**\n- Temperatura: **${cu.t}**\n- ${cu.x}`);
        return R(`Para empezar en Lima te recomiendo: **rabanito** (listo en un mes), **lechuga**, **culantro**, **albahaca** y **hierbabuena**. Pregúntame por cualquiera y te digo su humedad y temperatura ideales.`, { chips: ['Lechuga', 'Tomate', 'Albahaca', 'Fresa'] });
      }
      case 'abono': return R('Abono casero que funciona:\n- **Compost** o **humus de lombriz**: 2–3 cucharadas por planta cada mes.\n- **Borra de café** seca (poquito): aporta nitrógeno.\n- **Cáscara de huevo** molida: calcio, ideal para tomates.\nNo te pases: el exceso de abono atrae pulgones.');
      case 'luz': return R('La mayoría de hortalizas quiere **4–6 horas de sol** directo. Las de hoja (lechuga, espinaca, hierbabuena) aguantan media sombra; las de fruto (tomate, ají, fresa) necesitan más sol. En verano limeño, una malla raschel al mediodía ayuda.');
      case 'cuenta': return R('Sobre tu cuenta:\n- Para **crear otra cuenta** se necesita el **código de instalación** (la API_KEY del ESP32).\n- Tras **5 contraseñas incorrectas**, la cuenta se bloquea 15 minutos.\n- La sesión dura 7 días; para salir usa **Salir** en el menú.');
      case 'hora': return R(`Hoy es **${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}** y son las **${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}**.`);
      case 'chiste': return R(elegir(CHISTES));
      case 'instalar': return R('Puedes tenerla como app:\n- **Android (Chrome)**: menú ⋮ → «Agregar a la pantalla principal».\n- **iPhone (Safari)**: botón compartir → «Agregar a inicio».\nSe abrirá a pantalla completa con el logo del brote.');
      case 'estado': return R(resumen(c), { chips: ['¿Debo regar?', 'Ver gráficos'] });
      case 'tutorial': return R('Puedo ayudarte con:\n- **El huerto ahora**: «¿cómo está?», «¿debo regar?», «¿cuánta agua queda?»\n- **Acciones**: «riega», «apaga la bomba»\n- **Plagas**: «tengo pulgones», «hojas amarillas»\n- **Cultivos**: «¿cómo cuido la lechuga?»\n- **Problemas**: «la temperatura no marca», «el suelo siempre da 100 %»\n- **La app**: gráficos, cámara, avisos, cuenta.', { chips: ['¿Cómo está el huerto?', 'Ver tutorial'], accion: 'ir:guia' });
    }
    return R('Mmm, eso no lo entendí bien. 🤔 Prueba preguntándome de otra forma, por ejemplo:', { chips: ['¿Cómo está el huerto?', '¿Debo regar?', 'Tengo una plaga', 'La temperatura no marca'] });
  }

  window.Cerebro = { responder, clasificar };
})();
