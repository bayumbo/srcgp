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
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query
} from '@angular/fire/firestore';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';

@Component({
  standalone: true,
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss']
})
export class PerfilComponent implements OnInit {
  nombres: string = '';
  apellidos: string = '';
  correo: string = '';
  nuevaContrasena: string = '';
  contrasenaActual: string = '';
  unidad: string = '';
  cedula: string = '';
  empresa: string = '';
  
  uid: string | undefined;
  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;
  esAdmin: boolean = false;
  soloLectura: boolean = false;

  // Para comparar cambios
  datosOriginales: Partial<PerfilComponent> = {};
  hayCambios: boolean = false;
  reportesUsuario: ReporteConPagos[] = [];

  //Datos para lista de pagos
  pagos: any[] = [];
  pagosPaginados: any[] = [];
  paginaActualPagos: number = 1;
  pagosPorPagina: number = 5;
  totalPaginasPagos: number = 1;

  constructor(
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    const uidParam = this.route.snapshot.paramMap.get('uid');
    const auth = getAuth();


    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe(); // ✅ Esto evita bucles

      if (user) {
        this.correo = user.email || '';


        if (uidParam) {
          this.uid = uidParam;


          // Ver si el perfil es de otro usuario
          if (uidParam !== user.uid) {
            this.soloLectura = true;
          }
        } else {
          this.uid = user.uid;
        }


        await this.cargarDatosUsuario();

        await this.obtenerReportesUsuario();
        await this.cargarPagosUsuario();
        const rol = await this.authService.cargarRolActual();
        this.esAdmin = rol === 'admin';
      }

      unsubscribe(); // detiene el listener
    });
  }


  async cargarDatosUsuario() {
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
        this.unidad = data['unidad'] || '';
        this.empresa = data['empresa'] || '';
        this.correo = data['email'] || this.correo;

        // Guardar estado original para detección de cambios
        this.datosOriginales = {
          nombres: this.nombres,
          apellidos: this.apellidos,
          cedula: this.cedula,
          unidad: this.unidad,
          empresa: this.empresa,
          correo: this.correo,
        };
      }
    } catch (error) {
      console.error('Error al cargar usuario:', error);
    }
  }

  async obtenerReportesUsuario() {
    if (!this.uid) return;
  
    const firestore = getFirestore();
    const reportesRef = collection(firestore, `usuarios/${this.uid}/reportesDiarios`);
    const q = query(reportesRef, orderBy('fechaModificacion', 'desc'));
  
    const snapshot = await getDocs(q);
    const tempReportes: ReporteConPagos[] = [];
  
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;
  
      const pagosRef = collection(firestore, `usuarios/${this.uid}/reportesDiarios/${id}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);
  
      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;
  
      pagosSnap.forEach(pagoDoc => {
        const pago = pagoDoc.data();
        const detalles = pago['detalles'] ?? {};
  
        minutosPagados += detalles.minutosAtraso || 0;
        adminPagada += detalles.administracion || 0;
        minBasePagados += detalles.minutosBase || 0;
        multasPagadas += detalles.multas || 0;
      });
  
      tempReportes.push({
        ...data,
        id,
        uid: this.uid,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas
      });
    }
  
    this.reportesUsuario = tempReportes;
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
      this.unidad !== this.datosOriginales.unidad ||
      this.empresa !== this.datosOriginales.empresa ||
      this.correo !== this.datosOriginales.correo ||
      !!this.nuevaContrasena;
  }

  async guardarCambios() {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    try {
      const email = user.email;
      if (!email) return alert('❌ Email no disponible');

      if (this.correo !== email) {
        await updateEmail(user, this.correo);
      }

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

      alert('✅ Cambios guardados correctamente');
      this.cancelarCambioContrasena();

      // Resetear comparación
      this.datosOriginales = {
        nombres: this.nombres,
        apellidos: this.apellidos,
        cedula: this.cedula,
        unidad: this.unidad,
        empresa: this.empresa,
        correo: this.correo,
      };
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
    if (type === 'current') {
      this.showCurrentPassword = !this.showCurrentPassword;
    } else {
      this.showNewPassword = !this.showNewPassword;
    }
  }

  async cargarPagosUsuario() {
    if (!this.uid) return;
  
    const firestore = getFirestore();
    const reportesRef = collection(firestore, `usuarios/${this.uid}/reportesDiarios`);
    const reportesSnap = await getDocs(reportesRef);
  
    const pagosTotales: any[] = [];
  
    for (const reporte of reportesSnap.docs) {
      const pagosRef = collection(firestore, `usuarios/${this.uid}/reportesDiarios/${reporte.id}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);
  
      pagosSnap.forEach(pagoDoc => {
        const pagoData = pagoDoc.data();
        pagosTotales.push({
          ...pagoData,
          fecha: pagoData['fecha']?.toDate?.() || null,
          urlPDF: pagoData['urlPDF'] || null
        });
      });
    }
  
    this.pagos = pagosTotales.sort((a, b) => (b.fecha as any) - (a.fecha as any));
    this.totalPaginasPagos = Math.ceil(this.pagos.length / this.pagosPorPagina);
    this.actualizarPagosPaginados();
  }

  actualizarPagosPaginados() {
    const inicio = (this.paginaActualPagos - 1) * this.pagosPorPagina;
    const fin = inicio + this.pagosPorPagina;
    this.pagosPaginados = this.pagos.slice(inicio, fin);
  }
  
  cambiarPaginaPagos(valor: number) {
    const nuevaPagina = this.paginaActualPagos + valor;
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginasPagos) {
      this.paginaActualPagos = nuevaPagina;
      this.actualizarPagosPaginados();
    }
  }
  
  descargarPDF(url: string) {
    window.open(url, '_blank');
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }
  
  
}
