import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  getAuth,
  updatePassword,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from '@angular/fire/auth';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
  limit
} from '@angular/fire/firestore';

import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, Usuario } from 'src/app/core/auth/services/auth.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import { Functions, httpsCallable } from '@angular/fire/functions';

/**
 * PerfilComponent (users.component.ts)
 *
 * Compatibilidad:
 * - Unidades legacy: usuarios/{uid}/unidades -> { nombre: "E01" }
 * - Unidades globales (modelo actual): unidades/{empresaSlug}_{codigo} con uidPropietario
 *
 * Este componente:
 *  1) Carga datos de usuario desde usuarios/{uid}
 *  2) Carga unidades desde colección global "unidades" (uidPropietario)
 *     y si no existen, hace fallback a legacy usuarios/{uid}/unidades
 *  3) Carga reportes del usuario desde "reportes_dia" (modelo oficial)
 *  4) Carga pagos (agregados) desde "reportes_dia" (si existen campos pagados)
 */
type UnidadGlobalUI = {
  id: string;            // docId global o generado
  codigo: string;        // E01
  nombre: string;        // alias para tu HTML (nombre = codigo)
  empresa: string;       // Expreso Antisana
  estado: boolean;
  numeroOrden: number;
  propietarioNombre?: string;
  uidPropietario: string;
  createdAt?: any;
  updatedAt?: any;
};

@Component({
  standalone: true,
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss']
})
export class PerfilComponent implements OnInit {
  cargando: boolean = false;

  nombres: string = '';
  apellidos: string = '';
  correo: string = '';
  nuevaContrasena: string = '';
  contrasenaActual: string = '';

  unidades: UnidadGlobalUI[] = [];

  cedula: string = '';
  empresa: string = '';

  uidActual: string = '';
  uid: string | undefined;

  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;

  esAdmin: boolean = false;
  soloLectura: boolean = false;

  mostrarConfirmacion = false;
  eliminando = false;

  datosOriginales: Partial<Usuario> = {};
  hayCambios: boolean = false;

  reportesUsuario: ReporteConPagos[] = [];

  // Pagos
  pagos: any[] = [];
  pagosPaginados: any[] = [];
  paginaActualPagos: number = 1;
  pagosPorPagina: number = 5;
  totalPaginasPagos: number = 1;

  constructor(
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute,
    private functions: Functions
  ) {}

  async ngOnInit(): Promise<void> {
    const uidParam = this.route.snapshot.paramMap.get('uid');

    const user = await this.authService.getCurrentUser();
    if (!user) return;

    this.uidActual = user.uid;
    this.correo = user.email || '';

    if (uidParam) {
      this.uid = uidParam;
      this.soloLectura = uidParam !== user.uid;
    } else {
      this.uid = user.uid;
      this.soloLectura = false;
    }

    // Rol
    const rol = await this.authService.cargarRolActual();
    this.esAdmin = rol === 'admin';

    await this.cargarDatosUsuario();      // usuario + unidades
    await this.obtenerReportesUsuario();  // reportes_dia
    await this.cargarPagosUsuario();      // agregados desde reportes_dia
  }

  async cargarDatosUsuario(): Promise<void> {
    try {
      const firestore = getFirestore();
      if (!this.uid) return;

      const docRef = doc(firestore, 'usuarios', this.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        this.nombres = data['nombres'] || '';
        this.apellidos = data['apellidos'] || '';
        this.cedula = data['cedula'] || '';
        this.empresa = data['empresa'] || '';
        this.correo = data['email'] || this.correo;

        this.datosOriginales = {
          nombres: this.nombres,
          apellidos: this.apellidos,
          cedula: this.cedula,
          empresa: this.empresa,
          email: this.correo
        };
      }

      await this.cargarUnidadesDelUsuario();

    } catch (error) {
      console.error('Error al cargar usuario o unidades:', error);
    }
  }

