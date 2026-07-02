/* ====================================================================
   PANEL DE LIMPIEZA · COLECTIVOS — app.js
   Lógica de la SPA: ingreso por legajo, listado de órdenes, inicio y
   finalización de trabajos contra la API de Google Apps Script.
   ==================================================================== */

// --------------------------------------------------------------------
// CONFIGURACIÓN — Reemplazar por la URL del Web App publicado en
// Google Apps Script (Implementar > Nueva implementación > Aplicación web)
// --------------------------------------------------------------------
const API_URL = 'https://script.google.com/macros/s/AKfycbyMBFZN7cFNz72y3eR-RRUB9HZe9WseNmxnOxaphZpDK8cmSyITPI6sfMfcS77KWIRN0w/exec';

// --------------------------------------------------------------------
// ESTADO EN MEMORIA
// --------------------------------------------------------------------
let legajoActual = '';
let ordenesActuales = [];
let ordenSeleccionada = null;
let textoBusquedaFicha = '';
const busquedaFichaInput = document.getElementById('busquedaFicha');
const ordenesEnProcesoDeEnvio = new Set(); // evita doble clic por orden

// --------------------------------------------------------------------
// REFERENCIAS AL DOM
// --------------------------------------------------------------------
const pantallaIngreso = document.getElementById('pantallaIngreso');
const pantallaOrdenes = document.getElementById('pantallaOrdenes');

const legajoInput = document.getElementById('legajoInput');
const btnBuscar = document.getElementById('btnBuscar');

const btnVolver = document.getElementById('btnVolver');
const btnActualizar = document.getElementById('btnActualizar');
const legajoLabel = document.getElementById('legajoLabel');
const listaOrdenes = document.getElementById('listaOrdenes');
const estadoVacio = document.getElementById('estadoVacio');
const estadoVacioTitulo = document.getElementById('estadoVacioTitulo');
const estadoVacioTexto = document.getElementById('estadoVacioTexto');
const btnLimpiarFiltro = document.getElementById('btnLimpiarFiltro');
const resumenEstados = document.getElementById('resumenEstados');
const filtroFichasEl = document.getElementById('filtroFichas');

const modalFinalizar = document.getElementById('modalFinalizar');
const modalOrdenRef = document.getElementById('modalOrdenRef');
const campoSintoma = document.getElementById('campoSintoma');
const pendiente = document.getElementById('pendiente');
const campoCausa = document.getElementById('campoCausa');
const campoComentario = document.getElementById('campoComentario');
const errorModal = document.getElementById('errorModal');
const btnCancelarModal = document.getElementById('btnCancelarModal');
const btnConfirmarFinalizar = document.getElementById('btnConfirmarFinalizar');

const toast = document.getElementById('toast');
const overlayCarga = document.getElementById('overlayCarga');

// --------------------------------------------------------------------
// UTILIDADES
// --------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function fechaActualTexto() {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function horaActualTexto() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizarEstado(estado) {
  // Convierte "En proceso" -> "proceso", "Creado" -> "creado", etc.
  const valor = String(estado || '').trim().toLowerCase();
  if (valor === 'creado') return 'creado';
  if (valor === 'en proceso') return 'proceso';
  if (valor === 'finalizado') return 'finalizado';
  return 'creado';
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

let toastTimeoutId = null;
function mostrarToast(mensaje, tipo = 'info') {
  clearTimeout(toastTimeoutId);
  toast.textContent = mensaje;
  toast.className = `toast toast--${tipo}`;
  toastTimeoutId = setTimeout(() => {
    toast.classList.add('oculto');
  }, 3200);
}

function mostrarCarga(visible) {
  overlayCarga.classList.toggle('oculto', !visible);
}

// --------------------------------------------------------------------
// LLAMADAS A LA API
// --------------------------------------------------------------------

async function apiObtenerOrdenes(legajo) {
  const url = `${API_URL}?action=ordenes&legajo=${encodeURIComponent(legajo)}`;
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error('Error de conexión con el servidor');
  const datos = await resp.json();
  if (datos.error) throw new Error(datos.error);
  return datos.ordenes || [];
}

async function apiPost(body) {
  // Se envía como text/plain para evitar el preflight CORS que Apps
  // Script no resuelve correctamente con application/json.
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Error de conexión con el servidor');
  const datos = await resp.json();
  if (datos.error) throw new Error(datos.error);
  return datos;
}

