const admin = require("firebase-admin");

function getArg(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : null;
}

const START = getArg("start");
const END = getArg("end");
const DRY = (getArg("dry") || "false") === "true";

if (!START || !END) {
  console.error("Faltan parámetros. Ejemplo: --start=2025-01-01 --end=2026-12-31");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

function parseISO(iso) { return new Date(`${iso}T12:00:00`); }
function toISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toDateSafe(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function empresaSlug(empresa) { return String(empresa || "").replace(/\s+/g, ""); }

async function loadUnidadesMap() {
  const snap = await db.collection("unidades").get();
  const map = new Map();
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const empresa = (d.empresa || "").trim();
    const codigo = (d.codigo || "").trim();
    map.set(`${empresa}|${codigo}`, { id: doc.id, ...d });
  });
  return map;
}

async function main() {
  console.log("== Migración (SIN collectionGroup) legacy -> reportes_dia + pagos ==");
  console.log("Rango:", START, "a", END, "| DRY:", DRY);

  const unidadMap = await loadUnidadesMap();
  console.log("Unidades cargadas:", unidadMap.size);

  const startDate = parseISO(START);
  const endDate = new Date(parseISO(END).setHours(23, 59, 59, 999));
  const startTs = admin.firestore.Timestamp.fromDate(startDate);

  let totalUsuarios = 0;
  let totalReportes = 0;
  let totalPagos = 0;

  let omitidos = 0;
  let sinEmpresa = 0;
  let sinUnidad = 0;
  let sinMapeoUnidad = 0;
  let fueraDeRango = 0;

  const acumuladosPorDiaUnidad = new Map();

  // Recorremos usuarios en páginas
  let lastUser = null;
  while (true) {
    let uq = db.collection("usuarios").orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (lastUser) uq = uq.startAfter(lastUser);

    const usersSnap = await uq.get();
    if (usersSnap.empty) break;

    for (const uDoc of usersSnap.docs) {
      totalUsuarios++;
      const uid = uDoc.id;
      const u = uDoc.data() || {};
      const empresa = u.empresa || null;

      if (!empresa) {
        sinEmpresa++;
        continue;
      }

      // Paginamos reportesDiarios de este usuario
      let lastReporte = null;
      while (true) {
        let rq = db.collection(`usuarios/${uid}/reportesDiarios`)
          .where("fechaModificacion", ">=", startTs)
          .orderBy("fechaModificacion", "asc")
          .limit(200);

        if (lastReporte) rq = rq.startAfter(lastReporte);

        const repSnap = await rq.get();
        if (repSnap.empty) break;

        for (const repDoc of repSnap.docs) {
          const data = repDoc.data() || {};
          const fm = toDateSafe(data.fechaModificacion);
          if (!fm) { omitidos++; continue; }
          if (fm > endDate) { fueraDeRango++; continue; }

          totalReportes++;
          const reporteId = repDoc.id;

          const unidadCodigo = (data.unidad || "").trim();
          if (!unidadCodigo) { sinUnidad++; omitidos++; continue; }

          const unidad = unidadMap.get(`${String(empresa).trim()}|${unidadCodigo}`);
          if (!unidad) { sinMapeoUnidad++; omitidos++; continue; }

          const fechaISO = toISO(fm);
          const diaId = `${empresaSlug(empresa)}_${fechaISO}`;
          const unidadId = unidad.id;

          const diaRef = db.doc(`reportes_dia/${diaId}`);
          const unidadDiaRef = db.doc(`reportes_dia/${diaId}/unidades/${unidadId}`);

          const propietarioNombre =
            unidad.propietarioNombre ||
            `${u.nombres || ""} ${u.apellidos || ""}`.trim();

          if (!DRY) {
            const batch = db.batch();
            batch.set(diaRef, {
              empresa,
              fecha: fechaISO,
              cerrado: false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            batch.set(unidadDiaRef, {
              fecha: fechaISO,
              empresa,
              unidadId,
              codigo: unidad.codigo || unidadCodigo,
              numeroOrden: unidad.numeroOrden || 0,
              uidPropietario: unidad.uidPropietario || uid,
              propietarioNombre: propietarioNombre || "",
              administracion: num(data.administracion ?? 2),
              minutosBase: num(data.minutosBase ?? 0),
              minutosAtraso: num(data.minutosAtraso ?? 0),
              multas: num(data.multas ?? 0),
              adminPagada: 0,
              minBasePagados: 0,
              minutosPagados: 0,
              multasPagadas: 0,
              legacy: { uid, reporteId },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            await batch.commit();
          }

          // Migrar pagosTotales
          const pagosSnap = await db.collection(`usuarios/${uid}/reportesDiarios/${reporteId}/pagosTotales`).get();
          if (!pagosSnap.empty) {
            let batch = db.batch();
            let ops = 0;

            for (const pagoDoc of pagosSnap.docs) {
              totalPagos++;
              const pagoId = pagoDoc.id;
              const pagoData = pagoDoc.data() || {};
              const detalles = pagoData.detalles || {};

              const fechaPago = toDateSafe(detalles.fecha) || new Date();

              const aplicado = {
                administracion: num(detalles.administracion),
                minutosAtraso: num(detalles.minutosAtraso),
                minutosBase: num(detalles.minutosBase),
                multas: num(detalles.multas),
              };

              const keyAcc = `${diaId}|${unidadId}`;
              const acc = acumuladosPorDiaUnidad.get(keyAcc) || { adminPagada: 0, minutosPagados: 0, minBasePagados: 0, multasPagadas: 0 };
              acc.adminPagada += aplicado.administracion;
              acc.minutosPagados += aplicado.minutosAtraso;
              acc.minBasePagados += aplicado.minutosBase;
              acc.multasPagadas += aplicado.multas;
              acumuladosPorDiaUnidad.set(keyAcc, acc);

              if (!DRY) {
                const ledgerPagoRef = db.doc(`unidades/${unidadId}/pagos/${pagoId}`);
                batch.set(ledgerPagoRef, {
                  createdAt: admin.firestore.Timestamp.fromDate(fechaPago),
                  empresa,
                  unidadId,
                  codigo: unidad.codigo || unidadCodigo,
                  total: num(detalles.total || pagoData.total),
                  detalles: { ...aplicado },
                  urlPDF: detalles.urlPDF || pagoData.urlPDF || null,
                  aplicaciones: [{ diaId, fecha: fechaISO, ...aplicado }],
                  legacy: { uid, reporteId, ruta: pagoDoc.ref.path },
                }, { merge: true });

                const espejoRef = db.doc(`reportes_dia/${diaId}/unidades/${unidadId}/pagos_aplicados/${pagoId}`);
                batch.set(espejoRef, {
                  createdAt: admin.firestore.Timestamp.fromDate(fechaPago),
                  aplicado,
                  total: num(detalles.total || pagoData.total),
                  urlPDF: detalles.urlPDF || pagoData.urlPDF || null,
                  refPago: `unidades/${unidadId}/pagos/${pagoId}`,
                  legacy: { uid, reporteId },
                }, { merge: true });

                ops += 2;
                if (ops >= 450) {
                  await batch.commit();
                  batch = db.batch();
                  ops = 0;
                }
              }
            }

            if (!DRY && ops > 0) await batch.commit();
          }
        }

        lastReporte = repSnap.docs[repSnap.docs.length - 1];
      }

      if (totalUsuarios % 50 === 0) {
        console.log(`Usuarios procesados: ${totalUsuarios} | Reportes: ${totalReportes} | Pagos: ${totalPagos}`);
      }
    }

    lastUser = usersSnap.docs[usersSnap.docs.length - 1];
  }

  // Recalcular agregados por día/unidad
  console.log("Recalculando agregados del día por unidad... registros:", acumuladosPorDiaUnidad.size);
  if (!DRY) {
    let batch = db.batch();
    let ops = 0;
    for (const [key, acc] of acumuladosPorDiaUnidad.entries()) {
      const [diaId, unidadId] = key.split("|");
      const ref = db.doc(`reportes_dia/${diaId}/unidades/${unidadId}`);
      batch.set(ref, {
        adminPagada: acc.adminPagada,
        minutosPagados: acc.minutosPagados,
        minBasePagados: acc.minBasePagados,
        multasPagadas: acc.multasPagadas,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedRecalc: true,
      }, { merge: true });

      ops++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }

  console.log("== FIN MIGRACIÓN ==");
  console.log({ totalUsuarios, totalReportes, totalPagos, omitidos, sinEmpresa, sinUnidad, sinMapeoUnidad, fueraDeRango });
}

main().catch((err) => {
  console.error("Error migración:", err);
  process.exit(1);
});
