import { Injectable } from '@angular/core';
import { getAuth, onAuthStateChanged } from '@angular/fire/auth';
import { getFunctions, httpsCallable } from '@angular/fire/functions';
import {
  getFirestore,
  Firestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
  updateDoc,
} from '@angular/fire/firestore'; // <-- usa los de AngularFire
import {
  getStorage,
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from '@angular/fire/storage'; // <-- también de AngularFire

@Injectable({
  providedIn: 'root'
})
export class AuthGuardService {
  private user: any = null;
  private role: string | null = null;
  private initialized = false;

  constructor() {
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.user = user;

        // 🔹 Intentar obtener el rol desde los custom claims
        const token = await user.getIdTokenResult(true);
        this.role = (token.claims['role'] as string) || null;
      } else {
        this.user = null;
        this.role = null;
      }
      this.initialized = true;
    });
  }

  async esperarAutenticacion() {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (this.initialized) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
  }

  getUsuario() {
    return this.user;
  }

  getRol() {
    return this.role;
  }

  esAdmin(): boolean {
    return this.role === 'admin';
  }

  estaAutenticado(): boolean {
    return this.user != null;
  }
}










@Injectable({ providedIn: 'root' })
export class FirebaseService {
  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private libroDiarioService: LibroDiarioService
  ) {}

  async guardarComprobante(data: any, pdfBlob: Blob) {
    const comprobanteId = data.comprobanteId;
    const pdfRef = ref(this.storage, `comprobantes/${comprobanteId}.pdf`);

    await uploadBytes(pdfRef, pdfBlob);
    const pdfURL = await getDownloadURL(pdfRef);

    const comprobanteData = {
      ...data,
      pdfURL,
      creado: serverTimestamp(),
    };

    await addDoc(collection(this.firestore, 'comprobantes'), comprobanteData);

    // 🔥 Después de guardar, registrar también en libro-diario
    await this.guardarEnLibroDiarioDesdeEgreso(data);
  }

  private async guardarEnLibroDiarioDesdeEgreso(data: any) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');

    const transacciones = (data.transacciones || []).map((t: any) => ({
      cuenta: t.codigo || t.cuenta || '-',
      descripcion: t.descripcion || t.concepto || '-',
      centroCostos: t.cc || t.centroCostos || '-',
      debe: t.tipo === 'Debe' ? (t.monto || t.valor || 0) : 0,
      haber: t.tipo === 'Haber' ? (t.monto || t.valor || 0) : 0
    }));

    await addDoc(libroDiarioRef, {
      numeroReferencia: data.comprobanteId || 'Sin Número',
      concepto: data.concepto || 'Sin Concepto',
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      tipoDocumento: 'Comprobante de Egreso',
      transacciones
    });
  }

  async obtenerComprobantes() {
    const snapshot = await getDocs(collection(this.firestore, 'comprobantes'));
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  async eliminarComprobantePorId(id: string, comprobanteId: string): Promise<boolean> {
    const pdfRef = ref(this.storage, `comprobantes/${comprobanteId}.pdf`);
    await deleteObject(pdfRef);

    await deleteDoc(doc(this.firestore, 'comprobantes', id));
    await this.eliminarDeLibroDiarioPorNumero(comprobanteId);

    const ultimoNumero = await this.obtenerUltimoNumeroComprobante();
    const numeroEliminado = parseInt(comprobanteId.replace('EGR', ''), 10);

    return numeroEliminado === ultimoNumero;
  }


  private async eliminarDeLibroDiarioPorNumero(numeroReferencia: string) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('numeroReferencia', '==', numeroReferencia));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }








  async obtenerUltimoNumeroComprobante(): Promise<number> {
    const refCol = collection(this.firestore, 'comprobantes');
    const q = query(refCol, orderBy('comprobanteId', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const ultimo = snapshot.docs[0].data() as any;
      const id = ultimo?.comprobanteId;
      if (id && typeof id === 'string' && id.startsWith('EGR')) {
        const numero = parseInt(id.replace('EGR', ''), 10);
        if (!isNaN(numero)) return numero;
      }
    }

    return 0;
  }
}



@Injectable({ providedIn: 'root' })
export class LibroMayorService {
  constructor(private firestore: Firestore) {}