// --------------------------------------------------------------------
// NAVEGACIÓN ENTRE PANTALLAS
// --------------------------------------------------------------------

function irAPantallaOrdenes() {
  pantallaIngreso.classList.remove('pantalla--activa');
  pantallaOrdenes.classList.add('pantalla--activa');
}

function irAPantallaIngreso() {
  pantallaOrdenes.classList.remove('pantalla--activa');
  pantallaIngreso.classList.add('pantalla--activa');
  legajoInput.value = '';
  legajoInput.focus();
}

// --------------------------------------------------------------------
// PANTALLA 1 — BUSCAR ÓRDENES
// --------------------------------------------------------------------

async function manejarBuscarOrdenes() {
  if (btnBuscar.disabled) return;

  const legajo = legajoInput.value.trim();
  if (!legajo) {
    mostrarToast('Ingresá tu legajo para continuar', 'error');
    legajoInput.focus();
    return;
  }

  btnBuscar.disabled = true;
  const textoOriginal = btnBuscar.textContent;
  btnBuscar.textContent = 'Buscando…';
  mostrarCarga(true);

  try {
    const ordenes = await apiObtenerOrdenes(legajo);
    legajoActual = legajo;
    ordenesActuales = ordenes;
    legajoLabel.textContent = legajo;
    renderizarOrdenes();
    irAPantallaOrdenes();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo conectar con Google Sheets', 'error');
  } finally {
    btnBuscar.disabled = false;
    btnBuscar.textContent = textoOriginal;
    mostrarCarga(false);
  }
}

// --------------------------------------------------------------------
// PANTALLA 2 — RENDER DE TARJETAS
// --------------------------------------------------------------------

