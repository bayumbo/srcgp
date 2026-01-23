import { Component, OnInit } from '@angular/core';
import { EstadoFinancieroService } from '../../Services/comprobante.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HostListener } from '@angular/core';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';


@Component({
  selector: 'app-estado-financiero',
  standalone: true,
  templateUrl: './estados.component.html',
  styleUrls: ['./estados.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule,RouterModule]
})
export class EstadoFinancieroComponent implements OnInit {
  formFecha!: FormGroup;
  activos: any[] = [];
  pasivos: any[] = [];
  patrimonio: any[] = [];
  totalActivos = 0;
  totalPasivos = 0;
  totalPatrimonio = 0;

  fechaCorte: string = '';  // ✅ Añade esta línea

  constructor(
    private fb: FormBuilder,
    private estadoFinancieroService: EstadoFinancieroService
  ) {}

  ngOnInit(): void {
    this.formFecha = this.fb.group({
      fechaCorte: ['', Validators.required]
    });
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
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
   // Cierra si hace clic fuera del menú
   @HostListener('document:click', ['$event'])
   cerrarSiClickFuera(event: MouseEvent) {
     const target = event.target as HTMLElement;
     if (!target.closest('nav') && !target.closest('.menu-toggle')) {
       this.menuAbierto = false;
     }
   }


   async generarPDF(): Promise<void> {
    const doc = new jsPDF();

    // 📄 Encabezado
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ESTADO DE SITUACIÓN FINANCIERA - CONSORCIO PINTAG EXPRESS', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Fecha de Corte: ${this.fechaCorte}`, 105, 28, { align: 'center' });

    let y = 40;

    // 📋 ACTIVO
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('ACTIVO', 15, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: this.activos.map(item => [item.codigo, item.descripcion, item.saldo.toFixed(2)]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [200, 200, 200] },
      foot: [[
        { content: 'TOTAL ACTIVO', colSpan: 2, styles: { halign: 'right', fillColor: [41, 128, 185], textColor: 255 } },
        { content: this.totalActivos.toFixed(2), styles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255 } }
      ]]
    });

    const lastTableActivo = (doc as any).lastAutoTable;
    y = (lastTableActivo?.finalY ?? y) + 10;



    // 📋 PASIVO
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('PASIVO', 15, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: this.pasivos.map(item => [item.codigo, item.descripcion, item.saldo.toFixed(2)]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [200, 200, 200] },
      foot: [[
        { content: 'TOTAL PASIVO', colSpan: 2, styles: { halign: 'right', fillColor: [41, 128, 185], textColor: 255 } },
        { content: this.totalPasivos.toFixed(2), styles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255 } }
      ]]
    });

    const lastTablePasivo = (doc as any).lastAutoTable;
    y = (lastTablePasivo?.finalY ?? y) + 10;



    // 📋 PATRIMONIO
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('PATRIMONIO', 15, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Cuenta', 'Valor']],
      body: this.patrimonio.map(item => [item.codigo, item.descripcion, item.saldo  .toFixed(2)]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [200, 200, 200] },
      foot: [[
        { content: 'TOTAL PATRIMONIO', colSpan: 2, styles: { halign: 'right', fillColor: [41, 128, 185], textColor: 255 } },
        { content: this.totalPatrimonio.toFixed(2), styles: { fontStyle: 'bold', fillColor: [41, 128, 185], textColor: 255 } }
      ]]
    });

    const lastTablePatrimonio = (doc as any).lastAutoTable;
    y = (lastTablePatrimonio?.finalY ?? y) + 10;



    // 📊 Resultado Final
    doc.setFillColor(236, 239, 241); // Gris claro
    doc.rect(15, y, 180, 12, 'F');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL PASIVO + PATRIMONIO', 20, y + 8);

    const totalPasivoPatrimonio = this.totalPasivos + this.totalPatrimonio;
    doc.text(totalPasivoPatrimonio.toFixed(2), 195, y + 8, { align: 'right' });

    // 📥 Guardar PDF
    doc.save(`EstadoSituacionFinanciera_${this.fechaCorte}.pdf`);
  }



  async generarEstado() {
    if (this.formFecha.invalid) {
      this.formFecha.markAllAsTouched();
      return;
    }

    const fechaCorte = this.formFecha.value.fechaCorte;
    this.fechaCorte = fechaCorte; // 👈 Agrega esta línea

    const [catalogo, transacciones] = await Promise.all([
      this.estadoFinancieroService.obtenerCuentasCatalogo(),
      this.estadoFinancieroService.obtenerTransaccionesHastaFecha(fechaCorte)
    ]);

    // Clasificar saldos
    const saldos: Record<string, number> = {};

    transacciones.forEach(t => {
      if (!saldos[t.cuenta]) saldos[t.cuenta] = 0;
      saldos[t.cuenta] += (t.debe || 0) - (t.haber || 0);
    });

    this.activos = [];
    this.pasivos = [];
    this.patrimonio = [];
    this.totalActivos = 0;
    this.totalPasivos = 0;
    this.totalPatrimonio = 0;

    catalogo.forEach(cuenta => {
      const saldo = saldos[cuenta.codigo] || 0;
      if (cuenta.tipo === 'Activo') {
        this.activos.push({
          codigo: cuenta.codigo,
          descripcion: cuenta.nombre, // 👈 aquí adaptas
          saldo
        });
        this.totalActivos += saldo;
      } else if (cuenta.tipo === 'Pasivo') {
        this.pasivos.push({
          codigo: cuenta.codigo,
          descripcion: cuenta.nombre, // 👈 aquí igual
          saldo
        });
        this.totalPasivos += saldo;
      } else if (cuenta.tipo === 'Patrimonio') {
        this.patrimonio.push({
          codigo: cuenta.codigo,
          descripcion: cuenta.nombre, // 👈 aquí también
          saldo
        });
        this.totalPatrimonio += saldo;
      }

    });
    // 🧮 Calcular patrimonio automáticamente si no hay cuentas tipo "Patrimonio"
  if (this.patrimonio.length === 0) {
    this.totalPatrimonio = this.totalActivos - this.totalPasivos;
    this.patrimonio = [{
      codigo: 'PAT',
      descripcion: 'Patrimonio neto (Activo - Pasivo)',
      saldo: this.totalPatrimonio
    }];
  }
  }
}