  /**
   * Unidades:
   * - Primero desde colección global "unidades" where uidPropietario == uid
   * - Si no hay resultados, fallback a legacy usuarios/{uid}/unidades (campo nombre)
   */
  private async cargarUnidadesDelUsuario(): Promise<void> {
    if (!this.uid) return;

    const firestore = getFirestore();

    // 1) Global
    const globalRef = collection(firestore, 'unidades');
    const qGlobal = query(globalRef, where('uidPropietario', '==', this.uid));
    const snapGlobal = await getDocs(qGlobal);

    if (!snapGlobal.empty) {
      const unidades = snapGlobal.docs.map(d => {
        const data = d.data() as any;
        const codigo = String(data.codigo ?? '').trim();

        return {
          id: d.id,
          codigo,
          nombre: codigo, // alias para template
          empresa: String(data.empresa ?? this.empresa ?? '').trim(),
          estado: data.estado ?? true,
          numeroOrden: data.numeroOrden ?? 0,
          propietarioNombre: data.propietarioNombre || `${this.nombres} ${this.apellidos}`.trim(),
          uidPropietario: data.uidPropietario || this.uid!,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        } as UnidadGlobalUI;
      });

      // Orden local por numeroOrden
      this.unidades = unidades.sort((a, b) => (a.numeroOrden ?? 0) - (b.numeroOrden ?? 0));
      return;
    }

    // 2) Legacy fallback
    const legacyRef = collection(firestore, `usuarios/${this.uid}/unidades`);
    const snapLegacy = await getDocs(query(legacyRef));

    if (snapLegacy.empty) {
      this.unidades = [];
      return;
    }

    const propietarioNombre = `${this.nombres} ${this.apellidos}`.trim();
    const empresaSlug = (this.empresa || '').replace(/\s+/g, '');

    this.unidades = snapLegacy.docs.map((d, idx) => {
      const data = d.data() as any;
      const codigo = String(data?.nombre ?? '').trim() || d.id;

      return {
        id: `${empresaSlug || 'EMP'}_${codigo}`,
        codigo,
        nombre: codigo, // alias para template
        empresa: this.empresa || '',
        estado: true,
        numeroOrden: idx + 1,
        propietarioNombre,
        uidPropietario: this.uid!
      } as UnidadGlobalUI;
    });
  }

  /**
   * Reportes desde el modelo oficial: reportes_dia/{diaId}/unidades/{uid}
   */
  async obtenerReportesUsuario(): Promise<void> {
  if (!this.uid) return;

  this.cargando = true;

  try {
    const firestore = getFirestore();

    // Asegura empresa/unidades cargadas
    if (!this.empresa) {
      await this.cargarDatosUsuario();
      if (!this.empresa) return;
    }

    // Si unidades aún no están cargadas, cárgalas
    if (!this.unidades || this.unidades.length === 0) {
      await this.cargarDatosUsuario(); // esto llama cargarUnidadesDelUsuario()
    }

    // Set de códigos de unidades del usuario (E01, E02, ...)
    const unidadesUsuarioSet = new Set(
      (this.unidades || [])
        .map(u => (u.codigo || u.nombre || '').trim())
        .filter(Boolean)
    );

    // 1) Traer últimos días de esa empresa
    const diasRef = collection(firestore, 'reportes_dia');
    const qDias = query(
      diasRef,
      where('empresa', '==', this.empresa),
      orderBy('fecha', 'desc'),
      limit(90)
    );

    const diasSnap = await getDocs(qDias);

    const temp: ReporteConPagos[] = [];

    // 2) Para cada día, leer todas las unidades del día y filtrar por las del usuario
    for (const diaDoc of diasSnap.docs) {
      const diaId = diaDoc.id;
      const diaData = diaDoc.data() as any;

      const unidadesDiaRef = collection(firestore, `reportes_dia/${diaId}/unidades`);
      const unidadesDiaSnap = await getDocs(unidadesDiaRef);

      if (unidadesDiaSnap.empty) continue;

      const fechaDia: string =
        diaData.fecha || (diaId.includes('_') ? diaId.split('_').pop() : diaId) || '';

      for (const uDoc of unidadesDiaSnap.docs) {
        const u = uDoc.data() as any;

        // El campo unidad/código debe existir en el doc (ajusta si tu campo real es otro)
        const codigoUnidad = String(u.unidad ?? u.codigoUnidad ?? u.unidadCodigo ?? '').trim();

        // Filtra: solo las unidades que pertenecen a este usuario
        if (!codigoUnidad || !unidadesUsuarioSet.has(codigoUnidad)) continue;

        // Omite si todo está en 0 (asignado y pagado)
        const asignado =
          (u.minutosAtraso || 0) +
          (u.administracion || 0) +
          (u.minutosBase || 0) +
          (u.multas || 0);

        const pagado =
          (u.minutosPagados || 0) +
          (u.adminPagada || 0) +
          (u.minBasePagados || 0) +
          (u.multasPagadas || 0);

        if (asignado === 0 && pagado === 0) continue;

        temp.push({
          id: `${diaId}_${codigoUnidad}`, // id único por día+unidad
          uid: this.uid,                  // propietario (para navegación)
          nombre: u.nombre || `${this.nombres} ${this.apellidos}`.trim(),
          unidad: codigoUnidad,

          minutosAtraso: u.minutosAtraso || 0,
          administracion: u.administracion || 0,
          minutosBase: u.minutosBase || 0,
          multas: u.multas || 0,

          minutosPagados: u.minutosPagados || 0,
          adminPagada: u.adminPagada || 0,
          minBasePagados: u.minBasePagados || 0,
          multasPagadas: u.multasPagadas || 0,

          fechaModificacion: (diaData.updatedAt?.toDate?.() ?? new Date(fechaDia))
        } as any);
      }
    }

    // Orden final: fecha desc (si fechaModificacion es Date)
    this.reportesUsuario = temp.sort((a: any, b: any) => {
      const ta = a.fechaModificacion ? new Date(a.fechaModificacion).getTime() : 0;
      const tb = b.fechaModificacion ? new Date(b.fechaModificacion).getTime() : 0;
      return tb - ta;
    });

  } catch (error) {
    console.error('Error al obtener reportes por unidades del usuario:', error);
  } finally {
    this.cargando = false;
  }
}

