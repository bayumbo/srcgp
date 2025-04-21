import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators
} from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { LibroDiarioService } from '../../Services/comprobante.service';
import { CatalogoService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-libdiario',
  standalone: true,
  templateUrl: './libdiario.component.html',
  styleUrls: ['./libdiario.component.scss'],
  imports: [CommonModule, ReactiveFormsModule,MatIconModule, FormsModule, RouterModule],
})
export class LibroDiarioComponent implements OnInit {
  formAsiento!: FormGroup;
  asientosFiltrados: any[] = [];
  asientosPaginados: any[] = [];
  paginaActual: number = 1;
  registrosPorPagina: number = 5;
  filtroInicio: string = '';
  filtroFin: string = '';
  indiceSeleccionado: number = -1;

  nuevaCuenta = {
    codigo: '',
    descripcion: ''
  };

  cuentasDisponibles: any[] = [];
  mostrarSelectorCuentas: boolean = false;
  busquedaCuenta: string = '';

  constructor(
    private fb: FormBuilder,
    private diarioService: LibroDiarioService,
    private catalogoService: CatalogoService
  ) {}

  ngOnInit(): void {
    this.formAsiento = this.fb.group({
      numero: [{ value: this.generarCodigoAsiento(), disabled: true }],
      fecha: ['', Validators.required],
      concepto: ['', Validators.required],
      detalles: this.fb.array([])
    });
    this.agregarDetalle();
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
  }
  menuAbierto: boolean = false;

  get detalles(): FormArray {
    return this.formAsiento.get('detalles') as FormArray;
  }

  agregarDetalle(): void {
    const grupo = this.fb.group({
      cuenta: ['', Validators.required],
      descripcion: ['', Validators.required],
      centroCostos: ['', Validators.required],
      debe: ['', Validators.required],
      haber: ['', Validators.required]
    });
    this.detalles.push(grupo);
  }

  eliminarDetalle(index: number): void {
    this.detalles.removeAt(index);
  }

