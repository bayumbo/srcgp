
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  collectionGroup,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  where,
} from '@angular/fire/firestore';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { AuthService } from 'src/app/core/auth/services/auth.service';
import { ReportesDiaService } from '../../services/reportes-dia.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import * as XLSX from 'xlsx';


type EmpresaNombre = 'General Pintag' | 'Expreso Antisana';

type ReporteListaRow = ReporteConPagos & {
  fechaISO: string;
  empresaKey: string;

  // DocId real del doc dentro de subcolección "unidades"
  unidadDocId: string;

  // Código visual: "E13"
  codigo: string;

  // Ruta exacta al doc a borrar
  refPath: string;

  // Campos canónicos (según tu estructura)
  uidPropietario: string;
  propietarioNombre: string;
};

type FilaExcelMinutos = {
  unidad: string;   // E01 / P01
  fecha: string;    // YYYY-MM-DD
  valor: number;    // número
};

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss'],
})
export class ReporteListaComponent implements OnInit {
  // =========================
  // UI state
  // =========================
  creandoDia = false;
  cargando = true;
  cargandoEliminacion = false;
  eliminandoDia: boolean = false;

  esSocio = false;

  // Mensajes
  mostrarMensajeDia = false;
  mensajeEstadoDia = '';

  // Filtros
  mostrarFiltros = false;
  fechaPersonalizada = ''; // yyyy-mm-dd

  // Reporte empresas (restaurado)
  mostrarOpcionesEmpresa = false;
  empresaSeleccionada: EmpresaNombre | null = null;
  fechaInicio = '';
  fechaFin = '';
  errorFecha = '';

  // Reporte financiero (formato administrativo) - CONSOLIDA ambas empresas
  mostrarOpcionesFinanciero = false;
  periodoFinanciero: 'mensual' | 'trimestral' | 'semestral' | 'nonamestral' | 'anual' = 'mensual';
  fechaInicioFinanciero = ''; // YYYY-MM-DD (seleccionada)
  fechaFinFinanciero = '';    // YYYY-MM-DD (calculada)
  cargandoPDF = false;

  // Data
  reportes: ReporteListaRow[] = [];

  // Selección múltiple
  seleccion = new Set<string>();
  seleccionarTodo = false;

  // Excel
  subiendoExcel: boolean = false;
  progresoExcel: { total: number; ok: number; fail: number } = { total: 0, ok: 0, fail: 0 };

  // =========================
  // MODALES: Agregar/Eliminar día (fecha puntual)
  // =========================
  mostrarModalAgregarDia: boolean = false;
  fechaNuevaDia: string = ''; // YYYY-MM-DD
  errorCrearDia: string = '';

  mostrarModalEliminarDia: boolean = false;
  fechaEliminarDia: string = ''; // YYYY-MM-DD
  errorEliminarDia: string = '';
fechaSeleccionada: string = '';

