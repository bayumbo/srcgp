import { Timestamp } from "firebase/firestore";

export interface NuevoRegistro {
    id?: string;
    adminPagada: number;
    administracion: number;
    minBasePagados: number;
    minutosAtraso: number;
    minutosBase: number;
    minutosPagados: number;
    multas: number;
    multasPagadas: number;
    nombre: string;
    apellido: string;
    unidad: string;
    uid?: string;
    fechaModificacion?: Date;
  }
  export interface ReporteConPagos extends NuevoRegistro {
    id: string;
    uid: string;
    minutosPagados: number;
    adminPagada: number;
    minBasePagados: number;
    multasPagadas: number;
  }