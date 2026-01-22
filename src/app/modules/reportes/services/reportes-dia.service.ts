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
  serverTimestamp,
  DocumentData,
} from '@angular/fire/firestore';
import { Empresa, EMPRESAS, EMPRESA_SLUG } from 'src/app/core/types/empresa.type';

export interface UnidadGlobal {
  id: string;
  codigo?: string;
  numeroOrden?: number;
  empresa?: Empresa | string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;
  estado?: boolean;
}

export interface RegistroDiaUnidad {
  id: string;       // docId = unidadId
  unidadId: string; // redundante
  codigo?: string;
  numeroOrden?: number;
  empresa?: Empresa | string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;

  // clave para reportes por rango/PDF
  fecha?: string; // YYYY-MM-DD
  _fechaISO?: string; // helper interno

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
  private hoyISO(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private diaId(empresa: Empresa, fechaISO: string): string {
    return `${EMPRESA_SLUG[empresa]}_${fechaISO}`;
  }

  // ---------------------------
  // Unidades globales activas por empresa
  // ---------------------------
  async getUnidadesPorEmpresa(empresa: Empresa): Promise<UnidadGlobal[]> {
    const unidadesRef = collection(this.firestore, 'unidades');
    const q = query(
      unidadesRef,
      where('empresa', '==', empresa),
      where('estado', '==', true),
      orderBy('numeroOrden', 'asc')
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any),
    }));
  }

  // ---------------------------
  // Registros del día por empresa (subcolección unidades)
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
  // Último día generado (máximo 'fecha' en reportes_dia)
  // Devuelve YYYY-MM-DD o null si no hay nada
  // ---------------------------
  async getUltimaFechaGenerada(): Promise<string | null> {
    const ref = collection(this.firestore, 'reportes_dia');
    const q = query(ref, orderBy('fecha', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const data = snap.docs[0].data() as DocumentData;
    return (data['fecha'] as string) ?? null;
  }

  // ---------------------------
  // Crear día completo (ambas empresas)
  // Crea/merge header y crea docs por unidad si no existen
  // IMPORTANTÍSIMO: guarda `fecha` también en el doc de unidad
  // ---------------------------
  async agregarDiaCompleto(): Promise<{ fecha: string; creados: number; omitidos: number }> {
    const fecha = this.hoyISO();

    let creados = 0;
    let omitidos = 0;

    for (const empresa of EMPRESAS) {
      const diaId = this.diaId(empresa, fecha);

      const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
      const diaSnap = await getDoc(diaRef);

      const unidades = await this.getUnidadesPorEmpresa(empresa);

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

      // Header día
      if (!diaSnap.exists()) {
        batch.set(diaRef, {
          empresa,
          fecha, // YYYY-MM-DD
          cerrado: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        ops++;
      } else {
        batch.set(diaRef, {
          updatedAt: serverTimestamp(),
        }, { merge: true });
        ops++;
      }

      // Docs por unidad
      for (const u of unidades) {
        const unidadId = u.id;

        if (existentes.has(unidadId)) {
          omitidos++;
          continue;
        }

        const unidadDocRef = doc(this.firestore, `reportes_dia/${diaId}/unidades/${unidadId}`);

        batch.set(unidadDocRef, {
          unidadId,
          fecha, // <- CLAVE PARA PDFs POR RANGO
          codigo: u.codigo ?? null,
          numeroOrden: u.numeroOrden ?? 0,
          empresa: (u.empresa as any) ?? empresa,
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

        // Batch limit 500
        if (ops >= 450) await commit();
      }

      await commit();
    }

    return { fecha, creados, omitidos };
  }
  async getDiasEnRango(fechaInicioISO: string, fechaFinISO: string): Promise<{ empresa: Empresa; fecha: string; cerrado?: boolean }[]> {
  const ref = collection(this.firestore, 'reportes_dia');

  // OJO: tu campo fecha es string YYYY-MM-DD, sirve para order/compare.
  const q = query(
    ref,
    where('fecha', '>=', fechaInicioISO),
    where('fecha', '<=', fechaFinISO),
    orderBy('fecha', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => (d.data() as any));
}
  async existeDia(empresa: Empresa, fechaISO: string): Promise<boolean> {
    const diaId = this.diaId(empresa, fechaISO);
    const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
    const snap = await getDoc(diaRef);
    return snap.exists();
  }
  // ---------------------------
  // Rango por empresa para PDF (máx 31 días)
  // Lee headers reportes_dia dentro del rango y concatena unidades.
  // Retorna unidades con `fecha` y `_fechaISO`.
  // ---------------------------
  async getRegistrosEnRangoPorEmpresa(
    empresa: Empresa,
    fechaInicioISO: string,
    fechaFinISO: string
  ): Promise<RegistroDiaUnidad[]> {
    const ref = collection(this.firestore, 'reportes_dia');

    const q = query(
      ref,
      where('empresa', '==', empresa),
      where('fecha', '>=', fechaInicioISO),
      where('fecha', '<=', fechaFinISO),
      orderBy('fecha', 'asc')
    );

    const snap = await getDocs(q);

    const all: RegistroDiaUnidad[] = [];
    for (const d of snap.docs) {
      const header = d.data() as any;
      const fechaISO = (header?.fecha as string) ?? null;
      const diaDocId = d.id;

      const unidadesRef = collection(this.firestore, `reportes_dia/${diaDocId}/unidades`);
      const unidadesSnap = await getDocs(unidadesRef);

      for (const u of unidadesSnap.docs) {
        all.push({
          id: u.id,
          unidadId: u.id,
          _fechaISO: fechaISO ?? undefined,
          ...(u.data() as any),
        } as RegistroDiaUnidad);
      }
    }

    return all;
  }
}