  async obtenerDatosLibroMayor(fechaInicio: string, fechaFin: string): Promise<any[]> {
    const resultado: any[] = [];
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('fecha', '>=', new Date(fechaInicio)), where('fecha', '<=', new Date(fechaFin)));
    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      const fecha = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);
      const numero = data.numeroReferencia || 'Sin Número';
      const conceptoGeneral = data.concepto || 'Sin Concepto';
      const transacciones = data.transacciones || [];

      transacciones.forEach((t: any) => {
        resultado.push({
          fecha: fecha.toISOString().slice(0, 10),
          numero,
          cuenta: t.cuenta || '-',
          descripcion: t.descripcion || '-',
          debe: t.debe || 0,
          haber: t.haber || 0,
          concepto: conceptoGeneral,
        });
      });
    });

    return resultado;
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

@Injectable({ providedIn: 'root' })
export class EstadoFinancieroService {
  constructor(private firestore: Firestore) {}

  async obtenerCuentasCatalogo(): Promise<any[]> {
    const catalogoRef = collection(this.firestore, 'catalogo-cuentas');
    const snapshot = await getDocs(catalogoRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async obtenerTransaccionesHastaFecha(fechaCorte: string): Promise<any[]> {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('fecha', '<=', new Date(fechaCorte)));
    const snapshot = await getDocs(q);

    const transacciones: any[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      (data.transacciones || []).forEach((t: any) => {
        transacciones.push({
          cuenta: t.cuenta,
          descripcion: t.descripcion,
          debe: t.debe || 0,
          haber: t.haber || 0
        });
      });
    });

    return transacciones;
  }
}


@Injectable({ providedIn: 'root' })
export class BalanceComprobacionService {
  constructor(private firestore: Firestore) {}

  async obtenerBalance(fechaCorte: Date): Promise<any[]> {
    const ref = collection(this.firestore, 'libro-diario');
    const snapshot = await getDocs(ref);

    const registros: any = {};

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      const fecha = data.fecha?.toDate ? data.fecha.toDate() : new Date(data.fecha);

      if (fecha <= fechaCorte) {
        (data.transacciones || []).forEach((tran: any) => {
          const codigo = tran.cuenta || '-';
          if (!registros[codigo]) {
            registros[codigo] = {
              codigo: codigo,
              nombre: tran.descripcion || '-',
              debe: 0,
              haber: 0
            };
          }
          registros[codigo].debe += tran.debe || 0;
          registros[codigo].haber += tran.haber || 0;
        });
      }
    });

    return Object.values(registros).map((reg: any) => ({
      ...reg,
      saldoDeudor: reg.debe > reg.haber ? reg.debe - reg.haber : 0,
      saldoAcreedor: reg.haber > reg.debe ? reg.haber - reg.debe : 0
    }));
  }
}


@Injectable({ providedIn: 'root' })
export class EstadoResultadosService {
  constructor(
    private firestore: Firestore,
    private catalogoService: CatalogoService
  ) {}

  async obtenerDatosEstadoResultados(fechaInicio: Date, fechaFin: Date): Promise<{ ingresos: any[], gastos: any[] }> {
    const libroRef = collection(this.firestore, 'libro-diario');
    const snapshot = await getDocs(libroRef);

    const catalogo = await this.catalogoService.obtenerCuentas();
    const codigosIngresos = catalogo.filter(c => c.tipo === 'Ingreso').map(c => c.codigo);
    const codigosGastos = catalogo.filter(c => c.tipo === 'Gasto').map(c => c.codigo);

    const ingresos: any[] = [];
    const gastos: any[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as any;
      const fecha = data.fecha?.toDate ? data.fecha.toDate() : new Date();

      if (fecha >= fechaInicio && fecha <= fechaFin) {
        (data.transacciones || []).forEach((t: any) => {
          if (codigosIngresos.includes(t.cuenta)) {
            ingresos.push({
              codigo: t.cuenta,
              descripcion: t.descripcion,
              valor: t.haber || 0
            });
          } else if (codigosGastos.includes(t.cuenta)) {
            gastos.push({
              codigo: t.cuenta,
              descripcion: t.descripcion,
              valor: t.debe || 0
            });
          }
        });
      }
    });

