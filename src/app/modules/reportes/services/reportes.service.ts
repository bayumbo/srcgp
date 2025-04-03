import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';


@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private firestore: Firestore) {}

  async guardarReporteDiario(data: NuevoRegistro) {
    const ref = collection(this.firestore, 'reportesDiarios');
    return await addDoc(ref, data);
  }
}