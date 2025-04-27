import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FirebaseService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CatalogoService } from '../../Services/comprobante.service';
import { CentroCostosService } from '../../Services/comprobante.service';
import { MatIconModule } from '@angular/material/icon';
import { HostListener } from '@angular/core';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';




interface Transaccion {
  descripcion: string;
  codigo: string;
  fecha: string;
  tipo: string;
  monto: number;
  debe: number;
  haber: number;
  centroCostos?: { codigo: string; nombre: string }; // ✅ agregar esto
}


@Component({
  selector: 'app-indexconta',
  standalone: true,
  templateUrl: './indexconta.component.html',
  styleUrls: ['./stylescontacom.scss'],
  imports: [CommonModule, ReactiveFormsModule, MatIconModule,RouterModule, FormsModule]
})
export class IndexContaComponent implements OnInit {
  egresoForm!: FormGroup;
  transacciones: Transaccion[] = [];
  comprobantes: any[] = [];
  comprobantesFiltrados: any[] = [];
  comprobantesPaginados: any[] = [];

  totalDebe = 0;
  totalHaber = 0;

  mostrarLista = false;
  filtroInicio: string = '';
  filtroFin: string = '';
  paginaActual: number = 1;
  registrosPorPagina: number = 5;
  
  numeroComprobante: string = '';
  ultimoNumero: number = 0;
  
  constructor(private fb: FormBuilder, private firebaseService: FirebaseService,  private catalogoService: CatalogoService, private centroCostosService: CentroCostosService) {}