    return { ingresos, gastos };
  }
}


export interface DocumentoContable {
  id?: string;
  codigo: string;
  descripcion: string;
}
@Injectable({ providedIn: 'root' })
export class DocumentosService {
  constructor(private firestore: Firestore) {}

  async agregarDocumento(doc: Omit<DocumentoContable, 'id'>): Promise<void> {
    const ref = collection(this.firestore, 'documentos-contables');
    await addDoc(ref, {
      ...doc,
      creado: serverTimestamp(),
    });
  }

  async obtenerDocumentos(): Promise<DocumentoContable[]> {
    const ref = collection(this.firestore, 'documentos-contables');
    const q = query(ref, orderBy('codigo'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }) as DocumentoContable);
  }


  async actualizarDocumento(id: string, data: Omit<DocumentoContable, 'id'>): Promise<void> {
    const ref = doc(this.firestore, 'documentos-contables', id);
    await updateDoc(ref, {
      ...data,
      modificado: serverTimestamp(),
    });
  }

  async eliminarDocumento(id: string): Promise<void> {
    const ref = doc(this.firestore, 'documentos-contables', id);
    await deleteDoc(ref);
  }



}





@Injectable({ providedIn: 'root' })
export class CentroCostosService {
  constructor(private firestore: Firestore) {}

  async agregarCentro(data: { codigo: string; descripcion: string }): Promise<void> {
    const ref = collection(this.firestore, 'centro-costos');
    await addDoc(ref, {
      ...data,
      creado: serverTimestamp(),
    });
  }

