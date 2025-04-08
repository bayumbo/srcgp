import { Timestamp } from "firebase/firestore";

export interface NuevoRegistro {
    adminPagada: number;
    administracion: number;
    minBasePagados: number;
    minutosAtraso: number;
    minutosBase: number;
    minutosPagados: number;
    multas: number;
    multasPagadas: number;
    nombre: string;
    unidad: string;
    id?: string;
    fechaModificacion?: Timestamp;
  }