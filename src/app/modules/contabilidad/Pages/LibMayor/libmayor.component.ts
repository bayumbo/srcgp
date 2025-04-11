import { Component, OnInit } from '@angular/core';
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
      if (preloader) {
        preloader.style.display = 'none';
      }
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
      this.librosMayoresGenerados = datos.map(item => {
        saldo += (item.debe || 0) - (item.haber || 0);
        return { ...item, saldo };
      });

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
    doc.text('LIBRO MAYOR', 15, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text('Fecha      N° Doc.   Cuenta    Concepto                        Débito    Crédito    Saldo', 10, y);
    y += 8;
    doc.setFont('Helvetica', 'normal');

    this.librosMayoresGenerados.forEach(item => {
      const row = `${item.fecha}  ${item.numero}  ${item.cuenta}  ${item.concepto?.slice(0, 30)}  ${item.debe?.toFixed(2)}  ${item.haber?.toFixed(2)}  ${item.saldo?.toFixed(2)}`;
      doc.text(row, 10, y);
      y += 7;

      if (y >= 280) {
        doc.addPage();
        y = 20;
      }
    });

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
    this.librosFiltrados = []; // ⛔ no mostrar hasta que filtre
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
