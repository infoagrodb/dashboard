/* ============================================================
   INFOTALLER — core.js — v2 (agrega TablaInfoAgro)
   Núcleo compartido que cada HTML de pestaña importa con
   <script src="core.js"></script>. Contiene:
     1. Conexión al Worker (módulo /taller/*  y  /query genérico)
     2. Formato de fecha estándar 01-Ene-2026
     3. Manejo de sesión (sessionStorage, compartido entre
        index.html y todos los iframes del mismo origen)
     4. Catálogos compartidos (roles, estados, prioridades)
     5. Conexión a Exactus (DAB) — catálogo de artículos
     6. TablaInfoAgro — componente de tabla Excel-style reutilizable
   Si corriges algo aquí, todos los HTML lo heredan — no hay
   build system, todo es copiar/pegar manual si hace falta
   replicarlo en otro proyecto.
   ============================================================ */
console.log("core.js v13 cargado correctamente (búsqueda por palabra, no frase completa)");

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

/** Sube un archivo (foto, PDF) como adjunto de cualquier registro x_taller_*. */
async function tallerSubirAdjunto(model, resId, file) {
  const form = new FormData();
  form.append("file", file);
  form.append("model", model);
  form.append("res_id", resId);
  form.append("filename", file.name);
  const r = await fetch(INFOTALLER_WORKER_BASE + "/taller/adjunto", { method: "POST", body: form });
  let j;
  try { j = await r.json(); }
  catch (e) { throw new Error(`Respuesta no válida del servidor (HTTP ${r.status})`); }
  if (!r.ok && !j.ok) throw new Error(j.error || `Error HTTP ${r.status}`);
  return j;
}

/* ------------------------------------------------------------
   4. Catálogos compartidos (deben coincidir EXACTO con los
      Selection creados en Odoo Studio — ver documento de modelos)
   ------------------------------------------------------------ */
const INFOTALLER_ROLES = ["Recepción","Técnico","Presupuestador","Bodega","Compras","Supervisor","Administrador","Auditor"];
const INFOTALLER_ESTADOS_ORDEN = [
  "Solicitada","Recibida","En diagnóstico","Pendiente de presupuesto","Presupuestada",
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

/* ------------------------------------------------------------
   5. Conexión a Exactus (DAB) — solo para catálogo de artículos.
      Siempre vía el proxy de Cloudflare (HTTPS). No se intenta la
      intranet directa (http://192.168.5.58) porque esta app corre
      sobre GitHub Pages (HTTPS) y el navegador bloquea por Mixed
      Content cualquier pedido a una URL sin cifrar desde una página
      seguido — no es una falla intermitente, siempre falla.
   ------------------------------------------------------------ */
const DAB_API_PROXY = "https://sia.comasa.com.ni/dab/api";
let DAB_API = "";

async function dabResolverBase() {
  // Esta app corre siempre por HTTPS (GitHub Pages) — un navegador jamás va a
  // dejar pasar una petición a http://192.168.5.58 (Mixed Content bloqueado
  // por seguridad), así que ni se intenta: siempre se usa el proxy de Cloudflare.
  DAB_API = DAB_API_PROXY;
  return DAB_API;
}

async function dabFetchAll(pathWithQuery) {
  await dabResolverBase();
  let items = [];
  let url = DAB_API + pathWithQuery;
  let guard = 0;
  while (url && guard < 50) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try { res = await fetch(url, { signal: ctrl.signal }); }
    finally { clearTimeout(t); }
    if (!res.ok) throw new Error("Exactus HTTP " + res.status + " en " + url);
    const d = await res.json();
    items = items.concat(d.value || []);
    url = d.nextLink ? (DAB_API + dabRutaDesdeLink(d.nextLink)) : null;
    guard++;
  }
  return items;
}

