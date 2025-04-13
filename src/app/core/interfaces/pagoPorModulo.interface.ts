import { Timestamp } from 'firebase/firestore';

export interface PagoPorModulo {
  cantidad: number;
  fecha: Timestamp;
  reporteId: string;
}
