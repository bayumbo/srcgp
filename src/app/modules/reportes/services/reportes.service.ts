import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  Timestamp,
  doc,
  serverTimestamp,
  query,
  collectionGroup,
  where,
  limit,
  getDoc,
  orderBy
} from '@angular/fire/firestore';
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  
  private cacheReportes: { [unidad: string]: ReporteConPagos[] } = {};
  private unidadesCache: { unidad: string; nombre: string; uid: string }[] = [];
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
  async obtenerTodasLasUnidadesConNombre(): Promise<{ unidad: string; nombre: string; uid: string }[]> {
    if (this.unidadesCache.length > 0) {
      return this.unidadesCache;
    }
    
    const q = query(collectionGroup(this.firestore, 'reportesDiarios'),orderBy('unidad', 'asc'),);
    const querySnapshot = await getDocs(q);

    const unidadesMap = new Map<string, { nombre: string; uid: string }>();
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const unidad = data['unidad'];
      const nombre = data['nombre'];
      
      // Use the document path to extract the UID
      const pathParts = doc.ref.path.split('/');
      const uid = pathParts[1]; // The UID is the second part of the path

      if (unidad && nombre && uid && !unidadesMap.has(unidad)) {
        unidadesMap.set(unidad, { nombre, uid });
      }
    });

    const listaUnidades = Array.from(unidadesMap.entries()).map(([unidad, data]) => ({
      unidad,
      nombre: data.nombre,
      uid: data.uid
    }));

    this.unidadesCache = listaUnidades;
    return listaUnidades;
}

async obtenerReportePorUnidad(unidad: string): Promise<ReporteConPagos[]> {
    if (this.cacheReportes[unidad]) {
      return this.cacheReportes[unidad];
    }

    const q = query(collectionGroup(this.firestore, 'reportesDiarios'), 
    where('unidad', '==', unidad));
    const querySnapshot = await getDocs(q);

    const reportesConPagosPromises = querySnapshot.docs.map(async docReporte => {
      // Usamos 'any' para evitar errores de tipo en la conversión
      const data = docReporte.data() as any; 
      const id = docReporte.id;
      const pathParts = docReporte.ref.path.split('/');
      const uid = pathParts[1];

      // Consulta el documento del usuario para obtener nombre y apellido
      const userRef = doc(this.firestore, `usuarios/${uid}`);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};

      // Consulta la subcolección 'pagosTotales'
      const pagosRef = collection(docReporte.ref, 'pagosTotales');
      const pagosSnap = await getDocs(pagosRef);

      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;

      // Itera sobre los documentos de pago para sumar los montos
      pagosSnap.forEach(pagoDoc => {
        const detalles = pagoDoc.data()['detalles'] ?? {};
        minutosPagados += detalles.minutosAtraso || 0;
        adminPagada += detalles.administracion || 0;
        minBasePagados += detalles.minutosBase || 0;
        multasPagadas += detalles.multas || 0;
      });

      // Convierte el Timestamp a Date
      const fecha = (data.fecha as Timestamp)?.toDate() ?? null;
      const fechaModificacion = (data.fechaModificacion as Timestamp)?.toDate() ?? null;

      return {
        id,
        uid,
        unidad: data.unidad,
        nombre: userData['nombres'] ?? '',
        apellido: userData['apellidos'] ?? '',
        minutosAtraso: data.minutosAtraso ?? 0,
        administracion: data.administracion ?? 0,
        minutosBase: data.minutosBase ?? 0,
        multas: data.multas ?? 0,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas,
        fecha: fecha, // ⬅️ Añade la fecha
        fechaModificacion: fechaModificacion
      };
    });

    const reportesConPagos = await Promise.all(reportesConPagosPromises);
    this.cacheReportes[unidad] = reportesConPagos;
    return reportesConPagos;
  }



async obtenerPagosDeReporte(uid: string, reporteId: string) {
    const pagosAdministracionSnap = await this.getPagosPorModulo(uid, reporteId, 'Administracion');
    const pagosMinBaseSnap = await this.getPagosPorModulo(uid, reporteId, 'MinutosBase');
    const pagosAtrasoSnap = await this.getPagosPorModulo(uid, reporteId, 'MinutosAtraso');
    const pagosMultasSnap = await this.getPagosPorModulo(uid, reporteId, 'Multas');

    const adminPagada = pagosAdministracionSnap.docs.reduce((acc, doc) => acc + doc.data()['cantidad'], 0);
    const minBasePagados = pagosMinBaseSnap.docs.reduce((acc, doc) => acc + doc.data()['cantidad'], 0);
    const minutosPagados = pagosAtrasoSnap.docs.reduce((acc, doc) => acc + doc.data()['cantidad'], 0);
    const multasPagadas = pagosMultasSnap.docs.reduce((acc, doc) => acc + doc.data()['cantidad'], 0);

    return { adminPagada, minBasePagados, minutosPagados, multasPagadas };
  }
}

