import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  // Se inyecta Firestore y se crea la referencia a la colección 'nominaRecaudacion'
  private nominaRef = collection(this.firestore, 'nominaRecaudacion');

  constructor(private firestore: Firestore) {}

  // Método para obtener los registros de la colección, devolviendo un Observable
  obtenerNominaRecaudacion(): Observable<any[]> {
    return collectionData(this.nominaRef, { idField: 'id' });
  }

  // Método para agregar un nuevo documento (opcional)
  async agregarRegistro(registro: any): Promise<void> {
    try {
      await addDoc(this.nominaRef, registro);
      console.log('✅ Registro agregado con éxito');
    } catch (error) {
      console.error('❌ Error al agregar registro:', error);
      throw error;
    }
  }
}