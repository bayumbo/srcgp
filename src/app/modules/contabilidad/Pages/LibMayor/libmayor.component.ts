// src/app/modules/contabilidad/pages/libro-mayor/libro-mayor.component.ts

import { Component, OnInit,HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LibroMayorService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';
@Component({
  selector: 'app-libro-mayor',
  standalone: true,
  templateUrl: './libmayor.component.html',
  styleUrls: ['./libmayor.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule,MatIconModule]
})
export class LibroMayorComponent implements OnInit {
  formFiltro!: FormGroup;
  datosLibroMayor: any[] = [];
  cuentasUnicas: string[] = [];
  totalDebe = 0;
  totalHaber = 0;
  totalSaldo = 0;

  constructor(private fb: FormBuilder, private libroMayorService: LibroMayorService) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
      cuenta: ['']
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

  async filtrarLibroMayor() {
    if (this.formFiltro.invalid) {
      this.formFiltro.markAllAsTouched();
      return;
    }

    const { fechaInicio, fechaFin, cuenta } = this.formFiltro.value;
    const datos = await this.libroMayorService.obtenerDatosLibroMayor(fechaInicio, fechaFin);

    // Agrupación lógica
    this.totalDebe = 0;
    this.totalHaber = 0;
    this.totalSaldo = 0;

    let saldo = 0;
    let filtrados = datos;

    if (cuenta) {
      filtrados = datos.filter(d => d.cuenta === cuenta);
    }

    this.datosLibroMayor = filtrados.map(dato => {
      saldo += (dato.debe || 0) - (dato.haber || 0);
      this.totalDebe += dato.debe || 0;
      this.totalHaber += dato.haber || 0;
      return { ...dato, saldo };
    });

    this.totalSaldo = saldo;
    this.cuentasUnicas = [...new Set(datos.map(d => d.cuenta))];
  }
  async generarPDF() {
    if (this.datosLibroMayor.length === 0) {
      alert('⚠️ No hay datos para generar PDF.');
      return;
    }
  
    const doc = new jsPDF();
    let y = 20;
  
    doc.setFontSize(16);
    doc.text('LIBRO MAYOR - CONSORCIO PINTAG EXPRESS', 15, y);
  
    y += 10;
    const { fechaInicio, fechaFin } = this.formFiltro.value;
    doc.setFontSize(10);
    doc.text(`Desde: ${fechaInicio}`, 15, y);
    doc.text(`Hasta: ${fechaFin}`, 150, y);
  
    y += 10;
  
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'N° Documento', 'Cuenta', 'Concepto', 'Débito', 'Crédito', 'Saldo']],
      body: this.datosLibroMayor.map(item => [
        item.fecha,
        item.numero,
        item.cuenta,
        item.concepto,
        item.debe?.toFixed(2),
        item.haber?.toFixed(2),
        item.saldo?.toFixed(2)
      ]),
      styles: { fontSize: 8, halign: 'center' },
      headStyles: { fillColor: [220, 220, 220] }
    });
  
    
  
    // 🧮 Totales debajo
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'N° Documento', 'Cuenta', 'Concepto', 'Débito', 'Crédito', 'Saldo']],
      body: this.datosLibroMayor.map(item => [
        item.fecha,
        item.numero,
        item.cuenta,
        item.concepto,
        item.debe?.toFixed(2),
        item.haber?.toFixed(2),
        item.saldo?.toFixed(2)
      ]),
      styles: { fontSize: 8, halign: 'center' },
      headStyles: { fillColor: [220, 220, 220] },
      showHead: 'firstPage' // 🛠️ aquí evita que el header se repita
    });
    
    const lastTable = (doc as any).lastAutoTable;
y = (lastTable?.finalY ?? y) + 5; // posición justo debajo de la tabla

doc.setFont('Helvetica', 'bold');
doc.setFontSize(9);
doc.text('TOTALES:', 20, y + 5); // palabra a la izquierda

doc.text(this.totalDebe.toFixed(2), 1000 / 7, y + 5, { align: 'right' }); // debajo de Débito
doc.text(this.totalHaber.toFixed(2), 700 / 4.1, y + 5, { align: 'right' }); // debajo de Crédito
doc.text(this.totalSaldo.toFixed(2), 558 / 2.9, y + 5, { align: 'right' }); // debajo de Saldo
  
    doc.save(`LibroMayor_${new Date().toISOString().slice(0,10)}.pdf`);
  }
  
}
