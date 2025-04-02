import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { confirmPasswordReset, getAuth } from '@angular/fire/auth';

@Component({
  standalone: true,
  selector: 'app-confirmar-cambio',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h2>Nueva contraseña</h2>
      <form (ngSubmit)="cambiarContrasena()">
        <label for="password">Escribe tu nueva contraseña</label>
        <input
          type="password"
          id="password"
          name="password"
          [(ngModel)]="nuevaContrasena"
          required
        />
        <button type="submit">Aceptar</button>
      </form>
    </div>
  `
})
export class ConfirmarCambioComponent implements OnInit {
  oobCode: string = '';
  nuevaContrasena: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode') || '';
  }

  cambiarContrasena() {
    if (!this.oobCode || !this.nuevaContrasena) return;

    confirmPasswordReset(getAuth(), this.oobCode, this.nuevaContrasena)
      .then(() => {
        this.router.navigate(['/auth/password-confirmed']);
      })
      .catch((error) => {
        alert('Error: ' + error.message);
      });
  }
}
