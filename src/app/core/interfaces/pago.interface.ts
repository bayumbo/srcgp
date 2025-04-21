import { Timestamp } from 'firebase/firestore';

export interface Pago {
  multas: number;
  minutosBase: number;
  administracion: number;
  minutosAtraso: number;
  cantidad: number;
  fecha: Timestamp;
  pagado: boolean;
}
