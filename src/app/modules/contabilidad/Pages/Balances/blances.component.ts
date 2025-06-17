import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule,FormsModule } from '@angular/forms';
import { BalanceComprobacionService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CommonModule } from '@angular/common'; 
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

@Component({
  selector: 'app-balance-comprobacion',
  standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './blances.component.html',
  styleUrls: ['./blances.component.scss']
})
export class BalanceComprobacionComponent implements OnInit {
  formFiltro!: FormGroup;
  registros: any[] = [];
  fechaCorte!: Date;

  totalDebe = 0;
  totalHaber = 0;
  totalDeudor = 0;
  totalAcreedor = 0;

  constructor(
    private fb: FormBuilder,
    private balanceService: BalanceComprobacionService
  ) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      fechaCorte: ['', Validators.required]
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
        event.preventDefault();
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
  
  async generarBalance(): Promise<void> {
    if (this.formFiltro.invalid) {
      this.formFiltro.markAllAsTouched();
      return;
    }

    this.fechaCorte = new Date(this.formFiltro.value.fechaCorte);
    const datos = await this.balanceService.obtenerBalance(this.fechaCorte);

    this.registros = datos.sort((a, b) => a.codigo.localeCompare(b.codigo));

    this.totalDebe = this.registros.reduce((acc, item) => acc + (item.debe || 0), 0);
    this.totalHaber = this.registros.reduce((acc, item) => acc + (item.haber || 0), 0);
    this.totalDeudor = this.registros.reduce((acc, item) => acc + (item.saldoDeudor || 0), 0);
    this.totalAcreedor = this.registros.reduce((acc, item) => acc + (item.saldoAcreedor || 0), 0);
  }

  async exportarPDF(): Promise<void> {
    if (this.registros.length === 0) {
      alert('⚠️ No hay datos para exportar.');
      return;
    }

    const doc = new jsPDF();

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('BALANCE DE COMPROBACIÓN - CONSORCIO PINTAG EXPRESS', 20, 20);

    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Fecha de Corte: ${this.fechaCorte.toISOString().slice(0, 10)}`, 20, 30);

    autoTable(doc, {
      startY: 40,
      head: [['Código', 'Nombre', 'Debe', 'Haber', 'Saldo Deudor', 'Saldo Acreedor']],
      body: this.registros.map(item => [
        item.codigo || '',
        item.nombre || '',
        (item.debe || 0).toFixed(2),
        (item.haber || 0).toFixed(2),
        (item.saldoDeudor || 0).toFixed(2),
        (item.saldoAcreedor || 0).toFixed(2)
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
  headStyles: { fillColor: [55, 71, 79], textColor: 255 }, // Gris oscuro para la cabecera
  alternateRowStyles: { fillColor: [240, 240, 240] }, // filas alternas gris claro
  foot: [[
    { content: 'TOTALES:', styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 0, 0] } },
    { content: '', styles: { halign: 'right' } }, // celda vacía para columna "Cuenta"
    { content: this.totalDebe.toFixed(2), styles: { halign: 'center', fontStyle: 'bold', textColor: [0, 0, 0] } },
    { content: this.totalHaber.toFixed(2), styles: { halign: 'center', fontStyle: 'bold', textColor: [0, 0, 0] } },
    { content: this.totalDeudor.toFixed(2), styles: { halign: 'center', fontStyle: 'bold', textColor: [0, 0, 0] } },
    { content: this.totalAcreedor.toFixed(2), styles: { halign: 'center', fontStyle: 'bold', textColor: [0, 0, 0] } }
  ]]
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;

    const nombrePDF = `BalanceComprobacion_${this.fechaCorte.toISOString().slice(0,10)}.pdf`;
    doc.save(nombrePDF);
  }
}
