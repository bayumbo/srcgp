import { Component, OnInit, HostListener, HostListenerDecorator } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { LibroMayorService } from '../../Services/comprobante.service';
import { RouterModule } from '@angular/router';
import { Storage } from '@angular/fire/storage';

@Component({
  selector: 'app-libmayor',
  standalone: true,
  templateUrl: './libmayor.component.html',
  styleUrls: ['./libmayor.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
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
    doc.text('LIBRO MAYOR 2024', 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');

    // Encabezado
    const { fechaInicio, fechaFin } = this.formFiltro.value;
    doc.text(`Desde: ${fechaInicio}`, 15, y);
    doc.text(`Hasta: ${fechaFin}`, 140, y);
    y += 10;

    // Cabecera de tabla
    doc.setFillColor(200,200,200);
    doc.rect(10, y, 190, 10, 'F');
    doc.setTextColor(0);
    doc.setFont('Helvetica', 'bold');
    doc.text('Fecha', 20, y + 7);
    doc.text('N° Doc.', 40, y + 7);
    doc.text('Cuenta', 65, y + 7);
    doc.text('Concepto', 95, y + 7);
    doc.text('Débito', 145, y + 7);
    doc.text('Crédito', 170, y + 7);
    doc.text('Saldo', 195, y + 7, { align: 'right' });
    y += 12;

    doc.setFont('Helvetica' , 'normal');
    this.librosMayoresGenerados.forEach(item => {
      doc.text(item.fecha, 20, y);
      doc.text(item.numero, 40, y);
      doc.text(item.cuenta, 65, y);
      doc.text(item.concepto?.slice(0, 20), 95, y);
      doc.text(item.debe?.toFixed(2), 145, y, { align: 'right' });
      doc.text(item.haber?.toFixed(2), 170, y, { align: 'right' });
      doc.text(item.saldo?.toFixed(2), 195, y, { align: 'right' });
      y += 7;

      if (y >= 270) {
        doc.addPage();
        y = 20;
      }
    });

    // Línea resumen final
    doc.setFont('Helvetica', 'bold');
    doc.text('SUMAN', 95, y);
    doc.text(this.totalDebe.toFixed(2), 145, y, { align: 'right' });
    doc.text(this.totalHaber.toFixed(2), 170, y, { align: 'right' });
    doc.text(this.totalSaldo.toFixed(2), 195, y, { align: 'right' });
    const blob = doc.output('blob');
    const nombrePDF = `LibroMayor_${new Date().toISOString().slice(0, 10)}.pdf`;

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
