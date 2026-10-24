(function (global) {
  'use strict';

  var TajosClub = global.TajosClub;

  if (!TajosClub) {
    console.warn('Club Tajos: no se encontró la base compartida.');
    return;
  }

  var dom = TajosClub.dom;
  var api = TajosClub.api;
  var fmt = TajosClub.fmt;
  var msg = TajosClub.msg;
  var session = TajosClub.session;

  var ui = TajosClub.ui || {};
  var existingMotion = ui.motion || {};

  var SELECTORES_REVELADO = [
    'main > section',
    'main > div[data-club="vacio"]',
    'form[data-club="registro-form"] fieldset',
    '[data-club="lista"] .club-card',
    '.club-sucursal',
    '.club-accesos',
    '.club-resumen',
    '[data-club="tarjeta"]'
  ];

  var ETIQUETAS_TIPO = {
    novedad: 'Novedad',
    promocion: 'Promoción',
    descuento: 'Descuento',
    evento: 'Evento'
  };

  var observadorRevelado = null;
  var observadorChips = null;
  var elementosChips = [];
  var temporizadorDialogo = null;
  var disparadorDialogo = null;
  var trampaFocoActiva = false;

  function esReducidoMovimiento() {
    var consulta = global.matchMedia('(prefers-reduced-motion: reduce)');
    return Boolean(consulta && consulta.matches);
  }

  function esDispositivoLimitado() {
    var nucleos = global.navigator.hardwareConcurrency;
    var memoria = global.navigator.deviceMemory;

    if (typeof nucleos === 'number' && nucleos > 0 && nucleos <= 4) {
      return true;
    }

    if (typeof memoria === 'number' && memoria > 0 && memoria <= 2) {
      return true;
    }

    return false;
  }

  function calcularNivel() {
    if (esReducidoMovimiento()) {
      return 'minimo';
    }
    if (esDispositivoLimitado()) {
      return 'ligero';
    }
    return 'completo';
  }

  function aplicarNivel() {
    var nivel = calcularNivel();
    motion.nivel = nivel;
    global.document.documentElement.setAttribute('data-motion', nivel);
  }

  function leerDuracion(nombreVariable, respaldo) {
    var valor = '';
    var numero = 0;
    var unidad = '';

    try {
      valor = global
        .getComputedStyle(global.document.documentElement)
        .getPropertyValue(nombreVariable);
    } catch (error) {
      valor = '';
    }

    valor = (valor || '').trim();

    if (valor === '') {
      return respaldo;
    }

    if (valor.indexOf('ms') !== -1) {
      unidad = 'ms';
      numero = parseFloat(valor);
    } else if (valor.indexOf('s') !== -1) {
      unidad = 's';
      numero = parseFloat(valor) * 1000;
    } else {
      numero = parseFloat(valor);
      unidad = 'ms';
    }

    if (!isFinite(numero) || numero < 0) {
      return respaldo;
    }

    return Math.round(numero);
  }

  function siguienteCuadro(fn) {
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(fn);
    });
  }

  function marcarListo(elemento) {
    if (elemento) {
      elemento.setAttribute('data-club-listo', '');
    }
  }

  function yaListo(elemento) {
    return Boolean(elemento && elemento.hasAttribute('data-club-listo'));
  }

  /**
   * Capa de movimiento compartida.
   */
  var motion = {
    nivel: 'completo',

    /**
     * Devuelve la duración configurada para un tipo de movimiento.
     * @param {string} nombre 'control' | 'reveal' | 'vista'.
     * @returns {number} Duración en milisegundos.
     */
    dur: function (nombre) {
      if (motion.nivel === 'minimo') {
        return 0;
      }

      if (nombre === 'control') {
        return leerDuracion('--club-dur-control', 220);
      }
      if (nombre === 'reveal') {
        return leerDuracion('--club-dur-reveal', 560);
      }
      if (nombre === 'vista') {
        return leerDuracion('--club-dur-vista', 720);
      }

      return 0;
    },

    /**
     * Registra bloques para revelarlos al entrar en pantalla.
     * @param {ParentNode} [raiz] Raíz opcional de búsqueda.
     */
    observar: function (raiz) {
      var contenedor = raiz || global.document;
      var objetivos = [];
      var indice = 0;

      if (motion.nivel === 'minimo' || typeof global.IntersectionObserver !== 'function') {
        objetivos = contenedor.querySelectorAll(SELECTORES_REVELADO.join(','));
        for (indice = 0; indice < objetivos.length; indice += 1) {
          objetivos[indice].setAttribute('data-reveal', 'visible');
        }
        return;
      }

      if (!observadorRevelado) {
        observadorRevelado = new global.IntersectionObserver(function (entradas) {
          entradas.forEach(function (entrada) {
            if (!entrada.isIntersecting) {
              return;
            }

            entrada.target.setAttribute('data-reveal', 'visible');
            observadorRevelado.unobserve(entrada.target);
          });
        }, {
          threshold: 0.12,
          rootMargin: '0px 0px -8% 0px'
        });
      }

      objetivos = contenedor.querySelectorAll(SELECTORES_REVELADO.join(','));

      for (indice = 0; indice < objetivos.length; indice += 1) {
        var elemento = objetivos[indice];

        if (elemento.hasAttribute('data-reveal')) {
          continue;
        }

        var rect = elemento.getBoundingClientRect();
        var yaVisible = rect.top < global.innerHeight && rect.bottom > 0;

        if (yaVisible) {
          elemento.setAttribute('data-reveal', 'visible');
          elemento.setAttribute('data-reveal-inicial', '');
        } else {
          elemento.setAttribute('data-reveal', 'pendiente');
          observadorRevelado.observe(elemento);
        }
      }

      escalonarGrupos(contenedor);
    },

    /**
     * Transiciona entre dos bloques de vista.
     * @param {Element|null} salir Elemento que sale.
     * @param {Element|null} entrar Elemento que entra.
     * @param {{foco?: boolean}} [opciones] Opciones de transición.
     * @returns {Promise<void>}
     */
    cambiarVista: function (salir, entrar, opciones) {
      var configuracion = opciones || {};
      var duracion = motion.dur('vista');

      if (motion.nivel === 'minimo' || duracion === 0) {
        if (salir) {
          salir.setAttribute('hidden', '');
          salir.removeAttribute('data-estado');
        }
        if (entrar) {
          dom.show(entrar);
          entrar.setAttribute('data-estado', 'visible');
          enfocarEncabezado(entrar, configuracion.foco);
        }
        return Promise.resolve();
      }

      return new Promise(function (resolver) {
        if (salir) {
          salir.setAttribute('data-estado', 'saliendo');
        }

        global.setTimeout(function () {
          if (salir) {
            salir.setAttribute('hidden', '');
            salir.removeAttribute('data-estado');
          }

          if (entrar) {
            dom.show(entrar);
            entrar.setAttribute('data-estado', 'entrando');

            global.setTimeout(function () {
              entrar.setAttribute('data-estado', 'visible');
              enfocarEncabezado(entrar, configuracion.foco);
              resolver();
            }, 30);
          } else {
            resolver();
          }
        }, duracion);
      });
    },

    /**
     * Muestra u oculta un campo condicional.
     * @param {Element|null} elemento Campo a controlar.
     * @param {boolean} visible Indica si debe verse.
     */
    revelarCampo: function (elemento, visible) {
      if (!elemento) {
        return;
      }

      if (visible) {
        dom.show(elemento);
        elemento.setAttribute('data-estado', 'visible');
        return;
      }

      elemento.setAttribute('data-estado', 'oculto');

      var duracion = motion.dur('control');

      global.setTimeout(function () {
        dom.hide(elemento);
      }, duracion);
    },

    /**
     * Actualiza una barra de progreso con su valor real.
     * @param {Element|null} progressEl Elemento progress.
     * @param {number} valor Valor actual.
     * @param {number} max Valor máximo.
     */
    progreso: function (progressEl, valor, max) {
      if (!progressEl) {
        return;
      }

      var maximo = typeof max === 'number' && max > 0 ? max : 1;
      var actual = typeof valor === 'number' && valor >= 0 ? valor : 0;
      var avance = Math.max(0, Math.min(1, actual / maximo));

      progressEl.setAttribute('max', String(maximo));
      progressEl.setAttribute('value', String(actual));
      progressEl.setAttribute('data-progreso', 'listo');
      progressEl.style.setProperty('--club-progreso', String(avance));

      if (motion.nivel === 'minimo') {
        return;
      }

      progressEl.setAttribute('data-progreso', 'inicial');
      progressEl.style.setProperty('--club-progreso', '0');

      siguienteCuadro(function () {
        progressEl.setAttribute('data-progreso', 'listo');
        progressEl.style.setProperty('--club-progreso', String(avance));
      });
    }
  };

  function escalonarGrupos(raiz) {
    var grupos = raiz.querySelectorAll('[data-club="lista"], fieldset[data-club="lista-servicios"], .club-sellos');
    var indiceGrupo = 0;

    for (indiceGrupo = 0; indiceGrupo < grupos.length; indiceGrupo += 1) {
      var hijos = grupos[indiceGrupo].children;
      var indice = 0;

      for (indice = 0; indice < hijos.length; indice += 1) {
        var escalon = indice > 8 ? 8 : indice;
        hijos[indice].style.setProperty('--club-i', String(escalon));
      }
    }
  }

  function enfocarEncabezado(bloque, permitirFoco) {
    if (!bloque || permitirFoco === false) {
      return;
    }

    var encabezado = bloque.querySelector('h1, h2, h3');

    if (!encabezado) {
      return;
    }

    encabezado.setAttribute('tabindex', '-1');
    encabezado.focus();

    global.setTimeout(function () {
      encabezado.removeAttribute('tabindex');
    }, 0);
  }

  /**
   * Inicializa los componentes de interfaz compartidos.
   * @returns {void}
   */
  ui.init = function () {
    aplicarNivel();

    global.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', aplicarNivel);

    motion.observar(global.document);

    var botonesSalir = dom.hooks('btn-salir');

    botonesSalir.forEach(function (boton) {
      if (yaListo(boton)) {
        return;
      }
      boton.addEventListener('click', function () {
        session.salir();
      });
      marcarListo(boton);
    });

    dom.hooks('agendar').forEach(function (enlace) {
      if (yaListo(enlace)) {
        return;
      }
      enlace.addEventListener('click', function (evento) {
        if (typeof ui.hooks.alAgendar === 'function') {
          ui.hooks.alAgendar(evento);
        }
      });
      marcarListo(enlace);
    });

    var camposFecha = global.document.querySelectorAll('input[name="fecha_nacimiento"]');
    var hoy = fmt.hoyLocal();
    var indice = 0;

    for (indice = 0; indice < camposFecha.length; indice += 1) {
      camposFecha[indice].setAttribute('max', hoy);
    }
  };

  /**
   * Punto de extensión para comportamientos de agendamiento.
   */
  ui.hooks = {
    alAgendar: function () {}
  };

  /**
   * Alterna la interfaz entre visitante y miembro.
   * @param {'publico'|'miembro'} modo Modo de sesión.
   * @param {Object|null} estado Estado de la tarjeta del miembro.
   */
  ui.setModoSesion = function (modo, estado) {
    var publico = dom.hook('hero-publico');
    var miembro = dom.hook('hero-miembro');
    var btnIngresar = dom.hook('btn-ingresar');
    var btnTarjeta = dom.hook('btn-mi-tarjeta');

    if (modo === 'miembro') {
      if (btnIngresar) {
        dom.hide(btnIngresar);
      }
      if (btnTarjeta) {
        dom.show(btnTarjeta);
      }
      ui.renderMiembro(estado);
      motion.cambiarVista(publico, miembro, { foco: false });
      return;
    }

    if (btnIngresar) {
      dom.show(btnIngresar);
    }
    if (btnTarjeta) {
      dom.hide(btnTarjeta);
    }
    motion.cambiarVista(miembro, publico, { foco: false });
  };

  /**
   * Rellena los datos del miembro en la página actual.
   * @param {Object|null} estado Estado devuelto por estado_tarjeta.
   * @param {ParentNode} [raiz] Raíz opcional.
   */
  ui.renderMiembro = function (estado, raiz) {
    var contenedor = raiz || global.document;
    var datos = estado || {};

    var nombre = datos.nombre || '';
    var visitasTotales = typeof datos.visitas_totales === 'number' ? datos.visitas_totales : 0;
    var visitasRequeridas = typeof datos.visitas_requeridas === 'number' && datos.visitas_requeridas > 0
      ? datos.visitas_requeridas
      : 0;
    var progreso = typeof datos.progreso === 'number' ? datos.progreso : 0;
    var premios = typeof datos.premios_disponibles === 'number' ? datos.premios_disponibles : 0;
    var premio = datos.premio || '';
    var ultimaVisita = datos.ultima_visita || '';

    dom.hooks('miembro-nombre', contenedor).forEach(function (el) {
      dom.setText(el, nombre);
    });

    dom.hooks('premio', contenedor).forEach(function (el) {
      dom.setText(el, premio);
    });

    dom.hooks('visitas-requeridas', contenedor).forEach(function (el) {
      dom.setText(el, visitasRequeridas > 0 ? String(visitasRequeridas) : 'varias');
    });

    dom.hooks('visitas-faltan', contenedor).forEach(function (el) {
      var faltan = visitasRequeridas > 0 ? Math.max(0, visitasRequeridas - visitasTotales) : 0;
      dom.setText(el, String(faltan));
    });

    dom.hooks('premios-disponibles', contenedor).forEach(function (el) {
      dom.setText(el, String(premios));
    });

    dom.hooks('visitas-totales', contenedor).forEach(function (el) {
      dom.setText(el, String(visitasTotales));
    });

    dom.hooks('miembro-progreso', contenedor).forEach(function (barra) {
      motion.progreso(barra, progreso, visitasRequeridas || 1);
    });

    dom.hooks('miembro-progreso-texto', contenedor).forEach(function (el) {
      if (premios > 0) {
        dom.setText(el, 'Tarjeta completa');
      } else if (visitasRequeridas > 0) {
        dom.setText(el, visitasTotales + ' de ' + visitasRequeridas + ' visitas');
      } else {
        dom.setText(el, '');
      }
    });

    var bloquesUltima = dom.hooks('ultima-visita-bloque', contenedor);

    if (ultimaVisita) {
      dom.hooks('ultima-visita', contenedor).forEach(function (el) {
        dom.setText(el, fmt.fechaCorta(ultimaVisita));
      });
      bloquesUltima.forEach(function (bloque) {
        dom.show(bloque);
      });
    } else {
      bloquesUltima.forEach(function (bloque) {
        dom.hide(bloque);
      });
    }

    var avisosPremio = dom.hooks('miembro-premio', contenedor);

    if (premios > 0) {
      avisosPremio.forEach(function (aviso) {
        dom.show(aviso);
      });
      global.document.body.setAttribute('data-premio', 'si');
    } else {
      avisosPremio.forEach(function (aviso) {
        dom.hide(aviso);
      });
      global.document.body.setAttribute('data-premio', 'no');
    }

    var avisosSinVisitas = dom.hooks('sin-visitas', contenedor);

    if (visitasTotales === 0) {
      avisosSinVisitas.forEach(function (aviso) {
        dom.show(aviso);
      });
    } else {
      avisosSinVisitas.forEach(function (aviso) {
        dom.hide(aviso);
      });
    }
  };

  /**
   * Genera los sellos de la tarjeta de fidelidad.
   * @param {Object|null} estado Estado de la tarjeta.
   */
  ui.renderSellos = function (estado) {
    var contenedor = dom.hook('sellos');
    var plantilla = global.document.getElementById('tpl-sello');

    if (!contenedor || !plantilla) {
      return;
    }

    var datos = estado || {};
    var requeridas = typeof datos.visitas_requeridas === 'number' && datos.visitas_requeridas > 0
      ? datos.visitas_requeridas
      : 0;
    var progreso = typeof datos.progreso === 'number' ? datos.progreso : 0;
    var premios = typeof datos.premios_disponibles === 'number' ? datos.premios_disponibles : 0;

    contenedor.textContent = '';

    if (requeridas === 0) {
      return;
    }

    var llenadas = premios > 0 ? requeridas : Math.min(progreso, requeridas);
    var indice = 0;

    for (indice = 0; indice < requeridas; indice += 1) {
      var sello = plantilla.content.firstElementChild.cloneNode(true);
      var escalon = indice > 8 ? 8 : indice;

      sello.setAttribute('data-estado', 'pendiente');
      sello.style.setProperty('--club-i', String(escalon));

      var texto = sello.querySelector('[data-club="sello-texto"]');
      dom.setText(texto, 'Visita ' + (indice + 1) + ': pendiente');

      contenedor.appendChild(sello);
    }

    if (motion.nivel === 'minimo') {
      marcarSellosLlenos(contenedor, llenadas);
      return;
    }

    siguienteCuadro(function () {
      marcarSellosLlenos(contenedor, llenadas);
    });
  };

  function marcarSellosLlenos(contenedor, cantidad) {
    var sellos = contenedor.children;
    var indice = 0;

    for (indice = 0; indice < sellos.length; indice += 1) {
      var sello = sellos[indice];
      var texto = sello.querySelector('[data-club="sello-texto"]');

      if (indice < cantidad) {
        sello.setAttribute('data-estado', 'lleno');
        dom.setText(texto, 'Visita ' + (indice + 1) + ': completada');
      }
    }
  }

  /**
   * Renderiza promociones y contenido por tipo.
   * @param {Array} items Promociones vigentes.
   * @returns {{total: number, porTipo: Object}}
   */
  ui.renderPromociones = function (items) {
    var plantilla = global.document.getElementById('tpl-promo-card');
    var porTipo = { novedad: [], promocion: [], descuento: [], evento: [] };
    var total = 0;

    if (Array.isArray(items)) {
      items.forEach(function (item) {
        if (item && porTipo[item.tipo]) {
          porTipo[item.tipo].push(item);
          total += 1;
        }
      });
    }

    Object.keys(porTipo).forEach(function (tipo) {
      var seccion = global.document.getElementById(tipo + 's');
      var chip = global.document.querySelector('[data-club-chip="' + tipo + '"]');
      var lista = seccion ? seccion.querySelector('[data-club="lista"]') : null;

      if (lista) {
        lista.textContent = '';
      }

      if (porTipo[tipo].length === 0) {
        if (seccion) {
          dom.hide(seccion);
        }
        if (chip) {
          dom.hide(chip);
        }
        return;
      }

      if (seccion) {
        dom.show(seccion);
      }
      if (chip) {
        dom.show(chip);
      }

      if (!plantilla || !lista) {
        return;
      }

      porTipo[tipo].forEach(function (item) {
        var tarjeta = plantilla.content.firstElementChild.cloneNode(true);

        var badge = tarjeta.querySelector('[data-club="card-tipo"]');
        dom.setText(badge, ETIQUETAS_TIPO[tipo] || tipo);

        var titulo = tarjeta.querySelector('[data-club="card-titulo"]');
        dom.setText(titulo, item.titulo || '');

        var descripcion = tarjeta.querySelector('[data-club="card-descripcion"]');
        dom.setText(descripcion, item.descripcion || '');

        var vigenciaEl = tarjeta.querySelector('[data-club="card-vigencia"]');
        var textoVigencia = tipo === 'evento'
          ? fmt.rangoEvento(item.desde, item.hasta)
          : fmt.vigencia(item.desde, item.hasta);

        if (textoVigencia) {
          dom.setText(vigenciaEl, textoVigencia);
        } else {
          dom.hide(vigenciaEl);
        }

        var figura = tarjeta.querySelector('.club-card__media');
        var imagen = tarjeta.querySelector('img');

        if (figura && imagen && fmt.esUrlHttps(item.imagen_url)) {
          imagen.addEventListener('error', function () {
            dom.hide(figura);
          });
          imagen.setAttribute('src', item.imagen_url);
          imagen.setAttribute('alt', item.titulo || '');
          dom.show(figura);
        }

        lista.appendChild(tarjeta);
      });
    });

    var vacio = dom.hook('vacio');

    if (total === 0 && vacio) {
      dom.show(vacio);
    } else if (vacio) {
      dom.hide(vacio);
    }

    enlazarChips();
    observarChips();
    motion.observar(global.document);

    return { total: total, porTipo: porTipo };
  };

  function enlazarChips() {
    elementosChips = dom.hooks('chips').reduce(function (acumulado, nav) {
      return acumulado.concat(Array.prototype.slice.call(nav.querySelectorAll('.club-chip')));
    }, []);

    elementosChips.forEach(function (chip) {
      if (yaListo(chip)) {
        return;
      }

      chip.addEventListener('click', function (evento) {
        var destino = chip.getAttribute('href');
        var seccion = destino ? global.document.querySelector(destino) : null;

        if (!seccion) {
          return;
        }

        evento.preventDefault();
        seccion.scrollIntoView({
          behavior: motion.nivel === 'minimo' ? 'auto' : 'smooth',
          block: 'start'
        });
      });

      marcarListo(chip);
    });
  }

  function observarChips() {
    if (motion.nivel === 'minimo' || typeof global.IntersectionObserver !== 'function') {
      return;
    }

    if (observadorChips) {
      observadorChips.disconnect();
    }

    observadorChips = new global.IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) {
          return;
        }

        var id = entrada.target.id;

        elementosChips.forEach(function (chip) {
          var destino = chip.getAttribute('href');
          if (destino === '#' + id) {
            chip.setAttribute('aria-current', 'true');
          } else {
            chip.removeAttribute('aria-current');
          }
        });
      });
    }, {
      threshold: 0.4
    });

    ['novedades', 'promociones', 'descuentos', 'eventos'].forEach(function (id) {
      var seccion = global.document.getElementById(id);
      if (seccion && !seccion.hasAttribute('hidden')) {
        observadorChips.observe(seccion);
      }
    });
  }

  /**
   * Inicializa el diálogo de ingreso.
   * @param {{destino?: string}} [opciones] Destino luego de ingresar.
   */
  ui.initLogin = function (opciones) {
    var configuracion = opciones || {};
    var destino = configuracion.destino || 'inicio.html';
    var dialogo = global.document.getElementById('club-login-dialog');

    if (!dialogo) {
      return;
    }

    dom.hooks('btn-ingresar').forEach(function (boton) {
      if (yaListo(boton)) {
        return;
      }

      boton.addEventListener('click', function () {
        disparadorDialogo = boton;
        abrirDialogo(dialogo);
      });

      marcarListo(boton);
    });

    var cerrar = dom.hook('login-cerrar', dialogo);
    if (cerrar && !yaListo(cerrar)) {
      cerrar.addEventListener('click', function () {
        cerrarDialogo(dialogo);
      });
      marcarListo(cerrar);
    }

    dialogo.addEventListener('cancel', function (evento) {
      evento.preventDefault();
      cerrarDialogo(dialogo);
    });

    dialogo.addEventListener('click', function (evento) {
      if (evento.target === dialogo) {
        cerrarDialogo(dialogo);
      }
    });

    var formulario = dom.hook('login-form', dialogo);

    if (formulario && !yaListo(formulario)) {
      formulario.addEventListener('submit', function (evento) {
        evento.preventDefault();
        enviarLogin(dialogo, formulario, destino);
      });
      marcarListo(formulario);
    }
  };

  function abrirDialogo(dialogo) {
    dialogo.setAttribute('data-estado', 'abriendo');

    if (typeof dialogo.showModal === 'function') {
      dialogo.showModal();
    } else {
      dialogo.setAttribute('open', '');
      activarTrampaFoco(dialogo);
    }

    global.setTimeout(function () {
      dialogo.setAttribute('data-estado', 'abierto');
    }, 30);
  }

  function cerrarDialogo(dialogo) {
    var duracion = motion.dur('control');

    dialogo.setAttribute('data-estado', 'cerrando');

    global.clearTimeout(temporizadorDialogo);
    temporizadorDialogo = global.setTimeout(function () {
      if (typeof dialogo.close === 'function') {
        dialogo.close();
      } else {
        dialogo.removeAttribute('open');
        desactivarTrampaFoco();
      }

      dialogo.removeAttribute('data-estado');

      if (disparadorDialogo) {
        disparadorDialogo.focus();
        disparadorDialogo = null;
      }
    }, duracion);
  }

  function activarTrampaFoco(dialogo) {
    if (trampaFocoActiva) {
      return;
    }

    trampaFocoActiva = true;

    global.document.addEventListener('keydown', function (evento) {
      if (evento.key !== 'Tab' || !dialogo.hasAttribute('open')) {
        return;
      }

      var enfocables = dialogo.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (enfocables.length === 0) {
        return;
      }

      var primero = enfocables[0];
      var ultimo = enfocables[enfocables.length - 1];

      if (evento.shiftKey && global.document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && global.document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    });
  }

  function desactivarTrampaFoco() {
    trampaFocoActiva = false;
  }

  function enviarLogin(dialogo, formulario, destino) {
    var whatsapp = formulario.elements.whatsapp;
    var fecha = formulario.elements.fecha_nacimiento;
    var error = dom.hook('login-error', dialogo);
    var boton = dom.hook('login-submit', dialogo);

    var mensaje = '';

    if (!whatsapp || whatsapp.value.trim() === '') {
      mensaje = msg('whatsapp_invalido');
    } else if (!fecha || fecha.value === '') {
      mensaje = msg('fecha_invalida');
    }

    if (mensaje !== '') {
      dom.setText(error, mensaje);
      dom.show(error);
      return;
    }

    dom.hide(error);
    ui.setCargando(boton, true, 'Ingresando…');
    formulario.setAttribute('data-estado', 'cargando');

    api.recuperarTarjeta(whatsapp.value, fecha.value).then(function (respuesta) {
      if (respuesta.ok && respuesta.data && typeof respuesta.data.token === 'string') {
        session.setToken(respuesta.data.token);
        global.location.href = destino;
        return;
      }

      ui.setCargando(boton, false, 'Ingresar');
      formulario.removeAttribute('data-estado');
      dom.setText(error, msg(respuesta.error || 'datos_incorrectos'));
      dom.show(error);
    });
  }

  /**
   * Marca o desmarca el estado de carga de un botón.
   * @param {Element|null} boton Botón a controlar.
   * @param {boolean} activo Indica si está cargando.
   * @param {string} [textoActivo] Texto mientras carga.
   */
  ui.setCargando = function (boton, activo, textoActivo) {
    if (!boton) {
      return;
    }

    if (activo) {
      boton.setAttribute('aria-busy', 'true');
      boton.setAttribute('data-estado', 'cargando');
      boton.disabled = true;
      if (typeof textoActivo === 'string') {
        boton.setAttribute('data-texto-original', boton.textContent);
        dom.setText(boton, textoActivo);
      }
      return;
    }

    boton.removeAttribute('aria-busy');
    boton.removeAttribute('data-estado');
    boton.disabled = false;

    var textoOriginal = boton.getAttribute('data-texto-original');
    if (textoOriginal) {
      dom.setText(boton, textoOriginal);
      boton.removeAttribute('data-texto-original');
    }
  };

  /**
   * Muestra el error de un campo del formulario.
   * @param {string} nombre Nombre del campo.
   * @param {string} mensaje Mensaje de error.
   */
  ui.setErrorCampo = function (nombre, mensaje) {
    var campo = global.document.querySelector('[name="' + nombre + '"]');
    var error = dom.hookError(nombre);

    if (error) {
      dom.setText(error, mensaje || '');
      if (mensaje) {
        dom.show(error);
      } else {
        dom.hide(error);
      }
    }

    if (!campo) {
      return;
    }

    if (mensaje) {
      campo.setAttribute('aria-invalid', 'true');

      if (error && error.id) {
        var descritos = campo.getAttribute('aria-describedby') || '';
        if (descritos.indexOf(error.id) === -1) {
          campo.setAttribute(
            'aria-describedby',
            (descritos ? descritos + ' ' : '') + error.id
          );
        }
      }
    } else {
      campo.removeAttribute('aria-invalid');
    }
  };

  /**
   * Limpia los errores de un formulario.
   * @param {HTMLFormElement|null} formulario Formulario a limpiar.
   */
  ui.limpiarErrores = function (formulario) {
    if (!formulario) {
      return;
    }

    var errores = formulario.querySelectorAll('[data-club-error]');
    var indice = 0;

    for (indice = 0; indice < errores.length; indice += 1) {
      dom.setText(errores[indice], '');
      dom.hide(errores[indice]);
    }

    var campos = formulario.querySelectorAll('[aria-invalid="true"]');
    for (indice = 0; indice < campos.length; indice += 1) {
      campos[indice].removeAttribute('aria-invalid');
    }

    ui.mostrarErrorGeneral('');
  };

  /**
   * Muestra u oculta el error general del formulario.
   * @param {string} mensaje Mensaje de error.
   */
  ui.mostrarErrorGeneral = function (mensaje) {
    var error = dom.hook('form-error');

    if (!error) {
      return;
    }

    dom.setText(error, mensaje || '');

    if (mensaje) {
      dom.show(error);
    } else {
      dom.hide(error);
    }
  };

  /**
   * Inicializa el bloque para guardar y copiar el enlace de tarjeta.
   */
  ui.initEnlaceTarjeta = function () {
    var entrada = dom.hook('link-tarjeta');
    var boton = dom.hook('copiar-link');
    var estado = dom.hook('copiar-estado');
    var token = session.getToken();

    if (!entrada || !boton || token === '') {
      return;
    }

    dom.setText(entrada, TajosClub.links.urlTarjeta(token));

    if (yaListo(boton)) {
      return;
    }

    boton.addEventListener('click', function () {
      dom.copiarTexto(entrada.value).then(function (copiado) {
        if (copiado) {
          dom.setText(estado, '¡Copiado!');
          dom.show(estado);

          global.setTimeout(function () {
            dom.hide(estado);
          }, 2000);
          return;
        }

        dom.setText(estado, 'No se pudo copiar. Seleccioná el enlace y copialo manualmente.');
        dom.show(estado);
        entrada.select();
      });
    });

    marcarListo(boton);
  };

  /**
   * Muestra el contenido privado luego de validar la sesión.
   * @returns {Promise<void>}
   */
  ui.mostrarContenidoMiembro = function () {
    var cargando = dom.hook('cargando');
    var contenido = dom.hook('contenido-miembro');

    return motion.cambiarVista(cargando, contenido, { foco: false });
  };

  /**
   * Muestra el error de carga con opción de reintento.
   * @param {Function} [alReintentar] Función a ejecutar al reintentar.
   */
  ui.mostrarErrorCarga = function (alReintentar) {
    var cargando = dom.hook('cargando');
    var contenido = dom.hook('contenido-miembro');
    var error = dom.hook('error-carga');
    var boton = dom.hook('reintentar');

    if (cargando) {
      dom.hide(cargando);
    }
    if (contenido) {
      dom.hide(contenido);
    }
    if (error) {
      dom.show(error);
    }

    if (boton && !yaListo(boton)) {
      boton.addEventListener('click', function () {
        if (typeof alReintentar === 'function') {
          alReintentar();
        }
      });
      marcarListo(boton);
    }
  };

  ui.motion = motion;

  global.TajosClub.ui = ui;
})(window);