  async obtenerCentros(): Promise<any[]> {
    const ref = collection(this.firestore, 'centro-costos');
    const q = query(ref, orderBy('codigo'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  async actualizarCentro(id: string, data: { codigo: string; descripcion: string }): Promise<void> {
    const ref = doc(this.firestore, 'centro-costos', id);
    await updateDoc(ref, {
      ...data,
      modificado: serverTimestamp(),
    });
  }

  async eliminarCentro(id: string): Promise<void> {
    const ref = doc(this.firestore, 'centro-costos', id);
    await deleteDoc(ref);
  }
}




@Injectable({ providedIn: 'root' })
export class ComprobanteIngresoService {
  constructor(private firestore: Firestore, private storage: Storage,   private libroDiarioService: LibroDiarioService) {}

  async obtenerUltimoNumeroComprobante(): Promise<number> {
    const refCol = collection(this.firestore, 'comprobantes-ingreso');
    const q = query(refCol, orderBy('numeroComprobante', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const ultimo = snapshot.docs[0].data() as any;
      const numero = parseInt(ultimo.numeroComprobante.replace('ING', ''), 10);
      return numero;
    }
    return 0;
  }

  async guardarComprobanteIngreso(data: any, archivo: Blob): Promise<void> {
    const filePath = `comprobantes-ingreso/${data.id}.pdf`;
    const fileRef = ref(this.storage, filePath);
    await uploadBytes(fileRef, archivo);
    const url = await getDownloadURL(fileRef);


    const comprobanteData = {
      ...data,
      pdfURL: url,
      creado: new Date()
    };


    // 🟰 Guardar comprobante
    const docRef = doc(this.firestore, 'comprobantes-ingreso', data.id);
    await setDoc(docRef, {
      ...data,
      pdfURL: url,
      creado: new Date()
    });

    await this.guardarEnLibroDiarioDesdeIngreso(data);
  }

 private async guardarEnLibroDiarioDesdeIngreso(data: any) {
  const libroDiarioRef = collection(this.firestore, 'libro-diario');

  const transacciones = (data.transacciones || []).map((t: any) => ({
    cuenta: t.codigo || t.cuenta || '-',
    descripcion: t.descripcion || t.concepto || '-',
    centroCostos: t.centroCostos?.codigo || t.centroCostos || '-',
    debe: t.tipo === 'Debe' ? (t.monto || t.valor || 0) : 0,
    haber: t.tipo === 'Haber' ? (t.monto || t.valor || 0) : 0
  }));

  await addDoc(libroDiarioRef, {
    numeroReferencia: data.numeroComprobante || 'Sin Número',
    concepto: data.conceptoGeneral || 'Sin Concepto',
    fecha: data.fecha ? new Date(data.fecha) : new Date(),
    tipoDocumento: 'Comprobante de Ingreso', // 🔵 Aquí el tipo correcto
    transacciones
  });
}


  async obtenerComprobantes(): Promise<any[]> {
    const snapshot = await getDocs(collection(this.firestore, 'comprobantes-ingreso'));
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  }

  async eliminarComprobantePorId(id: string, numeroComprobante: string): Promise<void> {
    const pdfRef = ref(this.storage, `comprobantes-ingreso/${numeroComprobante}.pdf`);
    await deleteObject(pdfRef);

    const docRef = doc(this.firestore, 'comprobantes-ingreso', id);
    await deleteDoc(docRef);

    await this.eliminarDeLibroDiarioPorNumero(numeroComprobante);

  }


  private async eliminarDeLibroDiarioPorNumero(numeroReferencia: string) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('numeroReferencia', '==', numeroReferencia));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }






}






@Injectable({ providedIn: 'root' })
export class TransaccionesGeneralesService {
  constructor(private firestore: Firestore, private storage: Storage, private libroDiarioService: LibroDiarioService) {}

  async obtenerUltimoNumeroPorCodigo(codigoDocumento: string): Promise<number> {
    const refCol = collection(this.firestore, 'transacciones-generales',);
    const q = query(
      refCol,
      where('codigoDocumento', '==', codigoDocumento),
      orderBy('numero', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data()['numero'];
    }
    return 0;
  }

  async guardarTransaccion(data: any, archivo: Blob): Promise<void> {
    const filePath = `transacciones-generales/${data.codigoDocumento}${data.numeroFormateado}.pdf`;
    const fileRef = ref(this.storage, filePath);
    await uploadBytes(fileRef, archivo);
    const url = await getDownloadURL(fileRef);

    const refCol = collection(this.firestore, 'transacciones-generales');
    await addDoc(refCol, {
      ...data,
      codigoDocumento: data.codigoDocumento,
      numero: data.numero,
      numeroFormateado: data.numeroFormateado,
      pdfURL: url,
      creado: new Date()
    });

    await this.guardarEnLibroDiarioDesdeTransaccionesGenerales(data);

  }

  private async guardarEnLibroDiarioDesdeTransaccionesGenerales(data: any) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');

    const transacciones = (data.transacciones || []).map((t: any) => ({
      cuenta: t.codigo || t.cuenta || '-', // puede venir como 'codigo' o 'cuenta'
      descripcion: t.descripcion || t.concepto || '-', // descripción o concepto
      centroCostos: t.cc || t.centroCostos || '-', // 🔵 para transacciones suele ser 'cc'
      debe: t.tipo === 'Debe' ? (t.monto || t.valor || 0) : 0,
      haber: t.tipo === 'Haber' ? (t.monto || t.valor || 0) : 0
    }));

    await addDoc(libroDiarioRef, {
      numeroReferencia: data.documento || 'Sin Número', // 🔵 En transacciones es 'numeroReferencia'
      concepto: data.concepto || 'Sin Concepto',
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      tipoDocumento: 'Transacción General', // 🔵 El tipo correcto para identificarlo luego
      transacciones
    });
  }

  async obtenerTransacciones(): Promise<any[]> {
    const refCol = collection(this.firestore, 'transacciones-generales');
    const snapshot = await getDocs(refCol);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  }

  async eliminarTransaccion(id: string, codigoDocumento: string, numeroFormateado: string): Promise<boolean> {
    const filePath = `transacciones-generales/${codigoDocumento}${numeroFormateado}.pdf`;
    const fileRef = ref(this.storage, filePath);
    await deleteObject(fileRef);



    const docRef = doc(this.firestore, 'transacciones-generales', id);
    await deleteDoc(docRef);

    const q = query(
      collection(this.firestore, 'transacciones-generales'),
      where('codigoDocumento', '==', codigoDocumento)
    );
    await this.eliminarDeLibroDiarioPorNumero(codigoDocumento + numeroFormateado);;
    const snapshot = await getDocs(q);
    return snapshot.empty;
  }



  private async eliminarDeLibroDiarioPorNumero(numeroReferencia: string) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('numeroReferencia', '==', numeroReferencia));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }
}


