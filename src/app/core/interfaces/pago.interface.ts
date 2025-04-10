import { Timestamp } from "firebase/firestore";

export interface Pago {
    multas: number;
    minutosBase: number;
    administracion: number;
    minutosAtraso: number;
    fecha: Timestamp;
    cantidad: number;
    pagado: boolean;
  }