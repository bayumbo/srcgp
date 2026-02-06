import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

import * as XLSX from 'xlsx';
import * as FileSaver from 'file-saver';

import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
  deleteDoc
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from '@angular/fire/storage';

import { CierreCajaItem } from 'src/app/core/interfaces/cierreCajaItem.interface';
import { CierreCajaService } from '../../services/cierre-caja.services';
import { AuthService } from 'src/app/core/auth/services/auth.service';

@Component({
  selector: 'app-cierre-caja',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre-caja.component.html',
  styleUrls: ['./cierre-caja.component.scss']
})
export class CierreCajaComponent implements OnInit {
  // Rol / permisos
  esSocio: boolean = false;

  // Firebase
  firestore = inject(Firestore);
  storage = inject(Storage);

  // Datos cierre
  cierreItems: CierreCajaItem[] = [];
  fechaSeleccionada: Date = new Date();
  cargando: boolean = false;
  tituloFecha: string = '';

  // Historial de cierres
  cierresGuardados: any[] = [];

  // Egresos
  egresos: { modulo: string; valor: number }[] = [];
  nuevoEgreso = { modulo: '', valor: 0 };

  // UI edición egresos
  egresoEnEdicion: number | null = null;
  egresoEditado: { modulo: string; valor: number } = { modulo: '', valor: 0 };

  constructor(
    private cierreCajaService: CierreCajaService,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.currentUserRole$.subscribe(role => {
      this.esSocio = role === 'socio';
    });

    this.actualizarTituloFecha();
    this.cargarCierre();
    this.cargarHistorial();
  }

  /* ------------------------ Helpers fecha ------------------------ */

  private parseISODate(iso: string): Date | null {
    if (!iso || typeof iso !== 'string') return null;
    if (iso === '—') return null;
    const dt = new Date(`${iso}T00:00:00`);
    return isNaN(dt.getTime()) ? null : dt;
  }
private fechaIdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

  formatearFechaISO(iso: string): string {
    const dt = this.parseISODate(iso);
    return dt ? dt.toLocaleDateString('es-EC') : '—';
  }

  /* ------------------------ CARGA DATOS ------------------------ */

