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
  increment,
  setDoc
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

  // ✅ unidadId real (ej: ExpresoAntisana_E01) para lectura global de pagos
  unidadId: string = '';

  registros: (NuevoRegistro & { id?: string }) | null = null;

  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];
  fechaEdicion: string = '';
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
    this.fechaEdicion = (this.route.snapshot.queryParamMap.get('fecha') ?? '').toString().trim();

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


    // ✅ unidadId real (si estás en nuevo modelo: reportes_dia/.../unidades/{unidadId})
    this.unidadId = this.pathActual.split('/').pop() ?? '';

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
  // HISTORIAL DE PAGOS (global si existe / fallback doc actual)
  // =========================
  async cargarPagosTotales() {
    for (const campo of this.campos) this.pagosTotales[campo] = [];

    // 1) Intentar leer desde unidades/{unidadId}/pagos (fuente global para caja)
    let pagos: DocumentoPago[] = [];
    if (this.unidadId) {
      try {
        const refPagos = collection(this.firestore, `unidades/${this.unidadId}/pagos`);
        const snap = await getDocs(refPagos);
        pagos = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (e) {
        console.warn('No se pudo leer unidades/{unidadId}/pagos. Se usa fallback a pagosTotales:', e);
      }
    }

    // 2) Fallback: pagos del doc actual (legacy / mientras migras)
    if (pagos.length === 0) {
      try {
        const refPagos = collection(this.firestore, `${this.pathActual}/pagosTotales`);
        const snap = await getDocs(refPagos);
        pagos = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (e) {
        console.warn('No se pudo leer pagosTotales del doc actual:', e);
        pagos = [];
      }
    }

    // 3) Alimentar UI (una fila por módulo)
    // Nota: tu UI actual espera "PagoPorModulo" por campo.
    for (const campo of this.campos) {
      const nuevosPagos = pagos.flatMap(p => {
        const cantidad = Number(p.detalles?.[campo] ?? 0);

        // fecha real del pago (preferimos Timestamp)
        const fechaPago = (p.fecha ?? (p as any).createdAt ?? (p as any).fechaPago) as any;

        // Agrupador (si existe metadata), si no: '---'
        const reporteId =
          (p as any).pathDoc ??
          (p as any).diaId ??
          (p as any).reporteId ??
          (this.registros?.id ?? '---');

        return cantidad > 0
          ? [{ id: p.id, cantidad, fecha: fechaPago, reporteId }]
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

    // ✅ Recalcular desde cero SIEMPRE (evita acumulación por múltiples llamadas)
    const deudaHistoricaTmp: Record<CampoClave, number> = {
      minutosAtraso: 0,
      administracion: 0,
      minutosBase: 0,
      multas: 0
    };

    const deudaDetalleTmp: Record<CampoClave, Array<{ fecha: string; monto: number; pathDoc: string }>> = {
      minutosAtraso: [],
      administracion: [],
      minutosBase: [],
      multas: []
    };

    const codigo = ((this.registros as any)?.codigo ?? this.registros?.unidad ?? '').toString().trim();
    const empresa = ((this.registros as any)?.empresa ?? '').toString().trim();

    if (!codigo || !empresa) {
      this.deudaHistorica = deudaHistoricaTmp;
      this.deudaDetalle = deudaDetalleTmp;
      return;
    }

    const q = query(
      collectionGroup(this.firestore, 'unidades'),
      where('empresa', '==', empresa),
      where('codigo', '==', codigo)
    );

    const snap = await getDocs(q);

    snap.forEach(s => {
      const pathDoc = s.ref.path;

      // ✅ Solo tomar docs que vienen de reportes_dia (evita colisiones con otras colecciones)
      if (!pathDoc.startsWith('reportes_dia/')) return;

      // ✅ Solo tomar la unidad exacta (evita colisiones por codigo)
      if (this.unidadId && !pathDoc.endsWith(`/unidades/${this.unidadId}`)) return;

      const d: any = s.data();
      const fecha = (d?.fecha ?? '').toString().trim();
      if (!fecha) return;

      for (const campo of this.campos) {
        const total = Number(d?.[campo] ?? 0);
        const pagadoKey = this.campoPagadoKey(campo);
        const pagado = Number(d?.[pagadoKey] ?? 0);
        const pendiente = Math.max(total - pagado, 0);

        if (pendiente > 0) {
          deudaHistoricaTmp[campo] += pendiente;
          deudaDetalleTmp[campo].push({ fecha, monto: pendiente, pathDoc });
        }
      }
    });

    // Orden por fecha
    for (const campo of this.campos) {
      deudaDetalleTmp[campo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    // ✅ Asignación final (evita renders con parciales 2→4→6)
    this.deudaHistorica = deudaHistoricaTmp;
    this.deudaDetalle = deudaDetalleTmp;
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

calcularDeudaAcumulada(campo: CampoClave): number {
  return Number(this.deudaHistorica?.[campo] ?? 0);
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

  async eliminarPago(pagoId: string, campo?: CampoClave): Promise<void> {
  if (!pagoId) return;

  const ok = confirm('¿Seguro que deseas eliminar este pago?');
  if (!ok) return;

  try {
    // 1) Resolver doc del pago (dual)
    const pagoDocPathUnidades = this.unidadId ? `unidades/${this.unidadId}/pagos/${pagoId}` : '';
    const pagoDocPathFallback = `${this.pathActual}/pagosTotales/${pagoId}`;

    let pagoRef = pagoDocPathUnidades
      ? doc(this.firestore, pagoDocPathUnidades)
      : doc(this.firestore, pagoDocPathFallback);

    let snap = await getDoc(pagoRef);

    if (!snap.exists()) {
      // fallback
      pagoRef = doc(this.firestore, pagoDocPathFallback);
      snap = await getDoc(pagoRef);
    }

    if (!snap.exists()) {
      alert('El pago ya no existe o no se encontró.');
      return;
    }

    const data: any = snap.data();
    const detalles: Partial<Record<CampoClave, number>> = data?.detalles ?? {};
    const urlPDF: string | null = data?.urlPDF ?? null;
    const storagePath: string | null = data?.storagePath ?? null;

    // aplicaciones (modelo nuevo)
    const apps: any[] = Array.isArray(data?.aplicaciones) ? data.aplicaciones : [];

    // fallback doc único (legacy)
    const pathDocPago = (data?.pathDoc ?? this.pathActual) as string;

    // Helpers
    const revertirEnDoc = async (pathDoc: string, c: CampoClave, monto: number) => {
      if (!pathDoc || monto <= 0) return;
      await updateDoc(doc(this.firestore, pathDoc), {
        [this.campoPagadoKey(c)]: increment(-monto),
        updatedAt: serverTimestamp(),
        fechaModificacion: serverTimestamp()
      } as any);
    };

    // ✅ CASO A: eliminar TODO el pago (campo NO enviado)
    if (!campo) {
      if (apps.length > 0) {
        // ✅ Revertir EXACTAMENTE por aplicaciones (puede afectar varios días)
        for (const a of apps) {
          const c = a?.campo as CampoClave;
          const monto = Number(a?.monto ?? 0);
          const pathDoc = (a?.pathDoc ?? '').toString().trim();
          if (!c || monto <= 0 || !pathDoc) continue;
          await revertirEnDoc(pathDoc, c, monto);
        }
      } else {
        // fallback legacy: revertir por detalles en un solo doc
        const updates: any = {
          updatedAt: serverTimestamp(),
          fechaModificacion: serverTimestamp()
        };

        (Object.keys(detalles) as CampoClave[]).forEach((c) => {
          const monto = Number(detalles[c] ?? 0);
          if (monto > 0) {
            const pagadoKey = this.campoPagadoKey(c);
            updates[pagadoKey] = increment(-monto);
          }
        });

        await updateDoc(doc(this.firestore, pathDocPago), updates);
      }

      // Borrar doc pago
      await deleteDoc(pagoRef);

    } else {
      // ✅ CASO B: eliminar SOLO un módulo del pago
      const montoAnterior = Number(detalles?.[campo] ?? 0);
      if (montoAnterior <= 0) return;

      if (apps.length > 0) {
        // ✅ Revertir SOLO las aplicaciones del campo en sus docs reales
        const appsCampo = apps.filter(a => a?.campo === campo && a?.pathDoc);
        if (appsCampo.length > 0) {
          for (const a of appsCampo) {
            const monto = Number(a?.monto ?? 0);
            const pathDoc = (a?.pathDoc ?? '').toString().trim();
            if (monto > 0 && pathDoc) {
              await revertirEnDoc(pathDoc, campo, monto);
            }
          }
        } else {
          // fallback (por si apps existe pero vino incompleto)
          await revertirEnDoc(pathDocPago, campo, montoAnterior);
        }
      } else {
        // legacy: revertir por detalles en un doc
        await revertirEnDoc(pathDocPago, campo, montoAnterior);
      }

      // Actualizar doc de pago: poner campo en 0 y recalcular total
      const detallesNuevos: Partial<Record<CampoClave, number>> = { ...detalles, [campo]: 0 };

      const totalNuevo =
        Number(detallesNuevos.administracion ?? 0) +
        Number(detallesNuevos.minutosBase ?? 0) +
        Number(detallesNuevos.minutosAtraso ?? 0) +
        Number(detallesNuevos.multas ?? 0);

      if (totalNuevo <= 0) {
        await deleteDoc(pagoRef);
      } else {
        // ✅ además, limpiar aplicaciones del campo para que no vuelva a afectar si editas luego
        const appsNuevas = apps.length > 0 ? apps.filter(a => a?.campo !== campo) : apps;

        await updateDoc(pagoRef, {
          detalles: detallesNuevos,
          total: totalNuevo,
          aplicaciones: appsNuevas,
          updatedAt: serverTimestamp()
        } as any);
      }
    }

    // 2) Storage (solo borrado confiable si guardas storagePath)
    if (storagePath) {
      try {
        await deleteObject(ref(this.storage, storagePath));
      } catch (e) {
        console.warn('No se pudo eliminar el PDF en Storage por storagePath:', e);
      }
    } else if (urlPDF) {
      console.warn('urlPDF existe, pero falta storagePath para borrado confiable.');
    }

    alert('✅ Eliminación aplicada.');
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
    // Resolver doc pago (dual)
    const pagoDocPathUnidades = this.unidadId ? `unidades/${this.unidadId}/pagos/${id}` : '';
    const pagoDocPathFallback = `${this.pathActual}/pagosTotales/${id}`;

    let pagoRef = pagoDocPathUnidades
      ? doc(this.firestore, pagoDocPathUnidades)
      : doc(this.firestore, pagoDocPathFallback);

    let snap = await getDoc(pagoRef);

    if (!snap.exists()) {
      pagoRef = doc(this.firestore, pagoDocPathFallback);
      snap = await getDoc(pagoRef);
    }

    if (!snap.exists()) {
      alert('El pago no existe o ya fue eliminado.');
      this.cancelarEdicion();
      return;
    }

    const data: any = snap.data();
    const detalles = (data?.detalles ?? {}) as Partial<Record<CampoClave, number>>;
    const aplicaciones: any[] = Array.isArray(data?.aplicaciones) ? data.aplicaciones : [];
    const pathDocPago = (data?.pathDoc ?? this.pathActual) as string;

    const montoAnterior = Number(detalles?.[campo] ?? 0);
    const delta = montoNuevo - montoAnterior;

    // 1) Ajustar acumulados pagados
    if (delta !== 0) {
      // Si hay aplicaciones del campo, distribuimos el delta proporcionalmente por esas aplicaciones.
      // Si no hay, aplicamos al doc asociado al pago.
      const appsCampo = aplicaciones.filter(a => a.campo === campo && a.pathDoc);

      if (appsCampo.length > 0) {
        // Reparto simple: si hay 1 aplicación, va todo ahí.
        // Si hay varias, repartimos proporcionalmente al monto original.
        const totalApps = appsCampo.reduce((acc, a) => acc + Number(a.monto ?? 0), 0) || 0;

        if (totalApps > 0) {
          let restante = delta;

          for (let i = 0; i < appsCampo.length; i++) {
            const a = appsCampo[i];
            const base = Number(a.monto ?? 0);

            // cuota proporcional, el último se lleva el redondeo/restante
            const cuota = (i === appsCampo.length - 1)
              ? restante
              : (delta * (base / totalApps));

            const ajuste = Number(cuota);

            await updateDoc(doc(this.firestore, a.pathDoc), {
              [this.campoPagadoKey(campo)]: increment(ajuste),
              updatedAt: serverTimestamp(),
              fechaModificacion: serverTimestamp()
            } as any);

            restante -= ajuste;
          }
        } else {
          await updateDoc(doc(this.firestore, pathDocPago), {
            [this.campoPagadoKey(campo)]: increment(delta),
            updatedAt: serverTimestamp(),
            fechaModificacion: serverTimestamp()
          } as any);
        }
      } else {
        await updateDoc(doc(this.firestore, pathDocPago), {
          [this.campoPagadoKey(campo)]: increment(delta),
          updatedAt: serverTimestamp(),
          fechaModificacion: serverTimestamp()
        } as any);
      }
    }

    // 2) Actualizar doc pago (detalles + total)
    const detallesNuevos: Partial<Record<CampoClave, number>> = { ...detalles };
    detallesNuevos[campo] = montoNuevo;

    const totalNuevo =
      Number(detallesNuevos.administracion ?? 0) +
      Number(detallesNuevos.minutosBase ?? 0) +
      Number(detallesNuevos.minutosAtraso ?? 0) +
      Number(detallesNuevos.multas ?? 0);

    if (totalNuevo <= 0) {
      await deleteDoc(pagoRef);
    } else {
      await updateDoc(pagoRef, {
        detalles: detallesNuevos,
        total: totalNuevo,
        updatedAt: serverTimestamp()
      } as any);
    }

    // 3) Refrescar UI
    await this.cargarPagosTotales();
    await this.cargarDeudaHistoricaAcumulada();

    this.pagoEnEdicion = null;
    this.nuevoMonto = 0;

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

    // ✅ Guardaremos pagos creados como DocumentReference real (no string path)
    const pagosCreados: Array<ReturnType<typeof doc>> = [];

    // ✅ NUEVA RUTA: unidades/{unidadId}/pagos
    const pagosUnidadRef = collection(this.firestore, `unidades/${this.unidadId}/pagos`);

    for (const [pathDoc, items] of porDoc.entries()) {
      const detalles: Partial<Record<CampoClave, number>> = {};
      let total = 0;

      for (const it of items) {
        detalles[it.campo] = Number(detalles[it.campo] ?? 0) + it.monto;
        total += it.monto;
      }

      // ✅ ID estable (fecha de pago + random corto para evitar colisión si haces 2 pagos el mismo día)
      const now = Date.now().toString(36).slice(-6);
      const pagoId = `${fechaPagoStr}_${now}`;

      const pagoDocRef = doc(pagosUnidadRef, pagoId);

      // ✅ Guardar en unidades/{unidadId}/pagos
      await setDoc(pagoDocRef, {
        // fecha real del pago
        fecha: fechaPago,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        uidCobrador: this.uidUsuario,

        // metadata
        unidadId: this.unidadId,
        codigo: ((this.registros as any)?.codigo ?? this.registros?.unidad ?? '').toString().trim(),
        empresa: ((this.registros as any)?.empresa ?? '').toString().trim(),

        // totales
        detalles,
        total,

        // soporta revertir / editar
        aplicaciones: items.map(it => ({
          campo: it.campo,
          monto: it.monto,
          fechaDeuda: it.fechaDeuda,
          pathDoc // doc del día/unidad donde se aplicó el pago
        })),

        // pdf (se completa luego)
        urlPDF: null,
        storagePath: null,

        // opcional
        qrLink
      });

      pagosCreados.push(pagoDocRef);

      // ✅ Aplicar increment en el doc del día (reportes_dia/.../unidades/...)
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

    // ✅ Genera PDF y luego actualiza urlPDF en los pagos NUEVOS (unidades/.../pagos)
    this.generarReciboYSubirPDF(this.uidUsuario, this.registros.id ?? 'pago', {
      nombre: (this.registros as any)?.nombre ?? '',
      apellido: (this.registros as any)?.apellido ?? '',
      unidad: unidadTicket,
      total: totalPago,
      detalles: detallesTotalesPorCampo,
      pagosConFechas,
      pendientesDespues
    })
      .then(async (urlPDF) => {
        for (const refPago of pagosCreados) {
          await updateDoc(refPago as any, { urlPDF, updatedAt: serverTimestamp() });
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
  const fecha = (this.fechaEdicion ?? this.fechaSeleccionada ?? '').toString().trim();

  this.router.navigate(['/reportes/lista-reportes'], {
    queryParams: { fecha }
  });
}
}
