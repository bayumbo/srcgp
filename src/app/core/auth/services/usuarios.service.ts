import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  doc,
  updateDoc
} from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

export interface Usuario {
  uid: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  email: string;
  rol: string;
  empresa: string;
  estado?: boolean;
  nuevoRol?: string;
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private usuariosSubject = new BehaviorSubject<Usuario[]>([]);
  usuarios$ = this.usuariosSubject.asObservable();

  private lastVisible: QueryDocumentSnapshot<DocumentData> | null = null;
  private cargando = false;
  private readonly pageSize = 100;

  public sinMasUsuarios: boolean = false;

  constructor(private firestore: Firestore) {}

  get listaUsuarios(): Usuario[] {
    return this.usuariosSubject.getValue();
  }

  actualizarListaUsuarios(nuevaLista: Usuario[]) {
    this.usuariosSubject.next(nuevaLista);
  }

  async cargarPrimerosUsuarios(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;

    const ref = collection(this.firestore, 'usuarios');
    const q = query(ref, orderBy('nombres'), limit(this.pageSize));
    const snapshot = await getDocs(q);

    const usuarios: Usuario[] = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      nuevoRol: (doc.data() as any).rol
    })) as Usuario[];

    this.lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
    this.usuariosSubject.next(usuarios);

    if (usuarios.length < this.pageSize) {
      this.sinMasUsuarios = true;
    }

    this.cargando = false;
  }

  async cargarMasUsuarios(): Promise<void> {
    if (this.cargando || !this.lastVisible || this.sinMasUsuarios) return;
    this.cargando = true;

    const ref = collection(this.firestore, 'usuarios');
    const q = query(
      ref,
      orderBy('nombres'),
      startAfter(this.lastVisible),
      limit(this.pageSize)
    );

    const snapshot = await getDocs(q);
    const nuevos = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      nuevoRol: (doc.data() as any).rol
    })) as Usuario[];

    if (nuevos.length < this.pageSize) {
      this.sinMasUsuarios = true;
    }

    const actual = this.listaUsuarios;
    this.usuariosSubject.next([...actual, ...nuevos]);
    this.lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

    this.cargando = false;
  }


  async actualizarRol(uid: string, nuevoRol: string): Promise<void> {
    const ref = doc(this.firestore, 'usuarios', uid);
    await updateDoc(ref, { rol: nuevoRol });
  }

  
  async actualizarEstado(uid: string, estado: boolean): Promise<void> {
    const ref = doc(this.firestore, 'usuarios', uid);
    await updateDoc(ref, { estado });
  }
}
