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

  private normalizarUnidadDesdePago(p: any): string {
    // en pagos tienes codigo y unidadId
    const codigo = (p?.codigo || '').toString().trim();
    if (codigo) return codigo;

    const unidadId = (p?.unidadId || '').toString().trim();
    if (unidadId) return unidadId.includes('_') ? (unidadId.split('_').pop() || unidadId) : unidadId;

    const unidad = (p?.unidad || '').toString().trim();
    if (unidad) return unidad;

    return '—';
  }

  private pagoKey(p: any, fallbackPath: string): string {
    // urlPDF suele ser único por recibo
    return (p?.urlPDF && `pdf:${p.urlPDF}`) || `path:${fallbackPath}`;
  }

  private normalizarModulo(campo: string): string {
    const c = (campo || '').toLowerCase();
    if (c.includes('administr')) return 'Administracion';
    if (c.includes('minutosatraso') || c === 'minutos') return 'Minutos Atraso';
    if (c.includes('minutosbase')) return 'Minutos Base';
    if (c.includes('multa')) return 'Multas';
    return campo || 'otros';
  }

  private fechaDeudaDesdeAplicacion(a: any): string {
    // tu aplicación ya trae fechaDeuda: "YYYY-MM-DD"
    const f = String(a?.fechaDeuda || '').trim();
    return f || '—';
  }

async obtenerCierrePorFecha(fecha: Date): Promise<CierreCajaItem[]> {
  const { ini, fin } = this.rangoDia(fecha);

  const qPagos = query(
    collectionGroup(this.firestore, 'pagos'),
    where('createdAt', '>=', ini),
    where('createdAt', '<=', fin),
    orderBy('createdAt', 'asc')
  );

  const snap = await getDocs(qPagos);

  const resultados: CierreCajaItem[] = [];

  for (const d of snap.docs) {
    const p = d.data() as any;

    const empresa = this.normalizarEmpresa(p?.empresa || p?.detalles?.empresa || '');
    const unidad = this.normalizarUnidadDesdePago(p);

    // ✅ clave por documento (no por pdf)
    const pagoKey = `path:${d.ref.path}`;

    // ✅ total del doc (en tu caso es parcial por deuda)
    const pagoTotal = Number(p?.total ?? 0);

    const apps: any[] = Array.isArray(p?.aplicaciones) ? p.aplicaciones : [];

    if (apps.length > 0) {
      for (const a of apps) {
        const modulo = this.normalizarModulo(a?.campo);
        const fechaDeuda = String(a?.fechaDeuda || '—').trim();
        const monto = Number(a?.monto ?? 0);

        if (monto <= 0) continue;

        resultados.push({
          modulo,
          unidad,
          fecha: fechaDeuda as any, // ✅ fecha del reporte/deuda
          valor: monto,
          empresa,
          pagoKey,
          pagoTotal
        } as any);
      }
      continue;
    }

    // fallback si no hay aplicaciones
    const det = (p?.detalles || {}) as any;
    const administracion = Number(det?.administracion || 0);
    const minutosAtraso  = Number(det?.minutosAtraso || 0);
    const minutosBase    = Number(det?.minutosBase || 0);
    const multas         = Number(det?.multas || 0);

    if (administracion > 0) resultados.push({ modulo: 'administracion', unidad, fecha: '—' as any, valor: administracion, empresa, pagoKey, pagoTotal } as any);
    if (minutosAtraso  > 0) resultados.push({ modulo: 'minutosAtraso',  unidad, fecha: '—' as any, valor: minutosAtraso,  empresa, pagoKey, pagoTotal } as any);
    if (minutosBase    > 0) resultados.push({ modulo: 'minutosBase',    unidad, fecha: '—' as any, valor: minutosBase,    empresa, pagoKey, pagoTotal } as any);
    if (multas         > 0) resultados.push({ modulo: 'multas',         unidad, fecha: '—' as any, valor: multas,         empresa, pagoKey, pagoTotal } as any);
  }

  // orden: fecha deuda -> unidad -> módulo
  resultados.sort((a: any, b: any) => {
    const fa = String(a.fecha || '—');
    const fb = String(b.fecha || '—');
    if (fa !== fb) return fa.localeCompare(fb);

    const ua = String(a.unidad || '');
    const ub = String(b.unidad || '');
    if (ua !== ub) return ua.localeCompare(ub);

    return String(a.modulo || '').localeCompare(String(b.modulo || ''));
  });

  return resultados;
}

  async obtenerHistorialCierres(): Promise<any[]> {
    const ref = collection(this.firestore, 'cierresCaja');
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
}
