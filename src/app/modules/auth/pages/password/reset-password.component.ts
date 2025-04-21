import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-reset-password',
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './reset-password.component.html',
  styleUrl:'./reset-password.component.scss'

})
export class ResetPasswordComponent {
  email: string = '';

  constructor(
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  enviarEnlace() {
    if (!this.email) {
      this.snackBar.open('Por favor, ingresa un correo electrónico.', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.authService.correoExiste(this.email).then(existe => {
      if (!existe) {
        this.snackBar.open('❌ Este correo no está registrado.', 'Cerrar', {
          duration: 4000,
          panelClass: ['snack-error']
        });
        return;
      }

      this.authService.enviarCorreoRecuperacion(this.email)
        .then(() => {
          this.snackBar.open('📩 Se envió el enlace para restablecer tu contraseña.', 'Cerrar', {
            duration: 3000,
            panelClass: ['snack-success']
          });
          setTimeout(() => {
            this.router.navigate(['/auth/login']);
          }, 3000);
        })
        .catch(error => {
          this.snackBar.open('❌ Error: ' + error.message, 'Cerrar', {
            duration: 4000,
            panelClass: ['snack-error']
          });
        });
    });
  }

  volverAlLogin() {
    this.router.navigate(['/auth/login']);
  }
}
