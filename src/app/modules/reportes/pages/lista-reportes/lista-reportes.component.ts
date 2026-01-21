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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { ref, deleteObject, Storage } from '@angular/fire/storage';
import { ReportesDiaService } from '../../services/reportes-dia.service';

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss'],
})
export class ReporteListaComponent implements OnInit {
  creandoDia = false;
  esSocio: boolean = false;

  // Nuevo: modo de vista
  modoVista: 'historico' | 'diario' = 'historico';

  modoActual: 'todos' | 'filtrado' = 'todos'; // se mantiene para tu lógica existente
  cargandoPDF: boolean = false;

  reportes: ReporteConPagos[] = [];
  cargando: boolean = true;

  mostrarFiltros = false;
  fechaPersonalizada: string = ''; // yyyy-mm-dd (por input type=date)

  // Empresa
  mostrarOpcionesEmpresa = false;
  empresaSeleccionada: string | null = null;
  fechaInicio: string = '';
  fechaFin: string = '';
  errorFecha: string = '';

  // Paginación (histórico)
  paginaActual: number = 1;
  reportesPorPagina: number = 5;
  private storage = inject(Storage);
  hayMasReportes: boolean = true;
  private cacheUsuarios = new Map<string, any>();

  cursorStack: any[] = [];
  ultimaFechaCursor: any = null;

  private firestore = inject(Firestore);
  private router = inject(Router);

  constructor(
    private authService: AuthService,
    private reportesDiaService: ReportesDiaService
  ) {}

  async ngOnInit(): Promise<void> {
    this.authService.currentUserRole$.subscribe(role => {
      this.esSocio = role === 'socio';
    });

    // Por defecto, carga el histórico como lo venías haciendo
    await this.cargarTodosLosReportes();
  }

