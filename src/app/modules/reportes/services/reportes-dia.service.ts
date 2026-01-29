// reportes-dia.service.ts
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
  limit,
  writeBatch,
  serverTimestamp,
  deleteDoc,
  DocumentData,
} from '@angular/fire/firestore';

import { Empresa, EMPRESAS, EMPRESA_SLUG } from 'src/app/core/types/empresa.type';

export interface UnidadGlobal {
  id: string; // id del doc global en /unidades (NO se usa como docId diario)
  codigo?: string; // E01 / P01
  numeroOrden?: number;
  empresa?: Empresa | string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;
  estado?: boolean;
}

export interface RegistroDiaUnidad {
  id: string;       // docId real del doc en subcolección "unidades"
  unidadId: string; // redundante: igual a id
  codigo?: string;
  numeroOrden?: number;
  empresa?: Empresa | string;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;

  fecha?: string;    // YYYY-MM-DD
  _fechaISO?: string;

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

  private diaDocId(empresa: Empresa, fechaISO: string): string {
    return `${EMPRESA_SLUG[empresa]}_${fechaISO}`;
  }

  /** docId correcto de unidad diaria: ExpresoAntisana_E01 / GeneralPintag_P01 */
  private unidadDiaDocId(empresa: Empresa, codigo: string): string {
    const slug = EMPRESA_SLUG[empresa];
    const cod = (codigo || '').toString().trim().toUpperCase();
    return `${slug}_${cod}`;
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
    const diaId = this.diaDocId(empresa, fechaISO);
    const ref = collection(this.firestore, `reportes_dia/${diaId}/unidades`);
    const snap = await getDocs(ref);

    return snap.docs.map(d => ({
      id: d.id,
      unidadId: d.id,
      ...(d.data() as any),
    })) as RegistroDiaUnidad[];
  }

  // ---------------------------
  // Última fecha generada (máximo 'fecha' en reportes_dia)
  // ---------------------------
  async getUltimaFechaGenerada(): Promise<string | null> {
    const ref = collection(this.firestore, 'reportes_dia');
    const q = query(ref, orderBy('fecha', 'desc'), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) return null;
    const data = snap.docs[0].data() as DocumentData;
    return (data['fecha'] as string) ?? null;
  }

  // ---------------------------
  // Verificar si existe día por empresa
  // ---------------------------
  async existeDia(empresa: Empresa, fechaISO: string): Promise<boolean> {
    const diaId = this.diaDocId(empresa, fechaISO);
    const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
    const snap = await getDoc(diaRef);
    return snap.exists();
  }

  // ---------------------------
  // Días en rango (headers)
  // ---------------------------
  async getDiasEnRango(
    fechaInicioISO: string,
    fechaFinISO: string
  ): Promise<{ empresa: Empresa; fecha: string; cerrado?: boolean }[]> {
    const ref = collection(this.firestore, 'reportes_dia');

    // fecha es string YYYY-MM-DD => sirve para where + orderBy
    const q = query(
      ref,
      where('fecha', '>=', fechaInicioISO),
      where('fecha', '<=', fechaFinISO),
      orderBy('fecha', 'asc')
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as any);
  }

  // ---------------------------
  // CREAR DÍA COMPLETO (AMBAS EMPRESAS)
  // Crea header si no existe + crea docs por unidad (docId por empresa+codigo)
  // administracion inicia en 2
  // ---------------------------
  async agregarDiaCompleto(
    fechaISO?: string
  ): Promise<{ fecha: string; creados: number; omitidos: number }> {
    const fecha = (fechaISO && fechaISO.trim()) ? fechaISO.trim() : this.hoyISO();

    let creados = 0;
    let omitidos = 0;

    for (const empresa of EMPRESAS) {
      const diaId = this.diaDocId(empresa, fecha);

      const diaRef = doc(this.firestore, `reportes_dia/${diaId}`);
      const diaSnap = await getDoc(diaRef);

      const unidades = await this.getUnidadesPorEmpresa(empresa);

      // existentes por docId correcto (ExpresoAntisana_E01 ...)
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

      // Header día (como tus días correctos)
      if (!diaSnap.exists()) {
        batch.set(diaRef, {
          empresa,
          fecha,
          cerrado: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        batch.set(diaRef, { updatedAt: serverTimestamp() }, { merge: true });
      }
      ops++;

      // Crear doc por unidad usando CODIGO
      for (const u of unidades) {
        const codigo = (u.codigo ?? '').toString().trim().toUpperCase();
        if (!codigo) continue; // si una unidad global no tiene código, no la podemos crear bien

        const unidadDocId = this.unidadDiaDocId(empresa, codigo);

        if (existentes.has(unidadDocId)) {
          omitidos++;
          continue;
        }

        const unidadDocRef = doc(this.firestore, `reportes_dia/${diaId}/unidades/${unidadDocId}`);

        batch.set(unidadDocRef, {
          // datos canónicos de tu modelo nuevo
          codigo,
          empresa,
          fecha,
          numeroOrden: u.numeroOrden ?? 0,
          uidPropietario: u.uidPropietario ?? null,
          propietarioNombre: u.propietarioNombre ?? null,

          // valores del día
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
          fechaModificacion: serverTimestamp(),
          // opcional: legacy map si lo sigues usando en algunas vistas
          // legacy: {},
        }, { merge: true });

        creados++;
        ops++;

        // limite batch
        if (ops >= 450) await commit();
      }

      await commit();
    }

    return { fecha, creados, omitidos };
  }

  // ---------------------------
  // ELIMINAR DÍA COMPLETO (AMBAS EMPRESAS)
  // Borra pagosTotales por unidad + unidades + doc día
  // ---------------------------
  async eliminarDiaCompleto(
    fechaISO: string
  ): Promise<{ fecha: string; eliminados: number; omitidos: number }> {
    const fecha = (fechaISO || '').trim();
    if (!fecha) throw new Error('Fecha requerida para eliminar día.');

    let eliminados = 0;
    let omitidos = 0;

    for (const empresa of EMPRESAS) {
      const diaId = this.diaDocId(empresa, fecha);
      const diaPath = `reportes_dia/${diaId}`;
      const diaRef = doc(this.firestore, diaPath);

      const snapDia = await getDoc(diaRef);
      if (!snapDia.exists()) {
        omitidos++;
        continue;
      }

      // 1) borrar pagosTotales por unidad y luego unidades
      await this.borrarUnidadesYPagosDeDia(diaPath, 200);

      // 2) borrar doc día
      await deleteDoc(diaRef);
      eliminados++;
    }

    return { fecha, eliminados, omitidos };
  }

  // =========================
  // Helpers de borrado (chunks)
  // =========================
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

  private async borrarUnidadesYPagosDeDia(diaPath: string, chunkSize = 200): Promise<void> {
    const unidadesPath = `${diaPath}/unidades`;

    while (true) {
      const colUnidades = collection(this.firestore, unidadesPath);
      const snapUnidades = await getDocs(colUnidades);
      if (snapUnidades.empty) break;

      const lote = snapUnidades.docs.slice(0, chunkSize);

      // borrar pagosTotales dentro de cada unidad
      for (const u of lote) {
        await this.borrarSubcoleccionEnChunks(`${u.ref.path}/pagosTotales`, 400);
      }

      // borrar unidades (batch)
      const batch = writeBatch(this.firestore);
      lote.forEach(u => batch.delete(u.ref));
      await batch.commit();

      if (lote.length < chunkSize) break;
    }
  }

  // ---------------------------
  // RANGO POR EMPRESA (si lo usas para PDF)
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
