import { Component, OnInit,HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FirebaseService } from '../../Services/comprobante.service';
import { CatalogoService } from '../../Services/comprobante.service';
import { CentroCostosService } from '../../Services/comprobante.service';
import { DocumentosService } from '../../Services/comprobante.service';
import { TransaccionesGeneralesService } from '../../Services/comprobante.service';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';
import autoTable from 'jspdf-autotable'; 

interface TransaccionGeneral {
  cuenta: string;
  descripcion: string;
  centroCostos: string;
  tipo: 'Debe' | 'Haber';
  valor: number;
}

@Component({
  selector: 'app-transacciones-generales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './Transacciongeneral.component.html',
  styleUrls: ['./Transacciongeneral.component.scss']
})
export class TransaccionesGeneralesComponent implements OnInit {
  transaccionForm!: FormGroup;
  transacciones: TransaccionGeneral[] = [];
  totalDebe = 0;
  totalHaber = 0;

  documentoSeleccionado: any = null;
  numeroDocumento: string = '';
  documentosDisponibles: any[] = [];
  mostrarSelectorDocumento = false;

  cuentasDisponibles: any[] = [];
  mostrarSelectorCuenta = false;
  centrosDisponibles: any[] = [];
  mostrarSelectorCentro = false;
  busquedaCuenta: string = '';
  busquedaCentro: string = '';

  comprobantes: any[] = [];
  comprobantesFiltrados: any[] = [];
  comprobantesPaginados: any[] = [];
  paginaActual: number = 1;
  registrosPorPagina: number = 5;
  filtroTipoDocumento: string = '';
  busquedaDocumento: string = '';
  paginasVisibles: (number | string)[] = [];
  constructor(
    private fb: FormBuilder,
    private catalogoService: CatalogoService,
    private centroCostosService: CentroCostosService,
    private transaccionesService: TransaccionesGeneralesService,
    private documentosService: DocumentosService,
  ) {}

