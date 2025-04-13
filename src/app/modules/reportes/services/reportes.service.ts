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

  async guardarReporteDiario(data: NuevoRegistro) {
    if (!data.uid) {
      throw new Error('UID del usuario requerido para guardar el reporte');
    }
    const ref = collection(this.firestore, `usuarios/${data.uid}/reportesDiarios`);
    return await addDoc(ref, {
      ...data,
      fechaModificacion: serverTimestamp()
    });
  }

  async actualizarReporteDiario(uid: string, reporteId: string, data: NuevoRegistro) {
    const ref = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}`);
    return await updateDoc(ref, {
      ...data,
      fechaModificacion: serverTimestamp()
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