@Injectable({ providedIn: 'root' })
export class ComprasVariasService {
  constructor(private firestore: Firestore, private storage: Storage) {}

  async obtenerUltimoNumero(): Promise<number> {
    const refCol = collection(this.firestore, 'compras-varias');
    const q = query(refCol, orderBy('numero', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data()['numero'];
    }
    return 0;
  }

  async guardarCompra(data: any, archivo: Blob): Promise<void> {
    const filePath = `compras-varias/${data.numeroFormateado}.pdf`;
    const fileRef = ref(this.storage, filePath);
    await uploadBytes(fileRef, archivo);
    const url = await getDownloadURL(fileRef);

    const refCol = collection(this.firestore, 'compras-varias');
    await addDoc(refCol, {
      numeroFormateado: data.numeroFormateado,
      numero: data.numero,
      proveedor: data.proveedor,
      ruc: data.ruc,
      tipoDocumento: data.tipoDocumento,
      numeroDocumento: data.numeroDocumento,
      formaPago: data.formaPago,
      concepto: data.concepto,
      total: data.total,
      transacciones: data.transacciones,
      pdfURL: url,
      creado: new Date(),
      fecha: new Date(),
    });

    // 🔥 También guardar en libro-diario
    await this.guardarEnLibroDiarioDesdeComprasVarias(data);
  }

  private async guardarEnLibroDiarioDesdeComprasVarias(data: any) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');

    const transacciones = (data.transacciones || []).map((t: any) => ({
      cuenta: t.codigo || t.cuenta || '-',          // Código de cuenta o número
      descripcion: t.descripcion || t.concepto || '-', // Descripción o concepto
      centroCostos: t.cc || t.centroCostos || '-',   // Centro de costos
      debe: t.tipo === 'Debe' ? (t.monto || t.valor || 0) : 0,
      haber: t.tipo === 'Haber' ? (t.monto || t.valor || 0) : 0
    }));

    await addDoc(libroDiarioRef, {
      numeroReferencia: data.numeroDocumento || 'Sin Número', // 📄 Aquí en Compras Varias es "numeroFormateado"
      numeroFormateado: data.numeroFormateado || '-',
      concepto: data.concepto || data.concepto || 'Sin Concepto', // ✅ El concepto general de la compra
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      tipoDocumento: 'Compra Varias', // 🔵 Así lo registraremos diferenciado
      transacciones
    });
  }


  async obtenerCompras(): Promise<any[]> {
    const refCol = collection(this.firestore, 'compras-varias');
    const snapshot = await getDocs(refCol);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  }

  async eliminarCompra(id: string, numeroDocumento: string): Promise<void> {
    try {
      const filePath = `compras-varias/${numeroDocumento}.pdf`;
      const fileRef = ref(this.storage, filePath);
      await deleteObject(fileRef);

      const docRef = doc(this.firestore, 'compras-varias', id);
      await deleteDoc(docRef);
      await this.eliminarDeLibroDiarioPorNumero(numeroDocumento);

      console.log('✅ Compra eliminada correctamente.');
    } catch (error) {
      console.error('❌ Error al eliminar la compra:', error);
      throw error;
    }
  }

  private async eliminarDeLibroDiarioPorNumero(numeroFormateado: string) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('numeroFormateado', '==', numeroFormateado)); // <--- BUSCAR POR NUMEROFORMATEADO
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }





}



@Injectable({ providedIn: 'root' })
export class AsientoAperturaService {
  firestore: Firestore;
  storage = getStorage();

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  async obtenerUltimoNumero(): Promise<number> {
    const colRef = collection(this.firestore, 'asientos-apertura');
    const snapshot = await getDocs(colRef);

    const numeros = snapshot.docs
      .map(docSnap => docSnap.data()?.['numero'])
      .filter((num: string) => typeof num === 'string' && num.startsWith('APR'))
      .map((num: string) => parseInt(num.replace('APR', ''), 10))
      .filter(n => !isNaN(n));

    return numeros.length > 0 ? Math.max(...numeros) : 0;
  }