  // =========================
  // Injections
  // =========================
  private firestore = inject(Firestore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private nombrePorUnidad = new Map<string, string>();
  private nombresCargados = false;

  moduloActivo: 'cobros' | 'cierre' | null = null;

  constructor(
    private authService: AuthService,
    private reportesDiaService: ReportesDiaService
  ) {}

async ngOnInit(): Promise<void> {
  this.authService.currentUserRole$.subscribe(role => {
    this.esSocio = role === 'socio';
  });

  // ✅ 1) Si viene fecha por URL, manda esa fecha (al volver desde editar)
  const fechaQP = (this.route.snapshot.queryParamMap.get('fecha') ?? '').toString().trim();

  if (fechaQP) {
    await this.cargarDiaEnListaReportes(fechaQP);
    return;
  }

  // ✅ 2) Si no viene fecha, comportamiento normal (último día generado)
  await this.cargarUltimoDiaGenerado();

  // ✅ 3) (RECOMENDADO) fijar el día cargado en la URL (para que F5 no lo pierda)
  if (this.fechaSeleccionada) {
    this.router.navigate([], {
      queryParams: { fecha: this.fechaSeleccionada },
      replaceUrl: true
    });
  }
}



  // ==========================
  // Helpers
  // ==========================
  private toISO(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private hoyISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  private empresaToKey(empresa: string): string {
    return (empresa || '').replace(/\s+/g, '').trim();
  }

  private diaDocId(empresaKey: string, fechaISO: string): string {
    return `${empresaKey}_${fechaISO}`;
  }

  private unidadDocIdFromCodigo(empresaKey: string, codigo: string): string {
    return `${empresaKey}_${(codigo || '').toString().trim()}`;
  }

  private keyDeFila(r: Pick<ReporteListaRow, 'empresaKey' | 'fechaISO' | 'unidadDocId'>): string {
    return `${r.empresaKey}|${r.fechaISO}|${r.unidadDocId}`;
  }

  trackByReporte = (_: number, r: ReporteListaRow) => this.keyDeFila(r);

  private normUnidad(u: any): string {
    return (u ?? '').toString().trim().toUpperCase();
  }

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

  private ordenarPorEmpresaUnidad(a: any, b: any): number {
    const ea = (a.empresa ?? '').toString();
    const eb = (b.empresa ?? '').toString();
    if (ea !== eb) return ea.localeCompare(eb);

    const ca = (a.codigo ?? a.unidad ?? '').toString();
    const cb = (b.codigo ?? b.unidad ?? '').toString();
    const numA = parseInt(ca.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(cb.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  }

  private ordenarPorFechaEmpresaUnidad(a: any, b: any): number {
    const fa = new Date(`${a.fechaISO}T12:00:00`).getTime();
    const fb = new Date(`${b.fechaISO}T12:00:00`).getTime();
    if (fa !== fb) return fa - fb;
    return this.ordenarPorEmpresaUnidad(a, b);
  }

  // ==========================
  // Maestro nombres (para Excel)
  // ==========================
  private async cargarMaestroNombresUnidades(): Promise<void> {
    if (this.nombresCargados) return;

    this.nombrePorUnidad.clear();

    const ref = collection(this.firestore, 'unidades');
    const snap = await getDocs(ref);

    snap.forEach(docSnap => {
      const data: any = docSnap.data();
      const codigo = this.normUnidad(data.codigo || '');
      const nombre = (data.propietarioNombre ?? '').toString().trim();
      if (codigo && nombre) this.nombrePorUnidad.set(codigo, nombre);
    });

    this.nombresCargados = true;
  }

  private aplicarNombreSoloSiFalta(): void {
    if (!this.reportes?.length) return;

    this.reportes = this.reportes.map((r: any) => {
      const nombreActual = (r?.nombre ?? '').toString().trim();
      if (nombreActual) return r;

      const unidad = this.normUnidad(r?.unidad);
      const nombreResuelto = this.nombrePorUnidad.get(unidad) || '';
      return { ...r, nombre: nombreResuelto };
    });
  }

  // ==========================
  // Excel Minutos
  // ==========================
  private esFechaISO(val: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(val);
  }

  private async leerExcelMinutos(file: File): Promise<FilaExcelMinutos[]> {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!raw.length) throw new Error('El Excel está vacío.');

    const requiredKeys = ['Unidad *', 'Fecha *', 'Valor *'];
    const keys = Object.keys(raw[0] || {});
    for (const rk of requiredKeys) {
      if (!keys.includes(rk)) throw new Error(`Falta la columna obligatoria: "${rk}"`);
    }

    return raw.map((r, idx) => {
      const unidad = String(r['Unidad *'] || '').trim().toUpperCase();
      const fecha = String(r['Fecha *'] || '').trim();
      const valor = Number(r['Valor *']);

      if (!unidad) throw new Error(`Fila ${idx + 2}: "Unidad" vacía.`);
      if (!this.esFechaISO(fecha)) throw new Error(`Fila ${idx + 2}: "Fecha" inválida (${fecha}). Use YYYY-MM-DD.`);
      if (!Number.isFinite(valor)) throw new Error(`Fila ${idx + 2}: "Valor" inválido (${r['Valor *']}).`);

      return { unidad, fecha, valor };
    });
  }

  private resolverEmpresaPorUnidad(codigoUnidad: string): {
    empresa: string;
    empresaKey: string;
    unidad: string;
  } {
    const unidad = (codigoUnidad || '').trim().toUpperCase();

    if (/^E\d+/.test(unidad)) return { empresa: 'Expreso Antisana', empresaKey: 'ExpresoAntisana', unidad };
    if (/^P\d+/.test(unidad)) return { empresa: 'General Pintag', empresaKey: 'GeneralPintag', unidad };

    throw new Error(`Unidad "${codigoUnidad}" no válida. Use E01 o P01.`);
  }

  private async guardarMinutosDesdeExcel(filas: FilaExcelMinutos[]): Promise<void> {
    const CHUNK = 450;

    for (let i = 0; i < filas.length; i += CHUNK) {
      const chunk = filas.slice(i, i + CHUNK);
      const batch = writeBatch(this.firestore);

      for (const f of chunk) {
        try {
          const r = this.resolverEmpresaPorUnidad(f.unidad);

          const diaId = `${r.empresaKey}_${f.fecha}`;
          const unidadDocId = `${r.empresaKey}_${r.unidad}`;

          const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
          batch.set(diaRef, {
            empresa: r.empresa,
            fecha: f.fecha,
            updatedAt: serverTimestamp()
          }, { merge: true });

          const unidadRef = doc(this.firestore, `reportes_dia/${diaId}/unidades/${unidadDocId}`);
          batch.set(unidadRef, {
            codigo: r.unidad,
            empresa: r.empresa,
            fecha: f.fecha,
            minutosAtraso: f.valor,
            fechaModificacion: serverTimestamp()
          }, { merge: true });

          this.progresoExcel.ok++;
        } catch (err) {
          this.progresoExcel.fail++;
          console.error('Fila fallida:', f, err);
        }
      }

      await batch.commit();
    }
  }

  async onExcelMinutosSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.subiendoExcel = true;
    this.progresoExcel = { total: 0, ok: 0, fail: 0 };

    try {
      const filas = await this.leerExcelMinutos(file);
      this.progresoExcel.total = filas.length;

      await this.guardarMinutosDesdeExcel(filas);

      const fechaISO = (this.fechaPersonalizada && this.fechaPersonalizada.trim())
        ? this.fechaPersonalizada.trim()
        : filas[0]?.fecha;

      if (fechaISO) await this.cargarDiaEnListaReportes(fechaISO);

      await this.cargarMaestroNombresUnidades();
      this.aplicarNombreSoloSiFalta();

      alert(`Carga completa. OK: ${this.progresoExcel.ok}, Fallas: ${this.progresoExcel.fail}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Error al procesar el Excel.');
    } finally {
      this.subiendoExcel = false;
      input.value = '';
    }
  }

  // ==========================
  // Selección múltiple
  // ==========================
  isSelected(r: ReporteListaRow): boolean {
    return this.seleccion.has(this.keyDeFila(r));
  }

  toggleSeleccionFila(r: ReporteListaRow): void {
    const key = this.keyDeFila(r);
    if (this.seleccion.has(key)) this.seleccion.delete(key);
    else this.seleccion.add(key);
  }

  limpiarSeleccion(): void {
    this.seleccion.clear();
    this.seleccionarTodo = false;
  }

  toggleSeleccionTodos(checked: boolean): void {
    this.seleccion.clear();
    if (checked) this.reportes.forEach(r => this.seleccion.add(this.keyDeFila(r)));
    this.seleccionarTodo = checked;
  }

  get seleccionCount(): number {
    return this.seleccion.size;
  }

  abrirCalendario(input: HTMLInputElement): void {
    if (input && typeof (input as any).showPicker === 'function') {
      (input as any).showPicker();
    } else {
      input.focus();
      input.click();
    }
  }

  // ==========================
  // Cargar ÚLTIMO día generado
  // ==========================
  async cargarUltimoDiaGenerado() {
    this.cargando = true;
    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';
    this.limpiarSeleccion();

    try {
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
      await this.irADia(fechaISO);
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
  // Día exacto
  // ==========================
  async cargarDiaEnListaReportes(fechaISO: string) {
    this.cargando = true;
    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';
    this.limpiarSeleccion();
  this.fechaSeleccionada = fechaISO;
    try {
      const empresas: EmpresaNombre[] = ['General Pintag', 'Expreso Antisana'];

      const existe = await Promise.all(
        empresas.map(emp => this.reportesDiaService.existeDia(emp as any, fechaISO))
      );

      if (!existe.some(Boolean)) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes generados para el día ${fechaISO}.`;
        return;
      }

      const regsPorEmpresa = await Promise.all(
        empresas.map((emp, i) =>
          existe[i] ? this.reportesDiaService.getRegistrosDia(emp as any, fechaISO) : Promise.resolve([])
        )
      );

      const temp: ReporteListaRow[] = [];

      for (let idx = 0; idx < empresas.length; idx++) {
        const emp = empresas[idx];
        const empKey = this.empresaToKey(emp);
        const regs = regsPorEmpresa[idx] || [];
        const diaId = this.diaDocId(empKey, fechaISO);

        for (const r of regs as any[]) {
          const codigo = (r.codigo ?? '').toString().trim();
          const unidadDocId = (r.unidadId ?? r.id ?? '').toString().trim()
            || (codigo ? this.unidadDocIdFromCodigo(empKey, codigo) : '');

          if (!unidadDocId) continue;

          const refPath = `reportes_dia/${diaId}/unidades/${unidadDocId}`;

          const propietarioNombre = (r.propietarioNombre ?? r.nombre ?? '').toString().trim();
          const uidPropietario = (r.uidPropietario ?? r.uid ?? '').toString().trim();

          temp.push({
            id: unidadDocId,
            uid: uidPropietario,
            unidad: codigo || unidadDocId,
            nombre: propietarioNombre,
            apellido: (r.apellido ?? '').toString().trim(),

            minutosAtraso: r.minutosAtraso ?? 0,
            administracion: r.administracion ?? 0,
            minutosBase: r.minutosBase ?? 0,
            multas: r.multas ?? 0,

            minutosPagados: r.minutosPagados ?? 0,
            adminPagada: r.adminPagada ?? 0,
            minBasePagados: r.minBasePagados ?? 0,
            multasPagadas: r.multasPagadas ?? 0,

            fechaModificacion: new Date(`${fechaISO}T12:00:00`),
            empresa: r.empresa ?? emp,

            fechaISO,
            empresaKey: empKey,

            unidadDocId,
            codigo: codigo || (unidadDocId.split('_').pop() ?? unidadDocId),
            refPath,

            uidPropietario,
            propietarioNombre,
          } as any);
        }
      }

      const visibles = temp.filter(r => this.esRegistroVisible(r));

      if (visibles.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes con valores para el día ${fechaISO}.`;
        return;
      }

      visibles.sort((a, b) => this.ordenarPorEmpresaUnidad(a, b));
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
  // Semana/Mes (detalle por fecha, no acumulado)
  // ==========================
  async cargarRangoDetalladoEnListaReportes(inicioISO: string, finISO: string) {
    this.cargando = true;
    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';
    this.limpiarSeleccion();

    try {
      const dias = await this.reportesDiaService.getDiasEnRango(inicioISO, finISO);

      if (!dias || dias.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes generados entre ${inicioISO} y ${finISO}.`;
        return;
      }

      const registrosPorDia = await Promise.all(
        dias.map(d => this.reportesDiaService.getRegistrosDia(d.empresa as any, d.fecha))
      );

      const temp: ReporteListaRow[] = [];

      for (let i = 0; i < dias.length; i++) {
        const dia = dias[i];
        const regs = registrosPorDia[i] || [];
        const emp = dia.empresa as EmpresaNombre;
        const empKey = this.empresaToKey(emp);
        const diaId = this.diaDocId(empKey, dia.fecha);

        for (const r of regs as any[]) {
          const codigo = (r.codigo ?? '').toString().trim();
          const unidadDocId = (r.unidadId ?? r.id ?? '').toString().trim()
            || (codigo ? this.unidadDocIdFromCodigo(empKey, codigo) : '');

          if (!unidadDocId) continue;

          const refPath = `reportes_dia/${diaId}/unidades/${unidadDocId}`;

          const propietarioNombre = (r.propietarioNombre ?? r.nombre ?? '').toString().trim();
          const uidPropietario = (r.uidPropietario ?? r.uid ?? '').toString().trim();

          temp.push({
            id: unidadDocId,
            uid: uidPropietario,
            unidad: codigo || unidadDocId,
            nombre: propietarioNombre,
            apellido: (r.apellido ?? '').toString().trim(),

            minutosAtraso: r.minutosAtraso ?? 0,
            administracion: r.administracion ?? 0,
            minutosBase: r.minutosBase ?? 0,
            multas: r.multas ?? 0,

            minutosPagados: r.minutosPagados ?? 0,
            adminPagada: r.adminPagada ?? 0,
            minBasePagados: r.minBasePagados ?? 0,
            multasPagadas: r.multasPagadas ?? 0,

            fechaModificacion: new Date(`${dia.fecha}T12:00:00`),
            empresa: r.empresa ?? emp,

            fechaISO: dia.fecha,
            empresaKey: empKey,

            unidadDocId,
            codigo: codigo || (unidadDocId.split('_').pop() ?? unidadDocId),
            refPath,

            uidPropietario,
            propietarioNombre,
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

      visibles.sort((a, b) => this.ordenarPorFechaEmpresaUnidad(a, b));
      this.reportes = visibles;

      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = `Mostrando reportes del ${inicioISO} al ${finISO} (detallado por fecha).`;
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
  // MODAL: Agregar día (fecha puntual) -> usa ReportesDiaService (CREA UNIDADES BIEN)
  // ==========================
  abrirModalAgregarDia(): void {
    this.errorCrearDia = '';
    this.mostrarModalAgregarDia = true;
    this.fechaNuevaDia = this.hoyISO();
  }

  cerrarModalAgregarDia(): void {
    this.mostrarModalAgregarDia = false;
  }

  async confirmarAgregarDia(): Promise<void> {
    if (this.creandoDia) return;

    this.creandoDia = true;
    this.errorCrearDia = '';

    const fecha = (this.fechaNuevaDia || '').trim();
    if (!fecha) {
      this.errorCrearDia = 'Selecciona una fecha.';
      this.creandoDia = false;
      return;
    }

    try {
      // ✅ CLAVE: usa el service que ya crea doc día + subcolección unidades.
      // ✅ Debes tener agregarDiaCompleto(fechaISO?: string) en ReportesDiaService.
      const res = await this.reportesDiaService.agregarDiaCompleto(fecha);

      alert(`Día ${res.fecha} creado/actualizado. Nuevos: ${res.creados}. Ya existentes: ${res.omitidos}.`);

      this.fechaPersonalizada = res.fecha;
      await this.cargarDiaEnListaReportes(res.fecha);

      this.cerrarModalAgregarDia();
      this.mostrarFiltros = false;
    } catch (e) {
      console.error(e);
      this.errorCrearDia = 'Error al crear el día. Revise consola.';
    } finally {
      this.creandoDia = false;
    }
  }

  // ==========================
  // MODAL: Eliminar día (fecha puntual) - ambas empresas
  // ==========================
  abrirModalEliminarDia(): void {
    this.errorEliminarDia = '';
    this.mostrarModalEliminarDia = true;
    this.fechaEliminarDia = this.hoyISO();
  }

  cerrarModalEliminarDia(): void {
    this.mostrarModalEliminarDia = false;
  }

  private async borrarSubcoleccionEnChunks(path: string, chunkSize = 400): Promise<void> {
    while (true) {
      const colRef = collection(this.firestore, path);
      const snap = await getDocs(colRef);

      if (snap.empty) break;

      const docs = snap.docs.slice(0, chunkSize);
      const batch = writeBatch(this.firestore);
      docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      if (docs.length < chunkSize) break;
    }
  }

  private async borrarUnidadesYSubcolecciones(diaPath: string, chunkSize = 200): Promise<void> {
    const unidadesPath = `${diaPath}/unidades`;

    while (true) {
      const colUnidades = collection(this.firestore, unidadesPath);
      const snapUnidades = await getDocs(colUnidades);
      if (snapUnidades.empty) break;

      const lote = snapUnidades.docs.slice(0, chunkSize);

      // 1) borrar pagosTotales dentro de cada unidad
      for (const u of lote) {
        await this.borrarSubcoleccionEnChunks(`${u.ref.path}/pagosTotales`, 400);
      }

      // 2) borrar unidades (batch)
      const batch = writeBatch(this.firestore);
      lote.forEach(u => batch.delete(u.ref));
      await batch.commit();

      if (lote.length < chunkSize) break;
    }
  }

  async confirmarEliminarDia(): Promise<void> {
    if (this.eliminandoDia) return;
    this.eliminandoDia = true;
    this.errorEliminarDia = '';

    const fecha = (this.fechaEliminarDia || '').trim();

    const EMPRESAS = [
      { nombre: 'General Pintag', id: 'GeneralPintag' },
      { nombre: 'Expreso Antisana', id: 'ExpresoAntisana' }
    ];

    try {
      if (!fecha) {
        this.errorEliminarDia = 'Selecciona una fecha.';
        return;
      }

      const ok = confirm(
        `¿Seguro que deseas eliminar el día ${fecha} para ambas empresas?\n` +
        `Esto eliminará unidades y pagos de ese día.`
      );
      if (!ok) return;

      const resultados: string[] = [];

      for (const emp of EMPRESAS) {
        const diaId = `${emp.id}_${fecha}`;
        const diaPath = `reportes_dia/${diaId}`;
        const diaRef = doc(this.firestore, diaPath);

        const snapDia = await getDoc(diaRef);
        if (!snapDia.exists()) {
          resultados.push(`⚠️ ${emp.nombre}: no existe`);
          continue;
        }

        // 1) borrar subcolección unidades + pagosTotales
        await this.borrarUnidadesYSubcolecciones(diaPath, 200);

        // 2) borrar doc día
        await deleteDoc(diaRef);

        resultados.push(`✅ ${emp.nombre}: eliminado`);
      }

      this.cerrarModalEliminarDia();
      alert(`Resultado:\n${resultados.join('\n')}`);

      // ✅ Refrescar vista: cargar el último día existente
      await this.cargarUltimoDiaGenerado();

    } catch (e) {
      console.error(e);
      this.errorEliminarDia = 'Error al eliminar el día.';
    } finally {
      this.eliminandoDia = false;
    }
  }

  // ==========================
  // Filtros restaurados (sin filtro unidad)
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
  // Empresa + rango + validación 31 días (restaurado)
  // ==========================
  seleccionarEmpresa(nombreBoton: 'Pintag' | 'Antisana') {
    this.empresaSeleccionada = (nombreBoton === 'Pintag')
      ? 'General Pintag'
      : 'Expreso Antisana';

    this.fechaInicio = '';
    this.fechaFin = '';
    this.errorFecha = '';
  }

  validarRangoFechas() {
    if (this.fechaInicio && this.fechaFin) {
      const inicio = new Date(`${this.fechaInicio}T12:00:00`);
      const fin = new Date(`${this.fechaFin}T12:00:00`);
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

  /**
   * Calcula fechaFinFinanciero en base a fechaInicioFinanciero + periodoFinanciero.
   * Regla: fin = (inicio + N meses) - 1 día (inclusive).
   */
  actualizarRangoFinanciero(): void {
    if (!this.fechaInicioFinanciero) {
      this.fechaFinFinanciero = '';
      return;
    }

    const inicio = new Date(`${this.fechaInicioFinanciero}T12:00:00`);
    const meses =
      this.periodoFinanciero === 'mensual' ? 1 :
      this.periodoFinanciero === 'trimestral' ? 3 :
      this.periodoFinanciero === 'semestral' ? 6 :
      this.periodoFinanciero === 'nonamestral' ? 9 :
      12; // anual

    const fin = new Date(inicio);
    fin.setMonth(fin.getMonth() + meses);
    fin.setDate(fin.getDate() - 1); // inclusive
    this.fechaFinFinanciero = this.isoDate(fin);
  }

  /**
   * Wrapper UI: genera reporte financiero usando inicio + periodo (fin calculado).
   * No aplica la restricción de 31 días (es un reporte administrativo).
   */
  async generarReporteFinancieroPorPeriodo(): Promise<void> {
    if (!this.fechaInicioFinanciero) {
      alert('Selecciona una fecha de inicio para el reporte financiero.');
      return;
    }
    this.actualizarRangoFinanciero();
    if (!this.fechaFinFinanciero) {
      alert('No se pudo calcular la fecha de finalización.');
      return;
    }
    await this.generarReporteFinancieroPDF(this.fechaInicioFinanciero, this.fechaFinFinanciero);
  }


  async actualizarVistaPorRango() {
    if (!this.fechaInicio || !this.fechaFin || this.errorFecha) {
      this.reportes = [];
      return;
    }

    const inicioISO = this.fechaInicio;
    const finISO = this.fechaFin;

    await this.cargarRangoDetalladoEnListaReportesPorEmpresa(inicioISO, finISO, this.empresaSeleccionada);
  }

  async cargarRangoDetalladoEnListaReportesPorEmpresa(
    inicioISO: string,
    finISO: string,
    empresa: EmpresaNombre | null
  ) {
    this.cargando = true;
    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';
    this.limpiarSeleccion();

    try {
      const dias = await this.reportesDiaService.getDiasEnRango(inicioISO, finISO);

      const diasFiltrados = (empresa)
        ? (dias || []).filter(d => (d.empresa ?? '') === empresa)
        : (dias || []);

      if (!diasFiltrados || diasFiltrados.length === 0) {
        this.reportes = [];
        this.mostrarMensajeDia = true;
        this.mensajeEstadoDia = `No existen reportes generados para ${empresa ?? 'las empresas'} entre ${inicioISO} y ${finISO}.`;
        return;
      }

      const registrosPorDia = await Promise.all(
        diasFiltrados.map(d => this.reportesDiaService.getRegistrosDia(d.empresa as any, d.fecha))
      );

      const temp: ReporteListaRow[] = [];

      for (let i = 0; i < diasFiltrados.length; i++) {
        const dia = diasFiltrados[i];
        const regs = registrosPorDia[i] || [];
        const emp = dia.empresa as EmpresaNombre;
        const empKey = this.empresaToKey(emp);
        const diaId = this.diaDocId(empKey, dia.fecha);

        for (const r of regs as any[]) {
          const codigo = (r.codigo ?? '').toString().trim();
          const unidadDocId = (r.unidadId ?? r.id ?? '').toString().trim()
            || (codigo ? this.unidadDocIdFromCodigo(empKey, codigo) : '');

          if (!unidadDocId) continue;

          const refPath = `reportes_dia/${diaId}/unidades/${unidadDocId}`;

          const propietarioNombre = (r.propietarioNombre ?? r.nombre ?? '').toString().trim();
          const uidPropietario = (r.uidPropietario ?? r.uid ?? '').toString().trim();

          temp.push({
            id: unidadDocId,
            uid: uidPropietario,
            unidad: codigo || unidadDocId,
            nombre: propietarioNombre,
            apellido: (r.apellido ?? '').toString().trim(),

            minutosAtraso: r.minutosAtraso ?? 0,
            administracion: r.administracion ?? 0,
            minutosBase: r.minutosBase ?? 0,
            multas: r.multas ?? 0,

            minutosPagados: r.minutosPagados ?? 0,
            adminPagada: r.adminPagada ?? 0,
            minBasePagados: r.minBasePagados ?? 0,
            multasPagadas: r.multasPagadas ?? 0,

            fechaModificacion: new Date(`${dia.fecha}T12:00:00`),
            empresa: r.empresa ?? emp,

            fechaISO: dia.fecha,
            empresaKey: empKey,

            unidadDocId,
            codigo: codigo || (unidadDocId.split('_').pop() ?? unidadDocId),
            refPath,

            uidPropietario,
            propietarioNombre,
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

      visibles.sort((a, b) => this.ordenarPorFechaEmpresaUnidad(a, b));
      this.reportes = visibles;

      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = `Mostrando reportes del ${inicioISO} al ${finISO} (${empresa ?? 'todas'}).`;
    } catch (e) {
      console.error('❌ Error cargando rango (empresa):', e);
      this.reportes = [];
      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = 'Error al cargar rango por empresa. Revisa consola.';
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Limpiar filtros (restaurado)
  // ==========================
  async limpiarFiltros() {
    this.fechaPersonalizada = '';
    this.fechaInicio = '';
    this.fechaFin = '';
    this.empresaSeleccionada = null;
    this.errorFecha = '';

    await this.cargarUltimoDiaGenerado();
  }

  // ==========================
  // ELIMINAR (individual) - REAL (por refPath)
  // ==========================
  async eliminarReporte(reporte: ReporteListaRow) {
    const refPath = (reporte?.refPath ?? '').toString().trim();

    if (!refPath) {
      console.warn('No existe refPath en el registro. No se puede eliminar de forma segura.', reporte);
      alert('No se pudo eliminar: este registro no tiene refPath.');
      return;
    }

    const confirmar = confirm(`¿Eliminar registro ${reporte.codigo || reporte.unidad} del día ${reporte.fechaISO}?`);
    if (!confirmar) return;

    try {
      const ref = doc(this.firestore, refPath);
      await deleteDoc(ref);

      const check = await getDoc(ref);
      if (check.exists()) {
        console.error('El documento sigue existiendo tras deleteDoc:', refPath);
        alert('Se intentó eliminar, pero el documento sigue existiendo. Revisa reglas o ruta.');
        return;
      }

      const key = this.keyDeFila(reporte);
      this.reportes = this.reportes.filter(r => this.keyDeFila(r) !== key);
      this.seleccion.delete(key);

      alert('Registro eliminado correctamente.');
    } catch (e: any) {
      console.error('❌ Error eliminando registro:', e);
      alert(`No se pudo eliminar en Firebase: ${e?.code ?? e?.message ?? e}`);
    }
  }

  // ==========================
  // ELIMINAR (múltiple)
  // ==========================
  async eliminarSeleccionados() {
    if (this.seleccion.size === 0) {
      alert('No hay registros seleccionados.');
      return;
    }

    const confirmar = confirm(`¿Eliminar ${this.seleccion.size} registros seleccionados?`);
    if (!confirmar) return;

    try {
      this.cargandoEliminacion = true;

      const keys = Array.from(this.seleccion);
      const mapKeyToRow = new Map<string, ReporteListaRow>();
      this.reportes.forEach(r => mapKeyToRow.set(this.keyDeFila(r), r));

      for (const key of keys) {
        const row = mapKeyToRow.get(key);
        if (!row?.refPath) continue;
        await deleteDoc(doc(this.firestore, row.refPath));
      }

      const setKeys = new Set(keys);
      this.reportes = this.reportes.filter(r => !setKeys.has(this.keyDeFila(r)));
      this.limpiarSeleccion();

      this.mostrarMensajeDia = true;
      this.mensajeEstadoDia = `Se eliminaron ${keys.length} registros seleccionados.`;
    } catch (e: any) {
      console.error('❌ Error eliminando seleccionados:', e);
      alert(`Error eliminando seleccionados: ${e?.code ?? e?.message ?? e}`);
    } finally {
      this.cargandoEliminacion = false;
    }
  }

  // ==========================
  // Navegación
  // ==========================
  irANuevoRegistro(): void {
    this.router.navigate(['/reportes/nuevo-registro']);
  }

  irAEditar(r: any): void {
    const uid = r?.uid;
    const refPath = r?.refPath;

    if (!uid || !refPath) {
      alert('❌ No se puede editar: faltan uid o refPath.');
      return;
    }

    const safe = encodeURIComponent(refPath);

    this.router.navigate(['/reportes/actualizar', uid, safe], {
      queryParams: {
        nombre: r?.propietarioNombre ?? r?.nombre ?? '',
        apellido: r?.apellido ?? '',
        unidad: r?.codigo ?? r?.unidad ?? ''
      }
    });
  }
irADia(fechaISO: string): void {
  const fecha = (fechaISO ?? '').toString().trim();
  if (!fecha) return;

  this.router.navigate([], {
    queryParams: { fecha }
  });
}

irAPagar(r: any): void {
  const uid = (r?.uid ?? '').toString().trim();
  const refPath = (r?.refPath ?? '').toString().trim();
  const fecha = (this.fechaSeleccionada ?? '').toString().trim();

  if (!uid || !refPath) {
    alert('❌ No se puede pagar: faltan uid o refPath.');
    return;
  }

  const safeId = encodeURIComponent(refPath);

  this.router.navigate(['/reportes/realizar-pago', uid, safeId], {
    queryParams: {
      // ✅ CLAVE: para volver al mismo día
      fecha,

      // tus informativos (déjalos)
      nombre: (r?.propietarioNombre ?? r?.nombre ?? '').toString(),
      apellido: (r?.apellido ?? '').toString(),
      unidad: (r?.codigo ?? r?.unidad ?? '').toString()
    }
  });
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
  // PDFs Minutos / Administración (desde la vista actual) - SIN CAMBIOS
  // ==========================
  imprimirPDFMinutosDesdeVista() {
    if (this.reportes.length === 0) {
      alert('No hay datos en la vista actual.');
      return;
    }
    const docFecha = this.fechaPersonalizada
      ? new Date(`${this.fechaPersonalizada}T12:00:00`)
      : new Date();
    this.generarPDFMinutos(this.reportes, docFecha);
  }

  imprimirPDFAdministracionDesdeVista() {
    if (this.reportes.length === 0) {
      alert('No hay datos en la vista actual.');
      return;
    }
    const docFecha = this.fechaPersonalizada
      ? new Date(`${this.fechaPersonalizada}T12:00:00`)
      : new Date();
    this.generarPDFAdministracion(this.reportes, docFecha);
  }

  generarPDFMinutos(data: any[], fecha: Date) {
    const filtrado = data.filter(r => (r.minutosAtraso ?? 0) > 0);
    if (filtrado.length === 0) {
      alert('No hay valores de minutos para imprimir en esta vista.');
      return;
    }

    const docPdf = new jsPDF();
    const fechaTexto = fecha.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const W = docPdf.internal.pageSize.getWidth();
    const H = docPdf.internal.pageSize.getHeight();
    const margin = 15;

    const totalPagesExp = '{total_pages_count_string}';

    const logo1 = new Image();
    logo1.src = '/assets/img/LogoPintag.png';
    const logo2 = new Image();
    logo2.src = '/assets/img/LogoAntisana.png';

    docPdf.addImage(logo1, 'PNG', 15, 10, 25, 25);
    docPdf.addImage(logo2, 'PNG', 170, 10, 25, 25);

    docPdf.setFontSize(16);
    docPdf.text('Minutos', W / 2, 45, { align: 'center' });

    docPdf.setFontSize(11);
    docPdf.text(`Fecha: ${fechaTexto}`, 15, 55);

    const cuerpo = filtrado.map(item => [
      item.codigo || item.unidad || '',
      item.propietarioNombre || item.nombre || '',
      `$ ${Number(item.minutosAtraso ?? 0).toFixed(2)}`,
      ''
    ]);

    const totalMinutos = filtrado.reduce((sum, item) => sum + (item.minutosAtraso || 0), 0);

    autoTable(docPdf, {
      head: [['UNIDAD', 'NOMBRE', 'COSTO DE MINUTOS', 'FIRMA']],
      body: cuerpo,
      startY: 75,
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin, bottom: 18 },

      didDrawPage: () => {
        const W = docPdf.internal.pageSize.getWidth();
        const H = docPdf.internal.pageSize.getHeight();
        const margin = 15;

        const pageNumber = (((docPdf as any).internal?.pages?.length) || 1) - 1;

        docPdf.setDrawColor(180);
        docPdf.line(margin, H - 12, W - margin, H - 12);

        docPdf.setFontSize(6);
        docPdf.setTextColor(150);
        docPdf.text(
          'Consorcio Pintag Expresso | Pintag, Antisana S2-138 | consorciopinxpres@hotmail.com',
          margin,
          H - 8,
          { maxWidth: W - (margin * 2) }
        );

        docPdf.setFontSize(7);
        docPdf.setTextColor(120);
        docPdf.text(
          `Página ${pageNumber} de ${totalPagesExp}`,
          W - margin,
          H - 8,
          { align: 'right' }
        );
      }
    });

    const lastY = (docPdf as any).lastAutoTable.finalY ?? 75;
    let yTotal = lastY + 10;
    if (yTotal > H - 22) yTotal = H - 22;

    docPdf.setFontSize(11);
    docPdf.setTextColor(20);
    docPdf.text(`TOTAL MINUTOS: $ ${totalMinutos.toFixed(2)}`, margin, yTotal);

    if ((docPdf as any).putTotalPages) (docPdf as any).putTotalPages(totalPagesExp);

    docPdf.save(`Minutos_${this.fechaPersonalizada || 'vista'}.pdf`);
  }

  generarPDFAdministracion(data: any[], fecha: Date) {
    const filtrado = data.filter(r => (r.administracion ?? 0) > 0);
    if (filtrado.length === 0) {
      alert('No hay valores de administración para imprimir en esta vista.');
      return;
    }

    const docPdf = new jsPDF();
    const fechaTexto = fecha.toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    const W = docPdf.internal.pageSize.getWidth();
    const H = docPdf.internal.pageSize.getHeight();
    const margin = 15;

    const totalPagesExp = '{total_pages_count_string}';

    const logo1 = new Image();
    logo1.src = '/assets/img/LogoPintag.png';
    const logo2 = new Image();
    logo2.src = '/assets/img/LogoAntisana.png';

    docPdf.addImage(logo1, 'PNG', 15, 10, 25, 25);
    docPdf.addImage(logo2, 'PNG', 170, 10, 25, 25);

    docPdf.setFontSize(16);
    docPdf.text('Administración', W / 2, 45, { align: 'center' });

    docPdf.setFontSize(11);
    docPdf.text(`Fecha: ${fechaTexto}`, 15, 55);

    const cuerpo = filtrado.map(item => [
      item.codigo || item.unidad || '',
      item.propietarioNombre || item.nombre || '',
      `$ ${Number(item.administracion ?? 0).toFixed(2)}`,
      ''
    ]);

    const totalAdministracion = filtrado.reduce((sum, item) => sum + (item.administracion || 0), 0);

    autoTable(docPdf, {
      head: [['UNIDAD', 'NOMBRE', 'VALOR ADMINISTRACIÓN', 'FIRMA']],
      body: cuerpo,
      startY: 75,
      styles: { fontSize: 10 },
      margin: { left: margin, right: margin, bottom: 18 },

      didDrawPage: () => {
        const W = docPdf.internal.pageSize.getWidth();
        const H = docPdf.internal.pageSize.getHeight();
        const margin = 15;

        const pageNumber = (((docPdf as any).internal?.pages?.length) || 1) - 1;

        docPdf.setDrawColor(180);
        docPdf.line(margin, H - 12, W - margin, H - 12);

        docPdf.setFontSize(6);
        docPdf.setTextColor(150);
        docPdf.text(
          'Consorcio Pintag Expresso | Pintag, Antisana S2-138 | consorciopinxpres@hotmail.com',
          margin,
          H - 8,
          { maxWidth: W - (margin * 2) }
        );

        docPdf.setFontSize(7);
        docPdf.setTextColor(120);
        docPdf.text(
          `Página ${pageNumber} de ${totalPagesExp}`,
          W - margin,
          H - 8,
          { align: 'right' }
        );
      }
    });

    const lastY = (docPdf as any).lastAutoTable.finalY ?? 75;
    let yTotal = lastY + 10;
    if (yTotal > H - 22) yTotal = H - 22;

    docPdf.setFontSize(11);
    docPdf.setTextColor(20);
    docPdf.text(`TOTAL ADMINISTRACIÓN: $ ${totalAdministracion.toFixed(2)}`, margin, yTotal);

    if ((docPdf as any).putTotalPages) (docPdf as any).putTotalPages(totalPagesExp);

    docPdf.save(`Administracion_${this.fechaPersonalizada || 'vista'}.pdf`);
  }

  // ==========================
  // PDF EMPRESA (restaurado) - usa la vista filtrada por empresa/rango
  // ==========================
  private agruparDatosParaPDF(): Map<string, Map<string, any>> {
    const agrupado = new Map<string, Map<string, any>>();

    for (const reporte of this.reportes) {
      const unidad = (reporte.codigo || reporte.unidad || 'SIN_UNIDAD').toString().trim();

      const fecha = (reporte.fechaISO || '').toString().trim(); // YYYY-MM-DD
      const keyFecha = this.esFechaISO(fecha)
        ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-EC', { month: '2-digit', day: '2-digit' })
        : 'Sin Fecha';

      if (!agrupado.has(unidad)) agrupado.set(unidad, new Map());
      const fechasMap = agrupado.get(unidad)!;

      if (!fechasMap.has(keyFecha)) {
        fechasMap.set(keyFecha, {
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

      const valores = fechasMap.get(keyFecha)!;

      valores.minutosAtraso += reporte.minutosAtraso || 0;
      valores.minutosPagados += (reporte as any).minutosPagados || 0;
      valores.administracion += reporte.administracion || 0;
      valores.adminPagada += (reporte as any).adminPagada || 0;
      valores.minutosBase += reporte.minutosBase || 0;
      valores.minBasePagados += (reporte as any).minBasePagados || 0;
      valores.multas += reporte.multas || 0;
      valores.multasPagadas += (reporte as any).multasPagadas || 0;
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

  const doc = new jsPDF({ orientation: 'landscape' });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 15;
  const totalPagesExp = '{total_pages_count_string}';

  /* =======================
     ENCABEZADO
  ======================= */
  doc.setFontSize(18);
  doc.text(`Reporte ${this.empresaSeleccionada}`, W / 2, 20, { align: 'center' });

  doc.setFontSize(12);
  doc.text(`Fecha de inicio: ${inicio.toLocaleDateString('es-EC')}`, 15, 30);
  doc.text(`Fecha de finalización: ${fin.toLocaleDateString('es-EC')}`, 15, 36);
  doc.text(`Fecha de emisión: ${fechaEmision.toLocaleDateString('es-EC')}`, 15, 42);

  /* =======================
     FECHAS DEL RANGO
  ======================= */
  const fechasArray: string[] = [];
  let actual = new Date(inicio);
  while (actual <= fin) {
    fechasArray.push(
      actual.toLocaleDateString('es-EC', { month: '2-digit', day: '2-digit' })
    );
    actual.setDate(actual.getDate() + 1);
  }

  const unidades = [...new Set(this.reportes.map(r => r.unidad))]
    .filter(Boolean)
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0;
      const nb = parseInt(b.replace(/\D/g, '')) || 0;
      return na - nb;
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

  /* =======================
     TABLAS POR MÓDULO
  ======================= */
  for (const modulo of modulos) {
    doc.setFontSize(14);
    doc.text(`${modulo.nombre} Asignados`, 15, currentY);
    currentY += 6;

    let totalAsignado = 0;
    let totalSaldo = 0;

    const bodyAsignados: (string | number)[][] = [];

    for (const unidad of unidades) {
      const row: (string | number)[] = [unidad];
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

    await new Promise(r => setTimeout(r, 50));

    autoTable(doc, {
      startY: currentY,
      head: [['UNIDAD', ...fechasArray, 'TOTAL']],
      body: bodyAsignados,
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fontSize: 7.5, fillColor: [41, 128, 185], halign: 'center' },
      margin: { left: margin, right: margin, bottom: 18 },

      didDrawPage: () => {
        doc.setDrawColor(180);
        doc.line(margin, H - 12, W - margin, H - 12);

        doc.setFontSize(6);
        doc.setTextColor(150);
        doc.text(
          'Consorcio Pintag Expresso | Pintag, Antisana S2-138 | consorciopinxpres@hotmail.com',
          margin,
          H - 8,
          { maxWidth: W - margin * 2 }
        );

        const pageNumber = (((doc as any).internal?.pages?.length) || 1) - 1;
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(
          `Página ${pageNumber} de ${totalPagesExp}`,
          W - margin,
          H - 8,
          { align: 'right' }
        );
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    doc.setFontSize(12);
    doc.text(`${modulo.nombre} Adeudados`, 15, currentY);
    currentY += 6;

    const bodyAdeudados: (string | number)[][] = [];

    for (const unidad of unidades) {
      const row: (string | number)[] = [unidad];
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

    await new Promise(r => setTimeout(r, 50));

    autoTable(doc, {
      startY: currentY,
      head: [['UNIDAD', ...fechasArray, 'TOTAL']],
      body: bodyAdeudados,
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fontSize: 7.5, fillColor: [41, 128, 185], halign: 'center' },
      margin: { left: margin, right: margin, bottom: 18 },
      didDrawPage: (doc as any).lastAutoTable.settings?.didDrawPage
    });

    resumenFinal.push([
      modulo.nombre,
      totalAsignado,
      totalSaldo,
      totalAsignado - totalSaldo
    ]);

    currentY = (doc as any).lastAutoTable.finalY + 12;
  }

  /* =======================
     RESUMEN FINAL
  ======================= */
  doc.setFontSize(14);
  doc.text('Resumen Final por Módulo', 15, currentY);
  currentY += 6;

  autoTable(doc, {
    startY: currentY,
    head: [['MÓDULO', 'ASIGNADO TOTAL', 'SALDO TOTAL', 'PAGADO TOTAL']],
    body: resumenFinal.map(r => [
      r[0],
      `$${r[1].toFixed(2)}`,
      `$${r[2].toFixed(2)}`,
      `$${r[3].toFixed(2)}`
    ]),
    styles: { fontSize: 10 },
    margin: { left: margin, right: margin, bottom: 18 },
    didDrawPage: (doc as any).lastAutoTable.settings?.didDrawPage
  });

  // Reemplazo total de páginas
  // @ts-ignore
  if ((doc as any).putTotalPages) {
    // @ts-ignore
    (doc as any).putTotalPages(totalPagesExp);
  }

  doc.save(`Reporte_${this.empresaSeleccionada}_${this.fechaInicio}_al_${this.fechaFin}.pdf`);
  this.cargandoPDF = false;

  }


  // ==========================
  // REPORTE FINANCIERO (Mensual / Trimestral / Semestral / Nonamestral)
  // Formato EXACTO como el PDF administrativo: Ingresos/Egresos/Utilidad/CxC + Devoluciones
  // ==========================

  // Inputs (puedes exponerlos en tu HTML si los necesitas)
  saldoAnteriorInput: number = 0;
  totalEgresosInput: number = 0;

  // “Depósitos / Otros ingresos” (líneas detalladas bajo el bloque Depósitos)
  depositosOtrosIngresos: { detalle: string; valor: number }[] = [];

  /**
   * Genera el reporte financiero con el formato administrativo (NO es el “Reporte por Empresas”).
   * Usa el rango actual fechaInicio/fechaFin (YYYY-MM-DD) y consolida ambas empresas.
   */
  async generarReporteFinancieroPDF(inicioISOArg?: string, finISOArg?: string): Promise<void> {
    if (this.cargandoPDF) return;

    const inicioISO = inicioISOArg ?? this.fechaInicio;
    const finISO = finISOArg ?? this.fechaFin;

    if (!inicioISO || !finISO) {
      alert('Selecciona Fecha de inicio y Fecha de finalización.');
      return;
    }

    // Validación básica (sin límite de días)
    const inicioTmp = new Date(`${inicioISO}T12:00:00`);
    const finTmp = new Date(`${finISO}T12:00:00`);
    if (isNaN(inicioTmp.getTime()) || isNaN(finTmp.getTime()) || inicioTmp > finTmp) {
      alert('Rango de fechas inválido. Verifica que la fecha de inicio no sea mayor que la fecha final.');
      return;
    }

    this.cargandoPDF = true;

    try {
      const inicio = new Date(`${inicioISO}T12:00:00`);
      const fin = new Date(`${finISO}T12:00:00`);
      const fechaEmision = new Date();

      // 1) Traer TODAS las unidades del rango (ambas empresas) desde la nueva estructura
      const unidades = await this.cargarUnidadesEnRango(inicio, fin);

      // 2) Calcular INGRESOS (suma de pagados) + CxC (asignado - pagado)
      const ingresos = this.calcularIngresos(unidades);
      const cuentasPorCobrar = this.calcularCuentasPorCobrar(unidades);

      const totalIngresosSinSaldo = ingresos.totalIngresos;
      const saldoAnterior = Number(this.saldoAnteriorInput ?? 0) || 0;

      const totalDepositos = ingresos.totalDepositos;
      const totalIngresos = saldoAnterior + totalIngresosSinSaldo; // como el PDF (Saldo anterior + ingresos del rango)

      const totalEgresos = Number(this.totalEgresosInput ?? 0) || 0;

      const utilidad = (totalIngresos - totalEgresos);

      // 3) Devoluciones de administración (por año “devolución” = finYear - 2 para replicar tu ejemplo)
      const anioDevolucion = Math.max((fin.getFullYear() - 2), 2000);
      const devolAntisana = await this.calcularDevolucionAdministracionPorEmpresa('Expreso Antisana', anioDevolucion);
      const devolPintag = await this.calcularDevolucionAdministracionPorEmpresa('General Pintag', anioDevolucion);

      // 4) PDF (FORMATO)
      this.renderReporteFinancieroPDF({
        inicio,
        fin,
        fechaEmision,
        saldoAnterior,
        ingresos,
        totalIngresos,
        totalEgresos,
        utilidad,
        cuentasPorCobrar,
        devolAntisana,
        devolPintag,
        anioDevolucion,
      });

    } catch (e) {
      console.error('Error generarReporteFinancieroPDF:', e);
      alert('No se pudo generar el reporte financiero. Revisa consola.');
    } finally {
      this.cargandoPDF = false;
    }
  }

  // --------------------------
  // DATA LOADERS
  // --------------------------

  private async cargarUnidadesEnRango(inicio: Date, fin: Date): Promise<any[]> {
    // Se apoya en collectionGroup('unidades') con filtro por fecha (YYYY-MM-DD)
    const inicioISO = this.isoDate(inicio);
    const finISO = this.isoDate(fin);

    const q = query(
      collectionGroup(this.firestore, 'unidades'),
      where('fecha', '>=', inicioISO),
      where('fecha', '<=', finISO),
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...(d.data() as any) }));
  }

  private async calcularDevolucionAdministracionPorEmpresa(
    empresa: string,
    anio: number
  ): Promise<{ periodo: string; recaudacion: number; devolucion: number }[]> {

    // Recaudación mensual = suma de adminPagada del año por empresa
    const inicioISO = `${anio}-01-01`;
    const finISO = `${anio}-12-31`;

    const q = query(
      collectionGroup(this.firestore, 'unidades'),
      where('empresa', '==', empresa),
      where('fecha', '>=', inicioISO),
      where('fecha', '<=', finISO),
    );

    const snap = await getDocs(q);

    const map = new Map<string, number>(); // key: YYYY-MM

    for (const docu of snap.docs) {
      const d: any = docu.data();
      const fecha: string = (d.fecha ?? '').toString(); // YYYY-MM-DD
      if (!fecha || fecha.length < 7) continue;

      const key = fecha.slice(0, 7); // YYYY-MM
      const adminPagada = Number(d.adminPagada ?? 0) || 0;

      map.set(key, (map.get(key) ?? 0) + adminPagada);
    }

    const rows = Array.from(map.entries())
      .map(([ym, rec]) => {
        const [y, m] = ym.split('-').map(x => Number(x));
        const mesNombre = this.nombreMesEs(m);
        const periodo = `${y}, ${mesNombre}`;
        const recaudacion = this.round2(rec);
        const devolucion = this.round2(recaudacion / 3); // regla observada en tu PDF
        return { periodo, recaudacion, devolucion, _m: m };
      })
      .sort((a, b) => (a._m - b._m));

    // limpiar helper interno
    return rows.map(({ _m, ...rest }) => rest);
  }

  // --------------------------
  // CÁLCULOS
  // --------------------------

  private calcularIngresos(unidades: any[]): {
    administracion: number;
    minutosAtraso: number;
    minutosBase: number;
    multas: number;
    totalDepositos: number;
    depositosDetalle: { detalle: string; valor: number }[];
    totalIngresos: number; // ingresos del rango (sin saldo anterior)
  } {

    let administracion = 0;
    let minutosAtraso = 0;
    let minutosBase = 0;
    let multas = 0;

    for (const u of unidades) {
      administracion += Number(u.adminPagada ?? 0) || 0;
      minutosAtraso  += Number(u.minutosPagados ?? 0) || 0;
      minutosBase    += Number(u.minBasePagados ?? 0) || 0;
      multas         += Number(u.multasPagadas ?? 0) || 0;
    }

    const depositosDetalle = (this.depositosOtrosIngresos ?? [])
      .filter(x => (Number(x.valor ?? 0) || 0) !== 0)
      .map(x => ({ detalle: String(x.detalle ?? '').trim(), valor: this.round2(Number(x.valor ?? 0) || 0) }));

    const totalDepositos = this.round2(depositosDetalle.reduce((a, b) => a + (b.valor || 0), 0));

    const totalIngresos = this.round2(administracion + minutosAtraso + minutosBase + multas + totalDepositos);

    return {
      administracion: this.round2(administracion),
      minutosAtraso: this.round2(minutosAtraso),
      minutosBase: this.round2(minutosBase),
      multas: this.round2(multas),
      totalDepositos,
      depositosDetalle,
      totalIngresos
    };
  }

  private calcularCuentasPorCobrar(unidades: any[]): {
    antisanas: { adm: number; min: number; base: number; multas: number };
    pintag:    { adm: number; min: number; base: number; multas: number };
    total: number;
  } {

    const acc = {
      antisanas: { adm: 0, min: 0, base: 0, multas: 0 },
      pintag:    { adm: 0, min: 0, base: 0, multas: 0 }
    };

    for (const u of unidades) {
      const empresa = this.normalizarEmpresaCxc(String(u.empresa ?? ''));

      const admSaldo   = (Number(u.administracion ?? 0) || 0) - (Number(u.adminPagada ?? 0) || 0);
      const minSaldo   = (Number(u.minutosAtraso ?? 0) || 0) - (Number(u.minutosPagados ?? 0) || 0);
      const baseSaldo  = (Number(u.minutosBase ?? 0) || 0) - (Number(u.minBasePagados ?? 0) || 0);
      const mulSaldo   = (Number(u.multas ?? 0) || 0) - (Number(u.multasPagadas ?? 0) || 0);

      if (empresa === 'Expreso Antisana') {
        acc.antisanas.adm   += admSaldo;
        acc.antisanas.min   += minSaldo;
        acc.antisanas.base  += baseSaldo;
        acc.antisanas.multas+= mulSaldo;
      } else {
        acc.pintag.adm      += admSaldo;
        acc.pintag.min      += minSaldo;
        acc.pintag.base     += baseSaldo;
        acc.pintag.multas   += mulSaldo;
      }
    }

    const total =
      acc.antisanas.adm + acc.antisanas.min + acc.antisanas.base + acc.antisanas.multas +
      acc.pintag.adm + acc.pintag.min + acc.pintag.base + acc.pintag.multas;

    return {
      antisanas: {
        adm: this.round2(acc.antisanas.adm),
        min: this.round2(acc.antisanas.min),
        base: this.round2(acc.antisanas.base),
        multas: this.round2(acc.antisanas.multas),
      },
      pintag: {
        adm: this.round2(acc.pintag.adm),
        min: this.round2(acc.pintag.min),
        base: this.round2(acc.pintag.base),
        multas: this.round2(acc.pintag.multas),
      },
      total: this.round2(total),
    };
  }

  // --------------------------
  // PDF RENDER (igual al formato del PDF que enviaste)
  // --------------------------

  private renderReporteFinancieroPDF(args: {
    inicio: Date;
    fin: Date;
    fechaEmision: Date;
    saldoAnterior: number;
    ingresos: ReturnType<ReporteListaComponent['calcularIngresos']>;
    totalIngresos: number;
    totalEgresos: number;
    utilidad: number;
    cuentasPorCobrar: ReturnType<ReporteListaComponent['calcularCuentasPorCobrar']>;
    devolAntisana: { periodo: string; recaudacion: number; devolucion: number }[];
    devolPintag: { periodo: string; recaudacion: number; devolucion: number }[];
    anioDevolucion: number;
  }): void {

    const {
      inicio, fin, fechaEmision,
      saldoAnterior, ingresos, totalIngresos, totalEgresos, utilidad,
      cuentasPorCobrar, devolAntisana, devolPintag
    } = args;

    const doc = new jsPDF({ orientation: 'portrait' });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 15;

    const footerText = 'Consorcio Píntag Expresso | Píntag, Antisana S2-138 | consorciopinexpres@hotmail.com';

    const drawFooter = () => {
      doc.setDrawColor(180);
      doc.line(margin, H - 12, W - margin, H - 12);
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(footerText, margin, H - 8, { maxWidth: W - margin * 2 });
    };

    const drawHeader = () => {
      doc.setTextColor(20);
      doc.setFontSize(16);
      doc.text('Reporte', margin, 16);

      doc.setFontSize(10);
      doc.text('Fecha de inicio:', margin, 24);
      doc.text(this.formatoFechaLarga(inicio), margin, 29);

      doc.text('Fecha de finalización:', margin, 36);
      doc.text(this.formatoFechaLarga(fin), margin, 41);

      doc.text('Fecha de emisión:', margin, 48);
      doc.text(this.formatoFechaLarga(fechaEmision), margin, 53);

      doc.setFontSize(11);
      doc.text('Consorcio Píntag Expresso', margin, 62);
      doc.setFontSize(10);
      doc.text('Píntag, Antisana S2-138', margin, 67);
      doc.text('consorciopinexpres@hotmail.com', margin, 72);
    };

    drawHeader();

    let y = 78;

    // INGRESOS
    doc.setFontSize(12);
    doc.text('INGRESOS', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['', 'VALOR']],
      body: [
        ['Saldo anterior', this.money(saldoAnterior)],
        ['Administración', this.money(ingresos.administracion)],
        ['Minutos atraso', this.money(ingresos.minutosAtraso)],
        ['Minutos base', this.money(ingresos.minutosBase)],
        ['Multas', this.money(ingresos.multas)],
        ['Otros ingresos', ''],
        ['Depósitos', ''],
        ...ingresos.depositosDetalle.map(d => [`➥ ${d.detalle}`, this.money(d.valor)]),
        ['TOTAL', this.money(totalIngresos)]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.2 },
      headStyles: { fontStyle: 'bold', textColor: 40 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 6;

    // EGRESOS
    doc.setFontSize(12);
    doc.text('EGRESOS', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['', 'VALOR']],
      body: [
        ['TOTAL', this.money(totalEgresos)]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.2 },
      headStyles: { fontStyle: 'bold', textColor: 40 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 6;

    // UTILIDAD/PÉRDIDA
    doc.setFontSize(12);
    doc.text('UTILIDAD/PÉRDIDA', margin, y);
    doc.text(this.money(utilidad), W - margin, y, { align: 'right' });
    y += 8;

    // CUENTAS POR COBRAR
    doc.setFontSize(12);
    doc.text('CUENTAS POR COBRAR', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['', 'VALOR']],
      body: [
        ['Cuentas por cobrar Adm. Cía. ExpreAntisana', this.money(cuentasPorCobrar.antisanas.adm)],
        ['Cuentas por cobrar Minutos Cía. ExpreAntisana', this.money(cuentasPorCobrar.antisanas.min)],
        ['Cuentas por cobrar Minutos Base Cía. ExpreAntisana', this.money(cuentasPorCobrar.antisanas.base)],
        ['Cuentas por cobrar Multas Cía. ExpreAntisana', this.money(cuentasPorCobrar.antisanas.multas)],
        ['Cuentas por cobrar Adm. Cooperativa General Pintag', this.money(cuentasPorCobrar.pintag.adm)],
        ['Cuentas por cobrar Minutos Cooperativa General Pintag', this.money(cuentasPorCobrar.pintag.min)],
        ['Cuentas por cobrar Minutos Base Cooperativa General Pintag', this.money(cuentasPorCobrar.pintag.base)],
        ['Cuentas por cobrar Multas Cooperativa General Pintag', this.money(cuentasPorCobrar.pintag.multas)],
        ['TOTAL', this.money(cuentasPorCobrar.total)]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.2 },
      headStyles: { fontStyle: 'bold', textColor: 40 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    drawFooter();

    // ---------------------
    // Página 2: DEVOLUCIONES
    // ---------------------
    doc.addPage();
    let y2 = 18;

    doc.setFontSize(11);
    doc.text('DEVOLUCIÓN DE ADMINISTRACIÓN CÍA. EXPREANTISANA', margin, y2);
    y2 += 4;

    autoTable(doc, {
      startY: y2,
      head: [['', 'RECAUDACIÓN', 'DEVOLUCIÓN']],
      body: [
        ...devolAntisana.map(r => [r.periodo, this.money(r.recaudacion), this.money(r.devolucion)]),
        ['TOTAL',
          this.money(this.round2(devolAntisana.reduce((a, b) => a + (b.recaudacion || 0), 0))),
          this.money(this.round2(devolAntisana.reduce((a, b) => a + (b.devolucion || 0), 0))),
        ]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.2 },
      headStyles: { fontStyle: 'bold', textColor: 40 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    // @ts-ignore
    y2 = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(11);
    doc.text('DEVOLUCIÓN DE ADMINISTRACIÓN PINTAG', margin, y2);
    y2 += 4;

    autoTable(doc, {
      startY: y2,
      head: [['', 'RECAUDACIÓN', 'DEVOLUCIÓN']],
      body: [
        ...devolPintag.map(r => [r.periodo, this.money(r.recaudacion), this.money(r.devolucion)]),
        ['TOTAL',
          this.money(this.round2(devolPintag.reduce((a, b) => a + (b.recaudacion || 0), 0))),
          this.money(this.round2(devolPintag.reduce((a, b) => a + (b.devolucion || 0), 0))),
        ]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.2 },
      headStyles: { fontStyle: 'bold', textColor: 40 },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    drawFooter();

    const fileName = `Reporte_${this.fechaInicio}__${this.fechaFin}__${this.isoDate(new Date())}_${this.horaMinSeg(new Date())}.pdf`;
    doc.save(fileName);
  }

  // --------------------------
  // HELPERS
  // --------------------------

  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private horaMinSeg(d: Date): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}_${mm}_${ss}`;
  }

  private round2(n: number): number {
    const x = Number(n ?? 0);
    return Math.round(x * 100) / 100;
  }

  private money(n: number): string {
    const v = this.round2(Number(n ?? 0));
    return `$ ${v.toFixed(2)}`;
  }

  private formatoFechaLarga(d: Date): string {
    // Ej: Septiembre 01, 2025 (como en tu PDF)
    const meses = [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ];
    const mes = meses[d.getMonth()];
    const dia = String(d.getDate()).padStart(2, '0');
    const anio = d.getFullYear();
    return `${mes} ${dia}, ${anio}`;
  }

  private nombreMesEs(m: number): string {
    const meses = [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ];
    return meses[Math.max(1, Math.min(12, m)) - 1] ?? `Mes ${m}`;
  }

  private normalizarEmpresaCxc(raw: string): 'Expreso Antisana' | 'General Pintag' {
    const e = (raw || '').toLowerCase();
    if (e.includes('antisana')) return 'Expreso Antisana';
    // cubre: "General Píntag", "General Pintag", "Cooperativa General Pintag"
    return 'General Pintag';
  }


}
