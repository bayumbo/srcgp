import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, getDocs, updateDoc, doc, deleteDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class RecaudacionService {
  private pagosRef = collection(this.firestore, 'pagos');

  constructor(private firestore: Firestore) {}

  // Registrar un nuevo pago
  async registrarPago(pago: any) {
    return await addDoc(this.pagosRef, pago);
  }

  // Obtener todos los pagos
  async obtenerPagos() {
    const snapshot = await getDocs(this.pagosRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Actualizar un pago
  async actualizarPago(id: string, data: any) {
    const pagoRef = doc(this.firestore, 'pagos', id);
    return await updateDoc(pagoRef, data);
  }

  // Eliminar un pago
  async eliminarPago(id: string) {
    const pagoRef = doc(this.firestore, 'pagos', id);
    return await deleteDoc(pagoRef);
  }
}