import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EstadoResultadosService } from '../../Services/comprobante.service'; 
import { CatalogoService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

@Component({
  selector: 'app-estado-resultados',
  standalone: true,
 imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule,RouterModule],
  templateUrl: './estadosresultados.component.html',
  styleUrls: ['./estadosresultados.component.scss'],
})
export class EstadoResultadosComponent implements OnInit {
  formFiltro!: FormGroup;
  ingresos: any[] = [];
  gastos: any[] = [];
  totalIngresos = 0;
  totalGastos = 0;
  resultadoNeto = 0;

  totalNeto: number = 0;
  
  // cuando terminas de cargar datos:

  
  constructor(
    private fb: FormBuilder,
    private estadoResultadosService: EstadoResultadosService,
    private catalogoService: CatalogoService
  ) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
    });
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 500);
  }


  submenuCuentas = false;
  subCodificacion = false;
  subTransacciones = false;
  subLibros = false;

  submenus: Record<SubmenuKeys, boolean> = {
    codificacion: false,
    transacciones: false,
    libros: false
  };
  menuAbierto: boolean = false;
  toggleSubmenu(nombre: SubmenuKeys, event: Event): void {
    this.submenus[nombre] = !this.submenus[nombre]; 
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }

  @HostListener('document:click', ['$event'])
  cerrarSiClickFuera(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('nav') && !target.closest('.menu-toggle')) {
      this.menuAbierto = false;
    }
  }


  async generarEstado(): Promise<void> {
    if (this.formFiltro.invalid) {
      this.formFiltro.markAllAsTouched();
      return;
    }

    const { fechaInicio, fechaFin } = this.formFiltro.value;
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    const { ingresos, gastos } = await this.estadoResultadosService.obtenerDatosEstadoResultados(inicio, fin);

    this.ingresos = ingresos;
    this.gastos = gastos;

    this.totalIngresos = this.ingresos.reduce((sum, i) => sum + (i.valor || 0), 0);
    this.totalGastos = this.gastos.reduce((sum, g) => sum + (g.valor || 0), 0);
    this.resultadoNeto = this.totalIngresos - this.totalGastos;
  }

  async generarPDF(): Promise<void> {
    const doc = new jsPDF();
    let y = 20;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ESTADO DE RESULTADOS - CONSORCIO PINTAG EXPRESS', 15, y);

    y += 8;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    const { fechaInicio, fechaFin } = this.formFiltro.value;
    doc.text(`Desde: ${fechaInicio} - Hasta: ${fechaFin}`, 15, y);

    y += 10;

    // 🟦 Ingresos
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('INGRESOS', 15, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: this.ingresos.map(i => [i.codigo, i.descripcion, i.valor.toFixed(2)]),
      headStyles: { fillColor: [50, 150, 250], textColor: 255 },
      styles: { halign: 'center', fontSize: 9 },
    });

    const lastTableIngresos= (doc as any).lastAutoTable;
y = (lastTableIngresos?.finalY ?? y) + 10;

    // 🟥 Gastos
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('GASTOS', 15, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: this.gastos.map(g => [g.codigo, g.descripcion, g.valor.toFixed(2)]),
      headStyles: { fillColor: [50, 150, 250], textColor: 255 },
      styles: { halign: 'center', fontSize: 9 },
    });

    const lastTableGastos = (doc as any).lastAutoTable;
y = (lastTableGastos?.finalY ?? y) + 10;

    // 🧮 Resultado Neto
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y, 180, 10, 'F');
    doc.text(`RESULTADO NETO: ${this.resultadoNeto.toFixed(2)}`, 20, y + 7);

    doc.save('EstadoResultados.pdf');
  }
}
