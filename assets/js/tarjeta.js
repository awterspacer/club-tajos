(function (global) {
  'use strict';

  var TajosClub = global.TajosClub;

  if (!TajosClub || !TajosClub.ui || !TajosClub.session || !TajosClub.api || !TajosClub.dom) {
    return;
  }

  var dom = TajosClub.dom;
  var ui = TajosClub.ui;
  var session = TajosClub.session;

  var estadoMostrado = null;
  var contenidoVisible = false;

  function valoresDe(estado) {
    var datos = estado || {};

    return {
      visitas_totales: typeof datos.visitas_totales === 'number' ? datos.visitas_totales : 0,
      premios_disponibles: typeof datos.premios_disponibles === 'number' ? datos.premios_disponibles : 0,
      progreso: typeof datos.progreso === 'number' ? datos.progreso : 0,
      visitas_requeridas: typeof datos.visitas_requeridas === 'number' ? datos.visitas_requeridas : 0
    };
  }

  function cambioRespectoDe(estado) {
    if (!estadoMostrado) {
      return true;
    }

    var nuevos = valoresDe(estado);
    var anteriores = valoresDe(estadoMostrado);

    return (
      nuevos.visitas_totales !== anteriores.visitas_totales ||
      nuevos.premios_disponibles !== anteriores.premios_disponibles ||
      nuevos.progreso !== anteriores.progreso ||
      nuevos.visitas_requeridas !== anteriores.visitas_requeridas
    );
  }

  function alCargarEstado(estado) {
    estadoMostrado = estado;

    ui.renderMiembro(estado);
    ui.initEnlaceTarjeta();

    if (!contenidoVisible) {
      return ui.mostrarContenidoMiembro().then(function () {
        contenidoVisible = true;
        ui.motion.observar(dom.hook('contenido-miembro'));
        animarSellos();
      });
    }

    ui.renderSellos(estado);
    ui.motion.observar(dom.hook('contenido-miembro'));
  }

  function animarSellos() {
    var duracion = ui.motion.dur('vista');

    if (ui.motion.nivel === 'minimo' || duracion === 0) {
      ui.renderSellos(estadoMostrado);
      return;
    }

    global.setTimeout(function () {
      ui.renderSellos(estadoMostrado);
    }, duracion);
  }

  function alErrorEstado() {
    ui.mostrarErrorCarga(observador.recargar);
  }

  function alRecuperarRed() {
    /* El usuario decide reintentar si hay un error visible. */
  }

  function iniciar() {
    try {
      var sesion = session.init();

      if (sesion.redirigiendo) {
        return;
      }

      ui.init();

      if (!TajosClub.config.configurado) {
        alErrorEstado();
        return;
      }

      observador = ui.sesionObservar({
        intervaloMs: 60000,
        alCargar: alCargarEstado,
        alError: alErrorEstado,
        alRecuperarRed: alRecuperarRed
      });

      observador.recargar();
    } catch (error) {
      /* La página permanece utilizable. */
    }
  }

  var observador = null;

  dom.ready(iniciar);
})(window);