// El propio DAB a veces devuelve "nextLink" como URL absoluta apuntando a SU
// dirección interna (http://192.168.5.58...) — nunca hay que usar eso tal
// cual, porque el navegador lo bloquea (Mixed Content) al venir de una
// página HTTPS. Se extrae solo la ruta+query y siempre se pega sobre el
// proxy seguro (DAB_API), sin importar qué host venga en nextLink.
function dabRutaDesdeLink(nextLink) {
  try {
    const u = new URL(nextLink, DAB_API_PROXY);
    const i = u.pathname.indexOf("/api/");
    const ruta = i >= 0 ? u.pathname.slice(i + 4) : u.pathname; // se salta el "/api" para no duplicarlo
    return ruta + u.search;
  } catch (e) {
    return nextLink; // por si acaso ya viniera en el formato correcto
  }
}

// El DAB no soporta "contains" en $filter, así que el catálogo (liviano,
// 3 campos) se trae una sola vez y se filtra aquí en memoria.
const DAB_BODEGAS_TALLER = ["156", "164"];
let dabCatalogoArticulosPromise = null;
function dabObtenerCatalogoArticulos() {
  if (!dabCatalogoArticulosPromise) {
    dabCatalogoArticulosPromise = dabFetchAll(
      "/ARTICULO?$select=ARTICULO,DESCRIPCION,CLASIFICACION_1,CLASIFICACION_2,COSTO_PROM_LOC,COSTO_PROM_DOL,COSTO_ULT_LOC,COSTO_ULT_DOL,UNIDAD_ALMACEN,ACTIVO&$filter=ACTIVO eq 'S'"
    ).catch(e => {
      dabCatalogoArticulosPromise = null; // no se queda el fallo guardado — la próxima búsqueda reintenta
      throw e;
    });
  }
  return dabCatalogoArticulosPromise;
}

/**
 * Busca artículos activos en Exactus por texto (código o descripción) y
 * marca cuáles tienen existencia en las bodegas del taller (156/164).
 * Devuelve máximo 15 resultados: [{ARTICULO, DESCRIPCION, TIENE_EXISTENCIA}]
 */
async function buscarArticulosExactus(texto) {
  const catalogo = await dabObtenerCatalogoArticulos();
  const q = texto.toUpperCase();
  const arts = catalogo
    .filter(a => (a.DESCRIPCION || "").toUpperCase().includes(q) || (a.ARTICULO || "").toUpperCase().includes(q))
    .slice(0, 15);
  if (!arts.length) return [];
  const filtroCodigos = arts.map(a => `ARTICULO eq '${a.ARTICULO.replace(/'/g, "''")}'`).join(" or ");
  const filtroBodega = DAB_BODEGAS_TALLER.map(b => `BODEGA eq '${b}'`).join(" or ");
  const existe = await dabFetchAll(`/EXISTENCIA_BODEGA?$filter=${encodeURIComponent(`(${filtroCodigos}) and (${filtroBodega})`)}`);
  const conStock = new Set(existe.map(e => e.ARTICULO));
  return arts.map(a => ({ ...a, TIENE_EXISTENCIA: conStock.has(a.ARTICULO) }));
}

/**
 * Busca artículos ya creados localmente en x_taller_articulo (InfoAgro) —
 * cubre los que se crearon porque todavía no existían en Exactus.
 */
async function buscarArticulosLocalTaller(texto) {
  const filas = await tallerQuery("x_taller_articulo", [
    "id","x_name","x_studio_codigo","x_studio_costo_promedio","x_studio_unidad_medida","x_studio_activo_en_erp",
  ], ["|", ["x_name", "ilike", texto], ["x_studio_codigo", "ilike", texto]], 10);
  return filas.map(a => ({
    ARTICULO: a.x_studio_codigo || ("LOCAL-" + a.id),
    DESCRIPCION: a.x_name,
    COSTO_PROM_DOL: a.x_studio_costo_promedio || 0,
    COSTO_ULT_DOL: a.x_studio_costo_promedio || 0,
    UNIDAD_ALMACEN: a.x_studio_unidad_medida || "",
    TIENE_EXISTENCIA: false,
    ORIGEN: a.x_studio_activo_en_erp ? "InfoAgro" : "InfoAgro (pendiente Exactus)",
    _localId: a.id,
  }));
}