  ngOnInit(): void {
    this.transaccionForm = this.fb.group({
      nombre: ['', Validators.required],
      concepto: ['', Validators.required],
      cuenta: ['', Validators.required],
      descripcion: ['', Validators.required],
      centroCostos: ['', Validators.required],
      tipo: ['Debe', Validators.required],
      valor: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]{1,2})?$/)]]
    });

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 500);

    this.cargarComprobantes();
  }

  async cargarComprobantes() {
    const snapshot = await this.transaccionesService.obtenerTransacciones();
    this.comprobantes = snapshot;
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const filtro = this.filtroTipoDocumento.toLowerCase();
    this.comprobantesFiltrados = this.comprobantes.filter(c =>
      c.documento?.toLowerCase().includes(filtro)
    );
    this.paginar();
    this.generarPaginasVisibles(); // ✅ agrega esto
  }

  paginar() {
    const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
    const fin = inicio + this.registrosPorPagina;
    this.comprobantesPaginados = this.comprobantesFiltrados.slice(inicio, fin);
  }

  get totalPaginas(): number {
    return Math.ceil(this.comprobantesFiltrados.length / this.registrosPorPagina);
  }

  cambiarPagina(pagina: number) {
    this.paginaActual = pagina;
    this.paginar();
    this.generarPaginasVisibles(); 
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

  async abrirSelectorDocumento() {
    this.documentosDisponibles = await this.documentosService.obtenerDocumentos();
    this.mostrarSelectorDocumento = true;
  }

  async seleccionarDocumento(documento: any) {
    this.documentoSeleccionado = documento; 
    this.numeroDocumento = ''; // 🧽 Limpia temporal
    this.mostrarSelectorDocumento = false;
  
    await this.generarNumeroDocumento(); // ✅ ESPERA la generación del número
  }
  
  async generarNumeroDocumento() {
    if (!this.documentoSeleccionado) return;
  
    const cantidad = await this.transaccionesService.obtenerUltimoNumeroPorCodigo(this.documentoSeleccionado.codigo);
    const correlativo = (cantidad + 1).toString().padStart(7, '0');
    this.numeroDocumento = `${this.documentoSeleccionado.codigo}${correlativo}`;
  }
  

  async abrirSelectorCuenta() {
    this.cuentasDisponibles = await this.catalogoService.obtenerCuentas();
    this.mostrarSelectorCuenta = true;
  }

  seleccionarCuenta(cuenta: any) {
    this.transaccionForm.patchValue({ cuenta: cuenta.codigo, descripcion: cuenta.nombre });
    this.mostrarSelectorCuenta = false;
  }

  async abrirSelectorCentro() {
    this.centrosDisponibles = await this.centroCostosService.obtenerCentros();
    this.mostrarSelectorCentro = true;
  }

  seleccionarCentro(centro: any) {
    this.transaccionForm.patchValue({ centroCostos: centro.codigo });
    this.mostrarSelectorCentro = false;
  }

  agregarTransaccion() {
    if (this.transaccionForm.invalid) return;
    const { cuenta, descripcion, centroCostos, tipo, valor } = this.transaccionForm.value;
    this.transacciones.push({ cuenta, descripcion, centroCostos, tipo, valor: parseFloat(valor) });
    this.actualizarTotales();
    this.transaccionForm.patchValue({ cuenta: '', descripcion: '', centroCostos: '', tipo: 'Debe', valor: '' });
  }

  eliminarTransaccion(index: number) {
    this.transacciones.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales() {
    this.totalDebe = this.transacciones.filter(t => t.tipo === 'Debe').reduce((sum, t) => sum + t.valor, 0);
    this.totalHaber = this.transacciones.filter(t => t.tipo === 'Haber').reduce((sum, t) => sum + t.valor, 0);
  }

  async generarPDF() {
    if (this.transacciones.length === 0) {
      alert('⚠️ No hay datos para generar el PDF.');
      return;
    }
  
    const doc = new jsPDF();
    let y = 20;
  
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text('TRANSACCIONES GENERALES - CONSORCIO PINTAG EXPRESS', 15, y);
    y += 10;
  
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    const { nombre, concepto } = this.transaccionForm.value;
    doc.text(`Documento: ${this.numeroDocumento}`, 15, y);
    doc.text(`A nombre de: ${nombre}`, 120, y);
    y += 8;
    doc.text(`Concepto: ${concepto}`, 15, y);
  
    y += 10;
  
    autoTable(doc, {
      startY: y,
      head: [['Cuenta', 'Centro C.', 'Descripción', 'Debe', 'Haber']],
      body: this.transacciones.map(t => [
        t.cuenta,
        t.centroCostos,
        t.descripcion,
        t.tipo === 'Debe' ? t.valor.toFixed(2) : '-',
        t.tipo === 'Haber' ? t.valor.toFixed(2) : '-'
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
  
    const nombrePDF = `TransaccionesGenerales_${this.numeroDocumento}.pdf`;
    const blob = doc.output('blob');
  
    await this.transaccionesService.guardarTransaccion({
      documento: this.numeroDocumento,
      nombre,
      concepto,
      codigoDocumento: this.documentoSeleccionado.codigo,
      numero: parseInt(this.numeroDocumento.replace(this.documentoSeleccionado.codigo, ''), 10),
      numeroFormateado: this.numeroDocumento.replace(this.documentoSeleccionado.codigo, ''),
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      transacciones: this.transacciones,
      creado: new Date()
    }, blob);
  
    doc.save(nombrePDF);
    alert('✅ Transacción guardada correctamente.');
  
    this.transacciones = [];
    this.actualizarTotales();
    this.cargarComprobantes();
    
    if (this.documentoSeleccionado?.codigo) {
      await this.generarNumeroDocumento();
    }
  }
  


  async eliminarComprobante(id: string, codigo: string, numero: string): Promise<void> {
    const fueUltimo = await this.transaccionesService.eliminarTransaccion(id, codigo, numero);
    this.comprobantes = this.comprobantes.filter(c => c.id !== id);
    this.aplicarFiltros();
  
    if (fueUltimo && this.documentoSeleccionado?.codigo === codigo) {
      await this.generarNumeroDocumento(); // Reinicia número si se eliminó el último
    }
  
    alert('✅ Transacción eliminada correctamente.');
  }
  get documentosFiltrados(): any[] {
    const filtro = this.busquedaDocumento.toLowerCase();
    return this.documentosDisponibles.filter(doc =>
      doc.codigo.toLowerCase().includes(filtro) || 
      (doc.nombre?.toLowerCase().includes(filtro) || doc.descripcion?.toLowerCase().includes(filtro))
    );
  }
  
  generarPaginasVisibles(): void {
    const total = this.totalPaginas;
    const actual = this.paginaActual;
    const rango = 1;
  
    const paginas: (number | string)[] = [];
  
    if (total <= 7) {
      for (let i = 1; i <= total; i++) paginas.push(i);
    } else {
      paginas.push(1);
      if (actual > 3) paginas.push('...');
      
      const inicio = Math.max(2, actual - rango);
      const fin = Math.min(total - 1, actual + rango);
  
      for (let i = inicio; i <= fin; i++) paginas.push(i);
  
      if (actual < total - 2) paginas.push('...');
      paginas.push(total);
    }
  
    this.paginasVisibles = paginas;
  }
  get cuentasFiltradas(): any[] {
    const filtro = this.busquedaCuenta.toLowerCase();
    return this.cuentasDisponibles.filter(cuenta =>
      cuenta.codigo.toLowerCase().includes(filtro) || cuenta.nombre.toLowerCase().includes(filtro)
    );
  }
  get centrosFiltrados(): any[] {
    const filtro = this.busquedaCentro.toLowerCase();
    return this.centrosDisponibles.filter(centro =>
      centro.codigo.toLowerCase().includes(filtro) || centro.descripcion.toLowerCase().includes(filtro)
    );
  }
  
}
