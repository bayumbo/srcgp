import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  Timestamp,
  doc,
  serverTimestamp
} from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private firestore: Firestore) {}

  guardarReporteDiario(uid: string, reporte: NuevoRegistro) {
    const ref = collection(this.firestore, `usuarios/${uid}/reportesDiarios`);
    return addDoc(ref, {
      ...reporte,
      fechaModificacion: new Date()
    });
  }
  
  actualizarReporteDiario(uid: string, id: string, reporte: NuevoRegistro) {
    const ref = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${id}`);
    return updateDoc(ref, {
      ...reporte,
      fechaModificacion: new Date()
    });
  }

  getPagosPorModulo(uid: string, reporteId: string, modulo: string) {
    const ref = collection(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}/pagos${modulo}`);
    return getDocs(ref);
  }

  agregarPago(uid: string, reporteId: string, modulo: string, cantidad: number) {
    const ref = collection(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}/pagos${modulo}`);
    return addDoc(ref, {
      fecha: Timestamp.now(),
      cantidad,
      pagado: true
    });
  }
}
