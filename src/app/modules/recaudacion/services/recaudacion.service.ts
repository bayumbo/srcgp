import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { collectionData } from '@angular/fire/firestore';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class RecaudacionService {
  private pagosRef;

  constructor(private firestore: Firestore) {
    this.pagosRef = collection(this.firestore, 'pagos');
  }

  async registrarPago(pago: any): Promise<void> {
    try {
      await addDoc(this.pagosRef, pago);
      console.log('✅ Pago registrado con éxito');
    } catch (error) {
      console.error('❌ Error al registrar pago:', error);
      throw error;
    }
  }

  obtenerPagos() {
    return collectionData(this.pagosRef, { idField: 'id' });
  }
}