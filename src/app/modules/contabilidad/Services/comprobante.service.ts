import { Injectable } from '@angular/core';
import {
  getFirestore,
  Firestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  orderBy,
  updateDoc,
} from '@angular/fire/firestore'; // <-- usa los de AngularFire
import { jsPDF } from 'jspdf';
import {
  getStorage,
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from '@angular/fire/storage'; // <-- también de AngularFire

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  constructor(
    private firestore: Firestore,
    private storage: Storage
  ) {}

  async guardarComprobante(data: any, pdfBlob: Blob) {
    const comprobanteId = data.comprobanteId;
    const pdfRef = ref(this.storage, `comprobantes/${comprobanteId}.pdf`);

    await uploadBytes(pdfRef, pdfBlob);
    const pdfURL = await getDownloadURL(pdfRef);

    await addDoc(collection(this.firestore, 'comprobantes'), {
      ...data,
      pdfURL,
      creado: serverTimestamp(),
    });
  }

  async obtenerComprobantes() {
    const snapshot = await getDocs(collection(this.firestore, 'comprobantes'));
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  async eliminarComprobantePorId(id: string, comprobanteId: string): Promise<void> {
    const pdfRef = ref(this.storage, `comprobantes/${comprobanteId}.pdf`);
    await deleteObject(pdfRef);
    await deleteDoc(doc(this.firestore, 'comprobantes', id));
  }
}


@Injectable({ providedIn: 'root' })
export class LibroDiarioService {

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private db:Firestore,
    
  ) {}

  async eliminarAsientoPorId(id: string, numero: string): Promise<void> {
    const pdfRef = ref(this.storage, `libros-diarios/${numero}.pdf`);
    await deleteObject(pdfRef);
    await deleteDoc(doc(this.db, 'libros-diarios', id));
  }

  async guardarAsientoConPDF(asiento: any, pdfBlob: Blob): Promise<string> {
    const fileName = `${asiento.numero}.pdf`;
    const pdfRef = ref(this.storage, `libros-diarios/${fileName}`);

    await uploadBytes(pdfRef, pdfBlob);
    const url = await getDownloadURL(pdfRef);

    const libroFinal = {
      ...asiento,
      pdfUrl: url,
      timestamp: Timestamp.now(),
    };

    await addDoc(collection(this.firestore, 'libros-diarios'), libroFinal);
    return url;
  }

  async obtenerAsientosPorFechas(inicio: string, fin: string): Promise<any[]> {
    const librosRef = collection(this.firestore, 'libros-diarios');
    const q = query(librosRef, where('fecha', '>=', inicio), where('fecha', '<=', fin));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

@Injectable({ providedIn: 'root' })
export class LibroMayorService {
  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private db: Firestore,
  ) {}

  async obtenerDatosPorFechas(inicio: string, fin: string): Promise<any[]> {
    const librosRef = collection(this.db, 'libros-diarios');
    const q = query(librosRef, where('fecha', '>=', inicio), where('fecha', '<=', fin));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async guardarLibroMayor(pdfBlob: Blob, metadata: { fechaInicio: string; fechaFin: string }): Promise<string> {
    const fileName = `LibroMayor_${metadata.fechaInicio}_al_${metadata.fechaFin}.pdf`;
    const pdfRef = ref(this.storage, `libros-mayor/${fileName}`);

    await uploadBytes(pdfRef, pdfBlob);
    const url = await getDownloadURL(pdfRef);

    await addDoc(collection(this.db, 'libros-mayor'), {
      ...metadata,
      url,
      timestamp: Timestamp.now()
    });

    return url;
  }

  async obtenerLibrosGuardados(): Promise<any[]> {
    const librosRef = collection(this.db, 'libros-mayor');
    const snapshot = await getDocs(librosRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async obtenerLibrosMayorPorFechas(inicio: string, fin: string): Promise<any[]> {
    const resultado: any[] = [];

    // Libros Diarios
    const librosRef = collection(this.db, 'libros-diarios');
    const qLibros = query(librosRef, where('fecha', '>=', inicio), where('fecha', '<=', fin));
    const snapshotLibros = await getDocs(qLibros);
    snapshotLibros.forEach(doc => {
      const data = doc.data();
      const { fecha, numero, concepto, detalles } = data;
      detalles.forEach((detalle: any) => {
        resultado.push({
          fecha,
          numero,
          concepto,
          cuenta: detalle.cuenta,
          debe: detalle.debe,
          haber: detalle.haber,
          origen: 'Libro Diario'
        });
      });
    });

    // Comprobantes
const comprobantesRef = collection(this.db, 'comprobantes');
const qComprobantes = query(comprobantesRef, where('fecha', '>=', inicio), where('fecha', '<=', fin));
const snapshotComprobantes = await getDocs(qComprobantes);
snapshotComprobantes.forEach(doc => {
  const data = doc.data();
  const { fecha, comprobanteId, concepto, transacciones, numeroCheque } = data;
  transacciones.forEach((item: any) => {
    resultado.push({
      fecha,
      numero: comprobanteId,
      cheque: numeroCheque || '-',
      concepto: item.descripcion,
      cuenta: item.codigo,
      debe: item.debe,
      haber: item.haber,
      
      origen: 'Comprobante'
    });
  });
});

    return resultado;
  }

  async subirPDFLibroMayor(pdfBlob: Blob, nombre: string): Promise<void> {
    const pdfRef = ref(this.storage, `libros-mayor/${nombre}`);
    await uploadBytes(pdfRef, pdfBlob);
    await addDoc(collection(this.db, 'libros-mayor'), {
      nombre,
      url: await getDownloadURL(pdfRef),
      timestamp: Timestamp.now()
    });
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  constructor(private firestore: Firestore) {}

  agregarCuenta(cuenta: any) {
    const cuentasRef = collection(this.firestore, 'catalogo-cuentas');
    return addDoc(cuentasRef, cuenta);
  }

  async obtenerCuentas(): Promise<any[]> {
    const refCuentas = collection(this.firestore, 'catalogo-cuentas');
    const q = query(refCuentas, orderBy('codigo'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  eliminarCuenta(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, 'catalogo-cuentas', id));
  }

  actualizarCuenta(id: string, datos: any): Promise<void> {
    return updateDoc(doc(this.firestore, 'catalogo-cuentas', id), datos);
  }
}
