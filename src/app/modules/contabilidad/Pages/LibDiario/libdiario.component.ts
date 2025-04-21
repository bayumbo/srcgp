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
    doc.setFontSize(12);
    doc.text('LIBRO DIARIO 2024', 15, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Numero: ${asiento.numero}`, 15, y);
    doc.text(`Fecha: ${asiento.fecha}`, 160, y, { align: 'right' });
    y += 8;
    doc.text(`Concepto: ${asiento.concepto}`, 15, y);
    y += 10;

  // Títulos de columna con sombreado
doc.setFillColor(200,200,200); // gris claro
doc.rect(20, y, 170, 10, 'F'); // fondo para encabezado
doc.setTextColor(0);
doc.setFont('Helvetica', 'bold');
doc.text('CUENTA', 30, y + 7, { align: 'center' });
doc.text('DESCRIPCIÓN', 75, y + 7, { align: 'center' });
doc.text('C. COSTOS', 110, y + 7, { align: 'center' });
doc.text('DEBITO', 150, y + 7, { align: 'center' });
doc.text('CREDITO', 185, y + 7, { align: 'center' });

y += 12;
    doc.setFont('Helvetica', 'normal');
    let totalDebe = 0;
    let totalHaber = 0;

    asiento.detalles.forEach((item: any) => {
      doc.text(item.cuenta, 30, y, { align: 'center' });
      doc.text(item.descripcion, 75, y, { align: 'center' });
      doc.text(item.centroCostos, 110, y, { align: 'center' });
      doc.text(item.debe.toFixed(2), 150, y, { align: 'center' });
      doc.text(item.haber.toFixed(2), 185, y, { align: 'center' });
      totalDebe += item.debe;
      totalHaber += item.haber;
      y += 8;

      if (y >= 270) {
        doc.addPage();
        y = 20;
      }
    });

    // Totales
    doc.setFont('Helvetica', 'bold');
    doc.text('TOTAL:', 130, y);
    doc.text(totalDebe.toFixed(2), 150, y, { align: 'right' });
    doc.text(totalHaber.toFixed(2), 180, y, { align: 'right' });

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