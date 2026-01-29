import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  collection,
  getDocs,
  collectionGroup,
  query,
  where,
  Timestamp,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { PagoPorModulo } from 'src/app/core/interfaces/pagoPorModulo.interface';
import { DocumentoPago } from 'src/app/core/interfaces/documentoPago.interface';

import { ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Storage } from '@angular/fire/storage';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { deleteDoc } from '@angular/fire/firestore';
import { deleteObject } from '@angular/fire/storage';
// ✅ Si no lo usas, mejor comenta o elimina para evitar warnings:
// import QRCode from 'qrcode';

type CampoClave = 'minutosAtraso' | 'administracion' | 'minutosBase' | 'multas';

type DeudaDetalleItem = {
  fecha: string;     // YYYY-MM-DD (fecha del reporte/deuda)
  monto: number;     // saldo pendiente para esa fecha y módulo
  pathDoc: string;   // ruta real: reportes_dia/{diaId}/unidades/{unidadId}
};

// ✅ Item que alimenta la tabla del PDF
type PagoReciboItem = {
  campo: CampoClave;
  monto: number;
  fecha: Timestamp;     // fecha de pago (cabecera)
  fechaDeuda: string;   // ✅ fecha del reporte (columna Fecha de la tabla)
};

@Component({
  selector: 'app-realizar-pago',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './realizar-pago.component.html',
  styleUrls: ['./realizar-pago.component.scss']
})
export class RealizarPagoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  uidUsuario: string = '';
  reporteId: string = '';
  private pathActual: string = '';

  registros: (NuevoRegistro & { id?: string }) | null = null;

  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];

  pagosTotales: Record<CampoClave, PagoPorModulo[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };

  deudaHistorica: Record<CampoClave, number> = {
    minutosAtraso: 0,
    administracion: 0,
    minutosBase: 0,
    multas: 0
  };

  deudaDetalle: Record<CampoClave, DeudaDetalleItem[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };


  pagosPorDeuda: Record<string, Partial<Record<CampoClave, number>>> = {};
  pagoEnEdicion: { id: string; campo: CampoClave } | null = null;
  nuevoMonto: number = 0;               // input monto

  cargandoPago: boolean = false;

  // Fecha de pago general (cabecera PDF)
  fechaSeleccionada: Date = new Date();

  // Cache de assets
  private logoPintagB64: string | null = null;
  private logoAntisanaB64: string | null = null;
  private busB64: string | null = null;

  private recargarVistaActual(): void {
  const url = this.router.url;

  // Truco: navegar a una ruta dummy y volver, para forzar ngOnInit
  this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
    this.router.navigateByUrl(url);
  });
}


  // =========================
  // INIT
  // =========================
  async ngOnInit(): Promise<void> {
    const idRaw = this.route.snapshot.paramMap.get('id');
    const uid = this.route.snapshot.paramMap.get('uid');

    if (!idRaw || !uid) {
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    this.uidUsuario = uid;
    this.reporteId = decodeURIComponent(idRaw);

    this.pathActual = this.resolverPath(this.uidUsuario, this.reporteId);

    const refDoc = doc(this.firestore, this.pathActual);
    const snap = await getDoc(refDoc);

    if (!snap.exists()) {
      alert('Registro no encontrado');
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    const data = snap.data() as any;

    this.registros = {
      ...(data as NuevoRegistro),
      id: snap.id
    };

const qp = this.route.snapshot.queryParamMap;

// ✅ UNIDAD
this.registros.unidad = (data.codigo ?? data.unidad ?? qp.get('unidad') ?? '').toString().trim();

// ✅ NOMBRE (nuevo modelo primero)
this.registros.nombre = (
  data.propietarioNombre ??            // ✅ nuevo
  data.nombre ??                       // legacy
  data.propietario ??                  // por si existe
  data.legacy?.propietarioNombre ??    // si lo guardaste en legacy map
  qp.get('nombre') ??
  ''
).toString().trim();

// ✅ APELLIDO (si no lo tienes en la unidad, se puede completar con usuarios/{uid})
(this.registros as any).apellido = (
  data.apellidos ??
  data.apellido ??
  data.legacy?.apellidos ??
  data.legacy?.apellido ??
  qp.get('apellido') ??
  ''
).toString().trim();


    await this.cargarPagosTotales();
    await this.cargarDeudaHistoricaAcumulada();
  }

  private resolverPath(uid: string, id: string): string {
    if (id.startsWith('reportes_dia/')) return id;

    const partes = (id ?? '').split('_');
    if (partes.length >= 3) {
      const unidadId = partes[partes.length - 1];
      const diaId = partes.slice(0, partes.length - 1).join('_');
      return `reportes_dia/${diaId}/unidades/${unidadId}`;
    }

    return `usuarios/${uid}/reportesDiarios/${id}`;
  }

  // =========================
  // HISTORIAL DE PAGOS (doc actual)
  // =========================
  async cargarPagosTotales() {
    for (const campo of this.campos) this.pagosTotales[campo] = [];
    if (!this.registros?.id) return;

    const reporteId = this.registros.id;
    const refPagos = collection(this.firestore, `${this.pathActual}/pagosTotales`);
    const snap = await getDocs(refPagos);

    const pagos: DocumentoPago[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<DocumentoPago, 'id'>)
    }));

    for (const campo of this.campos) {
      const nuevosPagos = pagos.flatMap(p => {
        const cantidad = p.detalles?.[campo] ?? 0;
        return cantidad > 0
          ? [{ id: p.id, cantidad: cantidad, fecha: p.fecha, reporteId }]
          : [];
      });

      this.pagosTotales[campo].push(...nuevosPagos);
    }
  }

  // =========================
  // DEUDA HISTÓRICA + DESGLOSE POR FECHA (collectionGroup)
  // =========================
  private async cargarDeudaHistoricaAcumulada(): Promise<void> {
    if (!this.registros) return;

    const codigo = ((this.registros as any)?.codigo ?? this.registros?.unidad ?? '').toString().trim();
    const empresa = ((this.registros as any)?.empresa ?? '').toString().trim();
    const fechaActual = ((this.registros as any)?.fecha ?? '').toString().trim();

    if (!codigo || !empresa || !fechaActual) return;

    for (const c of this.campos) {
      this.deudaHistorica[c] = 0;
      this.deudaDetalle[c] = [];
    }

    const q = query(
      collectionGroup(this.firestore, 'unidades'),
      where('empresa', '==', empresa),
      where('codigo', '==', codigo),
      where('fecha', '<', fechaActual)
    );

    const snap = await getDocs(q);

    snap.forEach(s => {
      const d: any = s.data();
      const fecha = (d?.fecha ?? '').toString().trim();
      if (!fecha) return;

      const pathDoc = s.ref.path;

      for (const campo of this.campos) {
        const total = Number(d?.[campo] ?? 0);
        const pagadoKey = this.campoPagadoKey(campo);
        const pagado = Number(d?.[pagadoKey] ?? 0);
        const pendiente = Math.max(total - pagado, 0);

        if (pendiente > 0) {
          this.deudaHistorica[campo] += pendiente;
          this.deudaDetalle[campo].push({ fecha, monto: pendiente, pathDoc });
        }
      }
    });

    for (const campo of this.campos) {
      this.deudaDetalle[campo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    const reg: any = this.registros;
    const fechaHoy = (reg?.fecha ?? fechaActual).toString().trim();

    for (const campo of this.campos) {
      const pendienteHoy = this.calcularDeudaDelDia(reg, campo);
      if (pendienteHoy > 0) {
        this.deudaDetalle[campo].push({ fecha: fechaHoy, monto: pendienteHoy, pathDoc: this.pathActual });
      }
    }
  }

  getDeudaDetalle(campo: CampoClave): DeudaDetalleItem[] {
    return this.deudaDetalle?.[campo] ?? [];
  }

  getDeudaDetalleLimitado(campo: CampoClave, max = 50): DeudaDetalleItem[] {
    const arr = this.getDeudaDetalle(campo);
    return arr.length > max ? arr.slice(arr.length - max) : arr;
  }

  // =========================
  // PAGO POR FILA
  // =========================
  private keyDeuda(campo: CampoClave, item: DeudaDetalleItem): string {
    return `${campo}__${item.pathDoc}__${item.fecha}`;
  }

  getPagoFila(campo: CampoClave, item: DeudaDetalleItem): number {
    const k = this.keyDeuda(campo, item);
    return Number(this.pagosPorDeuda[k]?.[campo] ?? 0);
  }

  setPagoFila(campo: CampoClave, item: DeudaDetalleItem, valor: any): void {
    const k = this.keyDeuda(campo, item);
    const num = Math.max(Number(valor ?? 0), 0);
    if (!this.pagosPorDeuda[k]) this.pagosPorDeuda[k] = {};
    this.pagosPorDeuda[k][campo] = Math.min(num, item.monto);
  }

  // =========================
  // CÁLCULOS
  // =========================
  private campoPagadoKey(
    campo: CampoClave
  ): 'adminPagada' | 'minBasePagados' | 'minutosPagados' | 'multasPagadas' {
    if (campo === 'administracion') return 'adminPagada';
    if (campo === 'minutosBase') return 'minBasePagados';
    if (campo === 'minutosAtraso') return 'minutosPagados';
    return 'multasPagadas';
  }

  private calcularDeudaDelDia(registro: any, campo: CampoClave): number {
    const total = Number(registro?.[campo] ?? 0);
    const pagadoKey = this.campoPagadoKey(campo);
    const pagado = Number(registro?.[pagadoKey] ?? 0);
    return Math.max(total - pagado, 0);
  }

  calcularDeudaAcumulada(campo: CampoClave): number {
    const historica = Number(this.deudaHistorica?.[campo] ?? 0);
    const hoy = this.registros ? this.calcularDeudaDelDia(this.registros as any, campo) : 0;
    return historica + hoy;
  }

  filtrarPagosPorRegistro(campo: CampoClave, registroId: string): PagoPorModulo[] {
    return this.pagosTotales[campo]?.filter(p => p.reporteId === registroId) || [];
  }

  calcularTotalPagado(campo: CampoClave, registroId: string): number {
    return this.filtrarPagosPorRegistro(campo, registroId).reduce((acc, p) => acc + p.cantidad, 0);
  }

  calcularTotalGeneral(): number {
    let total = 0;
    for (const campo of this.campos) {
      for (const item of this.getDeudaDetalle(campo)) {
        total += Math.min(this.getPagoFila(campo, item), item.monto);
      }
    }
    return total;
  }

  async eliminarPago(pagoId: string): Promise<void> {
  if (!pagoId) return;

  const ok = confirm('¿Seguro que deseas eliminar este pago? Esta acción no se puede deshacer.');
  if (!ok) return;

  try {
    // ✅ Ruta del doc del pago (si tu historial viene del doc actual, es pathActual)
    const pagoPath = `${this.pathActual}/pagosTotales/${pagoId}`;
    const pagoRef = doc(this.firestore, pagoPath);

    const snap = await getDoc(pagoRef);
    if (!snap.exists()) {
      alert('El pago ya no existe o no se encontró.');
      return;
    }

    const data: any = snap.data();
    const detalles: Partial<Record<CampoClave, number>> = data?.detalles ?? {};
    const urlPDF: string | null = data?.urlPDF ?? null;

    // ✅ Preparar decrementos en el doc unidad
    // OJO: el doc unidad es this.pathActual
    const updates: any = {
      updatedAt: serverTimestamp(),
      fechaModificacion: serverTimestamp()
    };

    // Restar de los acumulados pagados (adminPagada/minBasePagados/minutosPagados/multasPagadas)
    (Object.keys(detalles) as CampoClave[]).forEach((campo) => {
      const monto = Number(detalles[campo] ?? 0);
      if (monto > 0) {
        const pagadoKey = this.campoPagadoKey(campo);
        updates[pagadoKey] = increment(-monto); // ✅ resta
      }
    });

    // 1) actualizar unidad (restar pagos)
    await updateDoc(doc(this.firestore, this.pathActual), updates);

    // 2) eliminar doc pago
    await deleteDoc(pagoRef);

    // 3) (opcional) eliminar PDF asociado si existe
    // Solo si quieres que “limpie” storage también.
    if (urlPDF) {
      try {
        // Si urlPDF es una downloadURL, puedes borrarlo si guardas también la ruta.
        // Si NO guardas ruta, lo más estable es guardar `storagePath` dentro del doc pago.
        // Aun así, intento borrar desde URL si es compatible en tu caso.
        const objRef = ref(this.storage, urlPDF);
        await deleteObject(objRef);
      } catch (e) {
        // No bloqueamos por errores de Storage (puede fallar si no hay path)
        console.warn('No se pudo eliminar el PDF en Storage (revisar storagePath):', e);
      }
    }

    alert('✅ Pago eliminado correctamente.');

    // 4) recargar UI
  this.recargarVistaActual();

  } catch (error) {
    console.error('❌ Error eliminando pago:', error);
    alert('Ocurrió un error al eliminar el pago.');
  }
}

esPagoEnEdicion(pago: { id: string }, campo: CampoClave): boolean {
  return !!this.pagoEnEdicion && this.pagoEnEdicion.id === pago.id && this.pagoEnEdicion.campo === campo;
}

iniciarEdicion(pago: { id: string; cantidad: number; fecha: any }, campo: CampoClave): void {
  this.pagoEnEdicion = { id: pago.id, campo };

  // monto actual
  this.nuevoMonto = Number(pago.cantidad ?? 0);

  // fecha actual (Timestamp -> YYYY-MM-DD)
  const dt: Date =
    typeof pago.fecha?.toDate === 'function'
      ? pago.fecha.toDate()
      : (pago.fecha instanceof Date ? pago.fecha : new Date());

}

cancelarEdicion(): void {
  this.pagoEnEdicion = null;
  this.nuevoMonto = 0;

}

async guardarEdicion(): Promise<void> {
  if (!this.pagoEnEdicion) return;

  const { id, campo } = this.pagoEnEdicion;

  // Validaciones
  const montoNuevo = Math.max(Number(this.nuevoMonto ?? 0), 0);


  try {
    // Doc pago (siempre cuelga del doc actual)
    const pagoPath = `${this.pathActual}/pagosTotales/${id}`;
    const pagoRef = doc(this.firestore, pagoPath);

    const snap = await getDoc(pagoRef);
    if (!snap.exists()) {
      alert('El pago no existe o ya fue eliminado.');
      this.cancelarEdicion();
      return;
    }

    const data: any = snap.data();
    const detalles = (data?.detalles ?? {}) as Partial<Record<CampoClave, number>>;

    const montoAnterior = Number(detalles?.[campo] ?? 0);

    // Delta para ajustar acumulado en el doc unidad
    const delta = montoNuevo - montoAnterior;

    // 1) Ajustar acumulado pagado en el doc unidad (adminPagada/minBasePagados/minutosPagados/multasPagadas)
    if (delta !== 0) {
      const pagadoKey = this.campoPagadoKey(campo);
      await updateDoc(doc(this.firestore, this.pathActual), {
        [pagadoKey]: increment(delta),
        updatedAt: serverTimestamp(),
        fechaModificacion: serverTimestamp()
      } as any);
    }

    // 2) Actualizar doc pago (detalles + total + fecha)
    const detallesNuevos: Partial<Record<CampoClave, number>> = { ...detalles };
    detallesNuevos[campo] = montoNuevo;

    const totalNuevo =
      Number(detallesNuevos.administracion ?? 0) +
      Number(detallesNuevos.minutosBase ?? 0) +
      Number(detallesNuevos.minutosAtraso ?? 0) +
      Number(detallesNuevos.multas ?? 0);

    // Si el total queda en 0, borramos el doc pago (opcional, recomendado)
    if (totalNuevo <= 0) {
      await deleteDoc(pagoRef);
    } else {
      await updateDoc(pagoRef, {
 // si tú manejas ambos campos, mantenlos iguales
        detalles: detallesNuevos,
        total: totalNuevo,
        updatedAt: serverTimestamp()
      } as any);
    }

    // 3) Refrescar UI
    await this.cargarPagosTotales();
    await this.cargarDeudaHistoricaAcumulada();

this.cancelarEdicion();
alert('✅ Pago actualizado correctamente.');
this.recargarVistaActual();
  } catch (err) {
    console.error('❌ Error guardando edición:', err);
    alert('Ocurrió un error al editar el pago.');
  }
}

  // =========================
  // GUARDAR PAGOS
  // =========================
  async guardarPagosGenerales() {
    if (this.cargandoPago) return;
    this.cargandoPago = true;

    try {
      if (!this.registros) {
        alert('Registro no encontrado');
        return;
      }

      const aplicaciones: Array<{
        campo: CampoClave;
        monto: number;
        pathDoc: string;
        fechaDeuda: string;
      }> = [];

      for (const campo of this.campos) {
        const items = this.getDeudaDetalle(campo);
        for (const item of items) {
          const monto = this.getPagoFila(campo, item);
          if (monto > 0) {
            aplicaciones.push({
              campo,
              monto,
              pathDoc: item.pathDoc,
              fechaDeuda: item.fecha
            });
          }
        }
      }

      if (aplicaciones.length === 0) {
        alert('⚠️ Ingresa al menos un pago en alguna fecha.');
        return;
      }

      const fechaPagoStr = this.obtenerFechaISODesdeDate(this.fechaSeleccionada);
      const [y, m, d] = fechaPagoStr.split('-').map(Number);
      const fechaPago = Timestamp.fromDate(new Date(y, m - 1, d));

      // ✅ existe en este scope y la firma lo acepta como opcional
      const qrLink = `${window.location.origin}/recibos/pendiente`;

      const porDoc = new Map<string, Array<{ campo: CampoClave; monto: number; fechaDeuda: string }>>();
      for (const a of aplicaciones) {
        if (!porDoc.has(a.pathDoc)) porDoc.set(a.pathDoc, []);
        porDoc.get(a.pathDoc)!.push({ campo: a.campo, monto: a.monto, fechaDeuda: a.fechaDeuda });
      }

      const detallesTotalesPorCampo: Partial<Record<CampoClave, number>> = {};
      for (const a of aplicaciones) {
        detallesTotalesPorCampo[a.campo] = Number(detallesTotalesPorCampo[a.campo] ?? 0) + a.monto;
      }
      const totalPago = Object.values(detallesTotalesPorCampo).reduce((acc, v) => acc + Number(v ?? 0), 0);

      const pendientesAntes: Record<CampoClave, number> = {
        administracion: 0,
        minutosBase: 0,
        minutosAtraso: 0,
        multas: 0
      };

      for (const campo of this.campos) {
        pendientesAntes[campo] = this.getDeudaDetalle(campo).reduce((acc, it) => acc + Number(it.monto ?? 0), 0);
      }

      const pagosCreados: { pathPagoDoc: string }[] = [];

      for (const [pathDoc, items] of porDoc.entries()) {
        const detalles: Partial<Record<CampoClave, number>> = {};
        let total = 0;

        for (const it of items) {
          detalles[it.campo] = Number(detalles[it.campo] ?? 0) + it.monto;
          total += it.monto;
        }

        const refPagos = collection(this.firestore, `${pathDoc}/pagosTotales`);
        const docRef = await addDoc(refPagos, {
          fecha: fechaPago,
          detalles,
          total,
          urlPDF: null,
          fechaPago,
          aplicaciones: items,
          createdAt: serverTimestamp(),
          uidCobrador: this.uidUsuario
        });

        pagosCreados.push({ pathPagoDoc: `${pathDoc}/pagosTotales/${docRef.id}` });

        const incUpdates: any = {
          updatedAt: serverTimestamp(),
          fechaModificacion: serverTimestamp()
        };

        for (const c of Object.keys(detalles) as CampoClave[]) {
          const monto = Number(detalles[c] ?? 0);
          if (monto > 0) {
            const pagadoKey = this.campoPagadoKey(c);
            incUpdates[pagadoKey] = increment(monto);
          }
        }

        await updateDoc(doc(this.firestore, pathDoc), incUpdates);
      }

      alert('✅ Pagos aplicados correctamente. Generando recibo...');

      const pagosConFechas: PagoReciboItem[] = aplicaciones.map(a => ({
        campo: a.campo,
        monto: a.monto,
        fecha: fechaPago,
        fechaDeuda: a.fechaDeuda
      }));

      const pendientesDespues: Record<CampoClave, number> = {
        administracion: 0,
        minutosBase: 0,
        minutosAtraso: 0,
        multas: 0
      };

      for (const campo of this.campos) {
        const pagadoCampo = Number(detallesTotalesPorCampo[campo] ?? 0);
        pendientesDespues[campo] = Math.max(Number(pendientesAntes[campo] ?? 0) - pagadoCampo, 0);
      }

      const unidadTicket =
      (this.registros?.unidad ?? '').toString().trim() ||
      ((this.registros as any)?.codigo ?? '').toString().trim() ||
      '---';


      // ✅ Genera PDF y luego actualiza urlPDF en los pagos
    this.generarReciboYSubirPDF(this.uidUsuario, this.registros.id ?? 'pago', {
      nombre: (this.registros as any)?.nombre ?? '',
      apellido: (this.registros as any)?.apellido ?? '',
      unidad: unidadTicket, // ✅ usar la unidad correcta aquí
      total: totalPago,
      detalles: detallesTotalesPorCampo,
      pagosConFechas,
      pendientesDespues
    })
      .then(async (urlPDF) => {
        for (const p of pagosCreados) {
          await updateDoc(doc(this.firestore, p.pathPagoDoc), { urlPDF });
        }
      })
      .catch(err => console.error('❌ Error generando el PDF:', err));

      this.pagosPorDeuda = {};
this.recargarVistaActual();

    } catch (error) {
      console.error('❌ Error al guardar los pagos:', error);
      alert('Ocurrió un error al guardar los pagos.');
    } finally {
      this.cargandoPago = false;
    }
  }

  // =========================
  // PDF
  // =========================
async generarReciboYSubirPDF(
  uid: string,
  reporteId: string,
  datos: {
    nombre: string;
    apellido: string;
    unidad: string; // ✅ E01/E13
    total: number;
    detalles: Partial<Record<CampoClave, number>>;
    pagosConFechas: { campo: CampoClave; monto: number; fecha: Timestamp; fechaDeuda?: string }[];
    pendientesDespues: Record<CampoClave, number>;
  }
): Promise<string> {

  // =========================
  // FORMATO TICKET 80mm
  // =========================
  const pdfDoc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [80, 297] // Roll Paper 80 x 297 mm
  });

  const W = 80;
  const margin = 4;

  // =========================
  // FECHA / HORA (LOCAL)
  // =========================
  // Nota: esto usa la hora local del navegador (tu PC). Para forzar Ecuador:
  // usamos timeZone: 'America/Guayaquil'
    const emisionNow = new Date();

    // (opcional) mantenemos fechaPagoDate solo como fallback para la tabla si falta fechaDeuda
    const fechaPagoDate = datos.pagosConFechas?.[0]?.fecha?.toDate?.() ?? emisionNow;

    const fechaTexto = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    }).format(emisionNow);

    const horaTexto = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(emisionNow);
  // =========================
  // CABECERA (UNIDAD GRANDE + BLOQUE DERECHO)
  // =========================
  const unidadTicket = (datos.unidad ?? '').toString().trim().toUpperCase() || '---';

  // Unidad grande (izquierda)
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(22);
  pdfDoc.text(unidadTicket, margin, 12);

  // Bloque derecho (empresa + contacto) con WRAP para 80mm
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(6.5);

  const empresa1 = 'Consorcio Pintag Expresso';
  const empresa2 = 'Pintag, Antisana S2-138';
  const email    = 'consorciopinxpres@hotmail.com';

  const rightX = W - margin;

  pdfDoc.text(empresa1, rightX, 10.5, { align: 'right' });

  const wrapRight = (txt: string, y: number) => {
    const maxW = 44; // ancho máximo del bloque derecho
    const lines = pdfDoc.splitTextToSize(txt, maxW);
    pdfDoc.text(lines, rightX, y, { align: 'right' });
  };

  wrapRight(empresa2, 13.5);
  wrapRight(email,   17.0);

  const yFecha = 20.5;
  // Fecha/hora (izquierda, debajo)
  pdfDoc.setFontSize(6.7);
  pdfDoc.text(`Fecha de emisión: ${fechaTexto}`, margin, yFecha);
  pdfDoc.text(`Hora de emisión:  ${horaTexto}`,  margin, yFecha + 3);

  // Línea separadora
  pdfDoc.setDrawColor(180);
  pdfDoc.line(margin, 24, W - margin, 24);

  // =========================
  // TABLA PRINCIPAL (DESCRIPCIÓN / FECHA(=fechaDeuda) / VALOR)
  // =========================
  const tablaPagoActual: any[] = [];

  for (const pago of (datos.pagosConFechas ?? [])) {
    // Fecha que se muestra en la tabla: FECHA DEL REPORTE (fechaDeuda)
    let fechaReporteTexto = '';

    if (pago.fechaDeuda) {
      const [yy, mm, dd] = pago.fechaDeuda.split('-').map(Number);
      const fechaReporte = new Date(yy, (mm || 1) - 1, dd || 1);

      fechaReporteTexto = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(fechaReporte);
    } else {
      // Fallback: no debería pasar, pero evita errores
      fechaReporteTexto = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(fechaPagoDate);
    }

    const descripcion =
      pago.campo === 'administracion' ? 'Administración' :
      pago.campo === 'minutosBase' ? 'Minutos Base' :
      pago.campo === 'minutosAtraso' ? 'Minutos' :
      'Multas';

    tablaPagoActual.push([
      descripcion,
      fechaReporteTexto,
      `$ ${Number(pago.monto ?? 0).toFixed(2)}`
    ]);
  }

  tablaPagoActual.push(['TOTAL', '', `$ ${Number(datos.total ?? 0).toFixed(2)}`]);

  autoTable(pdfDoc, {
    startY: 27,
    head: [['DESCRIPCIÓN', 'FECHA', 'VALOR']],
    body: tablaPagoActual,
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: { top: 0.8, right: 0.8, bottom: 0.8, left: 0.8 },
      overflow: 'linebreak'
    },
    headStyles: { fontStyle: 'bold', textColor: 120 },
    tableWidth: W - (margin * 2),
    columnStyles: {
      0: { halign: 'left',  cellWidth: 34 },
      1: { halign: 'left',  cellWidth: 22 },
      2: { halign: 'right', cellWidth: 16, fontStyle: 'bold' }
    },
    margin: { left: margin, right: margin }
  });

  const yFinal = (pdfDoc as any).lastAutoTable?.finalY || 60;

  // Línea separadora
  pdfDoc.setDrawColor(180);
  pdfDoc.line(margin, yFinal + 2, W - margin, yFinal + 2);

  // =========================
  // LOGOS CENTRADOS (SIN DESBORDAR)
  // =========================
  const logoPintag = await this.cargarImagenBase64('/assets/img/LogoPintag.png');
  const logoExpress = await this.cargarImagenBase64('/assets/img/LogoAntisana.png');

  const selloW = 20;
  const gap = 6;
  const totalSellos = (selloW * 2) + gap;
  const xSellos = (W - totalSellos) / 2;
  const ySellos = yFinal + 6;

  pdfDoc.addImage(logoPintag, 'PNG', xSellos, ySellos, selloW, selloW);
  pdfDoc.addImage(logoExpress, 'PNG', xSellos + selloW + gap, ySellos, selloW, selloW);

  const yDespuesSellos = ySellos + selloW + 6;

  // =========================
  // TABLA SALDOS (SALDO / TOTAL)
  // =========================

  autoTable(pdfDoc, {
  startY: yDespuesSellos,
  head: [['SALDO', 'TOTAL']],
  body: [
    ['ADMINISTRACIÓN', `$ ${Number(datos.pendientesDespues.administracion ?? 0).toFixed(2)}`],
    ['MINUTOS',        `$ ${Number(datos.pendientesDespues.minutosAtraso ?? 0).toFixed(2)}`],
    ['MINUTOS BASE',   `$ ${Number(datos.pendientesDespues.minutosBase ?? 0).toFixed(2)}`],
    ['MULTAS',         `$ ${Number(datos.pendientesDespues.multas ?? 0).toFixed(2)}`]
  ],
  theme: 'plain',
  styles: { fontSize: 9, cellPadding: 1.0 },
  headStyles: { fontStyle: 'bold', textColor: 120 },

  tableWidth: W - (margin * 2),
  columnStyles: {
    0: { halign: 'left',  cellWidth: 46 },
    1: { halign: 'right', cellWidth: 26 }
  },
  margin: { left: margin, right: margin },

  didDrawCell: (data) => {
  if (data.section !== 'head') return;
  if (data.row.index !== 0) return;
  if (data.column.index !== 1) return;

  const xStart = margin;
  const xEnd   = W - margin;
  const yLine  = data.cell.y + data.cell.height + 0.6;

  pdfDoc.setDrawColor(180);
  pdfDoc.setLineWidth(0.4);
  pdfDoc.line(xStart, yLine, xEnd, yLine);
}

});

  const yFinal2 = (pdfDoc as any).lastAutoTable?.finalY || (yDespuesSellos + 40);

  // Línea + footer como en ticket
  pdfDoc.setDrawColor(180);
  pdfDoc.line(margin, yFinal2 + 2, W - margin, yFinal2 + 2);

  pdfDoc.setFontSize(6);
  pdfDoc.setTextColor(150);
  pdfDoc.text(
    'Consorcio Pintag Expresso | Pintag, Antisana S2-138 | consorciopinxpres@hotmail.com',
    margin,
    yFinal2 + 6,
    { maxWidth: W - (margin * 2) }
  );

  // =========================
  // GUARDAR + SUBIR (SIN QR)
  // =========================
  const pdfBlob = pdfDoc.output('blob');
  const fileName = `recibos/${uid}_${reporteId}_${Date.now()}.pdf`;

  const storageRef = ref(this.storage, fileName);
  await uploadBytes(storageRef, pdfBlob);
  const pdfUrl = await getDownloadURL(storageRef);

  // Descarga instantánea (sin setTimeout)
  const safeUnidad = unidadTicket.replace(/\s+/g, '_');
  const safeNombre = (datos.nombre ?? '').toString().trim().replace(/\s+/g, '_');
  const safeApellido = (datos.apellido ?? '').toString().trim().replace(/\s+/g, '_');
  const fechaISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(emisionNow); // YYYY-MM-DD
  const pdfBlobLocal = pdfDoc.output('blob');
  const pdfURLLocal = URL.createObjectURL(pdfBlobLocal);

  // abre en nueva pestaña
  window.open(pdfURLLocal, '_blank');

  // (opcional) liberar memoria luego
  setTimeout(() => {
    URL.revokeObjectURL(pdfURLLocal);
  }, 60_000);

  return pdfUrl;
}

  // =========================
  // UTILIDADES
  // =========================
  private obtenerFechaISODesdeDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
private dateToISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
  cargarImagenBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        resolve(dataURL);
      };

      img.onerror = (err) => reject(err);
    });
  }

  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
