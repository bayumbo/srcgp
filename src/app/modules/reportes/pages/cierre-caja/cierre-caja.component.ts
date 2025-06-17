import { Component, OnInit } from '@angular/core';
import { inject } from '@angular/core';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { CierreCajaItem, Egreso } from 'src/app/core/interfaces/cierreCajaItem.interface';
import { CierreCajaService } from '../../services/cierre-caja.services';
import { Firestore, doc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import * as FileSaver from 'file-saver';
import { Router } from '@angular/router';
 
@Component({
  selector: 'app-cierre-caja',
  standalone: true,
  imports: [CommonModule,FormsModule], // aquí recuerda agregar CommonModule donde defines el componente
  templateUrl: './cierre-caja.component.html',
  styleUrls: ['./cierre-caja.component.scss']
})
export class CierreCajaComponent implements OnInit {
  firestore = inject(Firestore);
  storage = inject(Storage);

  cierreItems: CierreCajaItem[] = [];
  fechaSeleccionada: Date = new Date();
  cargando: boolean = false;
  tituloFecha: string = '';

  // Historial de cierres
  cierresGuardados: any[] = [];

  // Egresos
  egresos: { modulo: string; valor: number }[] = [];
  nuevoEgreso = { modulo: '', valor: 0 };

  constructor(
    private cierreCajaService: CierreCajaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.actualizarTituloFecha();
    this.cargarCierre();
    this.cargarHistorial();
  }

  async cargarCierre() {
    this.cargando = true;
    this.actualizarTituloFecha();
    this.cierreItems = await this.cierreCajaService.obtenerCierrePorFecha(this.fechaSeleccionada);
    this.cargando = false;
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

  agregarEgreso() {
    if (!this.nuevoEgreso.modulo || this.nuevoEgreso.valor <= 0) return;
    this.egresos.push({ ...this.nuevoEgreso });
    this.nuevoEgreso = { modulo: '', valor: 0 };
  }

  calcularTotalGeneral(): number {
    return this.cierreItems.reduce((total, item) => total + item.valor, 0);
  }

  calcularTotalEgresos(): number {
    return this.egresos.reduce((total, e) => total + e.valor, 0);
  }

  calcularSaldoNeto(): number {
    return this.calcularTotalGeneral() - this.calcularTotalEgresos();
  }
 
  /*---------------------------Lógica generación PDF-----------------------------------------*/
  
  async generarPDF() {
    const pdfDoc = new jsPDF();
    const fechaTexto = this.fechaSeleccionada.toLocaleDateString();
  
    // 🖼️ Cargar logos
    const logoPintag = await this.cargarImagenBase64('/assets/img/LogoPintag.png');
    const logoExpress = await this.cargarImagenBase64('/assets/img/LogoAntisana.png');
  
    pdfDoc.addImage(logoPintag, 'PNG', 10, 10, 30, 30);
    pdfDoc.addImage(logoExpress, 'PNG', 170, 10, 30, 30);
  
    // 🟦 Encabezado
    pdfDoc.setFontSize(16);
    pdfDoc.setTextColor(40, 40, 40);
    pdfDoc.text('Consorcio Pintag Express', 75, 20);
    pdfDoc.setFontSize(12);
    pdfDoc.text(`CIERRE DE CAJA - ${fechaTexto}`, 80, 28);
  
    const startY = 45;
    const body = this.cierreItems.map(item => [
      item.modulo,
      item.unidad,
      new Date(item.fecha).toLocaleDateString(),
      `$${item.valor.toFixed(2)}`
    ]);
  
    (pdfDoc as any).autoTable({
      head: [['Módulo', 'Unidad', 'Fecha', 'Valor']],
      body,
      startY,
      styles: { fontSize: 10, cellPadding: 3, halign: 'center' },
      headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 }
    });
  
    const total = this.calcularTotalGeneral();
    const lastY = (pdfDoc as any).lastAutoTable.finalY || startY + 30;
  
    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Total Ingresos: $${total.toFixed(2)}`, 14, lastY + 10);
  
    const totalEgresos = this.calcularTotalEgresos();
    const saldoNeto = this.calcularSaldoNeto();
    let egresosY = lastY + 10;
  
    if (this.egresos.length > 0) {
      (pdfDoc as any).autoTable({
        head: [['Detalle del Egreso', 'Valor']],
        body: this.egresos.map(e => [e.modulo, `$${e.valor.toFixed(2)}`]),
        startY: lastY + 20,
        styles: { fontSize: 10, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [244, 67, 54], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [253, 236, 234] },
        margin: { left: 14, right: 14 }
      });
  
      egresosY = (pdfDoc as any).lastAutoTable.finalY || lastY + 40;
    } else {
      egresosY = lastY + 20;
    }
  
    // Mostrar total egresos y saldo neto (siempre)
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Total Egresos: $${totalEgresos.toFixed(2)}`, 14, egresosY + 10);
  
    pdfDoc.setFontSize(13);
    pdfDoc.setTextColor(33, 150, 83);
    pdfDoc.text(`Saldo Neto del Día: $${saldoNeto.toFixed(2)}`, 14, egresosY + 20);
  
    // Mostrar resumen por empresa (siempre)
    const resumenY = this.agregarResumenPorEmpresa(pdfDoc, this.cierreItems, egresosY + 30);
  
    pdfDoc.setDrawColor(150);
    pdfDoc.line(14, resumenY + 20, 100, resumenY + 20);
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100);
    pdfDoc.text('Firma Responsable', 14, resumenY + 25);
  
    // Guardar PDF
    const fechaId = this.fechaSeleccionada.toISOString().split('T')[0];
    pdfDoc.save(`CierreCaja-${fechaId}.pdf`);
  
    const pdfBlob = pdfDoc.output('blob');
    const archivoRef = ref(this.storage, `cierres/${fechaId}.pdf`);
    await uploadBytes(archivoRef, pdfBlob);
    const pdfUrl = await getDownloadURL(archivoRef);
  
    await setDoc(doc(this.firestore, `cierresCaja/${fechaId}`), {
      fecha: this.fechaSeleccionada,
      total,
      cantidadItems: this.cierreItems.length,
      egresos: this.egresos,
      totalEgresos,
      saldoNeto,
      pdfUrl,
      creadoEn: serverTimestamp()
    });
  
    alert('✅ PDF generado, guardado y descargado con éxito');
    this.cargarHistorial();
  }
  
  agregarResumenPorEmpresa(pdfDoc: jsPDF, cierreItems: CierreCajaItem[], startY: number): number {
    const empresas = ['General Píntag', 'Expreso Antisana'];
    const modulos = ['Administración', 'Minutos', 'Minutos Base', 'Multas'];
  
    // 🧠 Función auxiliar para agrupar por categoría real
    const categorizarModulo = (nombre: string): string => {
      const nombreLimpio = nombre.toLowerCase();
      if (nombreLimpio.includes('administracion')) return 'Administración';
      if (nombreLimpio.includes('minutosatraso')) return 'Minutos';
      if (nombreLimpio.includes('minutosbase')) return 'Minutos Base';
      if (nombreLimpio.includes('multa')) return 'Multas';
      return 'Otros';
    };
  
    let currentY = startY;
  
    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(0);
    pdfDoc.setFont('helvetica', 'bold');
  
    modulos.forEach(modulo => {
      pdfDoc.text(`TOTAL ${modulo.toUpperCase()}`, 14, currentY);
      currentY += 6;
  
      empresas.forEach(empresa => {
        const valor = cierreItems
          .filter(i =>
            categorizarModulo(i.modulo) === modulo &&
            i.empresa?.toLowerCase().includes(empresa.toLowerCase())
          )
          .reduce((acc, i) => acc + i.valor, 0);
  
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text(`  ${modulo.toUpperCase()} COOP. ${empresa.toUpperCase()}`, 20, currentY);
        pdfDoc.text(`$${valor.toFixed(2)}`, 190, currentY, { align: 'right' });
        currentY += 6;
      });
    });
  
    return currentY;
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
  
 /*---------------------------Fin diseño PDF-----------------------------------------*/
  egresoEnEdicion: number | null = null;
  egresoEditado: { modulo: string; valor: number } = { modulo: '', valor: 0 };

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

  async eliminar(cierre: any) {
    const confirmacion = confirm(`¿Eliminar el cierre del ${cierre.id}?`);
    if (!confirmacion) return;

    const archivoRef = ref(this.storage, `cierres/${cierre.id}.pdf`);
    await deleteObject(archivoRef);
    await setDoc(doc(this.firestore, `cierresCaja/${cierre.id}`), {}, { merge: false });
    alert('🗑 Cierre eliminado');
    this.cargarHistorial();
  }

  descargar(cierre: any) {
    window.open(cierre.pdfUrl, '_blank');
  }
  descargarExcel() {
    const fechaId = this.fechaSeleccionada.toISOString().split('T')[0];
  
    // 1. Hoja de ingresos
    const ingresosData = this.cierreItems.map(item => ({
      Módulo: item.modulo,
      Unidad: item.unidad,
      Fecha: new Date(item.fecha).toLocaleDateString(),
      Valor: item.valor
    }));
  
    // 2. Hoja de egresos
    const egresosData = this.egresos.map(item => ({
      Detalle: item.modulo,
      Valor: item.valor
    }));
  
    // 3. Crear libro
    const wb = XLSX.utils.book_new();
  
    const wsIngresos = XLSX.utils.json_to_sheet(ingresosData);
    const wsEgresos = XLSX.utils.json_to_sheet(egresosData);
  
    XLSX.utils.book_append_sheet(wb, wsIngresos, 'Ingresos');
    XLSX.utils.book_append_sheet(wb, wsEgresos, 'Egresos');
  
    // 4. Exportar
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const nombreArchivo = `CierreCaja-${fechaId}.xlsx`;
    FileSaver.saveAs(new Blob([wbout], { type: 'application/octet-stream' }), nombreArchivo);
  }
  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}