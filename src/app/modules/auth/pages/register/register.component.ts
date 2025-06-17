import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import { AuthService, Usuario, Unidad } from 'src/app/core/auth/services/auth.service'; // Importamos Unidad también
import { Router } from '@angular/router';

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

  @ViewChild('cedulaInput') cedulaInput!: ElementRef;

  hidePassword: boolean = true;
  mensajeExito: string = '';
  mensajeError: string = '';

  form: FormGroup = this.fb.group({
    cedula: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rol: ['usuario', Validators.required],
    unidadInput: ['', Validators.required], // Campo para la entrada de texto de las unidades
    empresa: ['General Pintag', Validators.required]
  });
  volverAlMenu: any;

  async signUp(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    const {
      cedula, nombres, apellidos, email, password, rol, unidadInput, empresa } = this.form.value;

    try {
      const cedulaExiste = await this.authService.existeCedula(cedula);
      if (cedulaExiste) {
        alert('Ya existe un usuario registrado con esta cédula.');
        return;
      }

      // 1. Registrar usuario en Firebase Authentication
      const userCredential = await this.authService.signUpWithEmailAndPassword({ email, password });
      console.log('Registrado en Auth:', userCredential.user.uid);
      const uid = userCredential.user.uid;
      console.log('Guardando en Firestore...');

      // 2. Preparar el objeto de usuario principal (sin unidades)
      const usuarioData: Omit<Usuario, 'uid'> = { // Usamos Omit para que no exija 'uid'
        cedula,
        nombres,
        apellidos,
        email,
        rol,
        empresa,
        estado: true,
        creadoEn: new Date()
      };

      // 3. Guardar el documento principal del usuario en Firestore
      await this.authService.guardarUsuarioEnFirestore(uid, usuarioData);
      console.log('Documento de usuario principal guardado con éxito');

      // 4. Procesar y guardar cada unidad en la subcolección
      const unidadesArray = unidadInput.split(',').map((u: string) => u.trim()).filter((u: string) => u !== '');

      for (const unidadNombre of unidadesArray) {
        const unidad: Unidad = { nombre: unidadNombre };
        await this.authService.guardarUnidadEnSubcoleccion(uid, unidad);
        console.log(`Unidad "${unidadNombre}" guardada en subcolección para usuario ${uid}`);
      }

      // ✅ Mostrar mensaje de éxito
      this.mensajeExito = '✅ Registro exitoso';
      setTimeout(() => {
        this.mensajeExito = '';
      }, 3000);

      // ✅ Limpiar formulario
      this.form.reset();
      this.hidePassword = true;

      // ✅ Opcional: reenfocar al primer campo
      setTimeout(() => {
        this.cedulaInput?.nativeElement?.focus();
      }, 0);

    } catch (error: any) {
      console.error('Error en el registro:', error);
      if (error.code === 'auth/email-already-in-use') {
        this.mensajeError = 'Ya existe un usuario registrado con este correo electrónico.';
      } else {
        this.mensajeError = 'Ocurrió un error al registrar. Intenta nuevamente.';
      }

      // 🔁 Oculta el mensaje de error luego de 3 segundos
      setTimeout(() => {
        this.mensajeError = '';
      }, 3000);
    }
  }
}