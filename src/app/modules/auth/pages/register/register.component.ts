import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

import { AuthService, Credential } from 'src/app/core/auth/services/auth.service';
import { catchError } from 'rxjs';
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
  hidePassword: boolean = true;

  form: FormGroup = this.fb.group({
    cedula: ['',[ Validators.required,
      Validators.pattern(/^\d{10}$/)] 
     ],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
 
  async signUp(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // ← fuerza que se muestren errores en todos los campos
      alert('Por favor completa todos los campos requeridos.');
      return;
    }
  
    const credentials: Credential = {
      email: this.form.value.email,
      password: this.form.value.password,
    };
  
    try {
      const UserCredential= await this.authService.signUpWithEmailAndPassword(credentials);
      console.log('Registro exitoso:', this.form.value);
      this._router.navigateByUrl('/');
    } catch (error) {
      console.error('Error en el registro:', error);
    }
  }
  
 }   

