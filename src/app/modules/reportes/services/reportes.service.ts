import { Injectable } from '@angular/core';
import {Firestore, collection, getDocs, addDoc, Timestamp } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { doc, updateDoc } from '@angular/fire/firestore';
import { serverTimestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private firestore: Firestore) {}

  async guardarReporteDiario(data: NuevoRegistro) {
    const ref = collection(this.firestore, 'reportesDiarios');
    return await addDoc(ref, {
      ...data,
      fechaModificacion: serverTimestamp()
    });
  }

  async actualizarReporteDiario(id: string, data: NuevoRegistro) {
    const ref = doc(this.firestore, 'reportesDiarios', id);
    return await updateDoc(ref, {
      ...data,
      fechaModificacion: serverTimestamp()
    });
  }
  getPagosPorModulo(reporteId: string, modulo: string) {
    const ref = collection(this.firestore, `reportesDiarios/${reporteId}/pagos${modulo}`);
    return getDocs(ref);
  }

  agregarPago(reporteId: string, modulo: string, cantidad: number) {
    const ref = collection(this.firestore, `reportesDiarios/${reporteId}/pagos${modulo}`);
    return addDoc(ref, {
      fecha: Timestamp.now(),
      cantidad,
      pagado: true
    });
  
  }
}