  async guardarAsiento(data: any, pdfBlob: Blob) {
    const pdfRef = ref(this.storage, `asientos-apertura/${data.numero}.pdf`);
    await uploadBytes(pdfRef, pdfBlob);

    const url = await getDownloadURL(pdfRef);

    const docData = {
      ...data,
      pdfURL: url,
      creado: new Date()
    };

    await addDoc(collection(this.firestore, 'asientos-apertura'), docData);

    // 🟰 También guardar en libro-diario
    await this.guardarEnLibroDiario(data);
  }

  async guardarEnLibroDiario(data: any) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');

    const transacciones = data.cuentas.map((t: any) => ({
      cuenta: t.cuenta,
      descripcion: t.descripcion,
      centroCostos: t.centroCostos || '-',
      debe: t.tipo === 'Debe' ? t.valor : 0,
      haber: t.tipo === 'Haber' ? t.valor : 0
    }));

    await addDoc(libroDiarioRef, {
      numeroReferencia: data.numero,
      tipoDocumento: 'Asiento de Apertura',
      concepto: data.descripcionGeneral,
      fecha: new Date(),
      transacciones
    });
  }

  async obtenerAsientosGuardados(): Promise<any[]> {
    const snapshot = await getDocs(collection(this.firestore, 'asientos-apertura'));
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  }

  async eliminarAsiento(asientoId: string, numeroAsiento: string) {
    try {
      const docRef = doc(this.firestore, 'asientos-apertura', asientoId);
      await deleteDoc(docRef);

      const pdfRef = ref(this.storage, `asientos-apertura/${numeroAsiento}.pdf`);
      await deleteObject(pdfRef);

      await this.eliminarDeLibroDiarioPorNumero(numeroAsiento);


      console.log('✅ Asiento eliminado correctamente.');
    } catch (error) {
      console.error('❌ Error al eliminar asiento:', error);
      throw error;
    }
  }


  private async eliminarDeLibroDiarioPorNumero(numeroReferencia: string) {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');
    const q = query(libroDiarioRef, where('numeroReferencia', '==', numeroReferencia));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }

}

@Injectable({ providedIn: 'root' })
export class LibroDiarioService {
  constructor(private firestore: Firestore) {}
  async guardarEnLibroDiario(data: any): Promise<void> {
    const libroDiarioRef = collection(this.firestore, 'libro-diario');

    const nuevoLibro = {
      numeroTransaccion: data.numeroDocumento || data.numeroComprobante || data.numero || 'Sin Número',
      fecha: data.creado ? (data.creado instanceof Date ? data.creado : data.creado.toDate()) : new Date(),
      conceptoGeneral: data.concepto || data.conceptoGeneral || 'Sin Concepto',
      tipoDocumento: data.tipoDocumento || data.codigoDocumento || 'Sin Tipo',
      transacciones: data.transacciones || [],
      totalDebe: data.transacciones
        ? data.transacciones
            .filter((t: any) => t.tipo === 'Debe')
            .reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0)
        : 0,
      totalHaber: data.transacciones
        ? data.transacciones
            .filter((t: any) => t.tipo === 'Haber')
            .reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0)
        : 0
    };

    await addDoc(libroDiarioRef, nuevoLibro);
  }

  async obtenerLibrosEntreFechas(fechaInicio: Date, fechaFin: Date): Promise<any[]> {
    const ref = collection(this.firestore, 'libro-diario'); // 🔵 Colección principal de libros diarios
    const q = query(
      ref,
      where('creado', '>=', Timestamp.fromDate(fechaInicio)),
      where('creado', '<=', Timestamp.fromDate(fechaFin))
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }




  async obtenerLibrosEnRango(fechaInicio: Date, fechaFin: Date): Promise<any[]> {
    const colRef = collection(this.firestore, 'libro-diario');
    const q = query(
      colRef,
      where('fecha', '>=', fechaInicio),
      where('fecha', '<=', fechaFin),
      orderBy('fecha', 'asc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(docSnap => {
      const data = docSnap.data() as any;

      return {
        id: docSnap.id,
        numeroTransaccion: data.numeroReferencia || 'Sin Número',
        conceptoGeneral: data.concepto || 'Sin Concepto',
        fecha: data.fecha?.toDate ? data.fecha.toDate() : new Date(), // ← 🔥 Corrige la fecha
        transacciones: data.transacciones || []
      };
    });
  }


}

