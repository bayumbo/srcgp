import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
} from '@angular/fire/firestore';

type Empresa = 'General Pintag' | 'Expreso Antisana';

export interface UnidadGlobal {
  id: string;
  codigo?: string;
  numeroOrden?: number;
  empresa?: string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;
  estado?: boolean;
}

export interface RegistroDiaUnidad {
  id: string;       // docId = unidadId
  unidadId: string; // redundante para facilidad
  codigo?: string;
  numeroOrden?: number;
  empresa?: string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;

  administracion: number;
  minutosBase: number;
  minutosAtraso: number;
  multas: number;

  adminPagada: number;
  minBasePagados: number;
  minutosPagados: number;
  multasPagadas: number;
}

@Injectable({ providedIn: 'root' })
export class ReportesDiaService {
  constructor(private firestore: Firestore) {}

  // ---------------------------
  // Helpers
  // ---------------------------
  private empresaSlug(empresa: string): string {
    return empresa.replace(/\s+/g, ''); // "General Pintag" -> "GeneralPintag"
  }

  private hoyISO(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private diaId(empresa: Empresa, fechaISO: string): string {
    return `${this.empresaSlug(empresa)}_${fechaISO}`;
  }

  // ---------------------------
  // NUEVO: Lectura de unidades globales por empresa
  // ---------------------------
  async getUnidadesPorEmpresa(empresa: Empresa): Promise<UnidadGlobal[]> {
    const unidadesRef = collection(this.firestore, 'unidades');

    // Nota: orderBy requiere índice si combinas where + orderBy (Firestore te lo pedirá si falta)
    const q = query(
      unidadesRef,
      where('empresa', '==', empresa),
      where('estado', '==', true),
      orderBy('numeroOrden', 'asc')
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));
  }

  // ---------------------------
  // NUEVO: Lectura de registros del día (reportes_dia)
  // ---------------------------
  async getRegistrosDia(empresa: Empresa, fechaISO: string): Promise<RegistroDiaUnidad[]> {
    const diaId = this.diaId(empresa, fechaISO);
    const ref = collection(this.firestore, `reportes_dia/${diaId}/unidades`);
    const snap = await getDocs(ref);

    return snap.docs.map(d => ({
      id: d.id,
      unidadId: d.id,
      ...(d.data() as any),
    })) as RegistroDiaUnidad[];
  }

  // ---------------------------
  // Crear día completo (ya lo tenías; dejo versión robusta)
  // ---------------------------
  async agregarDiaCompleto(): Promise<{ fecha: string; creados: number; omitidos: number }> {
    const fecha = this.hoyISO();
    const empresas: Empresa[] = ['General Pintag', 'Expreso Antisana'];

    let creados = 0;
    let omitidos = 0;

    for (const empresa of empresas) {
      const diaId = this.diaId(empresa, fecha);

      const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
      const diaSnap = await getDoc(diaRef);

      // Unidades activas de esa empresa
      const unidades = await this.getUnidadesPorEmpresa(empresa);

      // Unidades ya creadas en el día (para no duplicar)
      const unidadesDiaRef = collection(this.firestore, `reportes_dia/${diaId}/unidades`);
      const snapUnidadesDia = await getDocs(unidadesDiaRef);
      const existentes = new Set<string>(snapUnidadesDia.docs.map(d => d.id));

      let batch = writeBatch(this.firestore);
      let ops = 0;

      const commit = async () => {
        if (ops > 0) {
          await batch.commit();
          batch = writeBatch(this.firestore);
          ops = 0;
        }
      };

      // Crear cabecera si no existe
      if (!diaSnap.exists()) {
        batch.set(diaRef, {
          empresa,
          fecha,
          cerrado: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        ops++;
      } else {
        // actualiza timestamp (opcional)
        batch.set(diaRef, {
          updatedAt: serverTimestamp(),
        }, { merge: true });
        ops++;
      }

      // Crear documentos por unidad
      for (const u of unidades) {
        const unidadId = u.id;

        if (existentes.has(unidadId)) {
          omitidos++;
          continue;
        }

        const unidadDocRef = doc(this.firestore, `reportes_dia/${diaId}/unidades/${unidadId}`);

        batch.set(unidadDocRef, {
          unidadId,
          codigo: u.codigo ?? null,
          numeroOrden: u.numeroOrden ?? 0,
          empresa: u.empresa ?? empresa,
          uidPropietario: u.uidPropietario ?? null,
          propietarioNombre: u.propietarioNombre ?? null,

          // Iniciales del día
          administracion: 2,
          minutosBase: 0,
          minutosAtraso: 0,
          multas: 0,

          adminPagada: 0,
          minBasePagados: 0,
          minutosPagados: 0,
          multasPagadas: 0,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: null,
        }, { merge: true });

        creados++;
        ops++;

        // Firestore batch limit = 500; dejamos margen
        if (ops >= 450) await commit();
      }

      await commit();
    }

    return { fecha, creados, omitidos };
  }
}