  ngOnInit() {
    this.initFormulario();
  
    this.firebaseService.obtenerUltimoNumeroComprobante().then(numero => {
      this.ultimoNumero = numero; // 0 si no hay registros
      this.numeroComprobante = this.generarCodigoComprobante(this.ultimoNumero + 1);
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
  

generarCodigoComprobante(numero: number): string {
  return 'EGR' + numero.toString().padStart(8, '0');
}
  initFormulario(): void {
    this.egresoForm = this.fb.group({
      beneficiario: ['', Validators.required],
      cedula: ['', [Validators.required, Validators.maxLength(13)]],
      codigo: ['', Validators.required],
      fecha: ['', Validators.required],
      descripcion: ['', Validators.required],
      tipo: ['Debe'],
      monto: ['', Validators.required],
      numeroCheque: [''],
      concepto: ['', Validators.required]
    });
  }

  agregarTransaccion(): void {
    if (this.egresoForm.invalid) return;
    const { codigo, fecha, descripcion, tipo, monto } = this.egresoForm.value;
    const montoNum = parseFloat(monto);
    this.transacciones.push({
      codigo,
      fecha,
      descripcion,
      tipo,
      monto: montoNum,
      debe: tipo === 'Debe' ? montoNum : 0,
      haber: tipo === 'Haber' ? montoNum : 0,
      centroCostos: this.centroSeleccionado ? { ...this.centroSeleccionado } : undefined
    });


    this.actualizarTotales();
    this.egresoForm.patchValue({ descripcion: '', monto: '' });
    if (!this.centroSeleccionado) {
      alert('⚠️ Debes seleccionar un Centro de Costos antes de agregar la transacción.');
      return;
    }
  }
  convertirNumeroALetras(num: number): string {
    // Aquí puedes usar una librería como numero-a-letras si deseas algo más complejo
    return `*** ${num.toFixed(2)} dólares americanos ***`;
  }
  
  eliminarTransaccion(index: number): void {
    this.transacciones.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales(): void {
    this.totalDebe = this.transacciones.reduce((sum, t) => sum + t.debe, 0);
    this.totalHaber = this.transacciones.reduce((sum, t) => sum + t.haber, 0);
  }

  async generarPDF(): Promise<void> {
    const doc = new jsPDF();
    const id = this.numeroComprobante;
    const { beneficiario, cedula, fecha, numeroCheque, concepto } = this.egresoForm.value;
  
    const totalDebe = this.totalDebe.toFixed(2);
    const totalHaber = this.totalHaber.toFixed(2);
    const valorLetras = this.convertirNumeroALetras(this.totalHaber);
  
    let y = 20;
  
    // 🧾 ENCABEZADO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CONSORCIO PINTAG EXPRESS', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('PINTAG, ANTISANA S2-138', 15, y + 5);
    doc.text('consorciopintagexpress@hotmail.com', 15, y + 10);
  
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('COMPROBANTE DE EGRESO', 195, y, { align: 'right' });
    doc.setTextColor(200, 0, 0);
    doc.text(`No. ${id}`, 195, y + 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  
    y += 25;
  
    // 📄 DATOS
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA: ${fecha}`, 15, y);
    doc.text(`PAGADO A: ${beneficiario}`, 90, y);
    doc.text(`CÉDULA/RUC: ${cedula}`, 155, y);
    y += 8;
    doc.text(`CHEQUE: ${numeroCheque || '-'}`, 15, y);
    y += 8;
    doc.text(`CONCEPTO: ${concepto}`, 15, y);
    y += 10;
  
    // 🧾 TABLA
    doc.setFont('helvetica', 'bold');
    doc.text('CUENTA', 15, y);
    doc.text('CONCEPTO', 45, y);
    doc.text('CC', 120, y);
    doc.text('DEBITO', 150, y);
    doc.text('CREDITO', 180, y);
    doc.setLineWidth(0.3);
    doc.line(15, y + 2, 195, y + 2);
    y += 7;
  
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  
    const transaccionesConCC = this.transacciones.map(t => ({
      cuenta: t.codigo,
      concepto: t.descripcion,
      cc: t.centroCostos?.codigo || '-',
      debe: t.tipo === 'Debe' ? t.monto : 0,
      haber: t.tipo === 'Haber' ? t.monto : 0,
      tipo: t.tipo,
      monto: t.monto,
      fecha: t.fecha
    }));
  
    transaccionesConCC.forEach((item) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
  
      doc.text(item.cuenta, 15, y);
      doc.text(item.concepto, 45, y);
      doc.text(item.cc, 120, y);
      doc.text(item.debe > 0 ? `$${item.debe.toFixed(2)}` : '-', 150, y);
      doc.text(item.haber > 0 ? `$${item.haber.toFixed(2)}` : '-', 180, y);
      y += 6;
    });
  
    // 🔢 TOTALES
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTALES:', 120, y);
    doc.text(`$${totalDebe}`, 150, y);
    doc.text(`$${totalHaber}`, 180, y);
  
    // 🔠 VALOR EN LETRAS
    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(`VALOR (en letras): ${valorLetras}`, 15, y);
  
    // ✍️ FIRMAS
    y += 25;
    doc.setFont('helvetica', 'normal');
    doc.line(30, y, 80, y);
    doc.text('Elaborado: Usuario', 35, y + 5);
    doc.line(130, y, 180, y);
    doc.text('Autorizado:', 145, y + 5);
  
    // 💾 GUARDAR EN FIREBASE
    const pdfBlob = doc.output('blob');
    await this.firebaseService.guardarComprobante({
      comprobanteId: id,
      beneficiario,
      cedula,
      fecha,
      concepto,
      numeroCheque,
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      transacciones: transaccionesConCC // ✅ ya incluye CC
    }, pdfBlob);
  
    doc.save(`${id}.pdf`);
    alert('✅ Comprobante guardado y PDF generado.');
  
    this.transacciones = [];
    this.actualizarTotales();
    this.mostrarPDFs();
  }
  
  

  toggleListaComprobantes(): void {
    this.mostrarLista = !this.mostrarLista;
    if (this.mostrarLista) {
      this.mostrarPDFs();
    }
  }

  async mostrarPDFs(): Promise<void> {
    this.comprobantes = await this.firebaseService.obtenerComprobantes();
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    const desde = this.filtroInicio ? new Date(this.filtroInicio) : null;
    const hasta = this.filtroFin ? new Date(this.filtroFin) : null;

    this.comprobantesFiltrados = this.comprobantes.filter(c => {
      const fecha = new Date(c.fecha);
      return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
    });

    this.paginaActual = 1;
    this.paginarComprobantes();
    this.generarPaginasVisibles();
  }

  get totalPaginas(): number {
    return Math.ceil(this.comprobantesFiltrados.length / this.registrosPorPagina);
  }

  paginarComprobantes(): void {
    const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
    this.comprobantesPaginados = this.comprobantesFiltrados.slice(inicio, inicio + this.registrosPorPagina);
  }

  cambiarPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      this.paginarComprobantes();
      this.generarPaginasVisibles();
    }
  }

  paginasVisibles: (number | string)[] = [];

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

  async eliminarComprobante(id: string, comprobanteId: string): Promise<void> {
    const fueUltimo = await this.firebaseService.eliminarComprobantePorId(id, comprobanteId);
        this.comprobantes = this.comprobantes.filter(c => c.id !== id);
this.aplicarFiltros();
if (fueUltimo) {
  this.ultimoNumero -= 1;
  this.numeroComprobante = this.generarCodigoComprobante(this.ultimoNumero + 1);
}

alert('✅ Comprobante eliminado correctamente.');}


  cuentasDisponibles: any[] = [];
  busquedaCuenta: string = '';
  mostrarSelectorCuentas: boolean = false;
  
  get cuentasFiltradasModal(): any[] {
    const filtro = this.busquedaCuenta.toLowerCase();
    return this.cuentasDisponibles.filter(c =>
      c.codigo.toLowerCase().includes(filtro) ||
      c.nombre.toLowerCase().includes(filtro)
    );
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
    this.egresoForm.patchValue({
      codigo: cuenta.codigo,
      descripcion: cuenta.nombre
    });
    this.cerrarSelectorCuentas();
  }
  
centrosDisponibles: any[] = [];
centroSeleccionado: { codigo: string; nombre: string } | null = null;
busquedaCentro: string = '';
mostrarSelectorCentro: boolean = false;

async abrirSelectorCentroCostos(): Promise<void> {
 // ✅ Esto es correcto si usas tu injectable real
this.centrosDisponibles = await this.centroCostosService.obtenerCentros();
  this.mostrarSelectorCentro = true;
}

cerrarSelectorCentro(): void {
  this.mostrarSelectorCentro = false;
  this.busquedaCentro = '';
}

get centrosFiltradosModal(): any[] {
  const filtro = this.busquedaCentro.toLowerCase();
  return this.centrosDisponibles.filter(c =>
    c.codigo.toLowerCase().includes(filtro) || c.descripcion.toLowerCase().includes(filtro)
  );
}


seleccionarCentro(centro: any): void {
  this.centroSeleccionado = centro;
  this.cerrarSelectorCentro();
}






}