/**
 * Búsqueda combinada: Exactus primero, luego lo creado localmente en InfoAgro
 * (para los artículos que todavía no existen del lado de Exactus). Si Exactus
 * no responde, igual devuelve lo que haya en el espejo local — no bloquea.
 */
async function buscarArticulosCombinado(texto) {
  const [exactus, local] = await Promise.all([
    buscarArticulosExactus(texto).then(r => r.map(a => ({ ...a, ORIGEN: "Exactus" })))
      .catch(e => { console.error("Exactus no respondió (se sigue con InfoAgro):", e.message); return []; }),
    buscarArticulosLocalTaller(texto).catch(() => []),
  ]);
  return [...exactus, ...local];
}

/* ------------------------------------------------------------
   6. TablaInfoAgro — componente de tabla reutilizable
   ------------------------------------------------------------
   Estándar fijo de UI del proyecto: formato tabular, encabezado
   con botón de orden y botón de filtro estilo autofiltro de
   Excel, filtros SIEMPRE en cascada entre columnas.

   Construido en React puro (createElement, sin JSX/Babel) para
   que el filtrado/orden lo controle React de punta a punta, sin
   mezclar manipulación directa del DOM. Se usa así, dentro de
   cualquier pestaña que ya tenga React cargado:

     TablaInfoAgro(h, {
       columnas: [
         { clave: "x_name", titulo: "Folio" },
         { clave: "estado", titulo: "Estado" },
         { clave: "fecha", titulo: "Fecha", formatear: formatearFecha },
       ],
       filas: arregloDeObjetos,
       onFilaClick: fila => {...},          // opcional
       filaClaveUnica: "id",                // opcional, default "id"
     })

   Devuelve un elemento React ya armado — se usa directo dentro
   de cualquier h(...) del componente que lo llama.
   ------------------------------------------------------------ */
