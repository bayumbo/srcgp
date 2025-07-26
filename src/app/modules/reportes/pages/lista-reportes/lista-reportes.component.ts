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
  collectionGroup,
  deleteDoc,
  startAfter,
  limit,
  startAt,
  getDoc
} from '@angular/fire/firestore';
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Pago } from 'src/app/core/interfaces/pago.interface';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthService } from 'src/app/core/auth/services/auth.service'; 
import {ref, deleteObject, Storage } from '@angular/fire/storage';

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss'],
  
})
export class ReporteListaComponent implements OnInit {

  esSocio: boolean = false;
  modoActual: 'todos' | 'filtrado' = 'todos'; // 👈 para saber si estás en modo paginado o con filtro

  reportes: ReporteConPagos[] = [];
  cargando: boolean = true;
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
  private storage = inject(Storage);
  hayMasReportes: boolean = true;
  private cacheUsuarios = new Map<string, any>();
  
  constructor(
    private authService: AuthService // ⬅️ Agrega esto
    
  ) {}


  

  private firestore = inject(Firestore);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
  this.authService.currentUserRole$.subscribe(role => {
    this.esSocio = role === 'socio';
  });

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




cursorStack: any[] = []; 
ultimaFechaCursor: any = null; 


async cargarTodosLosReportes(direccion: 'siguiente' | 'anterior' = 'siguiente') {
  this.cargando = true;

  try {
    let baseQuery = query(
      collectionGroup(this.firestore, 'reportesDiarios'),
      orderBy('fechaModificacion', 'desc')
    );

    if (direccion === 'siguiente' && this.ultimaFechaCursor) {
      baseQuery = query(baseQuery, startAfter(this.ultimaFechaCursor), limit(this.reportesPorPagina));
    } else if (direccion === 'anterior' && this.cursorStack.length >= 2) {
      this.cursorStack.pop();
      const anteriorDoc = this.cursorStack[this.cursorStack.length - 1];
      baseQuery = query(baseQuery, startAt(anteriorDoc), limit(this.reportesPorPagina));
      this.ultimaFechaCursor = anteriorDoc;
      this.paginaActual--;
    } else {
      baseQuery = query(baseQuery, limit(this.reportesPorPagina));
    }

    const snapshot = await getDocs(baseQuery);
    if (snapshot.empty) {
      this.hayMasReportes = false;
      this.cargando = false;
      return;
    }

    const tempReportes: ReporteConPagos[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;
      const uid = docSnap.ref.parent.parent?.id ?? '';

      // ✅ Obtener unidad directamente desde el campo del reporte
      const unidad = data.unidad ?? '';

      // Obtener datos del usuario
      const userRef = doc(this.firestore, `usuarios/${uid}`);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};

      // Cargar pagos
      const pagosRef = fsCollection(this.firestore, `usuarios/${uid}/reportesDiarios/${id}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);

      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;

      pagosSnap.forEach(pagoDoc => {
        const detalles = pagoDoc.data()['detalles'] ?? {};
        minutosPagados += detalles.minutosAtraso || 0;
        adminPagada += detalles.administracion || 0;
        minBasePagados += detalles.minutosBase || 0;
        multasPagadas += detalles.multas || 0;
      });

      const fechaModificacion = (data.fechaModificacion as unknown as Timestamp)?.toDate() ?? new Date();

      // 🧾 Log de verificación
      console.log(`🔍 Reporte ID: ${id} | UID: ${uid} | Unidad: ${unidad}`);

      tempReportes.push({
        id,
        uid,
        unidad,
        nombre: userData['nombres'] ?? '',
        apellido: userData['apellidos'] ?? '',
        minutosAtraso: data.minutosAtraso ?? 0,
        administracion: data.administracion ?? 0,
        minutosBase: data.minutosBase ?? 0,
        multas: data.multas ?? 0,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas,
        fechaModificacion
      });
    }

    const firstDoc = snapshot.docs[0];
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (direccion === 'siguiente') {
      if (this.cursorStack.length > 0) this.paginaActual++;
      this.cursorStack.push(firstDoc);
      this.ultimaFechaCursor = lastDoc;
    } else if (direccion !== 'anterior') {
      this.cursorStack = [firstDoc];
      this.ultimaFechaCursor = lastDoc;
      this.paginaActual = 1;
    }

    console.log('🧾 Página', this.paginaActual, tempReportes.map(r => r.nombre));

    this.reportes = tempReportes;
    this.hayMasReportes = snapshot.docs.length === this.reportesPorPagina;

  } catch (error) {
    console.error('❌ Error en paginación:', error);
  } finally {
    this.cargando = false;
  }
}


  async consultarReportesEnRango(fechaInicio: Date, fechaFin: Date) {
  this.cargando = true;
  this.cursorStack = [];
  this.ultimaFechaCursor = null;
  this.paginaActual = 1;
  this.hayMasReportes = false;
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

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;
      const pathParts = docSnap.ref.path.split('/');
      const uid = pathParts[1];

      if (uidsValidos && !uidsValidos.includes(uid)) continue;

      // Obtener datos del usuario
      const userRef = doc(this.firestore, `usuarios/${uid}`);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};

      // Obtener pagos
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

      const fechaModificacion = (data.fechaModificacion as unknown as Timestamp)?.toDate() ?? new Date();

      tempReportes.push({
        ...data,
        id,
        uid,
        nombre: userData['nombres'] ?? '',
        apellido: userData['apellidos'] ?? '',
        unidad: data.unidad ?? userData['unidad'] ?? '',
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas,
        fechaModificacion
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

  async eliminarReporte(reporte: any) {
      const fecha = reporte.fechaModificacion?.toDate?.().toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) || 'Sin fecha';
   const confirmar = confirm(`¿Deseas eliminar el reporte de ${reporte.nombre} del ${fecha}?`);
    if (!confirmar) return;

    try {
      const uid = reporte.uid;
      const reporteId = reporte.id;

      // 1. Eliminar subcolección pagosTotales
      const pagosRef = collection(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);
      for (const docPago of pagosSnap.docs) {
        await deleteDoc(docPago.ref);
      }

      // 2. Eliminar el PDF en Storage si existe
      if (reporte.urlPDF) {
        const pdfRef = ref(this.storage, reporte.urlPDF);
        await deleteObject(pdfRef);
      }

      // 3. Eliminar el documento principal del reporte
      const reporteRef = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}`);
      await deleteDoc(reporteRef);
      await this.cargarTodosLosReportes();
      alert('Reporte eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar reporte:', error);
      alert('Ocurrió un error al eliminar el reporte');
    }
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
  doc.text(`Fecha de inicio: ${inicio.toLocaleDateString('es-EC')}`, 15, 30);
  doc.text(`Fecha de finalización: ${fin.toLocaleDateString('es-EC')}`, 15, 36);
  doc.text(`Fecha de emisión: ${fechaEmision.toLocaleDateString('es-EC')}`, 15, 42);

  // ✅ Generar fechas ordenadas cronológicamente
  const fechasArray: string[] = [];
  let actual = new Date(inicio);
  while (actual <= fin) {
    fechasArray.push(actual.toLocaleDateString('es-EC', {
       day: '2-digit'
    }));
    actual.setDate(actual.getDate() + 1);
  }

  const unidades = [...new Set(this.reportes.map(r => r.unidad))];
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

    let totalAsignadoModulo = 0;
    let totalSaldoModulo = 0;

    // ✅ TABLA 1: ASIGNADOS
    const bodyAsignados = unidades.map(unidad => {
      const row: (string | number)[] = [unidad || ''];
      let total = 0;

      for (const fecha of fechasArray) {
        const registros = this.reportes.filter(r => {
          const fechaRep = (r.fechaModificacion as any)?.toDate?.() ?? r.fechaModificacion;
          const fechaFormateada = fechaRep instanceof Date
            ? fechaRep.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : typeof fechaRep === 'string' ? fechaRep : '';

          return r.unidad === unidad && fechaFormateada === fecha;
        });

        const suma = registros.reduce((acc, r) => acc + (Number(r[modulo.campo as keyof ReporteConPagos]) || 0), 0);
        row.push(`$${Math.round(2)}`);

        total += suma;
      }

      totalAsignadoModulo += total;
      row.push(`$${Math.round(2)}`);

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

    // ✅ TABLA 2: ADEUDADOS
    doc.setFontSize(12);
    doc.text(`${modulo.nombre.replace('Asignados', 'Adeudados')}`, 15, currentY);
    currentY += 6;

    const bodyPorCobrar = unidades.map(unidad => {
      const row: (string | number)[] = [unidad || ''];
      let total = 0;

      for (const fecha of fechasArray) {
        const registros = this.reportes.filter(r => {
          const fechaRep = (r.fechaModificacion as any)?.toDate?.() ?? r.fechaModificacion;
          const fechaFormateada = fechaRep instanceof Date
            ? fechaRep.toLocaleDateString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : typeof fechaRep === 'string' ? fechaRep : '';

          return r.unidad === unidad && fechaFormateada === fecha;
        });

        const asignado = registros.reduce((acc, r) => acc + (Number(r[modulo.campo as keyof ReporteConPagos]) || 0), 0);
        const pagado = registros.reduce((acc, r) => acc + (Number(r[modulo.pagado as keyof ReporteConPagos]) || 0), 0);
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
      styles: { fontSize: 7 },
      margin: { left: 15, right: 15 },
      didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
    });

    resumenFinal.push([
      modulo.nombre,
      totalAsignadoModulo,
      totalSaldoModulo,
      totalAsignadoModulo - totalSaldoModulo
    ]);
  }

  // ✅ RESUMEN FINAL
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

  
  /*---------------------------- PDF REPORTE EMPRESA FIN------------------------- */

  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    this.modoActual = 'filtrado';
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
    this.modoActual = 'filtrado';
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
  limpiarFiltros() {
  this.fechaPersonalizada = '';
  this.fechaInicio = '';
  this.fechaFin = '';
  this.empresaSeleccionada = null;
  this.errorFecha = '';
  this.modoActual = 'todos';
  this.cursorStack = [];
  this.ultimaFechaCursor = null;
  this.paginaActual = 1;
  this.hayMasReportes = true;
  this.cargarTodosLosReportes();
}

  volver() {
    this.router.navigate(['']);
  }
}
