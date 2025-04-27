import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ComprasVariasService } from '../../Services/comprobante.service';
import { CatalogoService } from '../../Services/comprobante.service';
import { CentroCostosService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

@Component({
  selector: 'app-compras-varias',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './compras-varias.component.html',
  styleUrls: ['./compras-varias.component.scss']
})
export class ComprasVariasComponent implements OnInit {
  compraForm!: FormGroup;
  productos: any[] = [];
  totalDebe = 0;
  totalHaber = 0;

  numeroRaw: number = 0;
  numeroFormateado: string = '';
  numeroCompra: string = '';

  formasPago = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta'];

  cuentasDisponibles: any[] = [];
  mostrarSelectorCuenta = false;

  centrosDisponibles: any[] = [];
  mostrarSelectorCentro = false;
  busquedaCuenta: string = '';
  busquedaCentro: string = '';
  mostrarComprasGuardadas: boolean = false;
  comprasGuardadas: any[] = [];

  constructor(
    private fb: FormBuilder,
    private comprasVariasService: ComprasVariasService,
    private catalogoService: CatalogoService,
    private centroCostosService: CentroCostosService
  ) {}

  ngOnInit(): void {
    this.compraForm = this.fb.group({
      proveedor: ['', Validators.required],
      ruc: ['', [Validators.required, Validators.maxLength(13)]],
      tipoDocumento: ['', Validators.required],
      numeroDocumento: ['', Validators.required],  // ←✅ AGREGA ESTO
      formaPago: ['', Validators.required],
      concepto: ['', Validators.required],
      cuenta: ['', Validators.required],
      descripcion: ['', Validators.required],
      centroCostos: ['', Validators.required],
      tipo: ['Debe', Validators.required],
      valor: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]]
    });
    
    this.obtenerUltimoNumero();
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

  @HostListener('document:click', ['$event'])
  cerrarSiClickFuera(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('nav') && !target.closest('.menu-toggle')) {
      this.menuAbierto = false;
    }
  }

  async obtenerUltimoNumero() {
    const ultimo = await this.comprasVariasService.obtenerUltimoNumero();
    this.numeroRaw = ultimo + 1;
    this.numeroFormateado = this.numeroRaw.toString().padStart(7, '0');
    this.numeroCompra = `COMP${this.numeroFormateado}`;  // solo una vez COMP
  
    // ✅ actualiza solo el campo 'numeroDocumento'
    this.compraForm.patchValue({
      numeroDocumento: this.numeroCompra
    });
  }
  
  
  async abrirSelectorCuenta() {
    this.cuentasDisponibles = await this.catalogoService.obtenerCuentas();
    this.mostrarSelectorCuenta = true;
  }

  seleccionarCuenta(cuenta: any) {
    this.compraForm.patchValue({ cuenta: cuenta.codigo, descripcion: cuenta.nombre });
    this.mostrarSelectorCuenta = false;
  }

  async abrirSelectorCentro() {
    this.centrosDisponibles = await this.centroCostosService.obtenerCentros();
    this.mostrarSelectorCentro = true;
  }

  seleccionarCentro(centro: any) {
    this.compraForm.patchValue({ centroCostos: centro.codigo });
    this.mostrarSelectorCentro = false;
  }

  agregarProducto() {
    if (this.compraForm.invalid) return;
    const { cuenta, descripcion, centroCostos, tipo, valor } = this.compraForm.value;
    this.productos.push({ cuenta, descripcion, centroCostos, tipo, valor: parseFloat(valor) });
    this.actualizarTotales();
    this.compraForm.patchValue({ cuenta: '', descripcion: '', centroCostos: '', tipo: 'Debe', valor: '' });
  }

  eliminarProducto(index: number) {
    this.productos.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales() {
    this.totalDebe = this.productos.filter(p => p.tipo === 'Debe').reduce((sum, p) => sum + p.valor, 0);
    this.totalHaber = this.productos.filter(p => p.tipo === 'Haber').reduce((sum, p) => sum + p.valor, 0);
  }

  async generarPDF() {
    if (this.productos.length === 0) {
      alert('⚠️ Agrega al menos un producto.');
      return;
    }
  
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.text('COMPRAS VARIAS - CONSORCIO PINTAG EXPRESS', 15, y);
    y += 10;
  
    doc.setFontSize(10);
    const { proveedor, ruc, tipoDocumento, numeroDocumento, formaPago, concepto } = this.compraForm.value;
    doc.text(`Proveedor: ${proveedor}`, 15, y);
    doc.text(`RUC: ${ruc}`, 120, y);
    y += 8;
    doc.text(`Tipo Documento: ${tipoDocumento}`, 15, y);
    doc.text(`Número Documento: ${numeroDocumento}`, 120, y);
    y += 8;
    doc.text(`Forma de Pago: ${formaPago}`, 15, y);
    y += 8;
    doc.text(`Concepto: ${concepto}`, 15, y);
  
    y += 10;
  
    autoTable(doc, {
      startY: y,
      head: [['Cuenta', 'Centro C.', 'Descripción', 'Debe', 'Haber']],
      body: this.productos.map(p => [
        p.cuenta,
        p.centroCostos,
        p.descripcion,
        p.tipo === 'Debe' ? p.valor.toFixed(2) : '-',
        p.tipo === 'Haber' ? p.valor.toFixed(2) : '-'
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
        { content: 'TOTALES', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `$${this.totalDebe.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `$${this.totalHaber.toFixed(2)}`, styles: { fontStyle: 'bold' } }
      ]]
    });
  
    const nombrePDF = `Compra_COMP${this.numeroFormateado}.pdf`;
    const blob = doc.output('blob');
  
    await this.comprasVariasService.guardarCompra({
      proveedor,
      ruc,
      tipoDocumento,
      numeroDocumento,
      formaPago,
      concepto,
      total: this.totalDebe,
      numero: this.numeroRaw,
      numeroFormateado: this.numeroFormateado,
      transacciones: this.productos,
      creado: new Date()
    }, blob);
  
    doc.save(nombrePDF);
    alert('✅ Compra guardada correctamente.');
  
    // 🔥 Reset corregido
    this.productos = [];
    this.actualizarTotales();
    this.compraForm.reset({
      proveedor: '',
      ruc: '',
      tipoDocumento: '',
      numeroDocumento: '',  // 👈 importante limpiar este
      formaPago: '',
      concepto: '',
      cuenta: '',
      descripcion: '',
      centroCostos: '',
      tipo: 'Debe',
      valor: ''
    });
    await this.obtenerUltimoNumero(); // ✅ cargar nuevo numero correctamente
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

  cerrarSelectorCuenta() {
    this.mostrarSelectorCuenta = false;
    this.busquedaCuenta = '';
  }

  cerrarSelectorCentro() {
    this.mostrarSelectorCentro = false;
    this.busquedaCentro = '';
  }

  async cargarComprasGuardadas() {
    const snapshot = await this.comprasVariasService.obtenerCompras();
    this.comprasGuardadas = snapshot;
  }
  async eliminarCompra(id: string, numeroDocumento: string): Promise<void> {
    await this.comprasVariasService.eliminarCompra(id, numeroDocumento);
    this.comprasGuardadas = this.comprasGuardadas.filter(c => c.id !== id);
    alert('🗑️ Documento eliminado correctamente.');
  }
  
}