function TablaInfoAgro(h, props) {
  const { useState, useMemo, useRef, useEffect } = React;
  const { columnas, filas, onFilaClick, filaClaveUnica } = props;
  const claveId = filaClaveUnica || "id";

  function ComponenteTabla() {
    const [orden, setOrden] = useState(null); // { clave, direccion: 1 | -1 }
    const [filtros, setFiltros] = useState({}); // { clave: Set(valores seleccionados) }
    const [panelAbierto, setPanelAbierto] = useState(null); // clave de columna con el panel de filtro visible
    const [busquedaPanel, setBusquedaPanel] = useState("");
    const [seleccionTemp, setSeleccionTemp] = useState(null); // selección en edición dentro del panel abierto
    const [busquedaGlobal, setBusquedaGlobal] = useState(""); // texto libre — busca en todas las columnas a la vez
    const contenedorRef = useRef(null);

    function valorDeCelda(fila, col) {
      const crudo = fila[col.clave];
      if (col.formatear) return col.formatear(crudo);
      if (Array.isArray(crudo)) return crudo[1] ?? ""; // Many2one de Odoo: [id, "Nombre"]
      if (crudo === false || crudo === null || crudo === undefined) return "";
      return String(crudo);
    }

    // Cierra el panel si se hace clic fuera de la tabla
    useEffect(() => {
      function alClicFuera(e) {
        if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
          setPanelAbierto(null);
        }
      }
      document.addEventListener("mousedown", alClicFuera);
      return () => document.removeEventListener("mousedown", alClicFuera);
    }, []);

    // Filas que pasan la búsqueda libre (todas las columnas a la vez) Y todos los filtros de columna activos
    const filasFiltradas = useMemo(() => {
      const palabras = busquedaGlobal.trim().toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
      return filas.filter(fila => {
        if (palabras.length) {
          // El texto de toda la fila junto — cada palabra puede estar en una columna distinta
          // (ej. "nh 16" encuentra "Tractor NH 18" en una columna y "OT-000016" en otra).
          const textoFila = columnas.map(col => valorDeCelda(fila, col).toLocaleLowerCase("es")).join(" | ");
          const coincideTodas = palabras.every(p => textoFila.includes(p));
          if (!coincideTodas) return false;
        }
        return columnas.every(col => {
          const set = filtros[col.clave];
          if (!set) return true; // sin filtro en esta columna = pasa
          return set.has(valorDeCelda(fila, col));
        });
      });
    }, [filas, filtros, busquedaGlobal]);

    const filasOrdenadas = useMemo(() => {
      if (!orden) return filasFiltradas;
      const col = columnas.find(c => c.clave === orden.clave);
      const copia = [...filasFiltradas];
      copia.sort((a, b) => {
        const va = valorDeCelda(a, col), vb = valorDeCelda(b, col);
        const na = parseFloat(va), nb = parseFloat(vb);
        let cmp;
        if (!isNaN(na) && !isNaN(nb) && va !== "" && vb !== "") cmp = na - nb;
        else cmp = String(va).localeCompare(String(vb), "es");
        return cmp * orden.direccion;
      });
      return copia;
    }, [filasFiltradas, orden]);

    function alternarOrden(clave) {
      setOrden(prev => {
        if (!prev || prev.clave !== clave) return { clave, direccion: 1 };
        if (prev.direccion === 1) return { clave, direccion: -1 };
        return null;
      });
    }

    // Valores disponibles para el panel de una columna: se calculan sobre las
    // filas que ya pasan los filtros de TODAS LAS DEMÁS columnas (esto es lo
    // que produce la cascada real entre filtros).
    function valoresDisponibles(colActual) {
      const filasBase = filas.filter(fila =>
        columnas.every(col => {
          if (col.clave === colActual.clave) return true;
          const set = filtros[col.clave];
          if (!set) return true;
          return set.has(valorDeCelda(fila, col));
        })
      );
      const conteo = new Map();
      filasBase.forEach(fila => {
        const v = valorDeCelda(fila, colActual);
        conteo.set(v, (conteo.get(v) || 0) + 1);
      });
      return [...conteo.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
    }

    function abrirPanel(col) {
      const disponibles = valoresDisponibles(col).map(([v]) => v);
      const actual = filtros[col.clave];
      setSeleccionTemp(new Set(actual ? [...actual] : disponibles));
      setBusquedaPanel("");
      setPanelAbierto(col.clave);
    }

    function aplicarPanel(col) {
      const disponibles = valoresDisponibles(col).map(([v]) => v);
      setFiltros(prev => {
        const copia = { ...prev };
        if (seleccionTemp.size === disponibles.length) {
          delete copia[col.clave]; // todo seleccionado = sin filtro
        } else {
          copia[col.clave] = new Set(seleccionTemp);
        }
        return copia;
      });
      setPanelAbierto(null);
    }

    function limpiarFiltro(clave) {
      setFiltros(prev => { const c = { ...prev }; delete c[clave]; return c; });
    }

    const hayFiltrosActivos = Object.keys(filtros).length > 0;

    return h("div", { className: "tabla-infoagro-envoltura", ref: contenedorRef },
      h("div", { className: "tabla-panel-busqueda" },
        h("span", { className: "tabla-busqueda-icono" }, "🔍"),
        h("input", {
          type: "text", className: "tabla-busqueda-input",
          placeholder: "Buscar en todos los campos...",
          value: busquedaGlobal,
          onChange: e => setBusquedaGlobal(e.target.value),
        }),
        busquedaGlobal && h("button", { className: "tabla-busqueda-limpiar", onClick: () => setBusquedaGlobal("") }, "✕"),
        busquedaGlobal && h("span", { className: "tabla-busqueda-conteo" }, filasFiltradas.length + " de " + filas.length)
      ),
      hayFiltrosActivos && h("div", { className: "tabla-barra-filtros" },
        h("span", null, "Filtros activos:"),
        Object.keys(filtros).map(clave => {
          const col = columnas.find(c => c.clave === clave);
          return h("span", { key: clave, className: "tabla-chip-filtro" },
            (col ? col.titulo : clave) + " (" + filtros[clave].size + ")",
            h("button", { onClick: () => limpiarFiltro(clave) }, "✕")
          );
        }),
        h("button", { className: "tabla-limpiar-todo", onClick: () => setFiltros({}) }, "Limpiar todo")
      ),
      h("div", { className: "tabla-scroll" },
        h("table", { className: "tabla-infoagro" },
          h("thead", null,
            h("tr", null,
              columnas.map(col => h("th", { key: col.clave },
                h("div", { className: "tabla-th-contenido" },
                  h("span", {
                    className: "tabla-th-titulo",
                    onClick: () => alternarOrden(col.clave),
                  },
                    col.titulo,
                    orden && orden.clave === col.clave && h("span", { className: "tabla-flecha-orden" }, orden.direccion === 1 ? " ▲" : " ▼")
                  ),
                  h("button", {
                    className: "tabla-btn-filtro" + (filtros[col.clave] ? " activo" : ""),
                    onClick: () => panelAbierto === col.clave ? setPanelAbierto(null) : abrirPanel(col),
                  }, "▾"),
                  panelAbierto === col.clave && h("div", { className: "tabla-panel-filtro", onClick: e => e.stopPropagation() },
                    h("input", {
                      type: "text", placeholder: "Buscar...", value: busquedaPanel,
                      onChange: e => setBusquedaPanel(e.target.value),
                      className: "tabla-panel-buscar",
                    }),
                    h("div", { className: "tabla-panel-acciones-rapidas" },
                      h("button", { onClick: () => setSeleccionTemp(new Set(valoresDisponibles(col).map(([v]) => v))) }, "Todos"),
                      h("button", { onClick: () => setSeleccionTemp(new Set()) }, "Ninguno")
                    ),
                    h("div", { className: "tabla-panel-lista" },
                      valoresDisponibles(col)
                        .filter(([v]) => v.toLowerCase().includes(busquedaPanel.toLowerCase()))
                        .map(([v, cuenta]) => h("label", { key: v || "(vacío)", className: "tabla-panel-item" },
                          h("input", {
                            type: "checkbox",
                            checked: seleccionTemp.has(v),
                            onChange: e => {
                              setSeleccionTemp(prev => {
                                const copia = new Set(prev);
                                if (e.target.checked) copia.add(v); else copia.delete(v);
                                return copia;
                              });
                            },
                          }),
                          h("span", null, v || "(vacío)"),
                          h("span", { className: "tabla-panel-cuenta" }, cuenta)
                        ))
                    ),
                    h("div", { className: "tabla-panel-botones" },
                      h("button", { className: "tabla-panel-cancelar", onClick: () => setPanelAbierto(null) }, "Cancelar"),
                      h("button", { className: "tabla-panel-ok", onClick: () => aplicarPanel(col) }, "Aceptar")
                    )
                  )
                )
              ))
            )
          ),
          h("tbody", null,
            filasOrdenadas.length === 0
              ? h("tr", null, h("td", { colSpan: columnas.length, className: "tabla-vacia" }, "Sin resultados"))
              : filasOrdenadas.map(fila => h("tr", {
                  key: fila[claveId],
                  className: onFilaClick ? "tabla-fila-clicable" : "",
                  onClick: onFilaClick ? () => onFilaClick(fila) : undefined,
                },
                  columnas.map(col => h("td", { key: col.clave }, valorDeCelda(fila, col)))
                ))
          )
        )
      ),
      h("div", { className: "tabla-pie" },
        filasOrdenadas.length + " de " + filas.length + " registro" + (filas.length === 1 ? "" : "s")
      )
    );
  }

  return h(ComponenteTabla);
}