  /**
   * Pagos (agregados por día) desde reportes_dia
   */
  async cargarPagosUsuario(): Promise<void> {
    if (!this.uid) return;

    try {
      const firestore = getFirestore();

      if (!this.empresa) {
        await this.cargarDatosUsuario();
        if (!this.empresa) return;
      }

      const diasRef = collection(firestore, 'reportes_dia');
      const qDias = query(
        diasRef,
        where('empresa', '==', this.empresa),
        orderBy('fecha', 'desc'),
        limit(180)
      );

      const diasSnap = await getDocs(qDias);
      const pagosTemp: any[] = [];

      for (const diaDoc of diasSnap.docs) {
        const diaId = diaDoc.id;
        const diaData = diaDoc.data() as any;

        const uRef = doc(firestore, `reportes_dia/${diaId}/unidades/${this.uid}`);
        const uSnap = await getDoc(uRef);
        if (!uSnap.exists()) continue;

        const u = uSnap.data() as any;

        const totalPagado =
          (u.minutosPagados || 0) +
          (u.adminPagada || 0) +
          (u.minBasePagados || 0) +
          (u.multasPagadas || 0);

        if (totalPagado === 0) continue;

        pagosTemp.push({
          fecha: diaData.fecha || (diaId.includes('_') ? diaId.split('_').pop() : null),
          empresa: diaData.empresa || this.empresa,
          unidad: u.unidad || u.unidadCodigo || u.codigoUnidad || '',
          detalles: {
            minutosAtraso: u.minutosPagados || 0,
            administracion: u.adminPagada || 0,
            minutosBase: u.minBasePagados || 0,
            multas: u.multasPagadas || 0
          },
          totalPagado,
          urlPDF: u.urlPDF || null
        });
      }

      this.pagos = pagosTemp.sort((a, b) => {
        const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
        const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
        return fb - fa;
      });

      this.totalPaginasPagos = Math.max(1, Math.ceil(this.pagos.length / this.pagosPorPagina));
      this.paginaActualPagos = 1;
      this.actualizarPagosPaginados();

    } catch (e) {
      console.error('Error al cargar pagos (agregados) del usuario:', e);
      this.pagos = [];
      this.pagosPaginados = [];
      this.totalPaginasPagos = 1;
      this.paginaActualPagos = 1;
    }
  }

  get passwordStrength(): string {
    const pass = this.nuevaContrasena;
    if (!pass) return '';
    if (pass.length < 6) return 'Débil';
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass) && /[!@#$%^&*]/.test(pass)) return 'Fuerte';
    return 'Media';
  }

  verificarCambios(): void {
    this.hayCambios =
      this.nombres !== this.datosOriginales.nombres ||
      this.apellidos !== this.datosOriginales.apellidos ||
      this.cedula !== this.datosOriginales.cedula ||
      this.empresa !== this.datosOriginales.empresa ||
      this.correo !== this.datosOriginales.email ||
      !!this.nuevaContrasena;
  }

