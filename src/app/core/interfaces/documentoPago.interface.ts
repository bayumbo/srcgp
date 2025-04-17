import { Timestamp } from 'firebase/firestore';

export interface DocumentoPago {
  id: string;
  fecha: Timestamp;
  detalles: Partial<Record<'minutosAtraso' | 'administracion' | 'minutosBase' | 'multas', number>>;
}