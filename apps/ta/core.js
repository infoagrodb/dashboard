/* ============================================================
   INFOTALLER — core.js
   Núcleo compartido que cada HTML de pestaña importa con
   <script src="core.js"></script>. Contiene:
     1. Conexión al Worker (módulo /taller/*  y  /query genérico)
     2. Formato de fecha estándar 01-Ene-2026
     3. Manejo de sesión (sessionStorage, compartido entre
        index.html y todos los iframes del mismo origen)
   Si corriges algo aquí, todos los HTML lo heredan — no hay
   build system, todo es copiar/pegar manual si hace falta
   replicarlo en otro proyecto.
   ============================================================ */

const INFOTALLER_WORKER_BASE = "https://weathered-recipe-d18c.ignagher.workers.dev";

/* ------------------------------------------------------------
   1. FORMATO DE FECHA — siempre 01-Ene-2026 en toda la app
   ------------------------------------------------------------ */
const INFOTALLER_MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

/**
 * formatearFecha(valor) -> "01-Ene-2026"
 * Acepta: objeto Date, string ISO ("2026-08-06" o "2026-08-06T10:30:00"),
 * o el formato que devuelve Odoo ("2026-08-06 10:30:00"). Vacío/null -> "".
 */
function formatearFecha(valor) {
  if (!valor) return "";
  let d;
  if (valor instanceof Date) {
    d = valor;
  } else {
    const limpio = String(valor).replace(" ", "T");
    d = new Date(limpio);
  }
  if (isNaN(d.getTime())) return String(valor);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = INFOTALLER_MESES[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** formatearFechaHora(valor) -> "01-Ene-2026 10:30 am" */
function formatearFechaHora(valor) {
  if (!valor) return "";
  const limpio = String(valor).replace(" ", "T");
  const d = new Date(limpio);
  if (isNaN(d.getTime())) return String(valor);
  const fecha = formatearFecha(d);
  let horas = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = horas >= 12 ? "pm" : "am";
  horas = horas % 12; if (horas === 0) horas = 12;
  return `${fecha} ${horas}:${mins} ${ampm}`;
}

/** Convierte un Date/valor a "YYYY-MM-DD" (para mandar a Odoo, que no entiende 01-Ene-2026) */
function fechaParaOdoo(valor) {
  if (!valor) return false;
  const d = valor instanceof Date ? valor : new Date(String(valor).replace(" ", "T"));
  if (isNaN(d.getTime())) return false;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------------------------------------------------
   2. SESIÓN — sessionStorage compartido (mismo origen -> visible
      entre index.html y todos sus iframes, sin postMessage)
   ------------------------------------------------------------ */
const INFOTALLER_SESSION_KEY = "infotaller_sesion";

function guardarSesion(usuario) {
  sessionStorage.setItem(INFOTALLER_SESSION_KEY, JSON.stringify(usuario));
}

function obtenerSesion() {
  try {
    const raw = sessionStorage.getItem(INFOTALLER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function cerrarSesion() {
  sessionStorage.removeItem(INFOTALLER_SESSION_KEY);
}

/**
 * Llamar al inicio de cada pestaña (o de index.html) que requiera estar
 * logueado. Si no hay sesión, redirige a login.html y detiene la ejecución
 * del resto del script (devuelve null).
 */
function exigirSesion() {
  const s = obtenerSesion();
  if (!s) {
    const destino = window.top === window.self ? "login.html" : "../login.html";
    (window.top || window).location.href = destino;
    return null;
  }
  return s;
}

/* ------------------------------------------------------------
   3. API — módulo Taller del Worker
   ------------------------------------------------------------ */

async function tallerFetch(ruta, opciones) {
  const r = await fetch(INFOTALLER_WORKER_BASE + ruta, opciones);
  let j;
  try { j = await r.json(); }
  catch (e) { throw new Error(`Respuesta no válida del servidor (HTTP ${r.status})`); }
  if (!r.ok && !j.ok) {
    throw new Error(j.error || `Error HTTP ${r.status}`);
  }
  return j;
}

async function tallerLogin(usuario, clave) {
  const j = await tallerFetch("/taller/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, clave }),
  });
  return j; // { ok, usuario } o { ok:false, error }
}

/** Lectura genérica de cualquier modelo x_taller_* (o x_equiposagricolas) vía /query */
async function tallerQuery(model, fields, domain, limit, offset) {
  const params = new URLSearchParams({
    base: "info",
    model,
    fields: (fields || []).join(","),
    domain: JSON.stringify(domain || []),
    limit: String(limit || 8000),
    offset: String(offset || 0),
  });
  const j = await tallerFetch(`/query?${params.toString()}`);
  return j.result || [];
}

async function tallerCrear(model, values) {
  return tallerFetch("/taller/crear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, values }),
  });
}

async function tallerActualizar(model, id, values) {
  return tallerFetch("/taller/actualizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, id, values }),
  });
}

async function tallerDesactivar(model, id, motivo) {
  return tallerFetch("/taller/desactivar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, id, motivo }),
  });
}

async function tallerFolio(prefijo) {
  const j = await tallerFetch(`/taller/folio?prefijo=${encodeURIComponent(prefijo || "OT")}`);
  return j.folio;
}

/* ------------------------------------------------------------
   4. Catálogos compartidos (deben coincidir EXACTO con los
      Selection creados en Odoo Studio — ver documento de modelos)
   ------------------------------------------------------------ */
const INFOTALLER_ROLES = ["Recepción","Técnico","Presupuestador","Bodega","Compras","Supervisor","Administrador","Auditor"];
const INFOTALLER_ESTADOS_ORDEN = [
  "Recibida","En diagnóstico","Pendiente de presupuesto","Presupuestada",
  "Pendiente de aprobación","Aprobada","Rechazada","En reparación",
  "Pendiente de repuesto","Terminada","Entregada","Cerrada","Cancelada",
];
const INFOTALLER_PRIORIDADES = ["Baja","Normal","Alta","Emergencia"];
const INFOTALLER_CAUSAS_DESVIACION = [
  "Cambio de cantidad","Cambio de costo unitario","Línea agregada no presupuestada",
  "Línea presupuestada no utilizada","Cambio de especificación","Daño adicional encontrado",
  "Error de diagnóstico","Retrabajo","Cambio solicitado por el cliente",
  "Falta de disponibilidad de repuesto","Sustitución de SKU","Otro",
];