  // ==========================
  // Helpers de fecha
  // ==========================
  private toISO(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ==========================
  // NUEVO: Cargar vista DIARIA desde reportes_dia
  // ==========================
  async cargarDiaEnListaReportes(fechaISO: string) {
    this.cargando = true;
    this.modoVista = 'diario';
    this.hayMasReportes = false; // en diario no hay paginación (muestras todas)

    try {
      // 1) traer unidades globales activas de ambas empresas (ordenadas)
      const [unP, unA] = await Promise.all([
        this.reportesDiaService.getUnidadesPorEmpresa('General Pintag'),
        this.reportesDiaService.getUnidadesPorEmpresa('Expreso Antisana'),
      ]);

      const unidades = [...unP, ...unA];

      // 2) traer docs ya creados del día
      const [regP, regA] = await Promise.all([
        this.reportesDiaService.getRegistrosDia('General Pintag', fechaISO),
        this.reportesDiaService.getRegistrosDia('Expreso Antisana', fechaISO),
      ]);

      const regs = [...regP, ...regA];
      const mapReg = new Map<string, any>();
      regs.forEach(r => mapReg.set(r.unidadId ?? r.id, r));

      // 3) mapear a tu interfaz ReporteConPagos (para que la tabla actual funcione)
      const temp: ReporteConPagos[] = unidades.map((u: any) => {
        const r = mapReg.get(u.id);

        const administracion = r?.administracion ?? 2;
        const minutosBase = r?.minutosBase ?? 0;
        const minutosAtraso = r?.minutosAtraso ?? 0;
        const multas = r?.multas ?? 0;

        const adminPagada = r?.adminPagada ?? 0;
        const minBasePagados = r?.minBasePagados ?? 0;
        const minutosPagados = r?.minutosPagados ?? 0;
        const multasPagadas = r?.multasPagadas ?? 0;

        // En el modo diario no existe uid+id legacy; usamos unidadId como id
        return {
          id: u.id,                // <- unidadId
          uid: u.uidPropietario ?? '', // para mantener estructura (si tu HTML lo usa)
          unidad: u.codigo ?? '',
          nombre: u.propietarioNombre ?? '',
          apellido: '',

          minutosAtraso,
          administracion,
          minutosBase,
          multas,

          minutosPagados,
          adminPagada,
          minBasePagados,
          multasPagadas,

          // usamos fecha del día como fechaModificacion para reusar UI/PDF
          fechaModificacion: new Date(`${fechaISO}T12:00:00`),

          // opcional: guarda empresa para ordenar o filtrar en HTML si quieres
          empresa: u.empresa ?? '',
        } as any;
      });

      // 4) ordenar por empresa y numeroOrden (si tu tabla depende de unidad asc, igual queda)
      temp.sort((a: any, b: any) => {
        const ea = (a.empresa ?? '').toString();
        const eb = (b.empresa ?? '').toString();
        if (ea !== eb) return ea.localeCompare(eb);

        // orden por número extraído de unidad: E01, P03, etc.
        const numA = parseInt((a.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });

      this.reportes = temp;
      this.modoActual = 'filtrado'; // para que tu UI no intente paginar

    } catch (e) {
      console.error('❌ Error cargando día:', e);
      alert('Error al cargar el día. Revise consola.');
      this.reportes = [];
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Botón: Agregar día
  // ==========================
  async agregarDia() {
    try {
      this.creandoDia = true;

      const res = await this.reportesDiaService.agregarDiaCompleto();
      alert(`Día ${res.fecha} creado/actualizado. Nuevos: ${res.creados}. Ya existentes: ${res.omitidos}.`);

      // Cargar inmediatamente el día creado
      await this.cargarDiaEnListaReportes(res.fecha);

      // setear también el input de fecha personalizada para que coincida con la vista
      this.fechaPersonalizada = res.fecha;

    } catch (e) {
      console.error(e);
      alert('Error al agregar día. Revise consola.');
    } finally {
      this.creandoDia = false;
    }
  }

  // ==========================
  // Lógica existente (HISTÓRICO)
  // ==========================
  async cargarTodosLosReportes(direccion: 'siguiente' | 'anterior' = 'siguiente') {
    this.cargando = true;
    this.modoVista = 'historico';

    try {
      let baseQuery = query(
        collectionGroup(this.firestore, 'reportesDiarios'),
        orderBy('fechaModificacion', 'desc'),
        orderBy('unidad', 'asc')
      );

      this.reportesPorPagina = 10;

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
        const unidad = data.unidad ?? '';

        const userRef = doc(this.firestore, `usuarios/${uid}`);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

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

      const refQ = query(
        collectionGroup(this.firestore, 'reportesDiarios'),
        where('fechaModificacion', '>=', start),
        where('fechaModificacion', '<=', end),
        orderBy('fechaModificacion', 'desc'),
        orderBy('unidad', 'asc')
      );

      const snapshot = await getDocs(refQ);
      const tempReportes: ReporteConPagos[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as NuevoRegistro;
        const id = docSnap.id;
        const pathParts = docSnap.ref.path.split('/');
        const uid = pathParts[1];

        if (uidsValidos && !uidsValidos.includes(uid)) continue;

        const userRef = doc(this.firestore, `usuarios/${uid}`);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

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

  // ==========================
  // Filtros: ahora en modo DIARIO
  // ==========================
  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    // Nueva lógica: si quieres que hoy/semana/mes sigan siendo HISTÓRICO, déjalo como estaba.
    // Pero por tu requerimiento de operación diaria instantánea, "hoy" debe cargar diario.

    if (tipo === 'hoy') {
      const hoyISO = this.toISO(new Date());
      this.fechaPersonalizada = hoyISO;
      await this.cargarDiaEnListaReportes(hoyISO);
      return;
    }

    // Semana/Mes: por ahora conserva histórico (porque diario sería por día, no rango)
    // Si quieres semana/mes en diario, se hace con lectura múltiple (y aún sería rápido).
    this.modoActual = 'filtrado';

    const hoy = new Date();
    let fechaInicio: Date;
    let fechaFin: Date;

    if (tipo === 'semana') {
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

    // En vez de histórico por rango, cargar el día exacto
    await this.cargarDiaEnListaReportes(this.fechaPersonalizada);
  }

  // ==========================
  // Empresa (se mantiene)
  // ==========================
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

  async obtenerUIDsPorEmpresa(nombreEmpresa: string): Promise<string[]> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('empresa', '==', nombreEmpresa));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.id);
  }

  // ==========================
  // PDFs: se mantienen iguales
  // ==========================
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

  generarPDFMinutos(data: ReporteConPagos[], fecha: Date) {
    fecha.setHours(0, 0, 0, 0);
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
    fecha.setHours(0, 0, 0, 0);
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

  // ==========================
  // Eliminar reporte (solo histórico)
  // ==========================
  async eliminarReporte(reporte: any) {
    // Si estamos en modo diario, no se elimina desde aquí
    if (this.modoVista === 'diario') {
      alert('En modo diario no se eliminan registros. Si necesitas, lo manejamos como “desactivar unidad” o “reset”.');
      return;
    }

    const fecha = (reporte.fechaModificacion instanceof Date
      ? reporte.fechaModificacion
      : (reporte.fechaModificacion as any)?.toDate?.())?.toLocaleDateString('es-EC', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
      }) ?? 'Sin Fecha';

    const confirmar = confirm(`¿Deseas eliminar el reporte de ${reporte.nombre} del ${fecha}?`);
    if (!confirmar) return;

    try {
      const uid = reporte.uid;
      const reporteId = reporte.id;

      const pagosRef = collection(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);
      for (const docPago of pagosSnap.docs) {
        await deleteDoc(docPago.ref);
      }

      if (reporte.urlPDF) {
        const pdfRef = ref(this.storage, reporte.urlPDF);
        await deleteObject(pdfRef);
      }

      const reporteRef = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}`);
      await deleteDoc(reporteRef);

      await this.cargarTodosLosReportes();
      alert('Reporte eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar reporte:', error);
      alert('Ocurrió un error al eliminar el reporte');
    }
  }

  // ==========================
  // Navegación (sin cambios)
  // ==========================
  irANuevoRegistro(): void {
    this.router.navigate(['/reportes/nuevo-registro']);
  }

  irAEditar(uid: string, id: string): void {
    this.router.navigate([`/reportes/actualizar`, uid, id]);
  }

  irAPagar(uid: string, id: string): void {
    // En modo diario no hay pago por documento legacy; se pagará desde flujo de pagos (lo vemos luego)
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

    // volver a histórico
    this.modoVista = 'historico';
    this.cursorStack = [];
    this.ultimaFechaCursor = null;
    this.paginaActual = 1;
    this.hayMasReportes = true;

    this.cargarTodosLosReportes();
  }

  volver() {
    this.router.navigate(['']);
  }

  // ==========================
  // PDF Empresa: se mantiene igual (tu código está abajo)
  // ==========================
  private agruparDatosParaPDF(): Map<string, Map<string, any>> {
    const agrupado = new Map<string, Map<string, any>>();

    for (const reporte of this.reportes) {
      const unidad = reporte.unidad || 'SIN_UNIDAD';
      const fecha = (reporte.fechaModificacion instanceof Date
        ? reporte.fechaModificacion
        : (reporte.fechaModificacion as any)?.toDate?.())?.toLocaleDateString('es-EC', {
          month: '2-digit',
          day: '2-digit'
        }) ?? 'Sin Fecha';

      if (!agrupado.has(unidad)) agrupado.set(unidad, new Map());
      const fechasMap = agrupado.get(unidad)!;

      if (!fechasMap.has(fecha)) {
        fechasMap.set(fecha, {
          minutosAtraso: 0,
          minutosPagados: 0,
          administracion: 0,
          adminPagada: 0,
          minutosBase: 0,
          minBasePagados: 0,
          multas: 0,
          multasPagadas: 0
        });
      }

      const valores = fechasMap.get(fecha)!;

      valores.minutosAtraso += reporte.minutosAtraso || 0;
      valores.minutosPagados += reporte.minutosPagados || 0;
      valores.administracion += reporte.administracion || 0;
      valores.adminPagada += reporte.adminPagada || 0;
      valores.minutosBase += reporte.minutosBase || 0;
      valores.minBasePagados += reporte.minBasePagados || 0;
      valores.multas += reporte.multas || 0;
      valores.multasPagadas += reporte.multasPagadas || 0;
    }

    return agrupado;
  }

  async generarReporteEmpresasPDF() {
    // Tu implementación actual (sin cambios)
    this.cargandoPDF = true;
    if (!this.empresaSeleccionada || this.errorFecha) return;

    const inicio = new Date(`${this.fechaInicio}T12:00:00`);
    const fin = new Date(`${this.fechaFin}T12:00:00`);

    const fechaEmision = new Date();
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(18);
    doc.text(`Reporte ${this.empresaSeleccionada}`, 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`Fecha de inicio: ${inicio.toLocaleDateString('es-EC')}`, 15, 30);
    doc.text(`Fecha de finalización: ${fin.toLocaleDateString('es-EC')}`, 15, 36);
    doc.text(`Fecha de emisión: ${fechaEmision.toLocaleDateString('es-EC')}`, 15, 42);

    const fechasArray: string[] = [];
    let actual = new Date(inicio);
    while (actual <= fin) {
      fechasArray.push(actual.toLocaleDateString('es-EC', {
        month: '2-digit',
        day: '2-digit'
      }));
      actual.setDate(actual.getDate() + 1);
    }

    const unidades = [...new Set(this.reportes.map(r => r.unidad))]
      .filter(Boolean)
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    const agrupado = this.agruparDatosParaPDF();

    const modulos = [
      { nombre: 'Minutos', campo: 'minutosAtraso', pagado: 'minutosPagados' },
      { nombre: 'Administración', campo: 'administracion', pagado: 'adminPagada' },
      { nombre: 'Minutos Base', campo: 'minutosBase', pagado: 'minBasePagados' },
      { nombre: 'Multas', campo: 'multas', pagado: 'multasPagadas' }
    ];

    let currentY = 50;
    const resumenFinal: [string, number, number, number][] = [];

    for (const modulo of modulos) {
      doc.setFontSize(14);
      doc.text(`${modulo.nombre} Asignados`, 15, currentY);
      currentY += 6;

      let totalAsignado = 0;
      let totalSaldo = 0;

      const bodyAsignados: (string | number)[][] = [];

      for (const unidad of unidades) {
        const row: (string | number)[] = [unidad || ''];
        let totalUnidad = 0;

        for (const fecha of fechasArray) {
          const datos = agrupado.get(unidad)?.get(fecha);
          const valor = datos?.[modulo.campo] || 0;
          row.push(`$${Math.round(valor)}`);
          totalUnidad += valor;
        }

        row.push(`$${Math.round(totalUnidad)}`);
        totalAsignado += totalUnidad;
        bodyAsignados.push(row);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      autoTable(doc, {
        startY: currentY,
        head: [['UNIDAD', ...fechasArray, 'TOTAL']],
        body: bodyAsignados,
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fontSize: 7.5, fillColor: [41, 128, 185], halign: 'center' },
        margin: { left: 15, right: 15 },
        didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
      });

      doc.setFontSize(12);
      doc.text(`${modulo.nombre} Adeudados`, 15, currentY);
      currentY += 6;

      const bodyAdeudados: (string | number)[][] = [];

      for (const unidad of unidades) {
        const row: (string | number)[] = [unidad || ''];
        let totalUnidad = 0;

        for (const fecha of fechasArray) {
          const datos = agrupado.get(unidad)?.get(fecha);
          const asignado = datos?.[modulo.campo] || 0;
          const pagado = datos?.[modulo.pagado] || 0;
          const saldo = asignado - pagado;
          row.push(`$${Math.round(saldo)}`);
          totalUnidad += saldo;
        }

        row.push(`$${Math.round(totalUnidad)}`);
        totalSaldo += totalUnidad;
        bodyAdeudados.push(row);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      autoTable(doc, {
        startY: currentY,
        head: [['UNIDAD', ...fechasArray, 'TOTAL']],
        body: bodyAdeudados,
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fontSize: 7.5, fillColor: [41, 128, 185], halign: 'center' },
        margin: { left: 15, right: 15 },
        didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
      });

      const totalPagado = totalAsignado - totalSaldo;

      resumenFinal.push([
        modulo.nombre,
        totalAsignado,
        totalSaldo,
        totalPagado
      ]);
    }

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
    this.cargandoPDF = false;
  }
}