  async guardarCambios(): Promise<void> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    try {
      const email = user.email;
      if (!email) return alert('❌ Email no disponible');

      // Evitar cambiar credenciales de otro usuario desde el cliente
      if (this.uid !== user.uid) {
        if (this.correo !== this.datosOriginales.email || this.nuevaContrasena) {
          return alert('⚠️ Para cambiar correo/clave de otro usuario, debe hacerse vía Cloud Function (Admin).');
        }
      } else {
        // Cambiar email propio
        if (this.correo !== email) {
          await updateEmail(user, this.correo);
          const firestore = getFirestore();
          const userDocRef = doc(firestore, 'usuarios', user.uid);
          await setDoc(userDocRef, { email: this.correo }, { merge: true });
        }

        // Cambiar contraseña propia
        if (this.nuevaContrasena) {
          if (this.nuevaContrasena.length < 6) {
            return alert('⚠️ La nueva contraseña debe tener al menos 6 caracteres');
          }
          if (!this.contrasenaActual) {
            return alert('⚠️ Ingresa tu contraseña actual');
          }
          const credential = EmailAuthProvider.credential(email, this.contrasenaActual);
          await reauthenticateWithCredential(user, credential);
          await updatePassword(user, this.nuevaContrasena);
        }
      }

      // Firestore: propio o ajeno si admin
      if (this.uid !== user.uid && !this.esAdmin) {
        return alert('❌ No autorizado para editar este perfil');
      }

      const firestore = getFirestore();
      const userDocRef = doc(firestore, 'usuarios', this.uid || user.uid);

      await setDoc(
        userDocRef,
        {
          nombres: this.nombres,
          apellidos: this.apellidos,
          cedula: this.cedula,
          empresa: this.empresa
        },
        { merge: true }
      );

      this.cancelarCambioContrasena();
      await this.cargarDatosUsuario();
      this.hayCambios = false;


    } catch (error: any) {
      const errorCode = error?.code || error?.error?.code;
      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        alert('❌ Contraseña incorrecta');
      } else {
        alert('❌ Error: ' + (error.message || 'Ocurrió un error inesperado'));
      }
    }
  }

  cancelarCambioContrasena(): void {
    this.nuevaContrasena = '';
    this.contrasenaActual = '';
    this.showNewPassword = false;
    this.showCurrentPassword = false;
    this.verificarCambios();
  }

  togglePasswordVisibility(type: 'current' | 'new'): void {
    if (type === 'current') this.showCurrentPassword = !this.showCurrentPassword;
    else this.showNewPassword = !this.showNewPassword;
  }

  eliminarUsuario(): void {
    this.mostrarConfirmacion = true;
  }

  async confirmarEliminacion(): Promise<void> {
    this.mostrarConfirmacion = false;
    this.eliminando = true;

    try {
      if (!this.uid) throw new Error('UID destino no definido');
      if (!this.esAdmin) throw new Error('No autorizado');
      if (this.uid === this.uidActual) throw new Error('No puedes eliminar tu propio usuario desde aquí');

      const eliminarFn = httpsCallable(this.functions, 'eliminarUsuarioAuth');
      await eliminarFn({ uid: this.uid });

      this.router.navigate(['/admin/gestionroles']);
      alert('✅ Usuario eliminado correctamente.');

    } catch (error: any) {
      console.error('❌ Error al eliminar usuario:', error);
      alert('❌ No se pudo eliminar completamente el usuario.');
    } finally {
      this.eliminando = false;
    }
  }

  cancelarEliminacion(): void {
    this.mostrarConfirmacion = false;
  }

  actualizarPagosPaginados(): void {
    const inicio = (this.paginaActualPagos - 1) * this.pagosPorPagina;
    const fin = inicio + this.pagosPorPagina;
    this.pagosPaginados = this.pagos.slice(inicio, fin);
  }

  cambiarPaginaPagos(valor: number): void {
    const nuevaPagina = this.paginaActualPagos + valor;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasPagos) {
      this.paginaActualPagos = nuevaPagina;
      this.actualizarPagosPaginados();
    }
  }

  descargarPDF(url: string): void {
    window.open(url, '_blank');
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }
}
