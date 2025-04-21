import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { EstadoResultadosService } from '../../Services/comprobante.service';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, Timestamp, serverTimestamp } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-estados-resultados',
  standalone: true,
  templateUrl: './estadosresultados.component.html',
  styleUrls: ['./estadosresultados.component.scss'],
  imports: [CommonModule, FormsModule, MatIconModule,RouterModule],
})
export class EstadosResultadosComponent implements OnInit {
  fechaInicio: string = '';
  fechaFin: string = '';
  resultados: { grupo: string; cuentas: { codigo: string; nombre: string; valor: number }[] }[] = [];
  modalAbierto: boolean = false;
  filtroInicio: string = '';
  filtroFin: string = '';
  resultadosFiltrados: any[] = [];
  pagina: number = 1;
  porPagina: number = 5;

  constructor(private estadoService: EstadoResultadosService) {}

  ngOnInit(): void {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      setTimeout(() => (preloader.style.display = 'none'), 1000);
    }
  }
  menuAbierto: boolean = false;

  async generarEstado(): Promise<void> {
    if (!this.fechaInicio || !this.fechaFin) return;
    try {
      this.resultados = await this.estadoService.generarEstadoResultados(
        this.fechaInicio,
        this.fechaFin
      );
    } catch (err) {
      console.error('Error al generar el estado de resultados:', err);
    }
  }

  async generarPDF(): Promise<void> {
    if (!this.resultados.length) return;
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTADO DE RESULTADOS', 105, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Desde: ${this.fechaInicio} - Hasta: ${this.fechaFin}`, 105, y, { align: 'center' });
    y += 12;

    this.resultados.forEach(seccion => {
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
        doc.text(cuenta.codigo, 25, y);
        doc.text(cuenta.nombre, 70, y);
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
    });

    const nombreArchivo = `estado_resultados_${this.fechaInicio}_a_${this.fechaFin}.pdf`;
    doc.save(nombreArchivo);

    const pdfBlob = doc.output('blob');
    const storage = getStorage();
    const pdfRef = ref(storage, `estados-resultados/${nombreArchivo}`);
    await uploadBytes(pdfRef, pdfBlob);
    const url = await getDownloadURL(pdfRef);

    const firestore = getFirestore();
    await addDoc(collection(firestore, 'estados-resultados'), {
      nombreArchivo,
      url,
      fechaInicio: this.fechaInicio,
      fechaFin: this.fechaFin,
      timestamp: serverTimestamp(),
    });

    alert('📄 Estado de Resultados generado y guardado exitosamente.');
  }

  obtenerTotal(cuentas: { valor: number }[]): number {
    return cuentas.reduce((s, c) => s + c.valor, 0);
  }

  abrirModal(): void {
    this.modalAbierto = true;
    this.pagina = 1;
    this.resultadosFiltrados = [];
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.pagina = 1;
  }

  async filtrarResultados(): Promise<void> {
    if (!this.filtroInicio || !this.filtroFin) return;
    const firestore = getFirestore();
    const ref = collection(firestore, 'estados-resultados');
    const q = query(ref, where('fechaInicio', '>=', this.filtroInicio), where('fechaFin', '<=', this.filtroFin));
    const snapshot = await getDocs(q);
    this.resultadosFiltrados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.pagina = 1;
  }

  get paginaActual(): any[] {
    const inicio = (this.pagina - 1) * this.porPagina;
    return this.resultadosFiltrados.slice(inicio, inicio + this.porPagina);
  }

  get totalPaginas(): number {
    return Math.ceil(this.resultadosFiltrados.length / this.porPagina);
  }

  cambiarPagina(nueva: number): void {
    if (nueva >= 1 && nueva <= this.totalPaginas) {
      this.pagina = nueva;
    }
  }

  async eliminarResultado(resultado: any): Promise<void> {
    const storage = getStorage();
    const firestore = getFirestore();
    const pdfRef = ref(storage, `estados-resultados/${resultado.nombreArchivo}`);
    try {
      await deleteDoc(doc(firestore, 'estados-resultados', resultado.id));
      this.resultadosFiltrados = this.resultadosFiltrados.filter(b => b.id !== resultado.id);
      alert('✅ Documento eliminado correctamente.');
    } catch (error) {
      alert('❌ Ocurrió un error al eliminar el documento.');
      console.error(error);
    }
  }
}