function obtenerFichasUnicas() {
  const set = new Set();
  ordenesActuales.forEach(o => {
    const valor = String(o.Ficha || '').trim();
    if (valor) set.add(valor);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

function renderizarFiltroFichas(fichas) {
  if (fichas.length === 0) {
    filtroFichasEl.classList.add('oculto');
    return;
  }

  filtroFichasEl.classList.remove('oculto');
}

function renderizarOrdenes() {
  const fichas = obtenerFichasUnicas();
  renderizarFiltroFichas(fichas);

const texto = textoBusquedaFicha.trim().toLowerCase();

const ordenesFiltradas = texto
  ? ordenesActuales.filter(o =>
      String(o.Ficha || '')
        .toLowerCase()
        .includes(texto)
    )
  : ordenesActuales;

  // Resumen de chips por estado (sobre lo que se está mostrando)
  const conteo = { creado: 0, proceso: 0 };
  ordenesFiltradas.forEach(o => {
    const e = normalizarEstado(o.Estado);
    if (conteo[e] !== undefined) conteo[e]++;
  });
  resumenEstados.innerHTML = `
    <span class="chip-estado chip-estado--creado">${conteo.creado} creada${conteo.creado === 1 ? '' : 's'}</span>
    <span class="chip-estado chip-estado--proceso">${conteo.proceso} en proceso</span>
  `;

  listaOrdenes.innerHTML = '';

  if (ordenesActuales.length === 0) {
    estadoVacioTitulo.textContent = 'Sin órdenes pendientes';
    estadoVacioTexto.textContent = 'No hay órdenes "Creadas" o "En proceso" para este legajo.';
    btnLimpiarFiltro.classList.add('oculto');
    estadoVacio.classList.remove('oculto');
    return;
  }

  if (ordenesFiltradas.length === 0) {
    estadoVacioTitulo.textContent = 'Sin resultados para esta ficha';
    btnLimpiarFiltro.classList.remove('oculto');
    estadoVacio.classList.remove('oculto');
    return;
  }

  estadoVacio.classList.add('oculto');

  ordenesFiltradas.forEach(orden => {
    listaOrdenes.appendChild(crearTarjetaOrden(orden));
  });
}

function crearTarjetaOrden(orden) {
  const estadoClase = normalizarEstado(orden.Estado);
  const etiquetaEstado = estadoClase === 'proceso' ? 'En proceso'
    : estadoClase === 'finalizado' ? 'Finalizado' : 'Creado';

  const tarjeta = document.createElement('article');
  tarjeta.className = `tarjeta-orden tarjeta-orden--${estadoClase}`;
  tarjeta.dataset.orden = orden.Orden;

  tarjeta.innerHTML = `
    <div class="tarjeta-orden__cabecera">
      <div>
        <span class="tarjeta-orden__orden-label">ORDEN</span>
        <span class="tarjeta-orden__orden">${escaparHtml(orden.Orden)}</span>
      </div>
      <span class="badge-estado badge-estado--${estadoClase}">${etiquetaEstado}</span>
    </div>

    <div class="tarjeta-orden__filas">
      <div class="dato">
        <div class="dato__label">Ficha</div>
        <div class="dato__valor">${escaparHtml(orden.Ficha)}</div>
      </div>
      <div class="dato">
        <div class="dato__label">Taller</div>
        <div class="dato__valor">${escaparHtml(orden.Taller)}</div>
        <div class="dato__label dato__label--sub">Fecha inicio</div>
        <div class="dato__valor">${escaparHtml(orden.FechaInicial || '—')}</div>
      </div>
      <div class="dato dato--ancho">
        <div class="dato__label">Descripción</div>
        <div class="dato__valor">${escaparHtml(orden.Descripcion)}</div>
      </div>
    </div>

    <div class="tarjeta-orden__acciones"></div>
  `;

  const contenedorAcciones = tarjeta.querySelector('.tarjeta-orden__acciones');

  if (estadoClase === 'creado') {
    const boton = document.createElement('button');
    boton.className = 'boton boton--iniciar boton--full';
    boton.textContent = 'Iniciar Trabajo';
    boton.addEventListener('click', () => manejarIniciarTrabajo(orden, boton));
    contenedorAcciones.appendChild(boton);
  } else if (estadoClase === 'proceso') {
    const boton = document.createElement('button');
    boton.className = 'boton boton--finalizar boton--full';
    boton.textContent = 'Finalizar Trabajo';
    boton.addEventListener('click', () => abrirModalFinalizar(orden));
    contenedorAcciones.appendChild(boton);
  }

  return tarjeta;
}

// --------------------------------------------------------------------
// INICIAR TRABAJO
// --------------------------------------------------------------------

async function manejarIniciarTrabajo(orden, boton) {
  const idOrden = orden.Orden;
  if (ordenesEnProcesoDeEnvio.has(idOrden)) return; // evita doble clic
  ordenesEnProcesoDeEnvio.add(idOrden);

  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Iniciando…';

  const horaSalida = horaActualTexto();
  const fechaInicial = (orden.FechaInicial && String(orden.FechaInicial).trim() !== '')
    ? orden.FechaInicial
    : fechaActualTexto();

  try {
    await apiPost({
      action: 'iniciar',
      Orden: idOrden,
      horaSalida: horaSalida,
      fechaInicial: fechaInicial
    });

    // Reflejar el cambio localmente sin tener que volver a pedir todo
    orden.HoraSalida = horaSalida;
    orden.FechaInicial = fechaInicial;
    orden.Estado = 'En proceso';

    mostrarToast('Trabajo iniciado correctamente', 'exito');
    renderizarOrdenes();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo iniciar el trabajo', 'error');
    boton.disabled = false;
    boton.textContent = textoOriginal;
  } finally {
    ordenesEnProcesoDeEnvio.delete(idOrden);
  }
}

// --------------------------------------------------------------------
// FINALIZAR TRABAJO (MODAL)
// --------------------------------------------------------------------

function abrirModalFinalizar(orden) {
  pendiente.checked = false;
  ordenSeleccionada = orden;
  modalOrdenRef.textContent = `Orden ${orden.Orden} · Ficha ${orden.Ficha}`;
  campoSintoma.value = '';
  campoCausa.value = '';
  campoComentario.value = '';
  errorModal.classList.add('oculto');
  modalFinalizar.classList.remove('oculto');
  setTimeout(() => campoSintoma.focus(), 50);
}

function cerrarModalFinalizar() {
  modalFinalizar.classList.add('oculto');
  ordenSeleccionada = null;
}

async function manejarConfirmarFinalizar() {
  if (btnConfirmarFinalizar.disabled || !ordenSeleccionada) return;

  const sintoma = campoSintoma.value.trim();
  const causa = campoCausa.value.trim();
  const comentario = campoComentario.value.trim();
  const pendiente = document.getElementById('campoPendiente');

  if (pendiente.checked) {
    try {
    await apiPost({
        action: "creado",
        Orden: idOrden
    });

    ordenSeleccionada.Estado = "Creado";
    ordenSeleccionada.HoraSalida = "";
    ordenSeleccionada.FechaFinal = "";
    ordenSeleccionada.TiempoFinal = "";
    ordenSeleccionada.Sintoma = "";
    ordenSeleccionada.Causa = "";
    ordenSeleccionada.Comentario = "";

    cerrarModalFinalizar();
    mostrarToast("Trabajo marcado como pendiente", "exito");
    renderizarOrdenes();

    return;
  }
  catch(err){
      mostrarToast(err.message || "No se pudo volver la orden a Creado","error");
      return;
  }
  finally{
      ordenesEnProcesoDeEnvio.delete(idOrden);
      btnConfirmarFinalizar.disabled = false;
      btnConfirmarFinalizar.textContent = textoOriginal;
  }
}

  if (!sintoma || !causa || !comentario) {
    errorModal.classList.remove('oculto');
    return;
  }
  errorModal.classList.add('oculto');

  const idOrden = ordenSeleccionada.Orden;
  if (ordenesEnProcesoDeEnvio.has(idOrden)) return;
  ordenesEnProcesoDeEnvio.add(idOrden);

  btnConfirmarFinalizar.disabled = true;
  const textoOriginal = btnConfirmarFinalizar.textContent;
  btnConfirmarFinalizar.textContent = 'Guardando…';

  const fechaFinal = fechaActualTexto();
  const tiempoFinal = horaActualTexto();

  try {
    await apiPost({
      action: 'finalizar',
      Orden: idOrden,
      sintoma: sintoma,
      causa: causa,
      comentario: comentario,
      fechaFinal: fechaFinal,
      tiempoFinal: tiempoFinal
    });



    // Quitar la orden finalizada de la vista (ya no es "Creado"/"En proceso")
    ordenesActuales = ordenesActuales.filter(o => o.Orden !== idOrden);

    cerrarModalFinalizar();
    mostrarToast('Trabajo finalizado correctamente', 'exito');
    renderizarOrdenes();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo finalizar el trabajo', 'error');
  } finally {
    ordenesEnProcesoDeEnvio.delete(idOrden);
    btnConfirmarFinalizar.disabled = false;
    btnConfirmarFinalizar.textContent = textoOriginal;
  }
}

// --------------------------------------------------------------------
// ACTUALIZAR / VOLVER
// --------------------------------------------------------------------

async function manejarActualizar() {
  if (btnActualizar.disabled) return;
  btnActualizar.disabled = true;
  btnActualizar.textContent = '…';
  mostrarCarga(true);
  try {
    const ordenes = await apiObtenerOrdenes(legajoActual);
    ordenesActuales = ordenes;
    renderizarOrdenes();
    mostrarToast('Lista actualizada', 'info');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo actualizar', 'error');
  } finally {
    btnActualizar.disabled = false;
    btnActualizar.textContent = '⟲';
    mostrarCarga(false);
  }
}

// --------------------------------------------------------------------
// EVENTOS
// --------------------------------------------------------------------

btnBuscar.addEventListener('click', manejarBuscarOrdenes);
legajoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') manejarBuscarOrdenes();
});

btnVolver.addEventListener('click', irAPantallaIngreso);
btnActualizar.addEventListener('click', manejarActualizar);

btnCancelarModal.addEventListener('click', cerrarModalFinalizar);
btnConfirmarFinalizar.addEventListener('click', manejarConfirmarFinalizar);

btnLimpiarFiltro.addEventListener('click', () => {
  textoBusquedaFicha = '';
  busquedaFichaInput.value = '';
  renderizarOrdenes();
});

busquedaFichaInput.addEventListener('input', () => {
  textoBusquedaFicha = busquedaFichaInput.value;
  renderizarOrdenes();
});

// Cerrar el modal tocando el fondo oscuro (no el contenido)
modalFinalizar.addEventListener('click', (e) => {
  if (e.target === modalFinalizar) cerrarModalFinalizar();
});
