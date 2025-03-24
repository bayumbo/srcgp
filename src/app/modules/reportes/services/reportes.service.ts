import { Injectable } from '@angular/core';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  private pagosRef = collection(this.firestore, 'pagos');

  constructor(private firestore: Firestore) {}

  // Obtener reporte diario
  async obtenerReporteDiario(fecha: string) {
    const q = query(this.pagosRef, where('fecha', '==', fecha));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  // Obtener reporte por fecha
  async obtenerReportePorFecha(inicio: string, fin: string) {
    const q = query(this.pagosRef, where('fecha', '>=', inicio), where('fecha', '<=', fin));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  // Obtener reporte mensual
  async obtenerReporteMensual(mes: string) {
    const q = query(this.pagosRef, where('fecha', '>=', `${mes}-01`), where('fecha', '<=', `${mes}-31`));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }
}