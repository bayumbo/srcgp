import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { confirmPasswordReset, getAuth } from '@angular/fire/auth';

@Component({
  standalone: true,
  selector: 'app-cambio-confirmado',
  imports: [CommonModule, FormsModule],
  templateUrl: './cambio-confirmado.component.html'
})
export class CambioConfirmadoComponent implements OnInit {
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
