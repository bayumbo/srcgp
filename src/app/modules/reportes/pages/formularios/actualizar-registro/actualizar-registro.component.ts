import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';

@Component({
  selector: 'app-actualizar-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './actualizar-registro.component.html',
  styleUrls: ['./actualizar-registro.component.scss']
})
export class ActualizarRegistroComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);

  uid: string = '';
  id: string = '';

  // ✅ Fecha del día que se está editando (para volver a ese mismo día)
  fechaEditada: string = '';

  // Ruta real del documento (reportes_dia/... o legacy usuarios/... )
  private pathActual: string = '';

  registro: NuevoRegistro & { nombre?: string; apellido?: string; unidad?: string } = {
    administracion: 0,
    minutosAtraso: 0,
    minutosBase: 0,
    multas: 0,
    adminPagada: 0,
    minBasePagados: 0,
    minutosPagados: 0,
    multasPagadas: 0,
    nombre: '',
    apellido: '',
    unidad: ''
  };

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async params => {
      const uidRaw = params.get('uid');
      const idRaw = params.get('id');

      if (!uidRaw || !idRaw) {
        alert('❌ Parámetros inválidos (uid/id).');
        this.router.navigate(['/reportes/lista-reportes']);
        return;
      }

      this.uid = uidRaw;
      this.id = decodeURIComponent(idRaw);

      // Fallback informativo desde queryParams (si el doc no trae nombre/apellido/unidad)
      const qp = this.route.snapshot.queryParamMap;
      const nombreQP = (qp.get('nombre') ?? '').toString().trim();
      const apellidoQP = (qp.get('apellido') ?? '').toString().trim();
      const unidadQP = (qp.get('unidad') ?? '').toString().trim();

      // Resolver ruta real del doc
      this.pathActual = this.resolverPath(this.uid, this.id);

      try {
        const ref = doc(this.firestore, this.pathActual);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          alert('❌ Registro no encontrado');
          this.router.navigate(['/reportes/lista-reportes']);
          return;
        }

        const data = snap.data() as any;

        // ✅ Guardar la fecha del día editado (para volver a ese día)
        this.fechaEditada =
          (data.fecha ?? '').toString().trim() ||
          this.extraerFechaDesdePath(this.pathActual);

        this.registro = {
          ...this.registro,
          ...data,

          administracion: Number(data.administracion ?? 0),
          minutosAtraso: Number(data.minutosAtraso ?? 0),
          minutosBase: Number(data.minutosBase ?? 0),
          multas: Number(data.multas ?? 0),

          adminPagada: Number(data.adminPagada ?? 0),
          minBasePagados: Number(data.minBasePagados ?? 0),
          minutosPagados: Number(data.minutosPagados ?? 0),
          multasPagadas: Number(data.multasPagadas ?? 0),

          nombre: ((data.nombre ?? nombreQP) ?? '').toString().trim(),
          apellido: ((data.apellido ?? apellidoQP) ?? '').toString().trim(),
          unidad: ((data.unidad ?? unidadQP) ?? '').toString().trim()
        };
      } catch (e) {
        console.error(e);
        alert('❌ Error cargando el registro');
        this.router.navigate(['/reportes/lista-reportes']);
      }
    });
  }

  /**
   * 1) Si id viene como refPath real (ej: reportes_dia/XXX/unidades/YYY), úsalo directo.
   * 2) Si viene compuesto empresaKey_YYYY-MM-DD_unidadId, construye reportes_dia.
   * 3) Si no, cae a legacy usuarios/{uid}/reportesDiarios/{id}.
   */
  private resolverPath(uid: string, id: string): string {
    if (id.startsWith('reportes_dia/')) return id;

    const partes = (id ?? '').split('_');

    // Nuevo esquema: empresaKey_YYYY-MM-DD_unidadId (mínimo 3 partes)
    if (partes.length >= 3) {
      const unidadId = partes[partes.length - 1];
      const diaId = partes.slice(0, partes.length - 1).join('_');
      return `reportes_dia/${diaId}/unidades/${unidadId}`;
    }

    // Legacy
    return `usuarios/${uid}/reportesDiarios/${id}`;
  }

  // ✅ Extrae YYYY-MM-DD desde "reportes_dia/Empresa_YYYY-MM-DD/unidades/..."
  private extraerFechaDesdePath(path: string): string {
    const match = path.match(/_(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  async guardar(): Promise<void> {
    if (!this.pathActual) {
      alert('❌ No se pudo determinar la ruta del registro.');
      return;
    }

    const administracion = Number(this.registro.administracion ?? 0);
    const minutosBase = Number(this.registro.minutosBase ?? 0);
    const minutosAtraso = Number(this.registro.minutosAtraso ?? 0);
    const multas = Number(this.registro.multas ?? 0);

    const todoEnCero =
      administracion === 0 &&
      minutosBase === 0 &&
      minutosAtraso === 0 &&
      multas === 0;

    const ref = doc(this.firestore, this.pathActual);

    try {
      if (todoEnCero) {
        await deleteDoc(ref);

        alert('🗑️ Registro eliminado (todos los valores quedaron en 0)');
        await this.router.navigate(['/reportes/lista-reportes'], {
          queryParams: { fecha: this.fechaEditada }
        });
        return;
      }

      await updateDoc(ref, {
        administracion,
        minutosBase,
        minutosAtraso,
        multas,

        nombre: (this.registro.nombre ?? '').toString().trim(),
        apellido: (this.registro.apellido ?? '').toString().trim(),
        unidad: (this.registro.unidad ?? '').toString().trim(),

        fechaModificacion: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert('✅ Registro actualizado');

      // ✅ volver al MISMO día usando queryParams
      await this.router.navigate(['/reportes/lista-reportes'], {
        queryParams: { fecha: this.fechaEditada }
      });
    } catch (e) {
      console.error(e);
      alert('❌ Error al guardar el registro');
    }
  }

  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes'], {
      queryParams: { fecha: this.fechaEditada }
    });
  }
}
