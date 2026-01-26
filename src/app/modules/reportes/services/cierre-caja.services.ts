import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  doc
} from '@angular/fire/firestore';
import { CierreCajaItem } from '../../../core/interfaces/cierreCajaItem.interface';

@Injectable({ providedIn: 'root' })
export class CierreCajaService {

  constructor(private firestore: Firestore) {}

  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private normalizarEmpresa(empresaCruda: string): string {
    const e = (empresaCruda || 'Sin empresa').toLowerCase();
    if (e.includes('pintag')) return 'General Píntag';
    if (e.includes('antisana')) return 'Expreso Antisana';
    return empresaCruda || 'Sin empresa';
  }

  private normalizarUnidad(unidadId: string, dataUnidad?: any): string {
    // Si el doc trae campo "unidad", úsalo.
    const u = dataUnidad?.unidad;
    if (u && typeof u === 'string' && u.trim()) return u.trim();

    // Si el ID viene como "ExpresoAntisana_E01", toma lo último
    if (unidadId.includes('_')) return unidadId.split('_').pop() || unidadId;

    return unidadId;
  }

  async obtenerCierrePorFecha(fecha: Date): Promise<CierreCajaItem[]> {
    const fechaISO = this.isoDate(fecha);

    // 1) Buscar todos los "días" que correspondan a esa fecha
    // (tu docId es Empresa_YYYY-MM-DD, pero el campo fecha existe según tu modelo)
    const diasRef = collection(this.firestore, 'reportes_dia');
    const qDias = query(diasRef, where('fecha', '==', fechaISO));
    const diasSnap = await getDocs(qDias);

    const resultados: CierreCajaItem[] = [];

    // 2) Recorrer cada empresa/día y leer sus unidades
    for (const diaDoc of diasSnap.docs) {
      const diaData = diaDoc.data() as any;
      const empresa = this.normalizarEmpresa(diaData?.empresa);

      const unidadesRef = collection(this.firestore, `reportes_dia/${diaDoc.id}/unidades`);
      const unidadesSnap = await getDocs(unidadesRef);

      for (const uDoc of unidadesSnap.docs) {
        const uData = uDoc.data() as any;
        const unidad = this.normalizarUnidad(uDoc.id, uData);

        // IMPORTANTÍSIMO:
        // El cierre DEBE sumar lo pagado (no lo asignado).
        const adminPagada = Number(uData?.adminPagada || 0);
        const minutosPagados = Number(uData?.minutosPagados || 0);
        const minBasePagados = Number(uData?.minBasePagados || 0);
        const multasPagadas = Number(uData?.multasPagadas || 0);

        // Solo empujar filas si hay valor > 0
        if (adminPagada > 0) {
          resultados.push({ modulo: 'administracion', unidad, fecha: fechaISO as any, valor: adminPagada, empresa });
        }
        if (minutosPagados > 0) {
          resultados.push({ modulo: 'minutosAtraso', unidad, fecha: fechaISO as any, valor: minutosPagados, empresa });
        }
        if (minBasePagados > 0) {
          resultados.push({ modulo: 'minutosBase', unidad, fecha: fechaISO as any, valor: minBasePagados, empresa });
        }
        if (multasPagadas > 0) {
          resultados.push({ modulo: 'multas', unidad, fecha: fechaISO as any, valor: multasPagadas, empresa });
        }
      }
    }

    return resultados;
  }

  async obtenerHistorialCierres(): Promise<any[]> {
    const ref = collection(this.firestore, 'cierresCaja');
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
}
