import { Timestamp } from 'firebase/firestore';

export type CampoClave = 'minutosAtraso' | 'administracion' | 'minutosBase' | 'multas';

export interface DocumentoPago {
  id: string;

  // fecha real del pago (mantienes el nombre)
  fecha: Timestamp;

  detalles: Partial<Record<CampoClave, number>>;

  // opcionales (no rompen tu código)
  total?: number;
  urlPDF?: string;
  storagePath?: string;

  // MUY importantes para revertir correctamente
  pathDoc?: string;        // reportes_dia/{diaId}/unidades/{unidadId} donde se aplicó
  unidadId?: string;       // ExpresoAntisana_E01
  codigo?: string;         // E01
  empresa?: string;

  // Para pagos aplicados por fecha/módulo (si quieres máxima precisión)
  aplicaciones?: Array<{
    campo: CampoClave;
    monto: number;
    pathDoc: string;
    fechaDeuda: string; // YYYY-MM-DD
  }>;
}
