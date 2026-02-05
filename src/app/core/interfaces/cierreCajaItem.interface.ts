export interface CierreCajaItem {
  modulo: string;
  unidad: string;
  fecha: any;        // Date | Timestamp | null
  valor: number;
  empresa?: string;

  // ✅ opcionales para total real por pago
  pagoKey?: string;   // llave dedupe
  pagoTotal?: number; // total del pago (doc)
}


export interface Egreso {
modulo: string;
valor: number;
}
