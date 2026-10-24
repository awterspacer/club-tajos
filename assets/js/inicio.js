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

  var modoDegradado = false;
  var contenidoVisible = false;
  var promocionesListas = false;
  var estadoListo = false;

  function activarModoDegradado() {
    modoDegradado = true;

    dom.hide(dom.hook('saludo'));
    dom.hide(dom.hook('progreso'));

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

  function alCargarEstado(estado) {
    restaurarModoCompleto();
    ui.renderMiembro(estado);

    if (!contenidoVisible) {
      return ui.mostrarContenidoMiembro().then(function () {
        contenidoVisible = true;
        estadoListo = true;
        ui.motion.observar(dom.hook('contenido-miembro'));
        intentarAncla();
      });
    }

    estadoListo = true;
    ui.motion.observar(dom.hook('contenido-miembro'));
  }

  function alErrorEstado() {
    var errorCarga = dom.hook('error-carga');

    if (errorCarga) {
      ui.mostrarErrorCarga(observador.recargar);
      return;
    }

    activarModoDegradado();
  }

  function alRecuperarRed() {
    /* El usuario decide reintentar si hay un error visible. */
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

    var comportamiento = ui.motion.nivel === 'minimo' ? 'auto' : 'smooth';

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

      observador = ui.sesionObservar({
        intervaloMs: 60000,
        alCargar: alCargarEstado,
        alError: alErrorEstado,
        alRecuperarRed: alRecuperarRed
      });

      observador.recargar();
      cargarPromociones();
    } catch (error) {
      /* La página permanece utilizable. */
    }
  }

  var observador = null;

  dom.ready(iniciar);
})(window);
