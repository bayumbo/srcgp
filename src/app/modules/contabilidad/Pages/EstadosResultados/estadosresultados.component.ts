import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { EstadoResultadosService } from '../../Services/comprobante.service';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, Timestamp, serverTimestamp } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';
import { MatIconModule } from '@angular/material/icon';
import autoTable from 'jspdf-autotable';
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}
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
    doc.setFontSize(13);
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTADO DE RESULTADOS - CONSORCIO PINTAG EXPRESS', 105, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Desde: ${this.fechaInicio} - Hasta: ${this.fechaFin}`, 105, y, { align: 'center' });
    y += 12;
    let totalIngresos = 0;
    let totalGastos = 0;
  
    for (const seccion of this.resultados) {
      // Sección: título (INGRESOS / GASTOS)
      doc.setFontSize(12);
      doc.setFont('Helvetica', 'bold');
      doc.text(seccion.grupo.toUpperCase(), 20, y);
      y += 6;
  
      const cuerpo = seccion.cuentas.map(cuenta => {
        if (seccion.grupo.toUpperCase() === 'INGRESOS') totalIngresos += cuenta.valor;
        if (seccion.grupo.toUpperCase() === 'GASTOS') totalGastos += cuenta.valor;
        return [
          cuenta.codigo,
          cuenta.nombre,
          cuenta.valor.toLocaleString('es-EC', { minimumFractionDigits: 2 }),
        ];
      });
  
      autoTable(doc, {
        startY: y,
        head: [['Código', 'Cuenta', 'Valor']],
        body: cuerpo,
        foot: [[
          { content: `TOTAL ${seccion.grupo.toUpperCase()}`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
          {
            content: (seccion.cuentas.reduce((s, c) => s + c.valor, 0)).toLocaleString('es-EC', { minimumFractionDigits: 2 }),
            styles: { fontStyle: 'bold' }
          }
        ]],
        styles: {
          halign: 'center',
          fontSize: 9,
          cellPadding: 4,
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [180, 180, 180],
          textColor: 20,
          fontStyle: 'bold'
        },
        footStyles: {
          fillColor: [50, 130, 200],
          textColor: 255,
          fontStyle: 'bold'
        }
      });
  
      const lastY = (doc as any).lastAutoTable?.finalY || y;
y = lastY + 10;
    }
  
    // Resultado Neto
    const resultado = totalIngresos - totalGastos;
    autoTable(doc, {
      startY: y,
      body: [[
        { content: 'RESULTADO NETO', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
        {
          content: resultado.toLocaleString('es-EC', { minimumFractionDigits: 2 }),
          styles: { fontStyle: 'bold' }
        }
      ]],
      styles: {
        halign: 'center',
        fontSize: 10,
        cellPadding: 4
      },
      footStyles: {
        fillColor: [30, 100, 180],
        textColor: 255,
        fontStyle: 'bold'
      }
    });
  
    const nombreArchivo = `estado_resultados_${this.fechaInicio}_a_${this.fechaFin}.pdf`;
    const pdfBlob = doc.output('blob');
    doc.save(nombreArchivo);
  
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
      totalIngresos,
      totalGastos,
      resultadoNeto: resultado,
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
