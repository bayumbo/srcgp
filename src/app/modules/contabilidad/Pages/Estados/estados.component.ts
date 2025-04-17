import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { EstadoFinancieroService } from '../../Services/comprobante.service';
import { getStorage, ref, uploadBytes, getDownloadURL, } from '@angular/fire/storage';
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, Timestamp, serverTimestamp } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-estados',
  standalone: true,
  templateUrl: './estados.component.html',
  styleUrls: ['./estados.component.scss'],
  imports: [CommonModule, FormsModule, RouterModule],
})
export class EstadosComponent implements OnInit {
  fechaInicio: string = '';
  fechaFin: string = '';
  estadoJerarquico: { grupo: string; cuentas: { codigo: string; nombre: string; valor: number }[] }[] = [];

  modalAbierto: boolean = false;
  filtroInicio: string = '';
  filtroFin: string = '';
  balancesFiltrados: any[] = [];
  pagina: number = 1;
  porPagina: number = 5;

  constructor(private estadoService: EstadoFinancieroService) {}

  ngOnInit(): void {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      setTimeout(() => preloader.style.display = 'none', 1000);
    }
  }

  async generarEstado(): Promise<void> {
    if (!this.fechaInicio || !this.fechaFin) return;
    try {
      this.estadoJerarquico = await this.estadoService.generarBalanceGeneralJerarquico(this.fechaInicio, this.fechaFin);
    } catch (err) {
      console.error('Error al generar el estado financiero:', err);
    }
  }

  async generarPDF(): Promise<void> {
    if (!this.estadoJerarquico.length) return;
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTADO DE SITUACIÓN FINANCIERA', 105, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Desde: ${this.fechaInicio} - Hasta: ${this.fechaFin}`, 105, y, { align: 'center' });
    y += 12;

    const totales: any = {};
    this.estadoJerarquico.forEach(seccion => {
      let subtotal = 0;
      doc.setFontSize(11);
      doc.setFont('Helvetica', 'bold');
      doc.text(seccion.grupo, 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('Courier', 'bold');
      doc.text('Código', 25, y);
      doc.text('Cuenta', 70, y);
      doc.text('Valor', 190, y, { align: 'right' });
      y += 2;
      doc.setDrawColor(180);
      doc.line(20, y, 190, y);
      y += 5;
      doc.setFontSize(9);
      doc.setFont('Courier', 'normal');

      seccion.cuentas.forEach(cuenta => {
        const nivel = cuenta.codigo.split('.').length - 1;
        const sangria = 70 + nivel * 10;
        doc.text(cuenta.codigo, 25, y);
        doc.text(cuenta.nombre, sangria, y);
        doc.text(cuenta.valor.toLocaleString('es-EC', { minimumFractionDigits: 2 }), 190, y, { align: 'right' });
        subtotal += cuenta.valor;
        y += 6;
        if (y >= 270) {
          doc.addPage();
          y = 20;
        }
      });

      doc.setFont('Courier', 'bold');
      doc.setFontSize(10);
      doc.text(`TOTAL ${seccion.grupo}`, 70, y);
      doc.text(subtotal.toLocaleString('es-EC', { minimumFractionDigits: 2 }), 190, y, { align: 'right' });
      y += 10;
      totales[seccion.grupo] = subtotal;
    });

    doc.setDrawColor(100);
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RESUMEN FINAL:', 25, y);
    y += 7;
    const totalActivos = totales['ACTIVO'] || 0;
    const totalPasivos = totales['PASIVO'] || 0;
    const totalPatrimonio = totales['PATRIMONIO'] || 0;
    const comprobacion = (totalActivos.toFixed(2) === (totalPasivos + totalPatrimonio).toFixed(2)) ? '✅' : '❌';
    doc.setFont('Courier', 'normal');
    doc.text(`Total ACTIVO:`, 40, y);
    doc.text(totalActivos.toFixed(2), 190, y, { align: 'right' });
    y += 6;
    doc.text(`Total PASIVO:`, 40, y);
    doc.text(totalPasivos.toFixed(2), 190, y, { align: 'right' });
    y += 6;
    doc.text(`Total PATRIMONIO:`, 40, y);
    doc.text(totalPatrimonio.toFixed(2), 190, y, { align: 'right' });
    y += 10;
    doc.setFont('Helvetica', 'bold');
    doc.text(`ACTIVO = PASIVO + PATRIMONIO ${comprobacion}`, 105, y, { align: 'center' });
    y += 15;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Contador', 60, 285);
    doc.text('Gerente', 140, 285);

    const nombreArchivo = `estado_situacion_${this.fechaInicio}_a_${this.fechaFin}.pdf`;
    doc.save(nombreArchivo);

    const pdfBlob = doc.output('blob');
    const storage = getStorage();
    const pdfRef = ref(storage, `estados-financieros/${nombreArchivo}`);
    await uploadBytes(pdfRef, pdfBlob);
    const url = await getDownloadURL(pdfRef);

    const firestore = getFirestore();
    await addDoc(collection(firestore, 'estados-financieros'), {
      nombreArchivo,
      url,
      fechaInicio: this.fechaInicio,
      fechaFin: this.fechaFin,
      totalActivos,
      totalPasivos,
      totalPatrimonio,
      cumpleFormula: comprobacion === '✅',
      timestamp: serverTimestamp(),
    });

    alert('📄 PDF generado y guardado exitosamente con estilo profesional.');
  }

  obtenerSubtotal(cuentas: { valor: number }[]): number {
    return cuentas.reduce((s, c) => s + c.valor, 0);
  }

  abrirModal(): void {
    this.modalAbierto = true;
    this.pagina = 1;
    this.balancesFiltrados = [];
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.pagina = 1;
  }

  async filtrarBalances(): Promise<void> {
    if (!this.filtroInicio || !this.filtroFin) return;
    const firestore = getFirestore();
    const ref = collection(firestore, 'estados-financieros');
    const q = query(ref, where('fechaInicio', '>=', this.filtroInicio), where('fechaFin', '<=', this.filtroFin));
    const snapshot = await getDocs(q);
    this.balancesFiltrados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.pagina = 1;
  }

  get paginaActual(): any[] {
    const inicio = (this.pagina - 1) * this.porPagina;
    return this.balancesFiltrados.slice(inicio, inicio + this.porPagina);
  }

  get totalPaginas(): number {
    return Math.ceil(this.balancesFiltrados.length / this.porPagina);
  }

  cambiarPagina(nueva: number): void {
    if (nueva >= 1 && nueva <= this.totalPaginas) {
      this.pagina = nueva;
    }
  }

  async eliminarBalance(balance: any): Promise<void> {
    const storage = getStorage();
    const firestore = getFirestore();
    const pdfRef = ref(storage, `estados-financieros/${balance.nombreArchivo}`);
    try {
      await deleteDoc(doc(firestore, 'estados-financieros', balance.id));
      this.balancesFiltrados = this.balancesFiltrados.filter(b => b.id !== balance.id);
      alert('✅ Balance eliminado correctamente.');
    } catch (error) {
      alert('❌ Ocurrió un error al eliminar el balance.');
      console.error(error);
    }
  }
}