  async cargarCierre() {
    this.cargando = true;
    this.actualizarTituloFecha();

    try {
      const items = await this.cierreCajaService.obtenerCierrePorFecha(this.fechaSeleccionada);

      // ✅ fecha viene como ISO ("YYYY-MM-DD") de la deuda/reporte
      this.cierreItems = (items || []).map(i => ({
        ...i,
        fecha: String((i as any).fecha || '—')
      })) as any;

      // opcional: ordenar por fecha deuda
      this.cierreItems.sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)));
      console.log('Filas cierre:', this.cierreItems.length);
      console.log('PagoKeys únicos:', new Set(this.cierreItems.map(x => (x as any).pagoKey)).size);

    } finally {
      this.cargando = false;
    }
  }

  async cargarHistorial() {
    this.cierresGuardados = await this.cierreCajaService.obtenerHistorialCierres();
  }

  actualizarTituloFecha() {
    this.tituloFecha = this.fechaSeleccionada.toLocaleDateString('es-EC', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  onFechaChange(event: any) {
    const [y, m, d] = event.target.value.split('-').map(Number);
    this.fechaSeleccionada = new Date(y, m - 1, d);
    this.cargarCierre();
  }

  /* ------------------------ EGRESOS ------------------------ */

  agregarEgreso() {
    if (!this.nuevoEgreso.modulo || this.nuevoEgreso.valor <= 0) return;
    this.egresos.push({ ...this.nuevoEgreso });
    this.nuevoEgreso = { modulo: '', valor: 0 };
  }

  editarEgreso(index: number) {
    this.egresoEnEdicion = index;
    this.egresoEditado = { ...this.egresos[index] };
  }

  guardarEgresoEditado(index: number) {
    this.egresos[index] = { ...this.egresoEditado };
    this.egresoEnEdicion = null;
  }

  cancelarEdicion() {
    this.egresoEnEdicion = null;
  }

  eliminarEgreso(index: number) {
    this.egresos.splice(index, 1);
  }

  /* ------------------------ CÁLCULOS ------------------------ */

  calcularTotalGeneral(): number {
    const vistos = new Set<string>();
    let total = 0;

    for (const item of this.cierreItems) {
      const key = (item as any).pagoKey;
      const pagoTotal = Number((item as any).pagoTotal ?? 0);

      if (!key) continue;
      if (vistos.has(key)) continue;

      vistos.add(key);
      total += pagoTotal;
    }

    return total;
  }

  calcularTotalEgresos(): number {
    return this.egresos.reduce((total, e) => total + e.valor, 0);
  }

  calcularSaldoNeto(): number {
    return this.calcularTotalGeneral() - this.calcularTotalEgresos();
  }

  /* ------------------------ PDF ------------------------ */

  async generarPDF() {
    if (this.esSocio) {
      alert('No tienes permisos para generar cierres de caja.');
      return;
    }

    if (!this.cierreItems || this.cierreItems.length === 0) {
      alert('No hay datos de ingresos para la fecha seleccionada.');
      return;
    }

    const pdfDoc = new jsPDF();
    const fechaId = this.fechaIdLocal(this.fechaSeleccionada); // ✅ local
    const fechaTexto = this.fechaSeleccionada.toLocaleDateString('es-EC');

    const logoPintag = await this.cargarImagenBase64('/assets/img/LogoPintag.png');
    const logoExpress = await this.cargarImagenBase64('/assets/img/LogoAntisana.png');

    pdfDoc.addImage(logoPintag, 'PNG', 10, 10, 30, 30);
    pdfDoc.addImage(logoExpress, 'PNG', 170, 10, 30, 30);

    pdfDoc.setFontSize(16);
    pdfDoc.setTextColor(40, 40, 40);
    pdfDoc.text('Consorcio Pintag Express', 75, 20);

    pdfDoc.setFontSize(12);
    pdfDoc.text(`CIERRE DE CAJA - ${fechaTexto}`, 80, 28);

    const startY = 45;

    const body = this.cierreItems.map(item => ([
      (item as any).modulo,
      (item as any).unidad,
      this.formatearFechaISO(String((item as any).fecha || '—')),
      `$${Number((item as any).valor || 0).toFixed(2)}`
    ]));

    (pdfDoc as any).autoTable({
      head: [['Módulo', 'Unidad', 'Fecha (deuda)', 'Valor']],
      body,
      startY,
      styles: { fontSize: 10, cellPadding: 3, halign: 'center' },
      headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 }
    });

    const total = this.calcularTotalGeneral();
    const lastY = (pdfDoc as any).lastAutoTable?.finalY || startY + 30;

    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Total Ingresos: $${total.toFixed(2)}`, 14, lastY + 10);

    const totalEgresos = this.calcularTotalEgresos();
    const saldoNeto = this.calcularSaldoNeto();

    let egresosY = lastY + 10;

    if (this.egresos.length > 0) {
      (pdfDoc as any).autoTable({
        head: [['Detalle del Egreso', 'Valor']],
        body: this.egresos.map(e => [e.modulo, `$${Number(e.valor).toFixed(2)}`]),
        startY: lastY + 20,
        styles: { fontSize: 10, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [244, 67, 54], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [253, 236, 234] },
        margin: { left: 14, right: 14 }
      });

      egresosY = (pdfDoc as any).lastAutoTable?.finalY || lastY + 40;
    } else {
      egresosY = lastY + 20;
    }

    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Total Egresos: $${totalEgresos.toFixed(2)}`, 14, egresosY + 10);

    pdfDoc.setFontSize(13);
    pdfDoc.setTextColor(33, 150, 83);
    pdfDoc.text(`Saldo Neto del Día: $${saldoNeto.toFixed(2)}`, 14, egresosY + 20);

    pdfDoc.setDrawColor(150);
    pdfDoc.line(14, egresosY + 35, 100, egresosY + 35);
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100);
    pdfDoc.text('Firma Responsable', 14, egresosY + 40);

    pdfDoc.save(`CierreCaja-${fechaId}.pdf`);

    const pdfBlob = pdfDoc.output('blob');
    const archivoRef = ref(this.storage, `cierres/${fechaId}.pdf`);
    await uploadBytes(archivoRef, pdfBlob);
    const pdfUrl = await getDownloadURL(archivoRef);

    await setDoc(
      doc(this.firestore, `cierresCaja/${fechaId}`),
      {
        fechaId,
        fecha: fechaId,
        total,
        cantidadItems: this.cierreItems.length,
        egresos: this.egresos,
        totalEgresos,
        saldoNeto,
        pdfUrl,
        creadoEn: serverTimestamp()
      },
      { merge: true }
    );


    await this.cargarHistorial();
    alert('PDF generado, guardado y descargado con éxito');
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

      img.onerror = err => reject(err);
    });
  }

  /* ------------------------ HISTORIAL: ELIMINAR / DESCARGAR ------------------------ */

  async eliminar(cierre: any) {
    if (this.esSocio) {
      alert('No tienes permisos para eliminar cierres de caja.');
      return;
    }

    const id = cierre?.id || cierre?.fechaId || cierre?.fecha;
    const confirmacion = confirm(`¿Eliminar el cierre del ${id}?`);
    if (!confirmacion) return;

    if (!id) {
      alert('No se pudo identificar el cierre a eliminar.');
      return;
    }

    try {
      const archivoRef = ref(this.storage, `cierres/${id}.pdf`);
      await deleteObject(archivoRef);
    } catch (e) {
      console.warn('No se pudo borrar el PDF en Storage:', e);
    }

    await deleteDoc(doc(this.firestore, `cierresCaja/${id}`));

    alert('Cierre eliminado');
    await this.cargarHistorial();
  }

  descargar(cierre: any) {
    if (!cierre?.pdfUrl) {
      alert('Este cierre no tiene URL de PDF.');
      return;
    }
    window.open(cierre.pdfUrl, '_blank');
  }

  /* ------------------------ EXCEL ------------------------ */

  descargarExcel() {
    const fechaId = this.fechaSeleccionada.toISOString().split('T')[0];

    const ingresosData = this.cierreItems.map(item => ({
      Módulo: (item as any).modulo,
      Unidad: (item as any).unidad,
      'Fecha deuda': this.formatearFechaISO(String((item as any).fecha || '—')),
      Valor: Number((item as any).valor || 0)
    }));

    const egresosData = this.egresos.map(item => ({
      Detalle: item.modulo,
      Valor: Number(item.valor || 0)
    }));

    const wb = XLSX.utils.book_new();
    const wsIngresos = XLSX.utils.json_to_sheet(ingresosData);
    const wsEgresos = XLSX.utils.json_to_sheet(egresosData);

    XLSX.utils.book_append_sheet(wb, wsIngresos, 'Ingresos');
    XLSX.utils.book_append_sheet(wb, wsEgresos, 'Egresos');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const nombreArchivo = `CierreCaja-${fechaId}.xlsx`;

    FileSaver.saveAs(
      new Blob([wbout], { type: 'application/octet-stream' }),
      nombreArchivo
    );
  }

  /* ------------------------ NAVEGACIÓN ------------------------ */

  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
