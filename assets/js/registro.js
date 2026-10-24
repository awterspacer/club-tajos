(function (global) {
  'use strict';

  var TajosClub = global.TajosClub;

  if (!TajosClub || !TajosClub.ui || !TajosClub.session || !TajosClub.api || !TajosClub.dom) {
    return;
  }

  var dom = TajosClub.dom;
  var api = TajosClub.api;
  var fmt = TajosClub.fmt;
  var msg = TajosClub.msg;
  var ui = TajosClub.ui;
  var motion = TajosClub.ui.motion;

  var formulario = null;
  var modoRango = false;
  var enviando = false;

  function campo(nombre) {
    if (!formulario || !formulario.elements[nombre]) {
      return null;
    }
    return formulario.elements[nombre];
  }

  function marcarListo(elemento) {
    if (elemento) {
      elemento.setAttribute('data-club-listo', '');
    }
  }

  function yaListo(elemento) {
    return Boolean(elemento && elemento.hasAttribute('data-club-listo'));
  }

  function enfocarElemento(elemento) {
    if (!elemento) {
      return;
    }

    var comportamiento = motion && motion.nivel === 'minimo' ? 'auto' : 'smooth';

    elemento.scrollIntoView({
      behavior: comportamiento,
      block: 'center'
    });

    elemento.focus();
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
        dom.setText(
          elemento,
          typeof premio === 'string' && premio !== '' ? premio : 'un premio especial'
        );
      });
    });
  }

  function cargarCatalogo() {
    api.getCatalogo().then(function (respuesta) {
      var catalogo = respuesta.ok && respuesta.data ? respuesta.data : { barbero: [], servicio: [] };
      cargarBarberos(catalogo.barbero);
      cargarServicios(catalogo.servicio);
      motion.observar(global.document);
    });
  }

  function cargarBarberos(nombres) {
    var select = campo('barbero_pref');

    if (!select || !Array.isArray(nombres)) {
      return;
    }

    nombres.forEach(function (nombre) {
      if (typeof nombre !== 'string' || nombre.trim() === '') {
        return;
      }

      if (nombre.trim().toLowerCase() === 'sin preferencia') {
        return;
      }

      var opcion = global.document.createElement('option');
      opcion.value = nombre;
      opcion.textContent = nombre;
      select.appendChild(opcion);
    });
  }

  function cargarServicios(nombres) {
    var contenedor = dom.hook('lista-servicios');
    var plantilla = global.document.getElementById('tpl-servicio-opcion');
    var vacio = dom.hook('servicios-vacio');

    if (!contenedor) {
      return;
    }

    var existentes = contenedor.querySelectorAll('input[name="servicios_habituales"]');
    var indice = 0;

    for (indice = 0; indice < existentes.length; indice += 1) {
      existentes[indice].closest('.club-check').remove();
    }

    if (!Array.isArray(nombres) || nombres.length === 0 || !plantilla) {
      dom.show(vacio);
      return;
    }

    dom.hide(vacio);

    nombres.forEach(function (nombre) {
      if (typeof nombre !== 'string' || nombre.trim() === '') {
        return;
      }

      var etiqueta = plantilla.content.firstElementChild.cloneNode(true);
      var entrada = etiqueta.querySelector('input');
      var texto = etiqueta.querySelector('span');

      entrada.value = nombre;
      dom.setText(texto, nombre);
      contenedor.appendChild(etiqueta);
    });
  }

  function establecerModoEdad(usarRango) {
    var fecha = campo('fecha_nacimiento');
    var rango = campo('rango_edad');
    var boton = dom.hook('toggle-rango');

    modoRango = usarRango;

    if (fecha) {
      if (usarRango) {
        fecha.value = '';
        fecha.disabled = true;
        fecha.removeAttribute('required');
        ui.setErrorCampo('fecha_nacimiento', '');
        motion.revelarCampo(fecha.closest('.club-field'), false);
      } else {
        fecha.disabled = false;
        fecha.setAttribute('required', '');
        motion.revelarCampo(fecha.closest('.club-field'), true);
      }
    }

    if (rango) {
      if (usarRango) {
        rango.disabled = false;
        rango.setAttribute('required', '');
        motion.revelarCampo(rango.closest('.club-field'), true);
      } else {
        rango.value = '';
        rango.disabled = true;
        rango.removeAttribute('required');
        ui.setErrorCampo('rango_edad', '');
        motion.revelarCampo(rango.closest('.club-field'), false);
      }
    }

    if (boton) {
      dom.setText(
        boton,
        usarRango
          ? 'Prefiero indicar mi fecha de nacimiento'
          : 'Prefiero indicar solo mi rango de edad'
      );
    }
  }

  function alternarModoEdad() {
    establecerModoEdad(!modoRango);
  }

  function establecerOtro(usarOtro) {
    var contenedor = dom.hook('como-llego-otro');
    var entrada = campo('como_llego_otro');

    if (!contenedor) {
      return;
    }

    if (usarOtro) {
      if (entrada) {
        entrada.disabled = false;
      }
      motion.revelarCampo(contenedor, true);
      return;
    }

    if (entrada) {
      entrada.value = '';
      entrada.disabled = true;
    }

    ui.setErrorCampo('como_llego_otro', '');
    motion.revelarCampo(contenedor, false);
  }

  function enlazarCamposCondicionales() {
    var botonRango = dom.hook('toggle-rango');
    var radios = formulario.querySelectorAll('input[name="como_llego"]');

    if (botonRango && !yaListo(botonRango)) {
      botonRango.addEventListener('click', alternarModoEdad);
      marcarListo(botonRango);
    }

    var indice = 0;

    for (indice = 0; indice < radios.length; indice += 1) {
      var radio = radios[indice];

      if (yaListo(radio)) {
        continue;
      }

      radio.addEventListener('change', function (evento) {
        establecerOtro(evento.target.value === 'otro');
      });

      marcarListo(radio);
    }
  }

  function enlazarLimpiezaErrores() {
    var campos = formulario.querySelectorAll('input, select, textarea');
    var indice = 0;

    for (indice = 0; indice < campos.length; indice += 1) {
      var elemento = campos[indice];

      if (yaListo(elemento)) {
        continue;
      }

      elemento.addEventListener('input', function (evento) {
        ui.setErrorCampo(evento.target.name, '');
      });

      elemento.addEventListener('change', function (evento) {
        ui.setErrorCampo(evento.target.name, '');
      });

      marcarListo(elemento);
    }
  }

  function fechaValida(valor) {
    if (typeof valor !== 'string') {
      return false;
    }

    var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);

    if (!partes) {
      return false;
    }

    var anio = parseInt(partes[1], 10);
    var mes = parseInt(partes[2], 10);
    var dia = parseInt(partes[3], 10);

    if (anio < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      return false;
    }

    var ahora = new Date();
    var hoyAnio = ahora.getFullYear();
    var hoyMes = ahora.getMonth() + 1;
    var hoyDia = ahora.getDate();

    if (anio > hoyAnio) {
      return false;
    }

    if (anio === hoyAnio && mes > hoyMes) {
      return false;
    }

    if (anio === hoyAnio && mes === hoyMes && dia > hoyDia) {
      return false;
    }

    return true;
  }

  function validar() {
    var errores = [];
    var honeypot = campo('sitio_web');

    if (honeypot && honeypot.value !== '') {
      return { honeypot: true, errores: [] };
    }

    var nombre = campo('nombre_completo');
    var whatsapp = campo('whatsapp');
    var fecha = campo('fecha_nacimiento');
    var rango = campo('rango_edad');
    var instagram = campo('usuario_ig');
    var consentimiento = campo('consentimiento');

    if (!nombre || nombre.value.trim().length < 3) {
      errores.push({ campo: 'nombre_completo', mensaje: msg('nombre_invalido') });
    }

    if (whatsapp) {
      var digitos = whatsapp.value.replace(/\D/g, '');
      if (digitos.length < 8 || digitos.length > 15) {
        errores.push({ campo: 'whatsapp', mensaje: msg('whatsapp_invalido') });
      }
    }

    if (modoRango) {
      if (!rango || rango.value === '' || parseInt(rango.value, 10) < 1 || parseInt(rango.value, 10) > 8) {
        errores.push({ campo: 'rango_edad', mensaje: msg('edad_requerida') });
      }
    } else {
      if (!fecha || fecha.value === '') {
        errores.push({ campo: 'fecha_nacimiento', mensaje: msg('edad_requerida') });
      } else if (!fechaValida(fecha.value)) {
        errores.push({ campo: 'fecha_nacimiento', mensaje: msg('fecha_invalida') });
      }
    }

    if (instagram && instagram.value !== '') {
      var patron = /^@?[A-Za-z0-9._]{1,30}$/;
      if (!patron.test(instagram.value)) {
        errores.push({
          campo: 'usuario_ig',
          mensaje: 'Revisá tu usuario de Instagram (solo letras, números, puntos y guiones bajos).'
        });
      }
    }

    if (!consentimiento || !consentimiento.checked) {
      errores.push({ campo: 'consentimiento', mensaje: msg('consentimiento_requerido') });
    }

    return { honeypot: false, errores: errores };
  }

  function agregarSiHayValor(objeto, clave, valor) {
    if (typeof valor === 'string' && valor.trim() !== '') {
      objeto[clave] = valor.trim();
    }
  }

  function armarPayload() {
    var payload = {};

    agregarSiHayValor(payload, 'nombre_completo', campo('nombre_completo').value);
    agregarSiHayValor(payload, 'whatsapp', campo('whatsapp').value);
    agregarSiHayValor(payload, 'ciudad', campo('ciudad').value);
    agregarSiHayValor(payload, 'barrio', campo('barrio').value);
    agregarSiHayValor(payload, 'nacionalidad', campo('nacionalidad').value);

    if (modoRango) {
      var rango = campo('rango_edad');
      if (rango && rango.value !== '') {
        payload.rango_edad = parseInt(rango.value, 10);
      }
    } else {
      agregarSiHayValor(payload, 'fecha_nacimiento', campo('fecha_nacimiento').value);
    }

    agregarSiHayValor(payload, 'barbero_pref', campo('barbero_pref').value);

    var instagram = campo('usuario_ig');
    if (instagram && instagram.value.trim() !== '') {
      payload.usuario_ig = instagram.value.trim().replace(/^@/, '');
    }

    var servicios = formulario.querySelectorAll('input[name="servicios_habituales"]:checked');
    var seleccionados = [];
    var indice = 0;

    for (indice = 0; indice < servicios.length; indice += 1) {
      seleccionados.push(servicios[indice].value);
    }

    if (seleccionados.length > 0) {
      payload.servicios_habituales = seleccionados;
    }

    var comoLlego = campo('como_llego');
    if (comoLlego) {
      payload.como_llego = comoLlego.value;
    }

    if (comoLlego && comoLlego.value === 'otro') {
      agregarSiHayValor(payload, 'como_llego_otro', campo('como_llego_otro').value);
    }

    payload.consentimiento = true;

    return payload;
  }

  function enfocarPrimerError(errores) {
    if (errores.length === 0) {
      return;
    }

    var primero = errores[0];
    var elemento = campo(primero.campo);

    if (elemento && elemento.type === 'checkbox') {
      elemento = elemento.closest('.club-check') || elemento;
    }

    enfocarElemento(elemento);
  }

  function aplicarErroresLocales(errores) {
    ui.limpiarErrores(formulario);

    errores.forEach(function (error) {
      ui.setErrorCampo(error.campo, error.mensaje);
    });

    ui.mostrarErrorGeneral('Revisá los campos marcados.');
    enfocarPrimerError(errores);
  }

  function enviarRegistro() {
    if (enviando) {
      return;
    }

    var boton = dom.hook('registro-submit');
    var validacion = validar();

    dom.hide(dom.hook('ya-registrado'));
    ui.mostrarErrorGeneral('');

    if (validacion.honeypot) {
      ui.mostrarErrorGeneral(msg('desconocido'));
      return;
    }

    if (validacion.errores.length > 0) {
      aplicarErroresLocales(validacion.errores);
      return;
    }

    enviando = true;
    ui.setCargando(boton, true, 'Creando tu tarjeta…');

    api.registrarCliente(armarPayload()).then(function (respuesta) {
      enviando = false;
      ui.setCargando(boton, false, 'Crear mi tarjeta');

      if (respuesta.ok && respuesta.data && typeof respuesta.data.token === 'string') {
        if (!TajosClub.session.setToken(respuesta.data.token)) {
          ui.mostrarErrorGeneral(msg('respuesta_invalida'));
          return;
        }

        var nombre = campo('nombre_completo').value;
        dom.hooks('ok-nombre').forEach(function (elemento) {
          dom.setText(elemento, fmt.primerNombre(nombre));
        });

        ui.initEnlaceTarjeta();

        var vistaForm = dom.hook('vista-form');
        var vistaOk = dom.hook('vista-ok');

        motion.cambiarVista(vistaForm, vistaOk).then(function () {
          global.scrollTo({
            top: 0,
            behavior: motion.nivel === 'minimo' ? 'auto' : 'smooth'
          });
        });

        return;
      }

      var codigo = respuesta.error || 'dato_invalido';

      ui.limpiarErrores(formulario);

      if (codigo === 'ya_registrado') {
        var aviso = dom.hook('ya-registrado');
        dom.show(aviso);
        ui.setErrorCampo('whatsapp', msg(codigo));
        enfocarElemento(aviso);
        return;
      }

      if (codigo === 'nombre_invalido') {
        ui.setErrorCampo('nombre_completo', msg(codigo));
        enfocarPrimerError([{ campo: 'nombre_completo' }]);
        return;
      }

      if (codigo === 'whatsapp_invalido') {
        ui.setErrorCampo('whatsapp', msg(codigo));
        enfocarPrimerError([{ campo: 'whatsapp' }]);
        return;
      }

      if (codigo === 'edad_requerida' || codigo === 'fecha_invalida') {
        var campoEdad = modoRango ? 'rango_edad' : 'fecha_nacimiento';
        ui.setErrorCampo(campoEdad, msg(codigo));
        enfocarPrimerError([{ campo: campoEdad }]);
        return;
      }

      if (codigo === 'consentimiento_requerido') {
        ui.setErrorCampo('consentimiento', msg(codigo));
        enfocarPrimerError([{ campo: 'consentimiento' }]);
        return;
      }

      ui.mostrarErrorGeneral(msg(codigo));
    });
  }

  function iniciar() {
    try {
      TajosClub.session.init();
      ui.init();

      formulario = dom.hook('registro-form');

      if (!formulario) {
        return;
      }

      var fecha = campo('fecha_nacimiento');
      if (fecha) {
        fecha.setAttribute('min', '1900-01-01');
      }

      var enlaceIngresar = dom.hook('link-ingresar');
      if (enlaceIngresar) {
        enlaceIngresar.setAttribute('href', 'index.html?ingresar=1');
      }

      var botonEnviar = dom.hook('registro-submit');

      if (botonEnviar && !yaListo(botonEnviar)) {
        botonEnviar.addEventListener('click', function (evento) {
          evento.preventDefault();
          enviarRegistro();
        });
        marcarListo(botonEnviar);
      }

      enlazarCamposCondicionales();
      enlazarLimpiezaErrores();

      establecerModoEdad(false);
      establecerOtro(false);

      if (TajosClub.config.configurado) {
        cargarConfiguracion();
        cargarCatalogo();
      } else {
        dom.show(dom.hook('servicios-vacio'));
      }
    } catch (error) {
      /* La página permanece utilizable. */
    }
  }

  global.addEventListener('pageshow', function () {
    /* La vista actual se conserva; no se reinicia el formulario ni el arranque. */
  });

  dom.ready(iniciar);
})(window);
