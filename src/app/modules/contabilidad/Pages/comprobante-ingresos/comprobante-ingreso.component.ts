import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CatalogoService } from '../../Services/comprobante.service';
import { CentroCostosService } from '../../Services/comprobante.service';
import { ComprobanteIngresoService } from '../../Services/comprobante.service';

import { jsPDF } from 'jspdf';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

interface TransaccionIngreso {
  cuenta: string;
  concepto: string;
  centroCostos: string;
  tipo: 'Debe' | 'Haber';
  valor: number;
}

@Component({
  selector: 'app-comprobante-ingreso',
  standalone: true,
  templateUrl: './comprobante-ingreso.component.html',
  styleUrls: ['./comprobante-ingreso.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule]
})
export class ComprobanteIngresoComponent implements OnInit {
  ingresoForm!: FormGroup;
  transacciones: TransaccionIngreso[] = [];
  totalDebe = 0;
  totalHaber = 0;

  cuentasDisponibles: any[] = [];
  centroCostosDisponibles: any[] = [];
  busquedaCuenta: string = '';
  busquedaCentro: string = '';
  mostrarSelectorCuentas: boolean = false;
  mostrarSelectorCentro: boolean = false;

  numeroComprobante: string = '';
  ultimoNumero: number = 0;

  constructor(
    private fb: FormBuilder,
    private catalogoService: CatalogoService,
    private centroCostosService: CentroCostosService,
    private comprobanteIngresoService: ComprobanteIngresoService // <- ESTE
  ) {}

  async ngOnInit(): Promise<void> {
    this.ingresoForm = this.fb.group({
      recibiDe: ['', Validators.required],
      cedula: ['', [Validators.required, Validators.maxLength(13)]],
      valor: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      conceptoGeneral: ['', Validators.required],
      fecha: ['', Validators.required], // ✅ AGREGA ESTA LÍNEA
      cuenta: ['', Validators.required],
      concepto: ['', Validators.required],
      centroCostos: ['', Validators.required],
      tipo: ['Debe', Validators.required],
      valorTransaccion: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]]
    });
    
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
    await this.obtenerUltimoNumero();

  }

  mostrarLista: boolean = false;
  comprobantesGuardados: any[] = [];
  paginaActual: number = 1;
  elementosPorPagina: number = 5;
  busquedaIngreso: string = '';

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




  async obtenerUltimoNumero() {
    const ultimo = await this.comprobanteIngresoService.obtenerUltimoNumeroComprobante();
    this.ultimoNumero = ultimo;
    this.numeroComprobante = this.formatearNumeroComprobante(ultimo + 1);
  }

  formatearNumeroComprobante(num: number): string {
    return `ING${num.toString().padStart(8, '0')}`;
  }

  agregarTransaccion(): void {
    if (this.ingresoForm.invalid) return;
    const { cuenta, concepto, centroCostos, tipo, valorTransaccion } = this.ingresoForm.value;
    const valor = parseFloat(valorTransaccion);

    this.transacciones.push({ cuenta, concepto, centroCostos, tipo, valor });
    this.actualizarTotales();

    this.ingresoForm.patchValue({
      cuenta: '', concepto: '', centroCostos: '', tipo: 'Debe', valorTransaccion: ''
    });
  }

  eliminarTransaccion(index: number): void {
    this.transacciones.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales(): void {
    this.totalDebe = this.transacciones.filter(t => t.tipo === 'Debe').reduce((sum, t) => sum + t.valor, 0);
    this.totalHaber = this.transacciones.filter(t => t.tipo === 'Haber').reduce((sum, t) => sum + t.valor, 0);
  }

  async abrirSelectorCuentas(): Promise<void> {
    this.cuentasDisponibles = await this.catalogoService.obtenerCuentas();
    this.mostrarSelectorCuentas = true;
  }

  cerrarSelectorCuentas(): void {
    this.mostrarSelectorCuentas = false;
    this.busquedaCuenta = '';
  }

  seleccionarCuenta(cuenta: any): void {
    this.ingresoForm.patchValue({ cuenta: cuenta.codigo, concepto: cuenta.nombre });
    this.cerrarSelectorCuentas();
  }

  async abrirSelectorCentro(): Promise<void> {
    this.centroCostosDisponibles = await this.centroCostosService.obtenerCentros();
    this.mostrarSelectorCentro = true;
  }

  cerrarSelectorCentro(): void {
    this.mostrarSelectorCentro = false;
    this.busquedaCentro = '';
  }

  seleccionarCentro(centro: any): void {
    this.ingresoForm.patchValue({ centroCostos: centro.codigo });
    this.cerrarSelectorCentro();
  }

  async generarPDF(): Promise<void> {
    const doc = new jsPDF();
    const id = this.numeroComprobante;
    const { recibiDe, cedula, fecha, conceptoGeneral, valor } = this.ingresoForm.value;
  
    const totalDebe = this.totalDebe.toFixed(2);
    const totalHaber = this.totalHaber.toFixed(2);
    const valorLetras = `*** ${parseFloat(valor).toFixed(2)} dólares americanos ***`;
  
    let y = 20;


    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CONSORCIO PINTAG EXPRESS', 15, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('PINTAG, ANTISANA S2-138', 15, y + 5);
    doc.text('consorciopintagexpress@hotmail.com', 15, y + 10);
  
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('COMPROBANTE DE INGRESO', 195, y, { align: 'right' });
    doc.setTextColor(200, 0, 0);
    doc.text(`No. ${id}`, 195, y + 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 25;
    // 🧑 DATOS PRINCIPALES
    doc.setFont('helvetica', 'normal');
    doc.text(`RECIBÍ DE:  ${recibiDe}`, 15, y);
    doc.text(`FECHA:  ${fecha}`, 150, y);
    y += 8;
    doc.text(`CÉDULA/RUC:  ${cedula}`, 15, y);
    doc.text(`VALOR: $${valor}`, 150, y);
    y += 8;
    doc.text(`CONCEPTO: ${conceptoGeneral}`, 15, y);
    y += 10;
  
    // 🧾 TABLA DE TRANSACCIONES
    doc.setFont('helvetica', 'bold');
    doc.text('CUENTA', 15, y);
    doc.text('CONCEPTO', 45, y);
    doc.text('CC', 120, y);
    doc.text('DEBITO', 150, y);
    doc.text('CREDITO', 180, y);
    y += 5;
    doc.setLineWidth(0.3);
    doc.line(15, y, 195, y);
    y += 7;
  
    doc.setFont('helvetica', 'normal');
    this.transacciones.forEach(t => {
      doc.text(t.cuenta, 15, y);
      doc.text(t.concepto, 45, y);
      doc.text(t.centroCostos, 120, y);
      doc.text(t.tipo === 'Debe' ? `$${t.valor.toFixed(2)}` : '-', 150, y);
      doc.text(t.tipo === 'Haber' ? `$${t.valor.toFixed(2)}` : '-', 180, y);
      y += 6;
    });
  
    // 📌 TOTALES
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTALES:', 120, y);
    doc.text(`$${totalDebe}`, 150, y);
    doc.text(`$${totalHaber}`, 180, y);
  
    // 🔠 Valor en letras
    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.text(`VALOR (en letras): ${valorLetras}`, 15, y);
  
  // ✍️ FIRMAS
  y += 25;
  doc.setFont('helvetica', 'normal');
  doc.line(20, y, 70, y);
  doc.text('APROBADO', 30, y + 5);

  doc.line(80, y, 130, y);
  doc.text('CONTABILIZADO', 90, y + 5);

  doc.line(140, y, 190, y);
  doc.text('REVISADO', 155, y + 5);
  
    // 📤 GUARDAR EN FIREBASE
    const blob = doc.output('blob');
    await this.comprobanteIngresoService.guardarComprobanteIngreso({
      id,
      numeroComprobante: id, // ← 🔴 AÑADE ESTO
      recibiDe,
      cedula,
      fecha,
      conceptoGeneral,
      valor: parseFloat(valor),
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      transacciones: this.transacciones
    }, blob);
  
    doc.save(`${id}.pdf`);
    alert('✅ Comprobante de ingreso generado y guardado.');
    this.transacciones = [];
    this.actualizarTotales();
    await this.obtenerUltimoNumero(); // ✅ para el siguiente comprobante
  }

  @HostListener('document:click', ['$event'])
  cerrarModales(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.modal-cuentas')) this.cerrarSelectorCuentas();
    if (!target.closest('.modal-centros')) this.cerrarSelectorCentro();
  }



  get cuentasFiltradas() {
    const filtro = this.busquedaCuenta.toLowerCase();
    return this.cuentasDisponibles.filter(c =>
      c.codigo.toLowerCase().includes(filtro) || c.nombre.toLowerCase().includes(filtro)
    );
  }
  
  get centrosFiltrados() {
    const filtro = this.busquedaCentro.toLowerCase();
    return this.centroCostosDisponibles.filter(c =>
      c.codigo.toLowerCase().includes(filtro) || c.descripcion.toLowerCase().includes(filtro)
    );
  }



  async cargarComprobantesGuardados(): Promise<void> {
    const todos = await this.comprobanteIngresoService.obtenerComprobantes();
    this.comprobantesGuardados = todos.sort((a, b) => b.creado?.seconds - a.creado?.seconds); // más recientes primero
  }
  toggleLista() {
    this.mostrarLista = !this.mostrarLista;
    if (this.mostrarLista) this.cargarComprobantesGuardados();
  }
  comprobantesFiltradosPaginados() {
    const filtrados = this.comprobantesGuardados.filter(c =>
      c.recibiDe.toLowerCase().includes(this.busquedaIngreso.toLowerCase()) ||
      c.conceptoGeneral.toLowerCase().includes(this.busquedaIngreso.toLowerCase())
    );
  
    const inicio = (this.paginaActual - 1) * this.elementosPorPagina;
    return filtrados.slice(inicio, inicio + this.elementosPorPagina);
  }
  
  paginas(): number[] {
    const totalPaginas = Math.ceil(this.comprobantesGuardados.length / this.elementosPorPagina);
    return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  }
  
  async eliminarComprobante(id: string, numeroComprobante: string) {
    if (!confirm('¿Estás seguro de eliminar este comprobante?')) return;
  
    try {
      await this.comprobanteIngresoService.eliminarComprobantePorId(id, numeroComprobante);
      alert('✅ Comprobante eliminado correctamente.');
      this.comprobantesGuardados = this.comprobantesGuardados.filter(c => c.id !== id);
    } catch (error) {
      console.error('Error al eliminar:', error);
      alert('❌ Error al eliminar el comprobante.');
    }
  }
  
  
}
