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
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private firestore: Firestore) {}

  guardarReporteDiario(uid: string, reporte: NuevoRegistro) {
    const ref = collection(this.firestore, `usuarios/${uid}/reportesDiarios`);
    return addDoc(ref, {
      ...reporte,
      fechaModificacion: reporte.fechaModificacion
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
  async obtenerReportePorUnidad(unidad: string): Promise<ReporteConPagos[]> {
    const refUsuarios = collection(this.firestore, 'usuarios');
    const snapshotUsuarios = await getDocs(refUsuarios);
  
    const resultados: ReporteConPagos[] = [];
  
    for (const userDoc of snapshotUsuarios.docs) {
      const uid = userDoc.id;
      const refReportes = collection(this.firestore, `usuarios/${uid}/reportesDiarios`);
      const snapshotReportes = await getDocs(refReportes);
  
      for (const docReporte of snapshotReportes.docs) {
        const data = docReporte.data() as ReporteConPagos;
        if (data.unidad === unidad) {
          resultados.push({ ...data, id: docReporte.id, uid });
        }
      }
    }
  
    return resultados;
  }
  

  async obtenerTodasLasUnidadesConNombre(): Promise<{ unidad: string; nombre: string }[]> {
    const unidadesMap = new Map<string, string>();
    const usuariosSnap = await getDocs(collection(this.firestore, 'usuarios'));
  
    for (const usuario of usuariosSnap.docs) {
      const uid = usuario.id;
      const reportesSnap = await getDocs(collection(this.firestore, `usuarios/${uid}/reportesDiarios`));
  
      reportesSnap.forEach(reporte => {
        const data = reporte.data();
        const unidad = data['unidad'];
        const nombre = data['nombre'];
  
        if (unidad && nombre && !unidadesMap.has(unidad)) {
          unidadesMap.set(unidad, nombre);
        }
      });
    }
  
    return Array.from(unidadesMap.entries()).map(([unidad, nombre]) => ({ unidad, nombre }));
  }
}

