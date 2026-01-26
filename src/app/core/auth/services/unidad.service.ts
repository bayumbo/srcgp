import { Timestamp } from '@angular/fire/firestore';

export interface UnidadFS {
  id: string;                 // docId: ExpresoAntisana_E01
  codigo: string;             // "E01"
  empresa: string;            // "Expreso Antisana"
  estado: boolean;            // true/false
  numeroOrden: number;        // 1, 2, 3...
  propietarioNombre?: string; // "JUAN CARLOS ORTEGA DIAZ"
  uidPropietario: string;     // UID del usuario
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
