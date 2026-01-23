import { ReportesDiaService } from './../../../services/reportes-dia.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from '@angular/fire/firestore';

type EmpresaNombre = 'General Pintag' | 'Expreso Antisana';

type UnidadBase = {
  id: string; // docId de catálogo/unidad (puede ser E13 o ExpresoAntisana_E13)
  codigo?: string | null; // "E13"
  numeroOrden?: number | null;

  uidPropietario?: string | null;
  propietarioNombre?: string | null;

  empresa?: string | null;
};

@Component({
  selector: 'app-nuevo-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nuevo-registro.component.html',
  styleUrls: ['./nuevo-registro.component.scss'],
})
export class NuevoRegistroComponent implements OnInit {
  private firestore = inject(Firestore);
  private router = inject(Router);
  private reportesDiaService = inject(ReportesDiaService);

  // ==========================
  // Estado UI
  // ==========================
  cargando = false;
  resultado = '';
  error = '';

  // ==========================
  // Empresa/Fecha (tu HTML usa fechaInput)
  // ==========================
  empresa: EmpresaNombre = 'Expreso Antisana';
  fechaInput = ''; // YYYY-MM-DD

  // ==========================
  // Buscador unidades (tu HTML)
  // ==========================
  unidadBuscada = '';
  dropdownAbierto = false;
  unidades: UnidadBase[] = [];
  unidadesFiltradas: UnidadBase[] = [];
  unidadSeleccionada: UnidadBase | null = null;

  // ==========================
  // Modelo que tu HTML ya usa: reporte.*
  // ==========================
  reporte: any = {
    nombre: '',
    apellido: '',
    unidad: '',

    administracion: 2,
    minutosBase: 0,
    minutosAtraso: 0,
    multas: 0,
  };

