import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  UserCredential,
  sendPasswordResetEmail,
  signOut
} from '@angular/fire/auth';

import {
  Firestore,
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp
} from '@angular/fire/firestore';

import { BehaviorSubject } from 'rxjs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getAuthStandalone, User } from 'firebase/auth';
import { environment } from 'src/environments/environment';

export interface Credential {
  email: string;
  password: string;
}

export interface Usuario {
  uid: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: 'usuario' | 'admin' | 'socio' | 'recaudador';
  empresa: string;
  estado: boolean;
  creadoEn: Date;
}

// LEGACY (ya no lo usamos para el modelo actual)
export interface Unidad {
  nombre: string;
}

export interface UnidadGlobal {
  id: string;
  codigo: string;
  empresa: string;
  estado: boolean;
  numeroOrden: number;
  propietarioNombre?: string;
  uidPropietario: string;
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  readonly authState$ = authState(this.auth);

  private _currentUserRole = new BehaviorSubject<string | null>(null);
  public readonly currentUserRole$ = this._currentUserRole.asObservable();

  constructor() {
    // Escuchar cambios en el estado de autenticación
    this.authState$.subscribe(user => {
      if (user) {
        this.cargarRolActual().then(rol => {
          this._currentUserRole.next(rol);
        });
      } else {
        this._currentUserRole.next(null);
        localStorage.removeItem('userRole');
      }
    });
  }

  getUser(): Promise<User | null> {
    return new Promise(resolve => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        resolve(user);
        unsubscribe();
      });
    });
  }

  async signUpWithEmailAndPassword(credential: Credential): Promise<UserCredential> {
    const secondaryApp = initializeApp(environment.firebase, 'SecondaryApp');
    const secondaryAuth = getAuthStandalone(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        credential.email,
        credential.password
      );
      return userCredential;
    } finally {
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);
    }
  }

  async logIn(email: string, password: string): Promise<UserCredential> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;

    // Forzar recarga del token
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const role = token.claims['role'] as string | null;

    this._currentUserRole.next(role);
    localStorage.setItem('userRole', role ?? '');

    // Leer datos públicos (ahora sí guardamos rol/empresa/estado ahí también)
    const uid = user.uid;
    const docRef = doc(this.firestore, `usuariosPublicos/${uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const rolPublico = data['rol'];
      if (rolPublico) {
        this._currentUserRole.next(rolPublico);
        localStorage.setItem('userRole', rolPublico);
      }
    }

    return userCredential;
  }

  async logOut(): Promise<void> {
    this._currentUserRole.next(null);
    localStorage.removeItem('userRole');
    await signOut(this.auth);
  }

  getUserRole(): string | null {
    return this._currentUserRole.getValue() || localStorage.getItem('userRole');
  }

  async obtenerDatosUsuarioActual(): Promise<Usuario | null> {
    const user = this.auth.currentUser;
    if (!user) return null;

    const docRef = doc(this.firestore, `usuariosPublicos/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as Usuario;
    }

    return null;
  }

  enviarCorreoRecuperacion(email: string): Promise<void> {
    this.auth.languageCode = 'es-419';
    return sendPasswordResetEmail(this.auth, email);
  }

  /**
   * Guarda el usuario en:
   * - usuarios/{uid} (privado)
   * - usuariosPublicos/{uid} (público)
   *
   * Importante: guardamos también rol/empresa/estado aquí porque tu login los lee de usuariosPublicos.
   */
  async guardarUsuarioEnFirestore(uid: string, usuario: Omit<Usuario, 'uid'>): Promise<void> {
    // Privado
    const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario, { merge: true });

    // Público (incluye rol/empresa/estado para consistencia)
    const userPublicoRef = doc(this.firestore, 'usuariosPublicos', uid);
    await setDoc(
      userPublicoRef,
      {
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        cedula: usuario.cedula,
        email: usuario.email,
        rol: usuario.rol,
        empresa: usuario.empresa,
        estado: usuario.estado,
        creadoEn: usuario.creadoEn
      },
      { merge: true }
    );
  }
async unidadDisponible(empresa: string, codigo: string): Promise<boolean> {
  const empresaKey = String(empresa ?? '').trim().replace(/\s+/g, '');
  const cod = String(codigo ?? '').trim().toUpperCase();
  const unidadId = `${empresaKey}_${cod}`;

  const snap = await getDoc(doc(this.firestore, 'unidades', unidadId));
  return !snap.exists();
}
  /**
   * ✅ NUEVO MODELO: crea unidad en colección global "unidades"
   * DocID: {EmpresaSinEspacios}_{CODIGO}  ej: GeneralPintag_P01
   */
  async crearUnidadGlobal(params: {
    uidPropietario: string;
    propietarioNombre: string;
    empresa: string;
    codigo: string;        // ej: P01, E01
    numeroOrden?: number;  // opcional
  }): Promise<string> {
    const empresa = String(params.empresa ?? '').trim();
    const codigo = String(params.codigo ?? '').trim().toUpperCase();

    if (!empresa || !codigo) throw new Error('empresa y codigo son obligatorios para crear una unidad.');

    const empresaKey = empresa.replace(/\s+/g, ''); // "General Pintag" -> "GeneralPintag"
    const unidadId = `${empresaKey}_${codigo}`;

    const unidadRef = doc(this.firestore, 'unidades', unidadId);

    // Validación: si existe y pertenece a otro propietario, no permitir
    const snap = await getDoc(unidadRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      const owner = String(data?.uidPropietario ?? '');
      if (owner && owner !== params.uidPropietario) {
        throw new Error(`La unidad ${codigo} ya está asignada a otro propietario.`);
      }
    }

    await setDoc(
      unidadRef,
      {
        codigo,
        empresa,
        estado: true,
        numeroOrden: Number(params.numeroOrden ?? 0),
        propietarioNombre: params.propietarioNombre,
        uidPropietario: params.uidPropietario,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return unidadId;
  }

  // =========================
  // LEGACY: subcolección usuarios/{uid}/unidades
  // =========================

  /** @deprecated Modelo anterior. No usar para registro nuevo. */
  async guardarUnidadEnSubcoleccion(userId: string, unidad: Unidad): Promise<void> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    await addDoc(unidadesRef, unidad);
  }

  /** @deprecated Modelo anterior. */
  async obtenerUnidadesDeUsuario(userId: string): Promise<Unidad[]> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    const q = query(unidadesRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Unidad);
  }

  async obtenerUnidadesGlobalesDeUsuario(userId: string): Promise<UnidadGlobal[]> {
    const unidadesRef = collection(this.firestore, 'unidades');
    const q = query(unidadesRef, where('uidPropietario', '==', userId));
    const snap = await getDocs(q);

    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id,
        codigo: data.codigo || '',
        empresa: data.empresa || '',
        estado: data.estado ?? true,
        numeroOrden: data.numeroOrden ?? 0,
        propietarioNombre: data.propietarioNombre || '',
        uidPropietario: data.uidPropietario || userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      } as UnidadGlobal;
    });
  }

  async correoExiste(email: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('email', '==', email));
    const resultado = await getDocs(q);
    return !resultado.empty;
  }

  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }

  async cargarRolActual(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      this._currentUserRole.next(null);
      return null;
    }

    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const rol = snap.data()['rol'];
      this._currentUserRole.next(rol);
      return rol;
    }

    this._currentUserRole.next(null);
    return null;
  }

  async obtenerCorreoPorCedula(cedula: string): Promise<string | null> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return data['email'] || null;
    }

    return null;
  }
}
