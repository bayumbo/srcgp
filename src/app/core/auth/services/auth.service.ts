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
  serverTimestamp,
  limit
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
  creadoEn: any;   // Timestamp (serverTimestamp)
  updatedAt?: any; // Timestamp
}

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

  /**
   * Registro de usuarios desde un "SecondaryApp" para no cambiar sesión del admin.
   */
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

  /**
   * Login normal: primero claims (role), luego fallback a Firestore usuarios/{uid}.
   * Ya NO usa usuariosPublicos.
   */
  async logIn(email: string, password: string): Promise<UserCredential> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;

    // Forzar recarga del token (claims)
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const roleClaim = (token.claims['role'] as string | null) ?? null;

    this._currentUserRole.next(roleClaim);
    localStorage.setItem('userRole', roleClaim ?? '');

    // Fallback: leer rol desde usuarios/{uid} (por si claim aún no propaga)
    const uid = user.uid;
    const docRef = doc(this.firestore, `usuarios/${uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as any;
      const rolFs = (data?.rol as string | undefined) ?? null;
      if (rolFs) {
        this._currentUserRole.next(rolFs);
        localStorage.setItem('userRole', rolFs);
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

  /**
   * Datos del usuario actual desde usuarios/{uid}.
   * Ya NO usa usuariosPublicos.
   */
  async obtenerDatosUsuarioActual(): Promise<Usuario | null> {
    const user = this.auth.currentUser;
    if (!user) return null;

    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);

    if (!snap.exists()) return null;

    return ({ uid: user.uid, ...(snap.data() as any) }) as Usuario;
  }

  enviarCorreoRecuperacion(email: string): Promise<void> {
    this.auth.languageCode = 'es-419';
    return sendPasswordResetEmail(this.auth, email);
  }

  /**
   * Guarda usuario COMPLETO en usuarios/{uid}.
   * - merge:true evita pisar campos si alguien escribe parcial después
   * - serverTimestamp para creadoEn/updatedAt consistente
   * Ya NO escribe usuariosPublicos.
   */
  async guardarUsuarioEnFirestore(uid: string, usuario: Omit<Usuario, 'uid'>): Promise<void> {
    if (!uid) throw new Error('UID requerido para guardar usuario');

    const userRef = doc(this.firestore, 'usuarios', uid);

    const data = {
      cedula: String(usuario.cedula ?? '').trim(),
      nombres: String(usuario.nombres ?? '').trim(),
      apellidos: String(usuario.apellidos ?? '').trim(),
      email: String(usuario.email ?? '').trim().toLowerCase(),
      rol: (usuario.rol ?? 'usuario') as Usuario['rol'],
      empresa: String(usuario.empresa ?? 'General Pintag').trim(),
      estado: typeof usuario.estado === 'boolean' ? usuario.estado : true,
      creadoEn: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (!data.cedula) throw new Error('Cédula requerida');
    if (!data.nombres) throw new Error('Nombres requeridos');
    if (!data.apellidos) throw new Error('Apellidos requeridos');
    if (!data.email) throw new Error('Email requerido');

    await setDoc(userRef, data, { merge: true });
  }

  async guardarUnidadEnSubcoleccion(userId: string, unidad: Unidad): Promise<void> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    await addDoc(unidadesRef, unidad);
  }

  async obtenerUnidadesDeUsuario(userId: string): Promise<Unidad[]> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    const q = query(unidadesRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => d.data() as Unidad);
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

  /**
   * Validación de correo: ahora consulta usuarios (no usuariosPublicos).
   */
  async correoExiste(email: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('email', '==', String(email).trim().toLowerCase()), limit(1));
    const resultado = await getDocs(q);
    return !resultado.empty;
  }

  /**
   * Validación de cédula: ahora consulta usuarios (no usuariosPublicos).
   */
  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', String(cedula).trim()), limit(1));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }

  /**
   * Rol actual desde usuarios/{uid}.
   */
  async cargarRolActual(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      this._currentUserRole.next(null);
      return null;
    }

    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const rol = (snap.data() as any)['rol'] as string | undefined;
      this._currentUserRole.next(rol ?? null);
      return rol ?? null;
    }

    this._currentUserRole.next(null);
    return null;
  }

  /**
   * Obtener correo por cédula desde usuarios (no usuariosPublicos).
   */
  async obtenerCorreoPorCedula(cedula: string): Promise<string | null> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', String(cedula).trim()), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data() as any;
      return data?.email || null;
    }

    return null;
  }
}
