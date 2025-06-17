import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AsientoAperturaService } from '../../Services/comprobante.service';
import { CatalogoService } from '../../Services/comprobante.service';
import { CentroCostosService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

@Component({
  selector: 'app-asiento-apertura',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, MatIconModule],
  templateUrl: './asiento-apertura.component.html',
  styleUrls: ['./asiento-apertura.component.scss']
})
export class AsientoAperturaComponent implements OnInit {
  aperturaForm!: FormGroup;
  cuentas: any[] = [];
  totalDebe = 0;
  totalHaber = 0;
  ejercicioActual: number = new Date().getFullYear();
  numeroAsiento: string = '';

  cuentasDisponibles: any[] = [];
  centrosDisponibles: any[] = [];
  mostrarSelectorCuenta = false;
  mostrarSelectorCentro = false;
  busquedaCuenta = '';
  busquedaCentro = '';

  mostrarAsientosGuardados = false;
  asientosGuardados: any[] = [];

  submenuCuentas = false;
  subCodificacion = false;
  subTransacciones = false;
  subLibros = false;
  menuAbierto = false;

  submenus: Record<SubmenuKeys, boolean> = {
    codificacion: false,
    transacciones: false,
    libros: false
  };

  constructor(
    private fb: FormBuilder,
    private asientoService: AsientoAperturaService,
    private catalogoService: CatalogoService,
    private centroCostosService: CentroCostosService
  ) {}

  numeroFormateado: string = '';

  ngOnInit(): void {
    this.aperturaForm = this.fb.group({
      ejercicio: [this.ejercicioActual, Validators.required],
      descripcionGeneral: ['', Validators.required],
      cuenta: ['', Validators.required],
      descripcion: ['', Validators.required],
      centroCostos: [''],
      tipo: ['Debe', Validators.required],
      valor: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]]
    });

    this.generarNumeroAsiento();

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
  }

  async generarNumeroAsiento() {
    const ultimo = await this.asientoService.obtenerUltimoNumero();
    const siguiente = ultimo + 1;
    this.numeroFormateado = `APR${siguiente.toString().padStart(8, '0')}`;
  }

  agregarCuenta() {
    if (this.aperturaForm.invalid) return;
    const { cuenta, descripcion, tipo, valor, centroCostos } = this.aperturaForm.value;
    this.cuentas.push({ cuenta, descripcion, tipo, valor: parseFloat(valor), centroCostos });
    this.actualizarTotales();
    this.aperturaForm.patchValue({ cuenta: '', descripcion: '', tipo: 'Debe', valor: '', centroCostos: '' });
  }

  eliminarCuenta(index: number) {
    this.cuentas.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales() {
    this.totalDebe = this.cuentas.filter(c => c.tipo === 'Debe').reduce((sum, c) => sum + c.valor, 0);
    this.totalHaber = this.cuentas.filter(c => c.tipo === 'Haber').reduce((sum, c) => sum + c.valor, 0);
  }

  async guardarAsiento() {
    if (this.totalDebe !== this.totalHaber) {
      alert('❌ El total Debe y Haber deben ser iguales.');
      return;
    }

    const { ejercicio, descripcionGeneral } = this.aperturaForm.value;

    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.text(`Asiento de Apertura - ${ejercicio}`, 15, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`N° Asiento: ${this.numeroFormateado}`, 15, y);
    y += 6;
    doc.text(`Descripción General: ${descripcionGeneral}`, 15, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Cuenta', 'Descripción', 'C.C.', 'Debe', 'Haber']],
      body: this.cuentas.map(c => [
        c.cuenta,
        c.descripcion,
        c.centroCostos || '-',
        c.tipo === 'Debe' ? c.valor.toFixed(2) : '-',
        c.tipo === 'Haber' ? c.valor.toFixed(2) : '-'
      ]),
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [180, 180, 180] },
      foot: [[
        { content: 'TOTALES', colSpan: 3, styles: { halign: 'right' } },
        { content: this.totalDebe.toFixed(2) },
        { content: this.totalHaber.toFixed(2) }
      ]]
    });

    const nombrePDF = `AsientoApertura_${this.numeroFormateado}.pdf`;
    const blob = doc.output('blob');

    await this.asientoService.guardarAsiento({
      numero: this.numeroFormateado,
      ejercicio,
      descripcionGeneral,
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      cuentas: this.cuentas,
      creado: new Date()
    }, blob);

    doc.save(nombrePDF);
    alert('✅ Asiento de apertura guardado correctamente.');
    this.cuentas = [];
    this.actualizarTotales();
    this.aperturaForm.reset({ ejercicio: this.ejercicioActual });
    await this.generarNumeroAsiento();
    await this.cargarAsientosGuardados();
  }
  mostrarAsientos = false;

  toggleMostrarAsientos() {
    this.mostrarAsientos = !this.mostrarAsientos;
    if (this.mostrarAsientos) {
      this.cargarAsientosGuardados();
    }
  }
  async cargarAsientosGuardados() {
    this.asientosGuardados = await this.asientoService.obtenerAsientosGuardados();
  }

  async eliminarAsiento(asientoId: string, pdfPath: string) {
    const confirmado = confirm('¿Deseas eliminar este asiento de apertura?');
    if (!confirmado) return;
    await this.asientoService.eliminarAsiento(asientoId, pdfPath);
    await this.cargarAsientosGuardados();
  }

  async abrirSelectorCuenta() {
    this.cuentasDisponibles = await this.catalogoService.obtenerCuentas();
    this.mostrarSelectorCuenta = true;
  }

  seleccionarCuenta(cuenta: any) {
    this.aperturaForm.patchValue({ cuenta: cuenta.codigo, descripcion: cuenta.nombre });
    this.mostrarSelectorCuenta = false;
  }

  async abrirSelectorCentro() {
    this.centrosDisponibles = await this.centroCostosService.obtenerCentros();
    this.mostrarSelectorCentro = true;
  }

  seleccionarCentro(centro: any) {
    this.aperturaForm.patchValue({ centroCostos: centro.codigo });
    this.mostrarSelectorCentro = false;
  }

  cerrarSelectorCuenta() {
    this.mostrarSelectorCuenta = false;
    this.busquedaCuenta = '';
  }

  cerrarSelectorCentro() {
    this.mostrarSelectorCentro = false;
    this.busquedaCentro = '';
  }

  get cuentasFiltradas(): any[] {
    const filtro = this.busquedaCuenta.toLowerCase();
    return this.cuentasDisponibles.filter(c =>
      c.codigo.toLowerCase().includes(filtro) || c.nombre.toLowerCase().includes(filtro)
    );
  }

  get centrosFiltrados(): any[] {
    const filtro = this.busquedaCentro.toLowerCase();
    return this.centrosDisponibles.filter(c =>
      c.codigo.toLowerCase().includes(filtro) || c.descripcion.toLowerCase().includes(filtro)
    );
  }

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
}