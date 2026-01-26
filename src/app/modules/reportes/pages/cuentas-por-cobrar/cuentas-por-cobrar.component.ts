import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';

import { AuthService } from 'src/app/core/auth/services/auth.service';

import {
  Firestore,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp
} from '@angular/fire/firestore';

type UnidadItem = {
  unidad: string;   // "E01"
  nombre: string;   // "JUAN ..."
  uid: string;      // legacy.uid (para resolver nombre)
};

type ReporteUnidad = {
  empresa: string;
  fecha: string; // YYYY-MM-DD
  fechaModificacion?: Date;

  administracion: number;
  adminPagada: number;

  minutosBase: number;
  minBasePagados: number;

  minutosAtraso: number;
  minutosPagados: number;

  multas: number;
  multasPagadas: number;

  legacyUid?: string;
  legacyReporteId?: string;
};

@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrls: ['./cuentas-por-cobrar.component.scss']
})
export class CuentasPorCobrarComponent implements OnInit {

  private firestore = inject(Firestore);
  private router = inject(Router);
  private authService = inject(AuthService);

  esSocio: boolean = false;

  filtro: string = '';
  listaUnidades: UnidadItem[] = [];

  unidadSeleccionada: string | null = null;

  reportesSeleccionados: ReporteUnidad[] = [];
  reportesConFechaConvertida: any[] = [];

  error: string = '';
  cargandoUnidades: boolean = false;
  cargandoReportes: boolean = false;

  /**
   * Para performance: buscamos unidades desde los últimos N días.
   * Suficiente para obtener el “catálogo” porque siempre hay movimiento.
   * Si quieres 365 o todo, subimos este valor.
   */
  private diasCatalogo = 180;

  async ngOnInit(): Promise<void> {

    this.cargandoUnidades = true;
    this.error = '';

    try {
      // Rol (se mantiene)
      const role = await new Promise<string>((resolve) => {
        this.authService.currentUserRole$.pipe(take(1)).subscribe(r => resolve(r || ''));
      });
      this.esSocio = role === 'socio';

      // 1) Cargar unidades ordenadas + nombre propietario
      await this.cargarUnidadesOrdenadasConNombre();
    } catch (e) {
      console.error(e);
      this.error = 'Error al cargar unidades.';
    } finally {
      this.cargandoUnidades = false;

    }

  }

  /**
   * Carga "todas las unidades" (catálogo) desde collectionGroup('unidades')
   * - Toma las últimas apariciones de cada unidad (codigo)
   * - Extrae legacy.uid para resolver el nombre desde /usuarios/{uid}
   * - Ordena por codigo (E01, E02...)
   */
  private async cargarUnidadesOrdenadasConNombre(): Promise<void> {
    const desdeISO = this.isoHaceNDias(this.diasCatalogo);

    const unidadesCG = collectionGroup(this.firestore, 'unidades');

    // Filtramos por fecha >= desdeISO para no leer todo el histórico
    const q = query(
      unidadesCG,
      where('fecha', '>=', desdeISO),
      orderBy('fecha', 'desc') // primero lo más reciente
    );

    const snap = await getDocs(q);

    // Map por codigo (unidad)
    const map = new Map<string, { uid: string; nombreDirecto?: string }>();

    snap.forEach(d => {
      const data: any = d.data();

      const codigo = (data.codigo || '').toString().trim(); // "E01"
      if (!codigo) return;
      // ✅ Filtrar códigos inválidos (evita que aparezca "01" sin la E)
      // Ajusta el regex si tienes otros formatos
      if (!/^E\d{2,3}$/i.test(codigo)) return;
      // Tomamos el más reciente para cada codigo (ya viene desc por fecha)
      if (map.has(codigo)) return;

      const uid = (data?.uidPropietario || data?.legacy?.uid || data?.uid || '').toString().trim();
      const nombreDirecto = (data?.propietarioNombre || data?.nombre || data?.propietarioNombre || data?.propietario || '').toString().trim();


      map.set(codigo, { uid, nombreDirecto });
      });

    // Resolver nombres por uid (usuarios/{uid})
    const unidades: UnidadItem[] = [];

  for (const [codigo, info] of map.entries()) {
    const nombre =
      info.nombreDirecto ||
      (await this.obtenerNombreUsuarioFlexible(info.uid)) ||
      '—';

    unidades.push({
      unidad: codigo.toUpperCase(),
      nombre,
      uid: info.uid || ''
    });
  }

    // Ordenar por unidad tipo E01, E02...
    unidades.sort((a, b) => a.unidad.localeCompare(b.unidad, 'es', { numeric: true }));

    this.listaUnidades = unidades;
  }

