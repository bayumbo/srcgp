import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { EstadoFinancieroService } from '../../Services/comprobante.service';
import { getStorage, ref, uploadBytes, getDownloadURL, } from '@angular/fire/storage';
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, Timestamp, serverTimestamp } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';
import { MatIconModule } from '@angular/material/icon';
import autoTable from 'jspdf-autotable';
import { HostListener } from '@angular/core';
@Component({
  selector: 'app-estados',
  standalone: true,
  templateUrl: './estados.component.html',
  styleUrls: ['./estados.component.scss'],
  imports: [CommonModule, FormsModule, MatIconModule,RouterModule],
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
  menuAbierto: boolean = false;
  toggleMenu() {
  this.menuAbierto = !this.menuAbierto;
}
// Cierra si hace clic fuera del menú
@HostListener('document:click', ['$event'])
cerrarSiClickFuera(event: MouseEvent) {
 const target = event.target as HTMLElement;
 if (!target.closest('nav') && !target.closest('.menu-toggle')) {
   this.menuAbierto = false;
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
    doc.setFontSize(13);
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTADO DE SITUACIÓN FINANCIERA - CONSORCIO PINTAG EXPRESS', 105, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Desde: ${this.fechaInicio} - Hasta: ${this.fechaFin}`, 105, y, { align: 'center' });
    y += 10;

    const totales: any = {};
    this.estadoJerarquico.forEach(seccion => {
      let subtotal = 0;



      doc.setFontSize(11);
      doc.setFont('Helvetica', 'bold');
      doc.text(seccion.grupo, 20, y);
      y += 5;

      
    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: seccion.cuentas.map(cuenta => {
        subtotal += cuenta.valor;
        return [
          cuenta.codigo,
          cuenta.nombre,
          cuenta.valor.toLocaleString('es-EC', { minimumFractionDigits: 2 })
        ];
      }),
      styles: {
        fontSize: 9,
        halign: 'center'
      },
      headStyles: {
        fillColor: [180, 180, 180],
        textColor: 20,
        fontStyle: 'bold'
      },
      theme: 'striped',
      margin: { left: 20, right: 20 }
    });

    y = (doc as any).lastAutoTable.finalY + 3;
    doc.setFont('Helvetica', 'bold');
    doc.text(`TOTAL ${seccion.grupo}`, 85, y);
    doc.text(subtotal.toLocaleString('es-EC', { minimumFractionDigits: 2 }), 170, y, { align: 'right' });
    y += 10;
    totales[seccion.grupo] = subtotal;
  });

  // 🧾 Resumen final
  doc.setDrawColor(100);
  doc.line(20, y, 190, y);
  y += 10;
  const totalActivos = totales['ACTIVO'] || 0;
  const totalPasivos = totales['PASIVO'] || 0;
  const totalPatrimonio = totales['PATRIMONIO'] || 0;
  const comprobacion = (totalActivos.toFixed(2) === (totalPasivos + totalPatrimonio).toFixed(2)) ? '✅' : '❌';

  doc.setFont('Helvetica', 'bold');
  doc.text('RESUMEN FINAL:', 25, y);
  y += 7;
  doc.setFont('Courier', 'normal');
  doc.text(`Total ACTIVO:`, 40, y);
  doc.text(totalActivos.toFixed(2), 190, y, { align: 'right' });
  y += 6;
  doc.text(`Total PASIVO:`, 40, y);
  doc.text(totalPasivos.toFixed(2), 190, y, { align: 'right' });
  y += 6;
  doc.text(`Total PATRIMONIO:`, 40, y);
  doc.text(totalPatrimonio.toFixed(2), 190, y, { align: 'right' });

 

  doc.text('Contador', 60, 285);
  doc.text('Gerente', 140, 285);

  const nombreArchivo = `estado_situacion_${this.fechaInicio}_a_${this.fechaFin}.pdf`;
  const pdfBlob = doc.output('blob');
  doc.save(nombreArchivo);

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

  alert('📄 PDF generado y guardado exitosamente.');
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