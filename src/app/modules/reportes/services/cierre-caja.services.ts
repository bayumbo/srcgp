import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  collectionGroup,
  orderBy
} from '@angular/fire/firestore';
import { CierreCajaItem } from '../../../core/interfaces/cierreCajaItem.interface';

@Injectable({ providedIn: 'root' })
export class CierreCajaService {
  constructor(private firestore: Firestore) {}

  private rangoDia(fecha: Date) {
    const inicio = new Date(fecha);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(fecha);
    fin.setHours(23, 59, 59, 999);
    return { ini: Timestamp.fromDate(inicio), fin: Timestamp.fromDate(fin) };
  }

  private normalizarEmpresa(empresaCruda: string): string {
    const e = (empresaCruda || 'Sin empresa').toLowerCase();
    if (e.includes('pintag')) return 'General Píntag';
    if (e.includes('antisana')) return 'Expreso Antisana';
    return empresaCruda || 'Sin empresa';
  }

  private normalizarUnidad(p: any): string {
    const codigo = (p?.codigo || p?.unidad || p?.codigoUnidad || '').toString().trim();
    if (codigo) return codigo;

    const unidadId = (p?.unidadId || p?.unidadID || '').toString().trim();
    if (unidadId) return unidadId.includes('_') ? (unidadId.split('_').pop() || unidadId) : unidadId;

    return '—';
  }

  private pagoKey(p: any, fallbackPath: string): string {
    // ✅ Prioridad: legacy.ruta (une pago nuevo con legacy)
    return (
      (p?.legacy?.ruta && `ruta:${p.legacy.ruta}`) ||
      (p?.urlPDF && `pdf:${p.urlPDF}`) ||
      `path:${fallbackPath}`
    );
  }

  private pushLineasPorModulo(
    out: CierreCajaItem[],
    p: any,
    key: string
  ) {
    const empresa = this.normalizarEmpresa(p?.empresa || p?.detalles?.empresa || '');
    const unidad = this.normalizarUnidad(p);

    const det = (p?.detalles || {}) as any;

    const administracion = Number(det?.administracion || 0);
    const minutosAtraso  = Number(det?.minutosAtraso || 0);
    const minutosBase    = Number(det?.minutosBase || 0);
    const multas         = Number(det?.multas || 0);

    const fechaPago = p?.createdAt ?? null;     // Timestamp
    const totalPago = Number(p?.total ?? 0);    // ✅ total real del pago

    // Solo si el pago tiene algo (por módulos) o total > 0
    // (si total > 0 pero detalles vacíos, igual lo registramos como "otros")
    const pushedAny =
      administracion > 0 || minutosAtraso > 0 || minutosBase > 0 || multas > 0;

    if (administracion > 0) out.push({ modulo: 'administracion', unidad, fecha: fechaPago as any, valor: administracion, empresa, pagoKey: key, pagoTotal: totalPago });
    if (minutosAtraso  > 0) out.push({ modulo: 'minutosAtraso',  unidad, fecha: fechaPago as any, valor: minutosAtraso,  empresa, pagoKey: key, pagoTotal: totalPago });
    if (minutosBase    > 0) out.push({ modulo: 'minutosBase',    unidad, fecha: fechaPago as any, valor: minutosBase,    empresa, pagoKey: key, pagoTotal: totalPago });
    if (multas         > 0) out.push({ modulo: 'multas',         unidad, fecha: fechaPago as any, valor: multas,         empresa, pagoKey: key, pagoTotal: totalPago });

    // Si no hay detalle por módulo pero sí hay total, crea una fila "otros"
    if (!pushedAny && totalPago > 0) {
      out.push({ modulo: 'otros', unidad, fecha: fechaPago as any, valor: totalPago, empresa, pagoKey: key, pagoTotal: totalPago });
    }
  }

  async obtenerCierrePorFecha(fecha: Date): Promise<CierreCajaItem[]> {
    const { ini, fin } = this.rangoDia(fecha);

    const qNuevos = query(
      collectionGroup(this.firestore, 'pagos'),
      where('createdAt', '>=', ini),
      where('createdAt', '<=', fin),
      orderBy('createdAt', 'asc')
    );

    const qLegacy = query(
      collectionGroup(this.firestore, 'pagosTotales'),
      where('createdAt', '>=', ini),
      where('createdAt', '<=', fin),
      orderBy('createdAt', 'asc')
    );

    const [snapNuevos, snapLegacy] = await Promise.all([
      getDocs(qNuevos),
      getDocs(qLegacy)
    ]);

    // ✅ dedupe por pago (no por líneas)
    const pagosUnicos = new Map<string, any>();

    // Primero metemos legacy (base)
    for (const d of snapLegacy.docs) {
      const p = d.data() as any;
      const key = this.pagoKey(p, d.ref.path);
      if (!pagosUnicos.has(key)) pagosUnicos.set(key, p);
    }

    // Luego metemos nuevos, pero si trae legacy.ruta, reemplaza/une sin duplicar
    for (const d of snapNuevos.docs) {
      const p = d.data() as any;
      const key = this.pagoKey(p, d.ref.path);
      // preferimos el doc nuevo si existe
      pagosUnicos.set(key, p);
    }

    // Ahora convertimos a líneas por módulo
    const resultados: CierreCajaItem[] = [];
    for (const [key, p] of pagosUnicos.entries()) {
      this.pushLineasPorModulo(resultados, p, key);
    }

    return resultados.filter(x => Number(x.valor) > 0);
  }
async obtenerHistorialCierres(): Promise<any[]> {
  const ref = collection(this.firestore, 'cierresCaja');
  const snapshot = await getDocs(ref);
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}
}