  async ngOnInit(): Promise<void> {
    // fecha por defecto: hoy
    this.fechaInput = this.toISO(new Date());
    await this.cargarUnidadesEmpresa();
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

  private empresaToKey(empresa: string): string {
    return (empresa || '').replace(/\s+/g, '').trim();
  }

  private diaDocId(empresaKey: string, fechaISO: string): string {
    return `${empresaKey}_${fechaISO}`;
  }

  private unidadDocId(empresaKey: string, codigo: string): string {
    // DocId definitivo para el día: ExpresoAntisana_E13
    return `${empresaKey}_${(codigo || '').trim().toUpperCase()}`;
  }

  private extraerCodigoDesdeId(id: string): string {
    // "ExpresoAntisana_E13" -> "E13"
    const parts = (id || '').split('_');
    return (parts[parts.length - 1] || '').trim().toUpperCase();
  }

  private ordenarPorCodigo(units: UnidadBase[]): UnidadBase[] {
    return [...units].sort((a, b) => {
      const ca = (a.codigo ?? '').toString();
      const cb = (b.codigo ?? '').toString();
      const na = parseInt(ca.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(cb.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
  }

  // ==========================
  // Cargar unidades por empresa (catálogo)
  // ==========================
  async cargarUnidadesEmpresa() {
    try {
      this.cargando = true;
      this.error = '';
      this.resultado = '';

      const lista: UnidadBase[] = await this.reportesDiaService.getUnidadesPorEmpresa(
        this.empresa as any
      );

      // Normalizamos: aseguramos codigo siempre
      this.unidades = (lista || []).map(u => ({
        ...u,
        codigo: (u.codigo ?? this.extraerCodigoDesdeId(u.id))
          .toString()
          .trim()
          .toUpperCase(),
      }));

      this.unidadesFiltradas = this.ordenarPorCodigo(this.unidades);
    } catch (e: any) {
      console.error(e);
      this.error = `Error cargando unidades: ${e?.message ?? e}`;
      this.unidades = [];
      this.unidadesFiltradas = [];
    } finally {
      this.cargando = false;
    }
  }

  // ==========================
  // Dropdown (lo que tu HTML llama)
  // ==========================
  mostrarUnidadesDisponibles() {
    this.dropdownAbierto = true;
    this.filtrarPorUnidad();
  }

  filtrarPorUnidad() {
    const q = (this.unidadBuscada || '').toString().trim().toLowerCase();
    const base = this.unidades || [];

    if (!q) {
      this.unidadesFiltradas = this.ordenarPorCodigo(base);
      return;
    }

    this.unidadesFiltradas = this.ordenarPorCodigo(
      base.filter(u => {
        const codigo = (u.codigo ?? '').toString().toLowerCase();
        const nombre = (u.propietarioNombre ?? '').toString().toLowerCase();
        const empresa = (u.empresa ?? '').toString().toLowerCase();
        return codigo.includes(q) || nombre.includes(q) || empresa.includes(q);
      })
    );
  }

  cerrarDropdownConDelay() {
    // blur ocurre antes que mousedown; delay evita que se cierre y no seleccione
    setTimeout(() => {
      this.dropdownAbierto = false;
    }, 150);
  }

  // TU HTML hace: (mousedown)="seleccionarUnidad(u)"
  seleccionarUnidad(u: UnidadBase) {
    this.unidadSeleccionada = u;
    this.dropdownAbierto = false;
    this.error = '';
    this.resultado = '';

    const codigo = (u.codigo ?? this.extraerCodigoDesdeId(u.id))
      .toString()
      .trim()
      .toUpperCase();
    const nombre = (u.propietarioNombre ?? '').toString().trim();
    const empresa = (u.empresa ?? this.empresa).toString();

    // Reflejar selección en UI
    this.unidadBuscada = codigo;
    this.reporte.unidad = codigo;
    this.reporte.nombre = nombre;
    this.reporte.apellido = ''; // tu base trae nombre completo

    // Si el catálogo trae empresa, sincroniza (opcional)
    if (empresa === 'General Pintag' || empresa === 'Expreso Antisana') {
      this.empresa = empresa as EmpresaNombre;
    }
  }

  limpiarSeleccion() {
    this.unidadSeleccionada = null;
    this.unidadBuscada = '';
    this.reporte.nombre = '';
    this.reporte.apellido = '';
    this.reporte.unidad = '';
    this.dropdownAbierto = false;
  }

  // ==========================
  // Submit (tu HTML hace (ngSubmit)="enviar()")
  // BLOQUEA duplicado: no permite crear si ya existe unidad en ese día.
  // ==========================
  async enviar() {
    this.error = '';
    this.resultado = '';

    if (!this.unidadSeleccionada) {
      this.error = 'Seleccione una unidad.';
      return;
    }

    const fechaISO = (this.fechaInput || '').toString().trim();
    if (!fechaISO) {
      this.error = 'Seleccione una fecha.';
      return;
    }

    // Datos desde unidad seleccionada (fuente de verdad)
    const empresaFinal: EmpresaNombre =
      (this.unidadSeleccionada.empresa as EmpresaNombre) || this.empresa;

    const empresaKey = this.empresaToKey(empresaFinal);

    const codigo = (this.unidadSeleccionada.codigo ??
      this.extraerCodigoDesdeId(this.unidadSeleccionada.id))
      .toString()
      .trim()
      .toUpperCase();

    const uidPropietario = (this.unidadSeleccionada.uidPropietario ?? '')
      .toString()
      .trim();
    const propietarioNombre = (this.unidadSeleccionada.propietarioNombre ?? '')
      .toString()
      .trim();

    if (!codigo) {
      this.error = 'No se pudo resolver el código de la unidad.';
      return;
    }
    if (!uidPropietario) {
      this.error = 'La unidad no tiene uidPropietario (revisa catálogo).';
      return;
    }
    if (!propietarioNombre) {
      this.error = 'La unidad no tiene propietarioNombre (revisa catálogo).';
      return;
    }

    try {
      this.cargando = true;

      const diaId = this.diaDocId(empresaKey, fechaISO);
      const unidadId = this.unidadDocId(empresaKey, codigo); // ExpresoAntisana_E13
      const refDia = doc(this.firestore, `reportes_dia/${diaId}`);
      const refUnidad = doc(this.firestore, `reportes_dia/${diaId}/unidades/${unidadId}`);

      // 1) asegurar doc del día
      await setDoc(
        refDia,
        {
          empresa: empresaFinal,
          fecha: fechaISO,
          cerrado: false,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2) ✅ BLOQUEO: si ya existe el registro de esa unidad en ese día, no crear
      const existente = await getDoc(refUnidad);
      if (existente.exists()) {
        const msg = `Ya existe un registro para la unidad ${codigo} en la fecha ${fechaISO}.`;
        this.error = msg;
        alert(msg);
        return;
      }

      // 3) crear doc unidad del día (merge:false porque ya confirmamos que no existe)
      await setDoc(
        refUnidad,
        {
          empresa: empresaFinal,
          fecha: fechaISO,

          unidadId: unidadId, // ExpresoAntisana_E13
          codigo: codigo,     // E13
          numeroOrden: this.unidadSeleccionada.numeroOrden ?? null,

          uidPropietario: uidPropietario,
          propietarioNombre: propietarioNombre,

          administracion: Number(this.reporte.administracion ?? 0),
          minutosBase: Number(this.reporte.minutosBase ?? 0),
          minutosAtraso: Number(this.reporte.minutosAtraso ?? 0),
          multas: Number(this.reporte.multas ?? 0),

          adminPagada: 0,
          minBasePagados: 0,
          minutosPagados: 0,
          multasPagadas: 0,

          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedBy: null,
        },
        { merge: false }
      );

      this.resultado = `Registro guardado: ${codigo} - ${propietarioNombre}`;
      this.router.navigate(['/reportes/lista-reportes']);
    } catch (e: any) {
      console.error(e);
      this.error = `No se pudo guardar: ${e?.code ?? e?.message ?? e}`;
    } finally {
      this.cargando = false;
    }
  }

  cancelar() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
