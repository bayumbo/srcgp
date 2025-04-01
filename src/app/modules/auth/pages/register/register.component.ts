import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import { AuthService, Credential } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-register',
  templateUrl: './register.component.html',
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private _router = inject(Router);

  @ViewChild('cedulaInput') cedulaInput!: ElementRef;

  hidePassword: boolean = true;
  mensajeExito: string = '';

  form: FormGroup = this.fb.group({
    cedula: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async signUp(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    const { cedula, nombres, apellidos, email, password } = this.form.value;

    try {
      const cedulaExiste = await this.authService.existeCedula(cedula);
      if (cedulaExiste) {
        alert('Ya existe un usuario registrado con esta cédula.');
        return;
      }

      const userCredential = await this.authService.signUpWithEmailAndPassword({ email, password });
      console.log('Registrado en Auth:', userCredential.user.uid);
      const uid = userCredential.user.uid;
      console.log('Guardando en Firestore...');


      const usuario = {
        uid,
        cedula,
        nombres,
        apellidos,
        email,
        rol: 'usuario',
        creadoEn: new Date()
      };

      await this.authService.guardarUsuarioEnFirestore(uid, usuario);
      console.log('Guardado en Firestore con éxito');

      // ✅ Mostrar mensaje de éxito
      this.mensajeExito = '✅ Registro exitoso';
      setTimeout(() => {
        this.mensajeExito = '';
      }, 3000); // Oculta el mensaje después de 3 segundos

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
        alert('Este correo ya está registrado.');
      } else {
        alert(error.message || 'Hubo un error al registrar al usuario.');
      }
    }
  }
}
