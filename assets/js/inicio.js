(function (global) {
  'use strict';

  var TajosClub = global.TajosClub;

  if (!TajosClub || !TajosClub.ui || !TajosClub.session || !TajosClub.api || !TajosClub.dom) {
    return;
  }

  var dom = TajosClub.dom;
  var api = TajosClub.api;
  var ui = TajosClub.ui;
  var session = TajosClub.session;

  var INTERVALO_ACTUALIZACION = 60000;
  var ultimaCargaCorrecta = 0;
  var actualizando = false;
  var modoDegradado = false;
  var contenidoVisible = false;
  var promocionesListas = false;
  var estadoListo = false;

  function marcarListo(elemento) {
    if (elemento) {
      elemento.setAttribute('data-club-listo', '');
    }
  }

  function yaListo(elemento) {
    return Boolean(elemento && elemento.hasAttribute('data-club-listo'));
  }

  function irAIndex() {
    global.location.replace('index.html');
  }

  function activarModoDegradado() {
    modoDegradado = true;

    var saludo = dom.hook('saludo');
    var progreso = dom.hook('progreso');

    dom.hide(saludo);
    dom.hide(progreso);

    return ui.mostrarContenidoMiembro().then(function () {
      contenidoVisible = true;
      ui.motion.observar(dom.hook('contenido-miembro'));
      intentarAncla();
    });
  }

  function restaurarModoCompleto() {
    if (!modoDegradado) {
      return;
    }

    modoDegradado = false;

    dom.show(dom.hook('saludo'));
    dom.show(dom.hook('progreso'));
  }

  function cargarEstado() {
    if (actualizando) {
      return;
    }

    actualizando = true;

    return session.cargarEstado().then(function (respuesta) {
      actualizando = false;

      if (respuesta.ok) {
        ultimaCargaCorrecta = Date.now();
        restaurarModoCompleto();
        ui.renderMiembro(respuesta.data);

        if (!contenidoVisible) {
          return ui.mostrarContenidoMiembro().then(function () {
            contenidoVisible = true;
            estadoListo = true;
            ui.motion.observar(dom.hook('contenido-miembro'));
            intentarAncla();
          });
        }

        estadoListo = true;
        return;
      }

      if (respuesta.error === 'token_invalido') {
        irAIndex();
        return;
      }

      var errorCarga = dom.hook('error-carga');

      if (errorCarga) {
        ui.mostrarErrorCarga(cargarEstado);
        return;
      }

      return activarModoDegradado();
    });
  }

  function cargarPromociones() {
    return api.getPromociones().then(function (respuesta) {
      var items = respuesta.ok && Array.isArray(respuesta.data) ? respuesta.data : [];
      ui.renderPromociones(items);
      promocionesListas = true;
      intentarAncla();
    });
  }

  function intentarAncla() {
    if (!contenidoVisible || !estadoListo || !promocionesListas) {
      return;
    }

    var hash = global.location.hash.replace('#', '');

    if (hash === '') {
      return;
    }

    var destino = global.document.getElementById(hash);

    if (!destino || destino.hasAttribute('hidden')) {
      return;
    }

    var comportamiento = ui.motion && ui.motion.nivel === 'minimo' ? 'auto' : 'smooth';

    destino.scrollIntoView({
      behavior: comportamiento,
      block: 'start'
    });

    destino.setAttribute('tabindex', '-1');
    destino.focus();

    global.setTimeout(function () {
      destino.removeAttribute('tabindex');
    }, 0);
  }

  function actualizarSilenciosamente() {
    if (actualizando || !session.hasToken()) {
      return;
    }

    if (Date.now() - ultimaCargaCorrecta < INTERVALO_ACTUALIZACION) {
      return;
    }

    actualizando = true;

    session.cargarEstado().then(function (respuesta) {
      actualizando = false;

      if (respuesta.ok) {
        ultimaCargaCorrecta = Date.now();
        restaurarModoCompleto();
        ui.renderMiembro(respuesta.data);
        ui.motion.observar(dom.hook('contenido-miembro'));
        return;
      }

      if (respuesta.error === 'token_invalido') {
        irAIndex();
      }

      /* Otros errores se ignoran en silencio. */
    });
  }

  function debeActualizar() {
    return document.visibilityState === 'visible' && session.hasToken();
  }

  function enlazarActualizacion() {
    global.document.addEventListener('visibilitychange', function () {
      if (debeActualizar()) {
        actualizarSilenciosamente();
      }
    });

    global.addEventListener('online', function () {
      if (debeActualizar()) {
        actualizarSilenciosamente();
      }
    });

    global.addEventListener('pageshow', function (evento) {
      if (evento.persisted && session.hasToken()) {
        ultimaCargaCorrecta = 0;
        actualizarSilenciosamente();
      }
    });
  }

  function iniciar() {
    try {
      var sesion = session.init();

      if (sesion.redirigiendo) {
        return;
      }

      ui.init();

      if (!TajosClub.config.configurado) {
        activarModoDegradado();
        ui.renderPromociones([]);
        promocionesListas = true;
        estadoListo = true;
        return;
      }

      enlazarActualizacion();

      cargarEstado();
      cargarPromociones();
    } catch (error) {
      /* La página permanece utilizable. */
    }
  }

  dom.ready(iniciar);
})(window);