  /**
   * Obtiene el nombre del usuario desde /usuarios/{uid}.
   * Ajusta el armado del nombre según tu estructura real (nombres/apellidos).
   */
private async obtenerNombreUsuarioFlexible(uid: string): Promise<string> {
  if (!uid) return '';

  try {
    const ref = doc(this.firestore, `usuarios/${uid}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return '';

    const u: any = snap.data();

    // Intentos en cascada (según lo que exista en tu DB)
    const nombres = (u.nombres || '').toString().trim();
    const apellidos = (u.apellidos || '').toString().trim();
    const full1 = `${nombres} ${apellidos}`.trim();
    if (full1) return full1;

    const full2 = (u.nombre || u.displayName || u.razonSocial || '').toString().trim();
    if (full2) return full2;

    const email = (u.email || '').toString().trim();
    return email || '';
  } catch (e) {
    return '';
  }
}


  /**
   * Click en una unidad:
   * - Trae el detalle de todos los días (histórico) para esa unidad (codigo)
   * - Ordena por fecha ascendente
   * - Construye la tabla derecha
   */
  async seleccionarUnidad(unidad: string, uid: string) {
    this.cargandoReportes = true;
    this.error = '';
    this.unidadSeleccionada = unidad;

    try {
      const unidadesCG = collectionGroup(this.firestore, 'unidades');

      // Traemos TODOS los documentos de esa unidad.
      // Si quieres limitar por rango, agregamos where('fecha','>=',...)
      const q = query(
        unidadesCG,
        where('codigo', '==', unidad),
        orderBy('fecha', 'asc')
      );

      const snap = await getDocs(q);

      const rows: ReporteUnidad[] = [];

      snap.forEach(d => {

        const x: any = d.data();

        const fecha = (x.fecha || '').toString(); // "2025-05-02"
        const ts = x.fechaModificacion as Timestamp | undefined;

        rows.push({
          empresa: (x.empresa || '').toString(),
          fecha,

          fechaModificacion: ts?.toDate ? ts.toDate() : (fecha ? new Date(`${fecha}T00:00:00`) : undefined),

          administracion: Number(x.administracion || 0),
          adminPagada: Number(x.adminPagada || 0),

          minutosBase: Number(x.minutosBase || 0),
          minBasePagados: Number(x.minBasePagados || 0),

          minutosAtraso: Number(x.minutosAtraso || 0),
          minutosPagados: Number(x.minutosPagados || 0),

          multas: Number(x.multas || 0),
          multasPagadas: Number(x.multasPagadas || 0),

          legacyUid: (x?.legacy?.uid || '').toString(),
          legacyReporteId: (x?.legacy?.reporteId || '').toString()
        });
      });

      // IMPORTANTE: tu HTML usa reporte.fechaModificacion
      this.reportesSeleccionados = rows;
      this.reportesConFechaConvertida = rows.map(r => ({
        ...r,
        fechaModificacion: r.fechaModificacion ?? new Date(`${r.fecha}T00:00:00`)
      }));

      if (rows.length === 0) {
        this.error = 'No se encontraron registros para esta unidad.';
      }
    } catch (err) {
      console.error(err);
      this.reportesSeleccionados = [];
      this.reportesConFechaConvertida = [];
      this.error = 'Ocurrió un error al buscar el detalle de la unidad.';
    } finally {
      this.cargandoReportes = false;
    }
  }

  // -------------------------
  // Totales: ADEUDADO (asignado - pagado)
  // -------------------------

  get saldoAdministracion(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.administracion - r.adminPagada), 0);
  }

  get saldoMinBase(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.minutosBase - r.minBasePagados), 0);
  }

  get saldoAtraso(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.minutosAtraso - r.minutosPagados), 0);
  }

  get saldoMultas(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.multas - r.multasPagadas), 0);
  }

  get total(): number {
    return this.saldoAdministracion + this.saldoMinBase + this.saldoAtraso + this.saldoMultas;
  }

  // -------------------------
  // Totales: PAGADO (detalle que pediste)
  // Estos no requieren cambiar HTML, pero ya quedan listos para mostrarlos cuando quieras.
  // -------------------------

  get pagadoAdministracion(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.adminPagada || 0), 0);
  }

  get pagadoMinBase(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.minBasePagados || 0), 0);
  }

  get pagadoAtraso(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.minutosPagados || 0), 0);
  }

  get pagadoMultas(): number {
    return this.reportesSeleccionados.reduce((acc, r) => acc + (r.multasPagadas || 0), 0);
  }

  get totalPagado(): number {
    return this.pagadoAdministracion + this.pagadoMinBase + this.pagadoAtraso + this.pagadoMultas;
  }

  /**
   * Botón PAGAR:
   * - Te manda al PAGO del ÚLTIMO REPORTE de esa unidad.
   * - Se usa legacy.uid + legacy.reporteId (porque tu módulo de pagos ya compila deuda ahí).
   */
async generarPago(): Promise<void> {
  if (!this.unidadSeleccionada) {
    this.error = 'Seleccione una unidad primero.';
    return;
  }

  try {
    const unidadesCG = collectionGroup(this.firestore, 'unidades');

    const q = query(
      unidadesCG,
      where('codigo', '==', this.unidadSeleccionada),
      orderBy('fecha', 'desc'),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      this.error = 'No se encontró el último reporte para esta unidad.';
      return;
    }

    const docu = snap.docs[0];
    const data: any = docu.data();

    // ✅ UID REAL del propietario según tu DB
    const uidProp = (data?.uidPropietario || data?.legacy?.uid || data?.uid || '').toString().trim();
    if (!uidProp) {
      this.error = 'El último reporte no tiene uidPropietario.';
      return;
    }

    // ✅ Path real que tu RealizarPagoComponent ya sabe manejar
    const pathReal = docu.ref.path;
    const idParam = encodeURIComponent(pathReal);



    // ✅ Usamos la ruta que tu RealizarPagoComponent YA exige (uid + id)
    this.router.navigate(['/reportes/realizar-pago', uidProp, idParam]);

  } catch (e) {
    console.error(e);
    this.error = 'Error al abrir pagos.';
  }
}

get unidadesFiltradas() {
  const q = (this.filtro || '').toLowerCase();

  return this.listaUnidades.filter(item =>
    (item.unidad || '').toLowerCase().includes(q) ||
    (item.nombre || '').toLowerCase().includes(q)
  );
}

  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }

  private isoHaceNDias(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
