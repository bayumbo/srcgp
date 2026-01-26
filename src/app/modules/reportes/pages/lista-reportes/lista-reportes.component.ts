import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { AuthService } from 'src/app/core/auth/services/auth.service';
import { ReportesDiaService } from '../../services/reportes-dia.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';

type EmpresaNombre = 'General Pintag' | 'Expreso Antisana';

type ReporteListaRow = ReporteConPagos & {
  fechaISO: string;
  empresaKey: string;

  // DocId real del doc dentro de subcolección "unidades"
  // Ej: "ExpresoAntisana_E13"
  unidadDocId: string;

  // Código visual: "E13"
  codigo: string;

  // Ruta exacta al doc a borrar
  refPath: string;

  // Campos canónicos (según tu estructura)
  uidPropietario: string;
  propietarioNombre: string;
};

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss'],
})
export class ReporteListaComponent implements OnInit {
  // UI state
  creandoDia = false;
  cargando = true;
  cargandoEliminacion = false;

  esSocio = false;

  // Mensajes
  mostrarMensajeDia = false;
  mensajeEstadoDia = '';

  // Filtros
  mostrarFiltros = false;
  fechaPersonalizada = ''; // yyyy-mm-dd

  // Reporte empresas (mantengo tus variables aunque aquí no las toco)
  mostrarOpcionesEmpresa = false;
  empresaSeleccionada: EmpresaNombre | null = null;
  fechaInicio = '';
  fechaFin = '';
  errorFecha = '';
  cargandoPDF = false;

  // Data
  reportes: ReporteListaRow[] = [];

  // Selección múltiple
  seleccion = new Set<string>();
  seleccionarTodo = false;

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

    await this.cargarUltimoDiaGenerado();
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
    // "Expreso Antisana" -> "ExpresoAntisana"
    // "General Pintag" -> "GeneralPintag"
    return (empresa || '').replace(/\s+/g, '').trim();
  }

  private diaDocId(empresaKey: string, fechaISO: string): string {
    return `${empresaKey}_${fechaISO}`;
  }

  private unidadDocIdFromCodigo(empresaKey: string, codigo: string): string {
    // Ej: empresaKey=ExpresoAntisana, codigo=E13 -> ExpresoAntisana_E13
    return `${empresaKey}_${(codigo || '').toString().trim()}`;
  }

  // Key canónica de UI: empresaKey|fechaISO|unidadDocId
  private keyDeFila(r: Pick<ReporteListaRow, 'empresaKey' | 'fechaISO' | 'unidadDocId'>): string {
    return `${r.empresaKey}|${r.fechaISO}|${r.unidadDocId}`;
  }

  trackByReporte = (_: number, r: ReporteListaRow) => this.keyDeFila(r);

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

    // Ordena por número dentro del código (E13 -> 13)
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
  // Día exacto
  // ==========================
  async cargarDiaEnListaReportes(fechaISO: string) {
    this.cargando = true;
    this.mostrarMensajeDia = false;
    this.mensajeEstadoDia = '';
    this.limpiarSeleccion();

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

      // Registros por empresa (idealmente esta función ya lee de reportes_dia/{dia}/unidades)
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
          // Compatibilidad:
          // - r.id / r.unidadId puede venir como "ExpresoAntisana_E13"
          // - r.codigo suele ser "E13"
          const codigo = (r.codigo ?? '').toString().trim();
          const unidadDocId = (r.unidadId ?? r.id ?? '').toString().trim()
            || (codigo ? this.unidadDocIdFromCodigo(empKey, codigo) : '');

          if (!unidadDocId) continue;

          const refPath = `reportes_dia/${diaId}/unidades/${unidadDocId}`;

          // Campos canónicos (preferidos)
          const propietarioNombre = (r.propietarioNombre ?? r.nombre ?? '').toString().trim();
          const uidPropietario = (r.uidPropietario ?? r.uid ?? '').toString().trim();

          const row: ReporteListaRow = {
            // ReporteConPagos base
            id: unidadDocId,
            uid: uidPropietario, // compatibilidad con tu navegación actual
            unidad: codigo || unidadDocId, // en tabla se muestra E13
            nombre: propietarioNombre,     // importante: pintar desde propietarioNombre
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
          } as any;

          temp.push(row);
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
        const dia = dias[i]; // { empresa, fecha }
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
  // Botón: Agregar día (crea día completo)
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

      // Verificación dura (evita "ficticio")
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

irAPagar(r: any): void {
  const uid = (r?.uid ?? '').toString().trim();
  const refPath = (r?.refPath ?? '').toString().trim(); // debe ser: reportes_dia/.../unidades/...

  if (!uid || !refPath) {
    alert('❌ No se puede pagar: faltan uid o refPath.');
    return;
  }

  const safeId = encodeURIComponent(refPath);

  this.router.navigate(['/reportes/realizar-pago', uid, safeId], {
    queryParams: {
      nombre: (r?.propietarioNombre ?? r?.nombre ?? '').toString(),
      apellido: (r?.apellido ?? '').toString(),
      unidad: (r?.codigo ?? r?.unidad ?? '').toString()
    }
  });
}
moduloActivo: 'cobros' | 'cierre' | null = null;

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
  // PDFs Minutos / Administración (desde la vista actual)
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

    const logo1 = new Image();
    logo1.src = '/assets/img/LogoPintag.png';
    const logo2 = new Image();
    logo2.src = '/assets/img/LogoAntisana.png';

    docPdf.addImage(logo1, 'PNG', 15, 10, 25, 25);
    docPdf.addImage(logo2, 'PNG', 170, 10, 25, 25);

    docPdf.setFontSize(16);
    docPdf.text('Minutos', 105, 45, { align: 'center' });

    docPdf.setFontSize(11);
    docPdf.text(`Fecha: ${fechaTexto}`, 15, 55);

    docPdf.setFontSize(10);
    docPdf.text('Consorcio Píntag Expresso', 135, 55);
    docPdf.text('Píntag, Antisana S2-138', 135, 60);
    docPdf.text('consorciopinexpres@hotmail.com', 135, 65);

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
      styles: { fontSize: 10 }
    });

    const finalY = (docPdf as any).lastAutoTable.finalY + 10;
    docPdf.setFontSize(11);
    docPdf.text(`TOTAL MINUTOS: $ ${totalMinutos.toFixed(2)}`, 15, finalY);

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

    const logo1 = new Image();
    logo1.src = '/assets/img/LogoPintag.png';
    const logo2 = new Image();
    logo2.src = '/assets/img/LogoAntisana.png';

    docPdf.addImage(logo1, 'PNG', 15, 10, 25, 25);
    docPdf.addImage(logo2, 'PNG', 170, 10, 25, 25);

    docPdf.setFontSize(16);
    docPdf.text('Administración', 105, 45, { align: 'center' });

    docPdf.setFontSize(11);
    docPdf.text(`Fecha: ${fechaTexto}`, 15, 55);

    docPdf.setFontSize(10);
    docPdf.text('Consorcio Píntag Expresso', 135, 55);
    docPdf.text('Píntag, Antisana S2-138', 135, 60);
    docPdf.text('consorciopinexpres@hotmail.com', 135, 65);

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
      styles: { fontSize: 10 }
    });

    const finalY = (docPdf as any).lastAutoTable.finalY + 10;
    docPdf.setFontSize(11);
    docPdf.text(`TOTAL ADMINISTRACIÓN: $ ${totalAdministracion.toFixed(2)}`, 15, finalY);

    docPdf.save(`Administracion_${this.fechaPersonalizada || 'vista'}.pdf`);
  }
}
