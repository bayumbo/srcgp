export interface CierreCajaItem {
  modulo: string;
  unidad: string;

  // ✅ fecha del REPORTE (día contable)
  fecha: string; // "YYYY-MM-DD"

  valor: number;
  empresa?: string;

  // dedupe / total real por pago
  pagoKey?: string;
  pagoTotal?: number;
}
