import { Empresa } from '../types/empresa.type';

export interface UnidadGlobal {
  id: string;
  codigo?: string;
  numeroOrden?: number;
  empresa?: Empresa;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;
  estado?: boolean;
}

export interface RegistroDiaUnidad {
  id: string;       // docId = unidadId
  unidadId: string; // redundante para facilidad

  codigo?: string;
  numeroOrden?: number;
  empresa?: Empresa;
  uidPropietario?: string | null;
  propietarioNombre?: string | null;

  administracion: number;
  minutosBase: number;
  minutosAtraso: number;
  multas: number;

  adminPagada: number;
  minBasePagados: number;
  minutosPagados: number;
  multasPagadas: number;
}
