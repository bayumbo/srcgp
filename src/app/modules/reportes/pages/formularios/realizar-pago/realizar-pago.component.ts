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

type CampoClave = 'minutosAtraso' | 'administracion' | 'minutosBase' | 'multas';

type DeudaDetalleItem = {
  fecha: string;     // YYYY-MM-DD (fecha del reporte/deuda)
  monto: number;     // saldo pendiente para esa fecha y módulo
  pathDoc: string;   // ruta real: reportes_dia/{diaId}/unidades/{unidadId}
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
  reporteId: string = '';             // viene del route param (puede ser refPath codificado)
  private pathActual: string = '';    // ✅ ruta real del doc en reportes_dia/.../unidades/...

  registros: (NuevoRegistro & { id?: string }) | null = null;

  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];

  // Historial (subcolección pagosTotales del doc actual)
  pagosTotales: Record<CampoClave, PagoPorModulo[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };

  // ✅ Deuda acumulada (histórica) y desglose por fecha/path
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

  /**
   * ✅ Pagos por fila (por deuda histórica específica).
   * Key: `${campo}__${pathDoc}` -> { [campo]: monto }
   */
  pagosPorDeuda: Record<string, Partial<Record<CampoClave, number>>> = {};

  cargandoPago: boolean = false;

  // Fecha de pago general (se mantiene el formato del PDF)
  fechaSeleccionada: Date = new Date();

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

    // ✅ Resolver la ruta real del doc
    this.pathActual = this.resolverPath(this.uidUsuario, this.reporteId);

    // Cargar el registro (doc unidad del día)
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

    // Fallback desde query params
    const qp = this.route.snapshot.queryParamMap;
    this.registros.nombre = (data.nombre ?? qp.get('nombre') ?? '').toString().trim();
    (this.registros as any).apellido = (data.apellido ?? qp.get('apellido') ?? '').toString().trim();
    this.registros.unidad = (data.codigo ?? data.unidad ?? qp.get('unidad') ?? '').toString().trim();

    // 1) historial del doc actual
    await this.cargarPagosTotales();

    // 2) deuda histórica + desglose (collectionGroup unidades)
    await this.cargarDeudaHistoricaAcumulada();
  }

  /**
   * 1) Si id ya viene como refPath real (reportes_dia/.../unidades/...), úsalo directo.
   * 2) Si viene compuesto empresaKey_YYYY-MM-DD_unidadDocId, construye reportes_dia.
   * 3) Si no, legacy.
   */
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

    console.log('💰 Pagos cargados:', this.pagosTotales);
  }

  // =========================
  // DEUDA HISTÓRICA + DESGLOSE POR FECHA (collectionGroup)
  // =========================
  private async cargarDeudaHistoricaAcumulada(): Promise<void> {
    if (!this.registros) return;

    const codigo = ((this.registros as any)?.codigo ?? this.registros?.unidad ?? '').toString().trim();
    const empresa = ((this.registros as any)?.empresa ?? '').toString().trim();
    const fechaActual = ((this.registros as any)?.fecha ?? '').toString().trim(); // YYYY-MM-DD

    if (!codigo || !empresa || !fechaActual) return;

    // reset
    for (const c of this.campos) {
      this.deudaHistorica[c] = 0;
      this.deudaDetalle[c] = [];
    }

    // Históricos (días anteriores)
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

      const pathDoc = s.ref.path; // ✅ ruta real del doc histórico

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

    // Ordenar por fecha asc
    for (const campo of this.campos) {
      this.deudaDetalle[campo].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    // Incluir el día actual (doc cargado), usando pathActual
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
  // PAGO POR FILA (por deuda histórica)
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
    // limitar al pendiente de esa fila
    this.pagosPorDeuda[k][campo] = Math.min(num, item.monto);
  }

  // =========================
  // CÁLCULOS (deuda y totales)
  // =========================
  private campoPagadoKey(
    campo: CampoClave
  ): 'adminPagada' | 'minBasePagados' | 'minutosPagados' | 'multasPagadas' {
    if (campo === 'administracion') return 'adminPagada';
    if (campo === 'minutosBase') return 'minBasePagados';
    if (campo === 'minutosAtraso') return 'minutosPagados';
    return 'multasPagadas';
  }

  /**
   * Deuda del día actual (doc actual).
   * OJO: aquí se calcula contra el acumulado del doc unidad (rápido).
   */
  private calcularDeudaDelDia(registro: any, campo: CampoClave): number {
    const total = Number(registro?.[campo] ?? 0);
    const pagadoKey = this.campoPagadoKey(campo);
    const pagado = Number(registro?.[pagadoKey] ?? 0);
    return Math.max(total - pagado, 0);
  }

  /**
   * Total acumulado “visible” en la tarjeta (históricos + hoy).
   * (Si en tu HTML estás mostrando deuda acumulada, úsala.)
   */
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

  /**
   * Total a pagar = suma de todos los inputs por fila (capados al pendiente).
   */
  calcularTotalGeneral(): number {
    let total = 0;
    for (const campo of this.campos) {
      for (const item of this.getDeudaDetalle(campo)) {
        total += Math.min(this.getPagoFila(campo, item), item.monto);
      }
    }
    return total;
  }

  // =========================
  // GUARDAR PAGOS (aplicar a cada doc histórico)
  // =========================
  async guardarPagosGenerales() {
    if (this.cargandoPago) return;
    this.cargandoPago = true;

    try {
      if (!this.registros) {
        alert('Registro no encontrado');
        return;
      }

      // 1) recolectar pagos ingresados (>0)
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

      // 2) fecha de pago (general, para mantener estructura del PDF)
      const fechaPagoStr = this.obtenerFechaISODesdeDate(this.fechaSeleccionada);
      const [y, m, d] = fechaPagoStr.split('-').map(Number);
      const fechaPago = Timestamp.fromDate(new Date(y, m - 1, d));

      // 3) agrupar por doc histórico (pathDoc)
      const porDoc = new Map<string, Array<{ campo: CampoClave; monto: number; fechaDeuda: string }>>();
      for (const a of aplicaciones) {
        if (!porDoc.has(a.pathDoc)) porDoc.set(a.pathDoc, []);
        porDoc.get(a.pathDoc)!.push({ campo: a.campo, monto: a.monto, fechaDeuda: a.fechaDeuda });
      }

      // 4) Totales por campo (para PDF fijo y control)
      const detallesTotalesPorCampo: Partial<Record<CampoClave, number>> = {};
      for (const a of aplicaciones) {
        detallesTotalesPorCampo[a.campo] = Number(detallesTotalesPorCampo[a.campo] ?? 0) + a.monto;
      }
      const totalPago = Object.values(detallesTotalesPorCampo).reduce((acc, v) => acc + Number(v ?? 0), 0);

      // 5) Pendientes “totales” antes del pago (sumando el desglose actual)
      const pendientesAntes: Record<CampoClave, number> = {
        administracion: 0,
        minutosBase: 0,
        minutosAtraso: 0,
        multas: 0
      };

      for (const campo of this.campos) {
        pendientesAntes[campo] = this.getDeudaDetalle(campo).reduce((acc, it) => acc + Number(it.monto ?? 0), 0);
      }

      // 6) Ejecutar escritura por cada doc histórico
      const pagosCreados: { pathPagoDoc: string }[] = [];

      for (const [pathDoc, items] of porDoc.entries()) {
        const detalles: Partial<Record<CampoClave, number>> = {};
        let total = 0;

        for (const it of items) {
          detalles[it.campo] = Number(detalles[it.campo] ?? 0) + it.monto;
          total += it.monto;
        }

        // 6.1 crear doc de pago
        const refPagos = collection(this.firestore, `${pathDoc}/pagosTotales`);
        const docRef = await addDoc(refPagos, {
          fecha: fechaPago,
          detalles,
          total,
          urlPDF: null,
          fechaPago,
          aplicaciones: items, // auditoría: a qué deudas/fechas se aplicó
          createdAt: serverTimestamp(),
          uidCobrador: this.uidUsuario
        });

        pagosCreados.push({ pathPagoDoc: `${pathDoc}/pagosTotales/${docRef.id}` });

        // 6.2 incrementar agregados del doc unidad
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

      // 7) Confirmación + PDF fijo (misma estructura)
      alert('✅ Pagos aplicados correctamente. Generando recibo en segundo plano...');

      // Generar PDF con estructura fija:
      // - Detalles por módulo (sumados)
      // - Fecha de pago por módulo = fecha seleccionada (misma para todos)
      const pagosConFechas = (Object.keys(detallesTotalesPorCampo) as CampoClave[])
        .filter(c => Number(detallesTotalesPorCampo[c] ?? 0) > 0)
        .map(c => ({ campo: c, monto: Number(detallesTotalesPorCampo[c] ?? 0), fecha: fechaPago }));

      // Pendientes después (acumulado total - pago total por módulo)
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

      // PDF en segundo plano + actualizar url en TODOS los docs de pago creados
      this.generarReciboYSubirPDF(this.uidUsuario, this.registros.id ?? 'pago', {
        nombre: (this.registros as any)?.nombre ?? '',
        apellido: (this.registros as any)?.apellido ?? '',
        unidad: (this.registros as any)?.unidad ?? (this.registros as any)?.codigo ?? '',
        total: totalPago,
        detalles: detallesTotalesPorCampo,
        pagosConFechas,
        pendientesDespues // ✅ mantiene la tabla de pendientes con cifras coherentes
      })
        .then(async (urlPDF) => {
          for (const p of pagosCreados) {
            await updateDoc(doc(this.firestore, p.pathPagoDoc), { urlPDF });
          }
          console.log('📄 Recibo PDF generado y URL actualizada en pagos');
        })
        .catch(err => console.error('❌ Error generando el PDF:', err));

      // 8) limpiar inputs y recargar
      this.pagosPorDeuda = {};
      await this.cargarPagosTotales();
      await this.cargarDeudaHistoricaAcumulada();

      // (si quieres volver automáticamente)
      // this.router.navigate(['/reportes/lista-reportes']);

    } catch (error) {
      console.error('❌ Error al guardar los pagos:', error);
      alert('Ocurrió un error al guardar los pagos.');
    } finally {
      this.cargandoPago = false;
    }
  }

  // =========================
  // PDF (estructura fija; solo cambia el cálculo interno)
  // =========================
  async generarReciboYSubirPDF(
    uid: string,
    reporteId: string,
    datos: {
      nombre: string;
      apellido: string;
      unidad: string;
      total: number;
      detalles: Partial<Record<CampoClave, number>>;
      pagosConFechas: { campo: CampoClave; monto: number; fecha: Timestamp }[];
      pendientesDespues: Record<CampoClave, number>;
    }
  ): Promise<string> {

    const fechaActual = datos.pagosConFechas[0]?.fecha.toDate() || new Date();
    const fechaTexto = fechaActual.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const horaTexto = fechaActual.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const campos: CampoClave[] = ['administracion', 'minutosBase', 'minutosAtraso', 'multas'];

    const tablaPagoActual: any[] = [];
    for (const pago of datos.pagosConFechas) {
      const fechaDelPago = pago.fecha.toDate().toLocaleDateString('es-EC', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const descripcion =
        pago.campo === 'administracion' ? 'Administración' :
        pago.campo === 'minutosBase' ? 'Minutos Base' :
        pago.campo === 'minutosAtraso' ? 'Minutos Atraso' :
        'Multas';

      tablaPagoActual.push([
        descripcion,
        fechaDelPago,
        `$${pago.monto.toFixed(2)}`
      ]);
    }
    tablaPagoActual.push(['TOTAL', '', `$${datos.total.toFixed(2)}`]);

    const logoPintag = await this.cargarImagenBase64('/assets/img/LogoPintag.png');
    const logoExpress = await this.cargarImagenBase64('/assets/img/LogoAntisana.png');

    const pdfDoc = new jsPDF();

    pdfDoc.addImage(logoPintag, 'PNG', 10, 10, 30, 30);
    pdfDoc.addImage(logoExpress, 'PNG', 170, 10, 30, 30);

    pdfDoc.setFontSize(18);
    pdfDoc.text('Consorcio Pintag Expresso', 60, 20);
    pdfDoc.setFontSize(10);
    pdfDoc.text('Pintag, Antisana S2-138', 80, 26);
    pdfDoc.text('consorciopinxpres@hotmail.com', 70, 31);

    pdfDoc.setFontSize(18);
    pdfDoc.text(`BUS ${datos.unidad}`, 20, 45);

    pdfDoc.setFontSize(11);
    pdfDoc.text(`Fecha de emisión: ${fechaTexto}`, 130, 45);
    pdfDoc.text(`Hora de emisión: ${horaTexto}`, 130, 51);

    autoTable(pdfDoc, {
      startY: 60,
      head: [['Descripción', 'Fecha', 'Valor']],
      body: tablaPagoActual,
      styles: { fontSize: 11, halign: 'right' },
      headStyles: { fillColor: [30, 144, 255], halign: 'center' }
    });

    const yFinal = (pdfDoc as any).lastAutoTable?.finalY || 100;

    // ✅ tabla de pendientes (mantiene estructura, con cifras coherentes post-pago)
    autoTable(pdfDoc, {
      startY: yFinal + 15,
      head: [['Descripción', 'Pendiente']],
      body: [
        ['Administración', `$${Number(datos.pendientesDespues.administracion ?? 0).toFixed(2)}`],
        ['Minutos Base', `$${Number(datos.pendientesDespues.minutosBase ?? 0).toFixed(2)}`],
        ['Minutos Atraso', `$${Number(datos.pendientesDespues.minutosAtraso ?? 0).toFixed(2)}`],
        ['Multas', `$${Number(datos.pendientesDespues.multas ?? 0).toFixed(2)}`]
      ],
      styles: { fontSize: 11, halign: 'right', textColor: 'black' },
      headStyles: { halign: 'center', fillColor: [240, 240, 240] }
    });

    const yFinal2 = (pdfDoc as any).lastAutoTable?.finalY || yFinal + 40;

    const busImage = await this.cargarImagenBase64('/assets/img/Bus.png');
    const busImg = new Image();
    busImg.src = busImage;
    await new Promise(resolve => (busImg.onload = resolve));

    const originalWidth = busImg.width;
    const originalHeight = busImg.height;
    const displayWidth = 30;
    const displayHeight = (originalHeight / originalWidth) * displayWidth;
    const centerX = (210 - displayWidth) / 2;

    pdfDoc.addImage(busImage, 'PNG', centerX, yFinal2 + 10, displayWidth, displayHeight);

    const texto = 'Escanea el código para descargar tu recibo';
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(0);
    const textWidth = pdfDoc.getTextWidth(texto);
    pdfDoc.text(texto, (210 - textWidth) / 2, yFinal2 + displayHeight + 25);

    const pdfBlob = pdfDoc.output('blob');
    const fileName = `recibos/${uid}_${reporteId}_${Date.now()}.pdf`;
    const storageRef = ref(this.storage, fileName);
    await uploadBytes(storageRef, pdfBlob);
    const pdfUrl = await getDownloadURL(storageRef);

    const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(pdfUrl)}`;
    const qrBase64 = await this.cargarImagenBase64(qrURL);
    const qrSize = 30;
    pdfDoc.addImage(qrBase64, 'PNG', (210 - qrSize) / 2, yFinal2 + displayHeight + 30, qrSize, qrSize);

    setTimeout(() => {
      pdfDoc.save(`${fechaTexto}_${datos.unidad.replace(/\s+/g, '_')}_${datos.nombre.replace(/\s+/g, '_')}_${datos.apellido.replace(/\s+/g, '_')}.pdf`);
    }, 500);

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
