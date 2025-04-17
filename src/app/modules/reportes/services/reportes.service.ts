import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
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
  }}