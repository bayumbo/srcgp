import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FirebaseService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CatalogoService } from '../../Services/comprobante.service';


interface Transaccion {
  descripcion: string;
  codigo: string;
  fecha: string;
  tipo: string;
  monto: number;
  debe: number;
  haber: number;
}

@Component({
  selector: 'app-indexconta',
  standalone: true,
  templateUrl: './indexconta.component.html',
  styleUrls: ['./stylescontacom.scss'],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FormsModule]
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

  constructor(private fb: FormBuilder, private firebaseService: FirebaseService,  private catalogoService: CatalogoService) {}

  ngOnInit() {
    this.initFormulario();

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
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
      numeroCheque: ['']
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
      haber: tipo === 'Haber' ? montoNum : 0
    });
    this.actualizarTotales();
    this.egresoForm.patchValue({ descripcion: '', monto: '' });
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
    const id = 'CE-' + String(Date.now()).slice(-6);
    const { beneficiario, cedula, fecha, numeroCheque } = this.egresoForm.value;
  
    const totalHaber = this.totalHaber.toFixed(2);
    const totalDebe = this.totalDebe.toFixed(2);
  
    let y = 20;
  
    // 🧾 ENCABEZADO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CONSORCIO PINTAG EXPRESS', 15, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('PINTAG, ANTISANA S2-138', 15, y + 5);
    doc.text('consorciopintagexpress@hotmail.com', 15, y + 10);
  
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('COMPROBANTE DE EGRESO', 195, y, { align: 'right' });
    doc.setTextColor(200, 0, 0);
    doc.text(`No. ${id}`, 195, y + 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  
    y += 25;
  
    // 📄 DATOS GENERALES
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${fecha}`, 15, y);
    doc.text(`Pagado a: ${beneficiario}`, 75, y);
    doc.text(`Cédula/RUC: ${cedula}`, 150, y);
    y += 10;
    doc.text(`Cheque: ${numeroCheque || '-'}`, 15, y);
  
    // 📋 TABLA
    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', 15, y);
    doc.text('VALOR', 195, y, { align: 'right' });
  
    doc.setLineWidth(0.1);
    doc.line(15, y + 2, 195, y + 2);
    y += 8;
  
    doc.setFont('helvetica', 'normal');
    this.transacciones.forEach((item) => {
      doc.text(item.descripcion, 15, y);
      const valor = (item.haber || item.debe).toFixed(2);
      doc.text(`$${valor}`, 195, y, { align: 'right' });
      y += 7;
    });
  
    // 🔢 TOTALES
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 15, y);
    doc.text(`$${totalHaber}`, 195, y, { align: 'right' });
  
    // 🔠 VALOR EN LETRAS
    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('VALOR (en letras):', 15, y);
    doc.text(this.convertirNumeroALetras(Number(this.totalHaber)), 60, y);
  
    // ✍️ FIRMAS
    y += 25;
    doc.setFont('helvetica', 'normal');
    doc.line(20, y, 70, y);
    doc.text('APROBADO', 30, y + 5);
  
    doc.line(80, y, 130, y);
    doc.text('CONTABILIZADO', 90, y + 5);
  
    doc.line(140, y, 190, y);
    doc.text('REVISADO', 155, y + 5);
  
    // 💾 GUARDAR Y SUBIR
    const pdfBlob = doc.output('blob');
    await this.firebaseService.guardarComprobante({
      comprobanteId: id,
      beneficiario,
      cedula,
      fecha,
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      numeroCheque,
      transacciones: this.transacciones
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

  eliminarComprobante(id: string, comprobanteId: string): void {
    this.firebaseService.eliminarComprobantePorId(id, comprobanteId)
      .then(() => {
        this.comprobantes = this.comprobantes.filter(c => c.id !== id);
        this.aplicarFiltros();
        alert('✅ Comprobante eliminado correctamente.');
      })
      .catch(err => {
        console.error('❌ Error al eliminar:', err);
        alert('Error al eliminar comprobante.');
      });
  }

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
  






}