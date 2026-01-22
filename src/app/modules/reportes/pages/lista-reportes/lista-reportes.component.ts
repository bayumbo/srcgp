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

  modoVista: 'historico' | 'diario' = 'diario';
  modoActual: 'todos' | 'filtrado' = 'filtrado';
  cargandoPDF: boolean = false;

  reportes: ReporteConPagos[] = [];
  cargando: boolean = true;

  mostrarFiltros = false;
  fechaPersonalizada: string = ''; // yyyy-mm-dd

  // Empresa (solo para PDF Empresas)
  mostrarOpcionesEmpresa = false;
  empresaSeleccionada: string | null = null;
  fechaInicio: string = '';
  fechaFin: string = '';
  errorFecha: string = '';

  // Mensajes
  mostrarMensajeDia: boolean = false;
  mensajeEstadoDia: string = '';

  // Paginación (legacy/histórico)
  paginaActual: number = 1;
  reportesPorPagina: number = 10;
  hayMasReportes: boolean = true;
  cursorStack: any[] = [];
  ultimaFechaCursor: any = null;

  private storage = inject(Storage);
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

    // Pantalla principal: último día generado
    await this.cargarUltimoDiaGenerado();
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

  private startOfWeekISO(date: Date): string {
    const d = new Date(date);
    const day = d.getDay(); // 0 domingo
    const diff = day === 0 ? -6 : 1 - day; // lunes
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return this.toISO(d);
  }

  private endOfWeekISO(date: Date): string {
    const start = new Date(`${this.startOfWeekISO(date)}T12:00:00`);
    start.setDate(start.getDate() + 6);
    return this.toISO(start);
  }

  private startOfMonthISO(date: Date): string {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setHours(0, 0, 0, 0);
    return this.toISO(d);
  }

  private endOfMonthISO(date: Date): string {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    d.setHours(0, 0, 0, 0);
    return this.toISO(d);
  }

  // Visible si cualquier valor asignado/pagado es > 0
  private esRegistroVisible(r: any): boolean {
    const asignados =
      (r.minutosAtraso ?? 0) +
      (r.administracion ?? 0) +
      (r.minutosBase ?? 0) +
      (r.multas ?? 0);

    const pagados =
      (r.minutosPagados ?? 0) +
      (r.adminPagada ?? 0) +
      (r.minBasePagados ?? 0) +
      (r.multasPagadas ?? 0);

    return (asignados + pagados) > 0;
  }

  // ==========================
  // Cargar ÚLTIMO día generado (reportes_dia)
  // ==========================
  async cargarUltimoDiaGenerado() {
    this.cargando = true;
    this.modoVista = 'diario';
    this.modoActual = 'filtrado';
    this.hayMasReportes = false;

    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';

    try {
      // Buscamos el último día generado en reportes_dia (por fecha desc)
      const ref = collection(this.firestore, 'reportes_dia');
      const q = query(ref, orderBy('fecha', 'desc'), limit(1));
      const snap = await getDocs(q);

      if (snap.empty) {
        this.reportes = [];
        this.fechaPersonalizada = '';
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = 'No existen días generados aún en reportes_dia.';
        return;
      }

      const data = snap.docs[0].data() as any;
      const fechaISO = data.fecha as string;

      this.fechaPersonalizada = fechaISO;
      await this.cargarDiaEnListaReportes(fechaISO);
    } catch (e) {
      console.error('❌ Error cargando último día:', e);
      this.reportes = [];
      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = 'Error cargando el último día. Revise consola.';
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Opción A: Día exacto (SOLO registros existentes y visibles)
  // ==========================
  async cargarDiaEnListaReportes(fechaISO: string) {
    this.cargando = true;
    this.modoVista = 'diario';
    this.modoActual = 'filtrado';
    this.hayMasReportes = false;

    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';

    try {
      const [existeP, existeA] = await Promise.all([
        this.reportesDiaService.existeDia('General Pintag' as any, fechaISO),
        this.reportesDiaService.existeDia('Expreso Antisana' as any, fechaISO),
      ]);

      if (!existeP && !existeA) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes generados para el día ${fechaISO}.`;
        return;
      }

      const [regP, regA] = await Promise.all([
        existeP ? this.reportesDiaService.getRegistrosDia('General Pintag' as any, fechaISO) : Promise.resolve([]),
        existeA ? this.reportesDiaService.getRegistrosDia('Expreso Antisana' as any, fechaISO) : Promise.resolve([]),
      ]);

      const regs: any[] = [...regP, ...regA];

      if (regs.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No hay unidades registradas para el día ${fechaISO}.`;
        return;
      }

      // Solo para completar campos visuales
      const [unP, unA] = await Promise.all([
        this.reportesDiaService.getUnidadesPorEmpresa('General Pintag' as any),
        this.reportesDiaService.getUnidadesPorEmpresa('Expreso Antisana' as any),
      ]);
      const mapUnidad = new Map<string, any>();
      [...unP, ...unA].forEach(u => mapUnidad.set(u.id, u));

      const temp: ReporteConPagos[] = regs.map((r: any) => {
        const unidadId = r.unidadId ?? r.id;
        const u = mapUnidad.get(unidadId) ?? null;

        return {
          id: unidadId,
          uid: u?.uidPropietario ?? r.uidPropietario ?? '',
          unidad: u?.codigo ?? r.codigo ?? '',
          nombre: u?.propietarioNombre ?? r.propietarioNombre ?? '',
          apellido: '',

          minutosAtraso: r.minutosAtraso ?? 0,
          administracion: r.administracion ?? 0, // <- no inventar 2
          minutosBase: r.minutosBase ?? 0,
          multas: r.multas ?? 0,

          minutosPagados: r.minutosPagados ?? 0,
          adminPagada: r.adminPagada ?? 0,
          minBasePagados: r.minBasePagados ?? 0,
          multasPagadas: r.multasPagadas ?? 0,

          fechaModificacion: new Date(`${fechaISO}T12:00:00`),
          empresa: r.empresa ?? u?.empresa ?? '',
        } as any;
      });

      const visibles = temp.filter(r => this.esRegistroVisible(r));

      if (visibles.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes con valores para el día ${fechaISO}.`;
        return;
      }

      visibles.sort((a: any, b: any) => {
        const ea = (a.empresa ?? '').toString();
        const eb = (b.empresa ?? '').toString();
        if (ea !== eb) return ea.localeCompare(eb);

        const numA = parseInt((a.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });

      this.reportes = visibles;
      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = `Mostrando reportes del día ${fechaISO}.`;
    } catch (e) {
      console.error('❌ Error cargando día:', e);
      this.reportes = [];
      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = 'Error al cargar el día. Revise consola.';
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Semana/Mes: detallado por fecha (NO acumulado) + visible
  // ==========================
  async cargarRangoDetalladoEnListaReportes(inicioISO: string, finISO: string) {
    this.cargando = true;
    this.modoVista = 'diario';
    this.modoActual = 'filtrado';
    this.hayMasReportes = false;

    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';

    try {
      const dias = await this.reportesDiaService.getDiasEnRango(inicioISO, finISO);

      if (!dias || dias.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes generados entre ${inicioISO} y ${finISO}.`;
        return;
      }

      // Unidades globales solo para completar nombre/código
      const [unP, unA] = await Promise.all([
        this.reportesDiaService.getUnidadesPorEmpresa('General Pintag' as any),
        this.reportesDiaService.getUnidadesPorEmpresa('Expreso Antisana' as any),
      ]);
      const mapUnidad = new Map<string, any>();
      [...unP, ...unA].forEach(u => mapUnidad.set(u.id, u));

      const registrosPorDia = await Promise.all(
        dias.map(d => this.reportesDiaService.getRegistrosDia(d.empresa as any, d.fecha))
      );

      const temp: ReporteConPagos[] = [];

      for (let i = 0; i < dias.length; i++) {
        const dia = dias[i]; // { empresa, fecha, ... }
        const regs = registrosPorDia[i] || [];

        for (const r of regs as any[]) {
          const unidadId = r.unidadId ?? r.id;
          const u = mapUnidad.get(unidadId) ?? null;

          temp.push({
            id: unidadId,
            uid: u?.uidPropietario ?? r.uidPropietario ?? '',
            unidad: u?.codigo ?? r.codigo ?? '',
            nombre: u?.propietarioNombre ?? r.propietarioNombre ?? '',
            apellido: '',

            minutosAtraso: r.minutosAtraso ?? 0,
            administracion: r.administracion ?? 0,
            minutosBase: r.minutosBase ?? 0,
            multas: r.multas ?? 0,

            minutosPagados: r.minutosPagados ?? 0,
            adminPagada: r.adminPagada ?? 0,
            minBasePagados: r.minBasePagados ?? 0,
            multasPagadas: r.multasPagadas ?? 0,

            fechaModificacion: new Date(`${dia.fecha}T12:00:00`),
            empresa: dia.empresa ?? u?.empresa ?? '',
          } as any);
        }
      }

      const visibles = temp.filter(r => this.esRegistroVisible(r));

      if (visibles.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes con valores en el rango ${inicioISO} a ${finISO}.`;
        return;
      }

      // Orden cronológico ascendente -> empresa -> unidad
      visibles.sort((a: any, b: any) => {
        const fa = new Date(a.fechaModificacion).getTime();
        const fb = new Date(b.fechaModificacion).getTime();
        if (fa !== fb) return fa - fb;

        const ea = (a.empresa ?? '').toString();
        const eb = (b.empresa ?? '').toString();
        if (ea !== eb) return ea.localeCompare(eb);

        const numA = parseInt((a.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.unidad ?? '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });

      this.reportes = visibles;

      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = `Mostrando reportes del ${inicioISO} al ${finISO} (ordenado por fecha).`;
    } catch (e) {
      console.error('❌ Error cargando rango:', e);
      this.reportes = [];
      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = 'Error al cargar semana/mes. Revisa consola.';
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Botón: Agregar día (crea día completo en reportes_dia)
  // ==========================
  async agregarDia() {
    try {
      this.creandoDia = true;

      const res = await this.reportesDiaService.agregarDiaCompleto();
      alert(`Día ${res.fecha} creado/actualizado. Nuevos: ${res.creados}. Ya existentes: ${res.omitidos}.`);

      this.fechaPersonalizada = res.fecha;
      await this.cargarDiaEnListaReportes(res.fecha);

    } catch (e) {
      console.error(e);
      alert('Error al agregar día. Revise consola.');
    } finally {
      this.creandoDia = false;
    }
  }

  // ==========================
  // Filtros
  // ==========================
  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    const hoy = new Date();

    if (tipo === 'hoy') {
      const hoyISO = this.toISO(hoy);
      this.fechaPersonalizada = hoyISO;
      await this.cargarDiaEnListaReportes(hoyISO);
      return;
    }

    if (tipo === 'semana') {
      const inicioISO = this.startOfWeekISO(hoy);
      const finISO = this.endOfWeekISO(hoy);
      await this.cargarRangoDetalladoEnListaReportes(inicioISO, finISO);
      return;
    }

    const inicioISO = this.startOfMonthISO(hoy);
    const finISO = this.endOfMonthISO(hoy);
    await this.cargarRangoDetalladoEnListaReportes(inicioISO, finISO);
  }

  async filtrarPorFechaPersonalizada() {
    if (!this.fechaPersonalizada) return;
    await this.cargarDiaEnListaReportes(this.fechaPersonalizada);
  }

  // ==========================
  // Empresa (solo para Reporte Empresas PDF)
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
        this.actualizarVistaPorRangoLegacy(); // para PDF empresas actual usa legacy: lo dejamos
      }
    }
  }

  // Mantengo tu flujo actual (legacy) solo para reporte empresas si lo necesitas.
  // Si ya lo migraste a reportes_dia, luego lo cambiamos.
  actualizarVistaPorRangoLegacy() {
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
    return snapshot.docs.map(d => d.id);
  }

  // ==========================
  // LEGACY (histórico) - se mantiene por compatibilidad
  // ==========================
  async cargarTodosLosReportes(direccion: 'siguiente' | 'anterior' = 'siguiente') {
    this.cargando = true;
    this.modoVista = 'historico';
    this.modoActual = 'todos';

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
          unidad: data.unidad ?? '',
          nombre: (userData as any)['nombres'] ?? '',
          apellido: (userData as any)['apellidos'] ?? '',
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
      console.error('❌ Error en paginación legacy:', error);
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
          const detalles = (pago as any)['detalles'] ?? {};
          minutosPagados += detalles.minutosAtraso || 0;
          adminPagada += detalles.administracion || 0;
          minBasePagados += detalles.minutosBase || 0;
          multasPagadas += detalles.multas || 0;
        });

        const fechaModificacion = (data.fechaModificacion as unknown as Timestamp)?.toDate() ?? new Date();

        tempReportes.push({
          ...(data as any),
          id,
          uid,
          nombre: (userData as any)['nombres'] ?? '',
          apellido: (userData as any)['apellidos'] ?? '',
          unidad: data.unidad ?? (userData as any)['unidad'] ?? '',
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
      console.error('Error al consultar por rango legacy:', error);
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // PDFs (Minutos / Administración)
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
    const filtrado = data.filter(r => (r.minutosAtraso ?? 0) > 0);

    if (filtrado.length === 0) {
      alert('No hay valores de minutos para imprimir en esta vista.');
      return;
    }

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

    const cuerpo = filtrado.map(item => [
      item.unidad || '',
      item.nombre || '',
      `$ ${Number(item.minutosAtraso ?? 0).toFixed(2)}`,
      ''
    ]);

    const totalMinutos = filtrado.reduce((sum, item) => sum + (item.minutosAtraso || 0), 0);

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
    const filtrado = data.filter(r => (r.administracion ?? 0) > 0);

    if (filtrado.length === 0) {
      alert('No hay valores de administración para imprimir en esta vista.');
      return;
    }

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

    const cuerpo = filtrado.map(item => [
      item.unidad || '',
      item.nombre || '',
      `$ ${Number(item.administracion ?? 0).toFixed(2)}`,
      ''
    ]);

    const totalAdministracion = filtrado.reduce((sum, item) => sum + (item.administracion || 0), 0);

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
  // Eliminar reporte (legacy/histórico)
  // ==========================
  async eliminarReporte(reporte: any) {
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
  // Navegación
  // ==========================
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

  // ==========================
  // PDF Empresas (tu implementación se mantiene)
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
    this.cargandoPDF = true;
    if (!this.empresaSeleccionada || this.errorFecha) {
      this.cargandoPDF = false;
      return;
    }

    const inicio = new Date(`${this.fechaInicio}T12:00:00`);
    const fin = new Date(`${this.fechaFin}T12:00:00`);

    const fechaEmision = new Date();
    const docPDF = new jsPDF({ orientation: 'landscape' });

    docPDF.setFontSize(18);
    docPDF.text(`Reporte ${this.empresaSeleccionada}`, 105, 20, { align: 'center' });

    docPDF.setFontSize(12);
    docPDF.text(`Fecha de inicio: ${inicio.toLocaleDateString('es-EC')}`, 15, 30);
    docPDF.text(`Fecha de finalización: ${fin.toLocaleDateString('es-EC')}`, 15, 36);
    docPDF.text(`Fecha de emisión: ${fechaEmision.toLocaleDateString('es-EC')}`, 15, 42);

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
        const numA = parseInt(String(a).replace(/\D/g, '')) || 0;
        const numB = parseInt(String(b).replace(/\D/g, '')) || 0;
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
      docPDF.setFontSize(14);
      docPDF.text(`${modulo.nombre} Asignados`, 15, currentY);
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

      autoTable(docPDF, {
        startY: currentY,
        head: [['UNIDAD', ...fechasArray, 'TOTAL']],
        body: bodyAsignados,
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fontSize: 7.5, fillColor: [41, 128, 185], halign: 'center' },
        margin: { left: 15, right: 15 },
        didDrawPage: data => { if (data.cursor) currentY = data.cursor.y + 10; return true; }
      });

      docPDF.setFontSize(12);
      docPDF.text(`${modulo.nombre} Adeudados`, 15, currentY);
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

      autoTable(docPDF, {
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

    docPDF.setFontSize(14);
    docPDF.text('Resumen Final por Módulo', 15, currentY);
    currentY += 6;

    autoTable(docPDF, {
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

    docPDF.save(`Reporte_${this.empresaSeleccionada}_${this.fechaInicio}_al_${this.fechaFin}.pdf`);
    this.cargandoPDF = false;
  }
}
