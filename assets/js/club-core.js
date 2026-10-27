(function (global) {
  'use strict';

  var existing = global.TajosClub || {};
  var TajosClub = existing;

  // === CONFIGURAR ===
  var CONFIG = {
    SUPABASE_URL: 'https://cfgrbwozpauphggyosbd.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmZ3Jid296cGF1cGhnZ3lvc2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NjMwMzAsImV4cCI6MjEwODMzOTAzMH0.E6wFKTF9jnES0hgJe7fVin5Scy9NEFPuILoBhV4BDTg',
    TOKEN_KEY: 'tajos_club_token',
    TOKEN_REGEX: /^[a-f0-9]{32}$/,
    TIMEOUT_MS: 8000,
    PAGINAS: {
      index: 'index.html',
      registro: 'registro.html',
      inicio: 'inicio.html',
      tarjeta: 'tarjeta.html'
    }
  };

  var avisoConfiguracionMostrado = false;
  var memoriaToken = null;
  var solicitudesEnVuelo = {};

  function contieneMarcador(valor) {
    return typeof valor === 'string' && valor.indexOf('{{') !== -1;
  }

  function estaConfigurado() {
    return !contieneMarcador(CONFIG.SUPABASE_URL) && !contieneMarcador(CONFIG.SUPABASE_ANON_KEY);
  }

  function avisarSinConfigurar() {
    if (avisoConfiguracionMostrado) {
      return;
    }
    avisoConfiguracionMostrado = true;
    console.warn('Club Tajos: la configuración de la base de datos no está completa.');
  }

  /**
   * Configuración compartida del Club.
   */
  var config = {
    SUPABASE_URL: CONFIG.SUPABASE_URL,
    SUPABASE_ANON_KEY: CONFIG.SUPABASE_ANON_KEY,
    TOKEN_KEY: CONFIG.TOKEN_KEY,
    TOKEN_REGEX: CONFIG.TOKEN_REGEX,
    TIMEOUT_MS: CONFIG.TIMEOUT_MS,
    PAGINAS: CONFIG.PAGINAS,
    configurado: estaConfigurado()
  };

  /**
   * Sesión del miembro: token en localStorage con respaldo en memoria.
   */
  var session = (function () {
    function leerStorage() {
      try {
        return global.localStorage.getItem(CONFIG.TOKEN_KEY);
      } catch (error) {
        return memoriaToken;
      }
    }

    function escribirStorage(token) {
      try {
        global.localStorage.setItem(CONFIG.TOKEN_KEY, token);
      } catch (error) {
        memoriaToken = token;
      }
    }

    function borrarStorage() {
      memoriaToken = null;
      try {
        global.localStorage.removeItem(CONFIG.TOKEN_KEY);
      } catch (error) {
        /* Storage no disponible. */
      }
    }

    /**
     * Devuelve el token guardado, si es válido.
     * @returns {string} Token o cadena vacía.
     */
    function getToken() {
      var token = leerStorage();
      if (typeof token === 'string' && CONFIG.TOKEN_REGEX.test(token)) {
        return token;
      }
      return '';
    }

    /**
     * Guarda un token después de validarlo.
     * @param {string} token Token de 32 caracteres hexadecimales.
     * @returns {boolean} true si se guardó.
     */
    function setToken(token) {
      if (typeof token !== 'string' || !CONFIG.TOKEN_REGEX.test(token)) {
        return false;
      }
      escribirStorage(token);
      return true;
    }

    /**
     * Borra el token de la sesión.
     */
    function clearToken() {
      borrarStorage();
    }

    /**
     * Indica si existe un token válido.
     * @returns {boolean}
     */
    function hasToken() {
      return getToken() !== '';
    }

    /**
     * Lee el token del parámetro `t`, lo guarda y lo quita de la URL.
     * @returns {boolean} true si se capturó un token válido.
     */
    function captureTokenFromUrl() {
      var url;
      var token;
      var nuevaUrl;

      try {
        url = new global.URL(global.location.href);
        token = url.searchParams.get('t');

        if (typeof token !== 'string' || !CONFIG.TOKEN_REGEX.test(token)) {
          return false;
        }

        escribirStorage(token);
        url.searchParams.delete('t');
        nuevaUrl = url.pathname + (url.search ? url.search : '') + url.hash;
        global.history.replaceState(null, '', nuevaUrl);
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Inicializa la sesión y redirige si la página exige sesión sin token.
     * @returns {{token: string, redirigiendo: boolean}}
     */
    function init() {
      var token = '';
      var cuerpo = global.document.body;
      var redirigiendo = false;

      captureTokenFromUrl();
      token = getToken();

      if (
        cuerpo &&
        cuerpo.hasAttribute('data-club-requiere-sesion') &&
        token === ''
      ) {
        redirigiendo = true;
        global.location.replace(CONFIG.PAGINAS.index);
      }

      return {
        token: token,
        redirigiendo: redirigiendo
      };
    }

    /**
     * Carga el estado de la tarjeta del miembro actual.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function cargarEstado() {
      var token = getToken();

      if (token === '') {
        return Promise.resolve({ ok: false, data: null, error: 'token_invalido' });
      }

      return api.estadoTarjeta(token).then(function (respuesta) {
        if (!respuesta.ok && respuesta.error === 'token_invalido') {
          borrarStorage();
        }
        return {
          ok: respuesta.ok,
          data: respuesta.ok ? respuesta.data : null,
          error: respuesta.ok ? null : respuesta.error
        };
      });
    }

    /**
     * Cierra la sesión y vuelve a la página principal.
     */
    function salir() {
      borrarStorage();
      global.location.replace(CONFIG.PAGINAS.index);
    }

    return {
      getToken: getToken,
      setToken: setToken,
      clearToken: clearToken,
      hasToken: hasToken,
      captureTokenFromUrl: captureTokenFromUrl,
      init: init,
      cargarEstado: cargarEstado,
      salir: salir
    };
  })();

  /**
   * Acceso a Supabase REST y funciones RPC.
   */
  var api = (function () {
    function encabezados() {
      return {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      };
    }

    function base() {
      return CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';
    }

    function pedir(url, opciones) {
      var controlador = new global.AbortController();
      var temporizador = global.setTimeout(function () {
        controlador.abort();
      }, CONFIG.TIMEOUT_MS);

      opciones.signal = controlador.signal;

      return global.fetch(url, opciones).then(function (respuesta) {
        global.clearTimeout(temporizador);

        if (!respuesta.ok) {
          return { ok: false, error: 'http', status: respuesta.status };
        }

        return respuesta.json().then(function (datos) {
          return { ok: true, data: datos };
        }, function () {
          return { ok: false, error: 'respuesta_invalida' };
        });
      }, function () {
        global.clearTimeout(temporizador);
        return { ok: false, error: 'red' };
      });
    }

    function normalizarRpc(datos) {
      if (!datos || typeof datos !== 'object') {
        return { ok: false, error: 'respuesta_invalida' };
      }

      if (datos.ok === false) {
        return { ok: false, error: datos.error || 'dato_invalido' };
      }

      return { ok: true, data: datos };
    }

    /**
     * Consulta GET a una tabla de Supabase.
     * @param {string} tabla Nombre de la tabla o vista.
     * @param {string} queryString Query string de PostgREST.
     * @returns {Promise<{ok: boolean, data: Array|Object|null, error: string|null}>}
     */
    function select(tabla, queryString) {
      if (!estaConfigurado()) {
        avisarSinConfigurar();
        return Promise.resolve({ ok: false, data: null, error: 'sin_configurar' });
      }

      var url = base() + '/' + tabla + (queryString ? '?' + queryString : '');
      var clave = 'GET ' + url;

      if (solicitudesEnVuelo[clave]) {
        return solicitudesEnVuelo[clave];
      }

      var promesa = pedir(url, {
        method: 'GET',
        headers: encabezados()
      }).then(function (respuesta) {
        delete solicitudesEnVuelo[clave];

        if (!respuesta.ok) {
          return { ok: false, data: null, error: respuesta.error };
        }

        return { ok: true, data: respuesta.data, error: null };
      }, function () {
        delete solicitudesEnVuelo[clave];
        return { ok: false, data: null, error: 'red' };
      });

      solicitudesEnVuelo[clave] = promesa;
      return promesa;
    }

    /**
     * Ejecuta una función RPC de Supabase.
     * @param {string} nombre Nombre de la función.
     * @param {Object} cuerpo Cuerpo JSON con los parámetros.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function rpc(nombre, cuerpo) {
      if (!estaConfigurado()) {
        avisarSinConfigurar();
        return Promise.resolve({ ok: false, data: null, error: 'sin_configurar' });
      }

      var url = base() + '/rpc/' + nombre;

      return pedir(url, {
        method: 'POST',
        headers: encabezados(),
        body: JSON.stringify(cuerpo || {})
      }).then(function (respuesta) {
        if (!respuesta.ok) {
          return { ok: false, data: null, error: respuesta.error };
        }

        var normalizada = normalizarRpc(respuesta.data);
        return {
          ok: normalizada.ok,
          data: normalizada.ok ? normalizada.data : null,
          error: normalizada.ok ? null : normalizada.error
        };
      });
    }

    /**
     * Obtiene las promociones vigentes.
     * @returns {Promise<{ok: boolean, data: Array, error: string|null}>}
     */
    function getPromociones() {
      return select(
        'promociones',
        'select=id,tipo,titulo,descripcion,imagen_url,desde,hasta&order=orden.asc,desde.desc'
      ).then(function (respuesta) {
        return {
          ok: respuesta.ok,
          data: respuesta.ok && Array.isArray(respuesta.data) ? respuesta.data : [],
          error: respuesta.error
        };
      });
    }

    /**
     * Obtiene la configuración pública del Club.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function getConfigClub() {
      return select(
        'config_club',
        'select=visitas_requeridas,premio_descripcion&id=eq.1'
      ).then(function (respuesta) {
        var primero = respuesta.ok && Array.isArray(respuesta.data) && respuesta.data.length > 0
          ? respuesta.data[0]
          : null;

        return {
          ok: respuesta.ok,
          data: primero,
          error: respuesta.error
        };
      });
    }

    /**
     * Obtiene el catálogo público agrupado por tipo.
     * @returns {Promise<{ok: boolean, data: Object, error: string|null}>}
     */
    function getCatalogo() {
      return select(
        'catalogo_publico',
        'select=tipo,nombre,orden&order=orden.asc,nombre.asc'
      ).then(function (respuesta) {
        var agrupado = { barbero: [], servicio: [], sucursal: [] };

        if (respuesta.ok && Array.isArray(respuesta.data)) {
          respuesta.data.forEach(function (item) {
            if (!item || typeof item.nombre !== 'string') {
              return;
            }
            if (item.tipo === 'barbero' || item.tipo === 'servicio' || item.tipo === 'sucursal') {
              agrupado[item.tipo].push(item.nombre);
            }
          });
        }

        return {
          ok: respuesta.ok,
          data: agrupado,
          error: respuesta.error
        };
      });
    }

    /**
     * Consulta el estado de una tarjeta por token.
     * @param {string} token Token del miembro.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function estadoTarjeta(token) {
      if (typeof token !== 'string' || !CONFIG.TOKEN_REGEX.test(token)) {
        return Promise.resolve({ ok: false, data: null, error: 'token_invalido' });
      }

      return rpc('estado_tarjeta', { p_token: token });
    }

    /**
     * Recupera el token de una tarjeta con WhatsApp y fecha de nacimiento.
     * @param {string} whatsapp Número tal como lo escribió el usuario.
     * @param {string} fechaNacimiento Fecha en formato YYYY-MM-DD.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function recuperarTarjeta(whatsapp, fechaNacimiento) {
      return rpc('recuperar_tarjeta', {
        p_whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : '',
        p_fecha_nacimiento: typeof fechaNacimiento === 'string' ? fechaNacimiento : ''
      });
    }

    /**
     * Registra un cliente y devuelve el token de su tarjeta.
     * @param {Object} payload Datos validados del formulario.
     * @returns {Promise<{ok: boolean, data: Object|null, error: string|null}>}
     */
    function registrarCliente(payload) {
      return rpc('registrar_cliente', { p: payload || {} });
    }

    return {
      select: select,
      rpc: rpc,
      getPromociones: getPromociones,
      getConfigClub: getConfigClub,
      getCatalogo: getCatalogo,
      estadoTarjeta: estadoTarjeta,
      recuperarTarjeta: recuperarTarjeta,
      registrarCliente: registrarCliente
    };
  })();

  /**
   * Mensajes de usuario para códigos de error.
   */
  var mensajes = {
    datos_incorrectos: 'No encontramos esa combinación. Revisá tu número y tu fecha de nacimiento.',
    demasiados_intentos: 'Demasiados intentos. Probá de nuevo en una hora o consultá en el local.',
    red: 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.',
    ya_registrado: 'Ese número ya tiene tarjeta. Ingresá desde la página principal.',
    consentimiento_requerido: 'Tenés que aceptar el consentimiento para continuar.',
    nombre_invalido: 'Ingresá tu nombre completo.',
    whatsapp_invalido: 'Revisá tu número de WhatsApp.',
    edad_requerida: 'Indicá tu fecha de nacimiento o tu rango de edad.',
    fecha_invalida: 'Revisá tu fecha de nacimiento.',
    dato_invalido: 'Revisá los datos ingresados e intentá de nuevo.',
    token_invalido: 'Tu sesión ya no es válida. Ingresá de nuevo.',
    http: 'Algo salió mal. Intentá de nuevo en unos minutos.',
    respuesta_invalida: 'Algo salió mal. Intentá de nuevo en unos minutos.',
    sin_configurar: 'Algo salió mal. Intentá de nuevo en unos minutos.'
  };

  /**
   * Devuelve el mensaje de usuario para un código de error.
   * @param {string} codigo Código de error.
   * @returns {string} Mensaje legible.
   */
  function msg(codigo) {
    if (typeof codigo === 'string' && mensajes[codigo]) {
      return mensajes[codigo];
    }
    return 'Algo salió mal. Intentá de nuevo en unos minutos.';
  }

  /**
   * Utilidades de formato de fechas y textos.
   */
  var fmt = (function () {
    function partesFecha(valor) {
      if (typeof valor !== 'string') {
        return null;
      }

      var coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
      if (!coincidencia) {
        return null;
      }

      var anio = parseInt(coincidencia[1], 10);
      var mes = parseInt(coincidencia[2], 10);
      var dia = parseInt(coincidencia[3], 10);

      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
        return null;
      }

      return { anio: anio, mes: mes, dia: dia };
    }

    function dosDigitos(numero) {
      return numero < 10 ? '0' + numero : String(numero);
    }

    /**
     * Convierte una fecha YYYY-MM-DD a dd/mm/aaaa.
     * @param {string} valor Fecha de calendario.
     * @returns {string} Fecha formateada o cadena vacía.
     */
    function fechaCorta(valor) {
      var partes = partesFecha(valor);
      if (!partes) {
        return '';
      }
      return dosDigitos(partes.dia) + '/' + dosDigitos(partes.mes) + '/' + partes.anio;
    }

    /**
     * Devuelve la fecha local de hoy en YYYY-MM-DD.
     * @returns {string}
     */
    function hoyLocal() {
      var ahora = new Date();
      return (
        ahora.getFullYear() + '-' +
        dosDigitos(ahora.getMonth() + 1) + '-' +
        dosDigitos(ahora.getDate())
      );
    }

    /**
     * Texto de vigencia de una promoción.
     * @param {string|null} desde Fecha inicial.
     * @param {string|null} hasta Fecha final.
     * @returns {string}
     */
    function vigencia(desde, hasta) {
      if (!hasta) {
        return '';
      }
      return 'Hasta el ' + fechaCorta(hasta);
    }

    /**
     * Texto de rango para un evento.
     * @param {string} desde Fecha inicial.
     * @param {string|null} hasta Fecha final.
     * @returns {string}
     */
    function rangoEvento(desde, hasta) {
      var inicio = fechaCorta(desde);

      if (!inicio) {
        return '';
      }

      if (!hasta || hasta === desde) {
        return inicio;
      }

      var fin = fechaCorta(hasta);
      if (!fin) {
        return inicio;
      }

      return inicio + ' al ' + fin;
    }

    /**
     * Devuelve el primer nombre de un texto.
     * @param {string} texto Nombre completo.
     * @returns {string}
     */
    function primerNombre(texto) {
      if (typeof texto !== 'string') {
        return '';
      }
      var partes = texto.trim().split(/\s+/);
      return partes.length > 0 ? partes[0] : '';
    }

    /**
     * Valida que una URL use HTTPS.
     * @param {string} url URL a validar.
     * @returns {boolean}
     */
    function esUrlHttps(url) {
      return typeof url === 'string' && url.indexOf('https://') === 0;
    }

    return {
      fechaCorta: fechaCorta,
      hoyLocal: hoyLocal,
      vigencia: vigencia,
      rangoEvento: rangoEvento,
      primerNombre: primerNombre,
      esUrlHttps: esUrlHttps
    };
  })();

  /**
   * Utilidades para el enlace compartible de la tarjeta.
   */
  var links = {
    /**
     * Crea la URL absoluta de la tarjeta con el token.
     * @param {string} token Token del miembro.
     * @returns {string} URL absoluta o cadena vacía.
     */
    urlTarjeta: function (token) {
      if (typeof token !== 'string' || !CONFIG.TOKEN_REGEX.test(token)) {
        return '';
      }

      try {
        var url = new global.URL(CONFIG.PAGINAS.index, global.location.href);
        url.searchParams.set('t', token);
        return url.href;
      } catch (error) {
        return '';
      }
    }
  };

  /**
   * Utilidades mínimas de DOM.
   */
  var dom = {
    /**
     * Busca el primer elemento con un data-club.
     * @param {string} nombre Valor del atributo data-club.
     * @param {ParentNode} [raiz] Raíz opcional de búsqueda.
     * @returns {Element|null}
     */
    hook: function (nombre, raiz) {
      var contenedor = raiz || global.document;
      return contenedor.querySelector('[data-club="' + nombre + '"]');
    },

    /**
     * Busca todos los elementos con un data-club.
     * @param {string} nombre Valor del atributo data-club.
     * @param {ParentNode} [raiz] Raíz opcional de búsqueda.
     * @returns {Element[]}
     */
    hooks: function (nombre, raiz) {
      var contenedor = raiz || global.document;
      return Array.prototype.slice.call(
        contenedor.querySelectorAll('[data-club="' + nombre + '"]')
      );
    },

    /**
     * Busca el mensaje de error de un campo.
     * @param {string} campo Nombre del campo.
     * @param {ParentNode} [raiz] Raíz opcional de búsqueda.
     * @returns {Element|null}
     */
    hookError: function (campo, raiz) {
      var contenedor = raiz || global.document;
      return contenedor.querySelector('[data-club-error="' + campo + '"]');
    },

    /**
     * Muestra un elemento.
     * @param {Element|null} elemento Elemento a mostrar.
     */
    show: function (elemento) {
      if (elemento) {
        elemento.removeAttribute('hidden');
      }
    },

    /**
     * Oculta un elemento.
     * @param {Element|null} elemento Elemento a ocultar.
     */
    hide: function (elemento) {
      if (elemento) {
        elemento.setAttribute('hidden', '');
      }
    },

    /**
     * Escribe texto seguro en un elemento.
     * @param {Element|null} elemento Elemento destino.
     * @param {string} texto Texto a insertar.
     */
    setText: function (elemento, texto) {
      if (elemento) {
        elemento.textContent = typeof texto === 'string' ? texto : '';
      }
    },

    /**
     * Ejecuta una función cuando el DOM está listo.
     * @param {Function} fn Función a ejecutar.
     */
    ready: function (fn) {
      if (global.document.readyState !== 'loading') {
        fn();
        return;
      }
      global.document.addEventListener('DOMContentLoaded', fn);
    },

    /**
     * Copia texto al portapapeles.
     * @param {string} texto Texto a copiar.
     * @returns {Promise<boolean>} true si se copió.
     */
    copiarTexto: function (texto) {
      if (typeof texto !== 'string' || texto === '') {
        return Promise.resolve(false);
      }

      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        return global.navigator.clipboard.writeText(texto).then(function () {
          return true;
        }, function () {
          return copiarConTextarea(texto);
        });
      }

      return Promise.resolve(copiarConTextarea(texto));
    }
  };

  function copiarConTextarea(texto) {
    var area = global.document.createElement('textarea');
    var copiado = false;

    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    global.document.body.appendChild(area);
    area.select();

    try {
      copiado = global.document.execCommand('copy');
    } catch (error) {
      copiado = false;
    }

    global.document.body.removeChild(area);
    return copiado;
  }

  TajosClub.config = config;
  TajosClub.session = session;
  TajosClub.api = api;
  TajosClub.mensajes = mensajes;
  TajosClub.msg = msg;
  TajosClub.fmt = fmt;
  TajosClub.links = links;
  TajosClub.dom = dom;
  TajosClub.version = '1.0.0';

  global.TajosClub = TajosClub;
})(window);
