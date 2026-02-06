import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import { AuthService, Usuario } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { User } from 'firebase/auth';

@Component({
  standalone: true,
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: '../register/register.component.scss',
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private _router = inject(Router);
  private functions = inject(Functions);

  @ViewChild('cedulaInput') cedulaInput!: ElementRef;

  hidePassword: boolean = true;
  mensajeExito: string = '';
  mensajeError: string = '';
  isRegistering: boolean = false;

  form: FormGroup = this.fb.group({
    cedula: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rol: ['usuario', Validators.required],
    unidadInput: [''], // aquí se ingresan CODIGOS: P01 o P01,P02
    empresa: ['General Pintag', Validators.required]
  });

  async signUp(): Promise<void> {
    if (this.isRegistering) return;
    this.isRegistering = true;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Por favor completa todos los campos correctamente.');
      this.isRegistering = false;
      return;
    }

    const { cedula, nombres, apellidos, email, password, rol, unidadInput, empresa } = this.form.value;
    const unidadTexto = String(unidadInput ?? '').trim();
// ===============================
// ✅ VALIDAR UNIDAD ANTES DE CREAR USUARIO (evita socio sin unidad)
// ===============================
const codigos = unidadTexto
  .split(',')
  .map((u: string) => u.trim().toUpperCase())
  .filter((u: string) => u !== '');

// Socio: unidad obligatoria
if (rol === 'socio' && codigos.length === 0) {
  alert('El rol SOCIO debe registrar al menos una unidad (ej: P01).');
  this.isRegistering = false;
  return;
}

// Si NO es recaudador, validar que las unidades no existan
if (rol !== 'recaudador') {
  for (const codigo of codigos) {
    const disponible = await this.authService.unidadDisponible(empresa, codigo);
    if (!disponible) {
      alert(`❌ La unidad ${codigo} ya pertenece a otro socio. No se puede crear el usuario.`);
      this.isRegistering = false;
      return; // 🔥 corta el flujo ANTES de crear usuario
    }
  }
}

    try {
      // Verificar cédula
      const cedulaExiste = await this.authService.existeCedula(cedula);
      if (cedulaExiste) {
        alert('Ya existe un usuario registrado con esta cédula.');
        return;
      }

      // 1) Registrar en Firebase Auth (SecondaryApp)
      const userCredential = await this.authService.signUpWithEmailAndPassword({ email, password });
      const uid = userCredential.user.uid;

      // 2) Guardar usuario en Firestore
      const usuarioData: Omit<Usuario, 'uid'> = {
        cedula,
        nombres,
        apellidos,
        email,
        rol,
        empresa,
        estado: true,
        creadoEn: new Date()
      };

      await this.authService.guardarUsuarioEnFirestore(uid, usuarioData);
      console.log('📝 Documento de usuario guardado en Firestore.');

      // 3) Crear unidad(es) en colección global "unidades" si aplica
const debeCrearUnidades = rol !== 'recaudador' && codigos.length > 0;

if (debeCrearUnidades) {
  const propietarioNombre =
    `${String(nombres ?? '').trim()} ${String(apellidos ?? '').trim()}`.trim();

  for (const codigo of codigos) {
    await this.authService.crearUnidadGlobal({
      uidPropietario: uid,
      propietarioNombre,
      empresa,
      codigo,
      numeroOrden: 0
    });
  }
} else {
  console.log('ℹ️ No se crean unidades (rol recaudador o sin unidades).');
}

      // 4) Llamar función para asignar rol (custom claim) y esperar propagation
      try {
        const asignarFn = httpsCallable(this.functions, 'asignarRolDesdeFirestore');
        await asignarFn({ uid });
        console.log('⏳ Esperando a que el claim de rol se propague...');

        async function waitForClaim(user: User, claimKey: string, retries = 5, delay = 1000) {
          for (let i = 0; i < retries; i++) {
            const tokenResult = await user.getIdTokenResult();
            if (tokenResult.claims[claimKey]) return tokenResult.claims[claimKey];
            await new Promise(res => setTimeout(res, delay));
          }
          return null;
        }

        const claimRol = await waitForClaim(userCredential.user, 'role', 5, 1000);
        console.log('🔐 Rol en claim después del registro:', claimRol);

        const rolString = typeof claimRol === 'string' ? claimRol : '';
        // nota: accedes a privado; lo dejo como lo tenías
        (this.authService as any)['_currentUserRole'].next(rolString || null);
        localStorage.setItem('userRole', rolString);

      } catch (error) {
        console.warn('⚠️ No se pudo asignar el claim de rol automáticamente.', error);
      }

      // 5) Mensaje éxito + reset
      this.mensajeExito = '✅ Registro exitoso';
      setTimeout(() => (this.mensajeExito = ''), 3000);

      this.form.reset();
      this.hidePassword = true;
      setTimeout(() => this.cedulaInput?.nativeElement?.focus(), 0);

    } catch (error: any) {
      console.error('❌ Error en el registro:', error);
      this.mensajeError = error.code === 'auth/email-already-in-use'
        ? 'Ya existe un usuario registrado con este correo electrónico.'
        : (error?.message ? String(error.message) : 'Ocurrió un error al registrar. Intenta nuevamente.');
      setTimeout(() => (this.mensajeError = ''), 3000);
    } finally {
      this.isRegistering = false;
    }
  }
}
