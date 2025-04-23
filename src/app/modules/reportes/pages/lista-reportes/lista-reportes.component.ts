import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  getDocs,
  doc,
  collection as fsCollection,
  query,
  where,
  Timestamp,
  orderBy,
  collectionGroup
} from '@angular/fire/firestore';
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Pago } from 'src/app/core/interfaces/pago.interface';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss']
})
export class ReporteListaComponent implements OnInit {
  reportes: ReporteConPagos[] = [];
  cargando: boolean = true;
  listaReportes: any[] = [];
  mostrarFiltros = false;
  fechaPersonalizada: string = '';

  // Empresa
  mostrarOpcionesEmpresa = false;
  empresaSeleccionada: string | null = null;
  fechaInicio: string = '';
  fechaFin: string = '';
  errorFecha: string = '';

  // Paginación
  paginaActual: number = 1;
  reportesPorPagina: number = 5;

  get totalPaginas(): number {
    return Math.ceil(this.reportes.length / this.reportesPorPagina);
  }

  get reportesPaginados(): ReporteConPagos[] {
    const inicio = (this.paginaActual - 1) * this.reportesPorPagina;
    return this.reportes.slice(inicio, inicio + this.reportesPorPagina);
  }

  private firestore = inject(Firestore);
  private router = inject(Router);

  cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
    }}

  async ngOnInit(): Promise<void> {
    await this.cargarTodosLosReportes();
  }

 seleccionarEmpresa(nombreBoton: string) {
  if (nombreBoton === 'Pintag') {
    this.empresaSeleccionada = 'General Pintag';
  } else if (nombreBoton === 'Antisana') {
    this.empresaSeleccionada = 'Expreso Antisana';
  }
  this.fechaInicio = '';
  this.fechaFin = '';
  this.errorFecha = '';
}

  validarRangoFechas() {
    if (this.fechaInicio && this.fechaFin) {
      const inicio = new Date(this.fechaInicio);
      const fin = new Date(this.fechaFin);
      const diferenciaDias = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);

      if (diferenciaDias < 0) {
        this.errorFecha = 'La fecha de inicio no puede ser mayor que la de fin.';
        this.reportes = [];
      } else if (diferenciaDias > 31) {
        this.errorFecha = 'El rango no debe superar los 31 días.';
        this.reportes = [];
      } else {
        this.errorFecha = '';
        this.actualizarVistaPorRango();
      }
    }
  }

  actualizarVistaPorRango() {
    if (!this.fechaInicio || !this.fechaFin || this.errorFecha) {
      this.reportes = [];
      return;
    }

    const inicio = new Date(this.fechaInicio);
    const fin = new Date(this.fechaFin);
    this.consultarReportesEnRango(inicio, fin);
  }



  async cargarTodosLosReportes() {
    this.cargando = true;
    try {
      const ref = query(
        collectionGroup(this.firestore, 'reportesDiarios'),
        orderBy('fechaModificacion', 'desc')
      );
      const snapshot = await getDocs(ref);
      const tempReportes = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as NuevoRegistro;
        const id = docSnap.id;
        const pathParts = docSnap.ref.path.split('/');
        const uid = pathParts[1];

        const pagosRef = fsCollection(this.firestore, `usuarios/${uid}/reportesDiarios/${id}/pagosTotales`);
        const pagosSnap = await getDocs(pagosRef);

        let minutosPagados = 0;
        let adminPagada = 0;
        let minBasePagados = 0;
        let multasPagadas = 0;

        pagosSnap.forEach(pagoDoc => {
          const pago = pagoDoc.data();
          const detalles = pago['detalles'] ?? {};

          minutosPagados += detalles.minutosAtraso || 0;
          adminPagada += detalles.administracion || 0;
          minBasePagados += detalles.minutosBase || 0;
          multasPagadas += detalles.multas || 0;
        });

        tempReportes.push({
          ...data,
          id,
          uid,
          minutosPagados,
          adminPagada,
          minBasePagados,
          multasPagadas
        });
      }

      this.reportes = tempReportes;
    } catch (error) {
      console.error('Error al cargar reportes:', error);
    } finally {
      this.cargando = false;
    }
  }

  async consultarReportesEnRango(fechaInicio: Date, fechaFin: Date) {
    this.cargando = true;
    try {
      const uidsValidos = this.empresaSeleccionada
        ? await this.obtenerUIDsPorEmpresa(this.empresaSeleccionada)
        : null;
  
      const start = Timestamp.fromDate(fechaInicio);
      const end = Timestamp.fromDate(new Date(fechaFin.setHours(23, 59, 59, 999)));
  
      const ref = query(
        collectionGroup(this.firestore, 'reportesDiarios'),
        where('fechaModificacion', '>=', start),
        where('fechaModificacion', '<=', end),
        orderBy('fechaModificacion', 'desc')
      );
  
      const snapshot = await getDocs(ref);
      const tempReportes: ReporteConPagos[] = [];
  
      console.log('UIDs válidos para empresa:', uidsValidos);
  
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as NuevoRegistro;
        const id = docSnap.id;
        const pathParts = docSnap.ref.path.split('/');
        const uid = pathParts[1];
  
        if (uidsValidos && !uidsValidos.includes(uid)) continue;
  
        const pagosRef = fsCollection(this.firestore, `usuarios/${uid}/reportesDiarios/${id}/pagosTotales`);
        const pagosSnap = await getDocs(pagosRef);
  
        let minutosPagados = 0;
        let adminPagada = 0;
        let minBasePagados = 0;
        let multasPagadas = 0;
  
        pagosSnap.forEach(pagoDoc => {
          const pago = pagoDoc.data();
          const detalles = pago['detalles'] ?? {};
          minutosPagados += detalles.minutosAtraso || 0;
          adminPagada += detalles.administracion || 0;
          minBasePagados += detalles.minutosBase || 0;
          multasPagadas += detalles.multas || 0;
        });
  
        tempReportes.push({
          ...data,
          id,
          uid,
          minutosPagados,
          adminPagada,
          minBasePagados,
          multasPagadas
        });
      }
  
      this.reportes = tempReportes;
      this.paginaActual = 1;
  
    } catch (error) {
      console.error('Error al consultar por rango:', error);
    } finally {
      this.cargando = false;
    }
  }
  
  async obtenerUIDsPorEmpresa(nombreEmpresa: string): Promise<string[]> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('empresa', '==', nombreEmpresa));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.id);
  } 
  /*---------------------------- PDF REPORTE EMPRESA------------------------- */
  generarReporteEmpresasPDF() {
    if (!this.empresaSeleccionada || this.errorFecha) return;
  
    const inicio = new Date(this.fechaInicio);
    const fin = new Date(this.fechaFin);
    const fechaEmision = new Date();
  
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Reporte General ${this.empresaSeleccionada}`, 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Fecha de inicio: ${inicio.toLocaleDateString()}`, 15, 30);
    doc.text(`Fecha de finalización: ${fin.toLocaleDateString()}`, 15, 36);
    doc.text(`Fecha de emisión: ${fechaEmision.toLocaleDateString()}`, 15, 42);
  
    const modulos = [
      { nombre: 'Minutos Asignados', campo: 'minutosAtraso', pagado: 'minutosPagados' },
      { nombre: 'Administración Asignada', campo: 'administracion', pagado: 'adminPagada' },
      { nombre: 'Minutos Base Asignados', campo: 'minutosBase', pagado: 'minBasePagados' },
      { nombre: 'Multas Asignadas', campo: 'multas', pagado: 'multasPagadas' }
    ];
  
    let currentY = 50;
    const resumenFinal: [string, number, number, number][] = [];
  
    for (const modulo of modulos) {
      doc.setFontSize(14);
      doc.text(modulo.nombre, 15, currentY);
      currentY += 6;
  
      const fechasSet = new Set(this.reportes.map(r => r.fechaModificacion?.toDate().toLocaleDateString() || ''));
      const fechasArray = Array.from(fechasSet).sort();
      const unidades = [...new Set(this.reportes.map(r => r.unidad))];
  
      let totalAsignadoModulo = 0;
      let totalSaldoModulo = 0;
  
      // TABLA 1: MONTOS ASIGNADOS POR DÍA
      const bodyAsignados = unidades.map(unidad => {
        const row: (string | number)[] = [unidad || ''];
        let total = 0;
        for (const fecha of fechasArray) {
          const rep = this.reportes.find(r => r.unidad === unidad && r.fechaModificacion?.toDate().toLocaleDateString() === fecha);
          const asignado = rep ? Number(rep[modulo.campo as keyof ReporteConPagos]) || 0 : 0;
          row.push(`$${asignado.toFixed(2)}`);
          total += asignado;
        }
        totalAsignadoModulo += total;
        row.push(`$${total.toFixed(2)}`);
        return row;
      });
  
      autoTable(doc, {
        startY: currentY,
        head: [['UNIDAD', ...fechasArray, 'TOTAL']],
        body: bodyAsignados,
        styles: { fontSize: 8 },
        margin: { left: 15, right: 15 },
        didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
      });
  
      // TÍTULO: MONTOS ADEUDADOS
      doc.setFontSize(12);
      doc.text(`${modulo.nombre.replace('Asignados', 'Adeudados')}`, 15, currentY);
      currentY += 6;
  
      // TABLA 2: MONTOS POR COBRAR POR DÍA
      const bodyPorCobrar = unidades.map(unidad => {
        const row: (string | number)[] = [unidad || ''];
        let total = 0;
        for (const fecha of fechasArray) {
          const rep = this.reportes.find(r => r.unidad === unidad && r.fechaModificacion?.toDate().toLocaleDateString() === fecha);
          const asignado = rep ? Number(rep[modulo.campo as keyof ReporteConPagos]) || 0 : 0;
          const pagado = rep ? Number(rep[modulo.pagado as keyof ReporteConPagos]) || 0 : 0;
          const saldo = asignado - pagado;
          row.push(`$${saldo.toFixed(2)}`);
          total += saldo;
        }
        totalSaldoModulo += total;
        row.push(`$${total.toFixed(2)}`);
        return row;
      });
  
      autoTable(doc, {
        startY: currentY,
        head: [['UNIDAD', ...fechasArray, 'TOTAL']],
        body: bodyPorCobrar,
        styles: { fontSize: 8 },
        margin: { left: 15, right: 15 },
        didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
      });
  
      resumenFinal.push([modulo.nombre, totalAsignadoModulo, totalSaldoModulo, totalAsignadoModulo - totalSaldoModulo]);
    }
  
    // RESUMEN FINAL POR MÓDULO
    doc.setFontSize(14);
    doc.text('Resumen Final por Módulo', 15, currentY);
    currentY += 6;
  
    autoTable(doc, {
      startY: currentY,
      head: [['MÓDULO', 'ASIGNADO TOTAL', 'SALDO TOTAL', 'PAGADO TOTAL']],
      body: resumenFinal.map(([nombre, asignado, saldo, pagado]) => [
        nombre,
        `$${asignado.toFixed(2)}`,
        `$${saldo.toFixed(2)}`,
        `$${pagado.toFixed(2)}`
      ]),
      styles: { fontSize: 10 },
      margin: { left: 15, right: 15 }
    });
  
    doc.save(`Reporte_${this.empresaSeleccionada}_${this.fechaInicio}_al_${this.fechaFin}.pdf`);
  }
  
  /*---------------------------- PDF REPORTE EMPRESA------------------------- */

  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    const hoy = new Date();
    let fechaInicio: Date;
    let fechaFin: Date;

    if (tipo === 'hoy') {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
    } else if (tipo === 'semana') {
      const diaActual = hoy.getDay();
      const diferencia = diaActual === 0 ? 6 : diaActual - 1;
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - diferencia);
      fechaInicio.setHours(0, 0, 0, 0);

      fechaFin = new Date(hoy);
      fechaFin.setHours(23, 59, 59, 999);
    } else {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    }

    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  async filtrarPorFechaPersonalizada() {
    if (!this.fechaPersonalizada) return;

    const [anio, mes, dia] = this.fechaPersonalizada.split('-').map(Number);
    const fechaInicio = new Date(anio, mes - 1, dia, 0, 0, 0);
    const fechaFin = new Date(anio, mes - 1, dia, 23, 59, 59);

    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  imprimirPDFMinutosDesdeVista() {
    if (!this.fechaPersonalizada) {
      alert('Selecciona una fecha primero');
      return;
    }

    const fecha = new Date(this.fechaPersonalizada);
    this.generarPDFMinutos(this.reportes, fecha);
  }

  imprimirPDFAdministracionDesdeVista() {
    if (!this.fechaPersonalizada) {
      alert('Selecciona una fecha primero');
      return;
    }

    const fecha = new Date(this.fechaPersonalizada);
    this.generarPDFAdministracion(this.reportes, fecha);
  }

  /*--------------------GENERAR PDF -------------------*/

generarPDFMinutos(data: ReporteConPagos[], fecha: Date) {
  const doc = new jsPDF();
  const fechaTexto = fecha.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

  const logo1 = new Image();
  logo1.src = '/assets/img/LogoPintag.png';
  const logo2 = new Image();
  logo2.src = '/assets/img/LogoAntisana.png';

  doc.addImage(logo1, 'PNG', 15, 10, 25, 25);
  doc.addImage(logo2, 'PNG', 170, 10, 25, 25);

  doc.setFontSize(16);
  doc.text('Minutos', 105, 45, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Fecha: ${fechaTexto}`, 15, 55);

  doc.setFontSize(10);
  doc.text('Consorcio Píntag Expresso', 135, 55);
  doc.text('Píntag, Antisana S2-138', 135, 60);
  doc.text('consorciopinexpres@hotmail.com', 135, 65);

  const cuerpo = data.map(item => [
    item.unidad || '',
    item.nombre || '',
    `$ ${item.minutosAtraso?.toFixed(2) || '0.00'}`,
    ''
  ]);

  const totalMinutos = data.reduce((sum, item) => sum + (item.minutosAtraso || 0), 0);

  autoTable(doc, {
    head: [['UNIDAD', 'NOMBRE', 'COSTO DE MINUTOS', 'FIRMA']],
    body: cuerpo,
    startY: 75,
    styles: { fontSize: 10 }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.text(`TOTAL MINUTOS: $ ${totalMinutos.toFixed(2)}`, 15, finalY);

  doc.save(`Minutos_${this.fechaPersonalizada}.pdf`);
}

generarPDFAdministracion(data: ReporteConPagos[], fecha: Date) {
  const doc = new jsPDF();
  const fechaTexto = fecha.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

  const logo1 = new Image();
  logo1.src = '/assets/img/LogoPintag.png';
  const logo2 = new Image();
  logo2.src = '/assets/img/LogoAntisana.png';

  doc.addImage(logo1, 'PNG', 15, 10, 25, 25);
  doc.addImage(logo2, 'PNG', 170, 10, 25, 25);

  doc.setFontSize(16);
  doc.text('Administración', 105, 45, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Fecha: ${fechaTexto}`, 15, 55);

  doc.setFontSize(10);
  doc.text('Consorcio Píntag Expresso', 135, 55);
  doc.text('Píntag, Antisana S2-138', 135, 60);
  doc.text('consorciopinexpres@hotmail.com', 135, 65);

  const cuerpo = data.map(item => [
    item.unidad || '',
    item.nombre || '',
    `$ ${item.administracion?.toFixed(2) || '0.00'}`,
    ''
  ]);

  const totalAdministracion = data.reduce((sum, item) => sum + (item.administracion || 0), 0);

  autoTable(doc, {
    head: [['UNIDAD', 'NOMBRE', 'VALOR ADMINISTRACIÓN', 'FIRMA']],
    body: cuerpo,
    startY: 75,
    styles: { fontSize: 10 }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(11);
  doc.text(`TOTAL ADMINISTRACIÓN: $ ${totalAdministracion.toFixed(2)}`, 15, finalY);

  doc.save(`Administracion_${this.fechaPersonalizada}.pdf`);
}


/*--------------------GENERAR PDF FIN -------------------*/

irANuevoRegistro(): void {
    this.router.navigate(['/reportes/nuevo-registro']);
  }

  irAEditar(uid: string, id: string): void {
    this.router.navigate([`/reportes/actualizar`, uid, id]);
  }

  irAPagar(uid: string, id: string): void {
    this.router.navigate([`/reportes/realizar-pago`, uid, id]);
  }

  irACuentasPorCobrar() {
    this.router.navigate(['/reportes/cuentas-por-cobrar']);
  }

  irACierreCaja() {
    this.router.navigate(['/reportes/cierre-caja']);
  }

  volver() {
    this.router.navigate(['']);
  }
}
