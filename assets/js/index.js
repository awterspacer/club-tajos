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

  var SECCIONES = ['novedades', 'promociones', 'descuentos', 'eventos'];

  function quitarParametroIngresar() {
    try {
      var url = new global.URL(global.location.href);

      if (!url.searchParams.has('ingresar')) {
        return;
      }

      url.searchParams.delete('ingresar');

      var nuevaUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      global.history.replaceState(null, '', nuevaUrl);
    } catch (error) {
      /* No interrumpe la página. */
    }
  }

  function abrirDialogoSiCorresponde() {
    try {
      var url = new global.URL(global.location.href);

      if (url.searchParams.get('ingresar') !== '1') {
        return;
      }

      if (session.hasToken()) {
        quitarParametroIngresar();
        return;
      }

      var boton = dom.hook('btn-ingresar');

      quitarParametroIngresar();

      if (boton) {
        boton.click();
      }
    } catch (error) {
      /* No interrumpe la página. */
    }
  }

  function cargarConfiguracion() {
    api.getConfigClub().then(function (respuesta) {
      if (!respuesta.ok || !respuesta.data) {
        return;
      }

      var visitas = respuesta.data.visitas_requeridas;
      var premio = respuesta.data.premio_descripcion;

      dom.hooks('visitas-requeridas').forEach(function (elemento) {
        dom.setText(
          elemento,
          typeof visitas === 'number' && visitas > 0 ? String(visitas) : 'varias'
        );
      });

      dom.hooks('premio').forEach(function (elemento) {
        dom.setText(elemento, typeof premio === 'string' && premio !== '' ? premio : 'un premio especial');
      });
    });
  }

  function enfocarSeccionDesdeHash() {
    var hash = global.location.hash.replace('#', '');
    var corresponde = false;
    var indice = 0;

    for (indice = 0; indice < SECCIONES.length; indice += 1) {
      if (SECCIONES[indice] === hash) {
        corresponde = true;
        break;
      }
    }

    if (!corresponde) {
      return;
    }

    var seccion = global.document.getElementById(hash);

    if (!seccion || seccion.hasAttribute('hidden')) {
      return;
    }

    var comportamiento = ui.motion && ui.motion.nivel === 'minimo' ? 'auto' : 'smooth';

    seccion.scrollIntoView({
      behavior: comportamiento,
      block: 'start'
    });

    seccion.setAttribute('tabindex', '-1');
    seccion.focus();

    global.setTimeout(function () {
      seccion.removeAttribute('tabindex');
    }, 0);
  }

  function cargarPromociones() {
    api.getPromociones().then(function (respuesta) {
      var items = respuesta.ok && Array.isArray(respuesta.data) ? respuesta.data : [];
      ui.renderPromociones(items);
      enfocarSeccionDesdeHash();
    });
  }

  function evaluarSesion() {
    if (!session.hasToken()) {
      ui.setModoSesion('publico');
      return;
    }

    session.cargarEstado().then(function (respuesta) {
      if (respuesta.ok) {
        ui.setModoSesion('miembro', respuesta.data);
        return;
      }

      if (respuesta.error === 'token_invalido') {
        ui.setModoSesion('publico');
        return;
      }

      ui.setModoSesion('publico');
    });
  }

  function iniciarDatos() {
    if (!TajosClub.config.configurado) {
      ui.setModoSesion('publico');
      ui.renderPromociones([]);
      return;
    }

    cargarConfiguracion();
    cargarPromociones();
    evaluarSesion();
  }

  function iniciar() {
    try {
      session.init();
      ui.init();
      ui.initLogin({ destino: 'inicio.html' });
      abrirDialogoSiCorresponde();
      iniciarDatos();
    } catch (error) {
      /* La página permanece utilizable. */
    }
  }

  global.addEventListener('pageshow', function (evento) {
    if (!evento.persisted) {
      return;
    }

    try {
      evaluarSesion();
    } catch (error) {
      /* No interrumpe la página. */
    }
  });

  dom.ready(iniciar);
})(window);
