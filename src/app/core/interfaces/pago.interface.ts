import { Timestamp } from "firebase/firestore";

export interface Pago {
    fecha: Timestamp;
    cantidad: number;
    pagado: boolean;
  }