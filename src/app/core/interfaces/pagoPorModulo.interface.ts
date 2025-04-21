import { Timestamp } from 'firebase/firestore';

export interface PagoPorModulo {
  id: string;
  cantidad: number;
  fecha: Timestamp;
  reporteId: string;
}