  async guardarAsiento(): Promise<void> {
    if (this.formAsiento.invalid || this.detalles.length === 0) {
      this.formAsiento.markAllAsTouched();
      this.detalles.controls.forEach(control => control.markAllAsTouched());
      alert('⚠️ Debes completar todos los campos obligatorios antes de generar el PDF.');
      return;
    }

    const raw = this.formAsiento.getRawValue();
    const asiento = {
      numero: raw.numero,
      fecha: raw.fecha,
      concepto: raw.concepto,
      detalles: raw.detalles
    };

    const doc = new jsPDF();
    
    let y = 20;

    // Estilo tipo imagen proporcionada
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LIBRO DIARIO - CONSORCIO PINTAG EXPRESS', 15, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Numero: ${asiento.numero}`, 15, y);
    doc.text(`Fecha: ${asiento.fecha}`, 160, y, { align: 'right' });
    y += 10;
    doc.text(`Concepto: ${asiento.concepto}`, 15, y);
    y += 10;


 // 🔢 Totales
 let totalDebe = 0;
 let totalHaber = 0;
 asiento.detalles.forEach((item: any) => {
   totalDebe += item.debe;
   totalHaber += item.haber;
 });
 // 📋 Tabla con AutoTable
 autoTable(doc, {
  startY: y,
  head: [['CUENTA', 'DESCRIPCIÓN', 'C. COSTOS', 'DEBITO', 'CREDITO']],
  body: asiento.detalles.map((item: any) => [
    item.cuenta,
    item.descripcion,
    item.centroCostos,
    item.debe.toFixed(2),
    item.haber.toFixed(2)
  ]),
  styles: {
    halign: 'center',
    fontSize: 10,
    cellPadding: 4,
    lineColor: [0, 0, 0],
    lineWidth: 0.1
  },
  headStyles: {
    fillColor: [180, 180, 180],
    textColor: 20,
    fontStyle: 'bold'
  },
  foot: [[
    { content: 'TOTAL:', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
    { content: totalDebe.toFixed(2), styles: { fontStyle: 'bold' } },
    { content: totalHaber.toFixed(2), styles: { fontStyle: 'bold' } }
  ]]
});

const nombreArchivo = `${asiento.numero}.pdf`;
const pdfBlob = doc.output('blob');
doc.save(nombreArchivo);
await this.diarioService.guardarAsientoConPDF(asiento, pdfBlob);

alert('✅ Asiento guardado y PDF generado.');
this.formAsiento.reset();
this.detalles.clear();
this.agregarDetalle();
this.formAsiento.patchValue({ numero: this.generarCodigoAsiento() });

if (this.filtroInicio && this.filtroFin) await this.filtrarPorFechas();
}


  async filtrarPorFechas(): Promise<void> {
    if (this.filtroInicio && this.filtroFin) {
      this.asientosFiltrados = await this.diarioService.obtenerAsientosPorFechas(
        this.filtroInicio,
        this.filtroFin
      );
      this.paginaActual = 1;
      this.paginarAsientos();
      this.generarPaginasVisibles();
    }
  }

  generarCodigoAsiento(): string {
    const now = Date.now();
    return 'COM' + String(now).slice(-8);
  }

  async eliminarAsiento(id: string, numero: string): Promise<void> {
    if (confirm('¿Estás seguro de eliminar este asiento? Esta acción no se puede deshacer.')) {
      try {
        await this.diarioService.eliminarAsientoPorId(id, numero);
        this.asientosFiltrados = this.asientosFiltrados.filter(a => a.id !== id);
        this.paginarAsientos();
        this.generarPaginasVisibles();
        alert('✅ Asiento eliminado correctamente.');
      } catch (error) {
        console.error('❌ Error al eliminar el asiento:', error);
        alert('❌ Ocurrió un error al eliminar el asiento.');
      }
    }
  }

  // 🔍 FILTRO DE CUENTAS
  get cuentasFiltradasModal(): any[] {
    const filtro = this.busquedaCuenta.toLowerCase();
    return this.cuentasDisponibles.filter(c =>
      c.codigo.includes(filtro) || c.nombre.toLowerCase().includes(filtro)
    );
  }

  async abrirSelectorCuentas(index: number): Promise<void> {
    this.indiceSeleccionado = index;
    this.cuentasDisponibles = await this.catalogoService.obtenerCuentas();
    this.mostrarSelectorCuentas = true;
  }

  cerrarSelectorCuentas(): void {
    this.mostrarSelectorCuentas = false;
    this.busquedaCuenta = '';
  }

  seleccionarCuenta(cuenta: any): void {
    const grupo = this.detalles.at(this.indiceSeleccionado);
    grupo.patchValue({
      cuenta: cuenta.codigo,
      descripcion: cuenta.nombre
    });
    this.cerrarSelectorCuentas();
  }

  // 📄 PAGINACIÓN
  get totalPaginas(): number {
    return Math.ceil(this.asientosFiltrados.length / this.registrosPorPagina);
  }

  paginarAsientos(): void {
    const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
    this.asientosPaginados = this.asientosFiltrados.slice(inicio, inicio + this.registrosPorPagina);
  }

  cambiarPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      this.paginarAsientos();
      this.generarPaginasVisibles();
    }
  }

  paginasVisibles: (number | string)[] = [];

  generarPaginasVisibles(): void {
    const total = this.totalPaginas;
    const actual = this.paginaActual;
    const rango = 1;
    const paginas: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) paginas.push(i);
    } else {
      paginas.push(1);
      if (actual > 3) paginas.push('...');
      const inicio = Math.max(2, actual - rango);
      const fin = Math.min(total - 1, actual + rango);
      for (let i = inicio; i <= fin; i++) paginas.push(i);
      if (actual < total - 2) paginas.push('...');
      paginas.push(total);
    }

    this.paginasVisibles = paginas;
  }

  
}

export interface AsientoContable {
  numero: string;
  concepto: string;
  fecha: string;
  detalles: {
    cuenta: string;
    descripcion: string;
    centroCostos: string;
    debe: number;
    haber: number;
  }[];
}