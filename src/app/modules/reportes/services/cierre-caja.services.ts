import { Injectable } from '@angular/core';
import {
  Firestore,
  collectionGroup,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  getDoc,
  collection
} from '@angular/fire/firestore';
import { CierreCajaItem } from '../../../core/interfaces/cierreCajaItem.interface';

@Injectable({
  providedIn: 'root'
})
export class CierreCajaService {
    constructor(private firestore: Firestore) {}
  
    async obtenerCierrePorFecha(fecha: Date): Promise<CierreCajaItem[]> {
      const inicio = new Date(fecha);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(fecha);
      fin.setHours(23, 59, 59, 999);
    
      const pagosQuery = query(
        collectionGroup(this.firestore, 'pagosTotales'),
        where('fecha', '>=', Timestamp.fromDate(inicio)),
        where('fecha', '<=', Timestamp.fromDate(fin))
      );
    
      const snapshot = await getDocs(pagosQuery);
      const resultados: CierreCajaItem[] = [];
    
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const detalles = data['detalles'] || {};
    
        // Extraer ruta del padre (reporteId)
        const fullPath = docSnap.ref.path;
        const pathParts = fullPath.split('/');
        const uid = pathParts[1];
        const reporteId = pathParts[3];
    
        const reporteRef = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${reporteId}`);
        const reporteSnap = await getDoc(reporteRef);
        const usuarioRef = doc(this.firestore, `usuarios/${uid}`);
        const usuarioSnap = await getDoc(usuarioRef);
    
        const unidad = reporteSnap.exists() ? reporteSnap.data()['unidad'] : '---';
        
        // 🔄 Normalización de nombre de empresa
        const empresaCruda = usuarioSnap.exists() ? usuarioSnap.data()['empresa'] || 'Sin empresa' : 'Sin empresa';
        const empresaLower = empresaCruda.toLowerCase();
        const empresa = empresaLower.includes('pintag')
        ? 'General Píntag'
        : empresaLower.includes('antisana')
          ? 'Expreso Antisana'
          : empresaCruda;
    
        for (const modulo in detalles) {
          const valor = detalles[modulo];
          if (valor && valor > 0) {
            resultados.push({
              modulo,
              unidad,
              fecha: data['fecha']?.toDate?.() || new Date(),
              valor,
              empresa
            });
          }
        }
      }
    
      return resultados;
    }
    
    async obtenerHistorialCierres(): Promise<any[]> {
        const ref = collection(this.firestore, 'cierresCaja');
        const snapshot = await getDocs(ref);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        }));
      }
    }  

  
