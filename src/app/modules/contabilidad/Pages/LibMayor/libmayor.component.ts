import { Component, OnInit, HostListener, HostListenerDecorator } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { LibroMayorService } from '../../Services/comprobante.service';
import { RouterModule } from '@angular/router';
import { Storage } from '@angular/fire/storage';
import { MatIconModule } from '@angular/material/icon';
import autoTable from 'jspdf-autotable'; 
@Component({
  selector: 'app-libmayor',
  standalone: true,
  templateUrl: './libmayor.component.html',
  styleUrls: ['./libmayor.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, MatIconModule,FormsModule, RouterModule],
})
export class LibroMayorComponent implements OnInit {
  formFiltro!: FormGroup;
  librosMayoresGenerados: any[] = [];
  cuentasUnicas: string[] = [];
  mostrarBoton: boolean = false;

  @HostListener('window:scroll', [])
  onScroll(): void {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    this.mostrarBoton = scrollTop > 100;
  }

  irArriba(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  // Totales
  totalDebe = 0;
  totalHaber = 0;
  totalSaldo = 0;

  // MODAL
  mostrarModalLibros = false;
  librosMayores: any[] = [];
  librosFiltrados: any[] = [];
  filtroInicioModal: string = '';
  filtroFinModal: string = '';

  constructor(
    private fb: FormBuilder,
    private libroMayorService: LibroMayorService,
    private storage: Storage
  ) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      fechaInicio: ['', Validators.required],
      fechaFin: ['', Validators.required],
      cuenta: ['']
    });
    this.obtenerLibrosGuardados();

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
  }
  menuAbierto: boolean = false;

  async filtrarLibros(): Promise<void> {
    if (this.formFiltro.invalid) {
      this.formFiltro.markAllAsTouched();
      return;
    }

    const { fechaInicio, fechaFin, cuenta } = this.formFiltro.value;

    try {
      const resultados = await this.libroMayorService.obtenerLibrosMayorPorFechas(fechaInicio, fechaFin);
      let datos = resultados;

      if (cuenta && cuenta.trim() !== '') {
        datos = datos.filter(item => item.cuenta === cuenta);
      }

      let saldo = 0;
      this.totalDebe = 0;
      this.totalHaber = 0;
      this.totalSaldo = 0;

      this.librosMayoresGenerados = datos.map(item => {
        saldo += (item.debe || 0) - (item.haber || 0);
        this.totalDebe += item.debe || 0;
        this.totalHaber += item.haber || 0;
        return { ...item, saldo };
      });

      this.totalSaldo = saldo;
      this.cuentasUnicas = [...new Set(resultados.map(r => r.cuenta))];
    } catch (error) {
      console.error('❌ Error al filtrar libros:', error);
      alert('❌ Ocurrió un error al filtrar los libros.');
    }
  }

  async generarPDF(): Promise<void> {
    if (this.librosMayoresGenerados.length === 0) {
      alert('⚠️ No hay datos para generar el PDF.');
      return;
    }

    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('LIBRO MAYOR - CONSORCIO PINTAG EXPRESS', 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');

    // Encabezado
    const { fechaInicio, fechaFin } = this.formFiltro.value;
    doc.text(`Desde: ${fechaInicio}`, 15, y);
    doc.text(`Hasta: ${fechaFin}`, 150, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'N° Doc.', 'Cuenta', 'Concepto', 'Débito', 'Crédito', 'Saldo']],
      body: this.librosMayoresGenerados.map(item => [
        item.fecha,
        item.numero,
        item.cuenta,
        item.concepto?.slice(0, 30) || '',
        item.debe?.toFixed(2),
        item.haber?.toFixed(2),
        item.saldo?.toFixed(2)
      ]),
      styles: {
        halign: 'center',
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [180, 180, 180],
        textColor: 20,
        fontStyle: 'bold'
      },
      foot: [[
        { content: 'SUMAN', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: this.totalDebe.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: this.totalHaber.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: this.totalSaldo.toFixed(2), styles: { fontStyle: 'bold' } }
      ]]
    });
  
    const nombrePDF = `LibroMayor_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output('blob');
  
    try {
      await this.libroMayorService.subirPDFLibroMayor(blob, nombrePDF);
      doc.save(nombrePDF);
      alert('✅ PDF generado y subido a Firebase.');
    } catch (err) {
      console.error('❌ Error al subir PDF:', err);
      alert('❌ Ocurrió un error al subir el PDF.');
    }
  }
  async obtenerLibrosGuardados(): Promise<void> {
    this.librosMayoresGenerados = await this.libroMayorService.obtenerLibrosGuardados();
  }

  async abrirModalLibros(): Promise<void> {
    this.librosMayores = await this.libroMayorService.obtenerLibrosGuardados();
    this.librosFiltrados = [];
    this.filtroInicioModal = '';
    this.filtroFinModal = '';
    this.mostrarModalLibros = true;
  }

  cerrarModalLibros(): void {
    this.mostrarModalLibros = false;
  }

  async eliminarLibroMayor(libro: any): Promise<void> {
    const confirmacion = confirm(`¿Estás seguro de eliminar el libro "${libro.nombre}"?`);
    if (confirmacion) {
      try {
        await this.libroMayorService.eliminarLibroMayor(libro);
        this.librosMayores = this.librosMayores.filter(l => l.id !== libro.id);
        this.librosFiltrados = this.librosFiltrados.filter(l => l.id !== libro.id);
        alert('✅ Libro eliminado correctamente.');
      } catch (error) {
        alert('❌ Error al eliminar el libro.');
        console.error(error);
      }
    }
  }

  filtrarLibrosModal(): void {
    if (!this.filtroInicioModal || !this.filtroFinModal) {
      this.librosFiltrados = [];
      return;
    }

    const inicio = new Date(this.filtroInicioModal);
    const fin = new Date(this.filtroFinModal);

    this.librosFiltrados = this.librosMayores.filter(libro => {
      const fecha = this.obtenerFechaDesdeNombre(libro.nombre);
      return fecha >= inicio && fecha <= fin;
    });
  }

  obtenerFechaDesdeNombre(nombre: string): Date {
    const regex = /LibroMayor_(\d{4})-(\d{2})-(\d{2})/;
    const match = nombre.match(regex);

    if (match) {
      const [_, year, month, day] = match;
      return new Date(`${year}-${month}-${day}`);
    }

    return new Date('2000-01-01');
  }
}
