// src/app/pages/menu/menu.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  imports: [CommonModule]
})
export class MenuComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  rol: string | null = null;
  isLoading = true;

  async ngOnInit(): Promise<void> {
    this.rol = this.authService.getUserRole();

    if (!this.rol) {
      this.rol = await this.authService.cargarRolActual();
      if (this.rol) {
        localStorage.setItem('userRole', this.rol);
      }
    }

    this.isLoading = false;
    console.log('Rol actual del usuario en MenuComponent:', this.rol);
  }

  // --- NUEVA LÓGICA DE PERMISOS PARA HEXÁGONOS ---

  // Reportes: admin, socio, recaudador pueden ver y entrar
  get canSeeReports(): boolean {
    return ['admin', 'socio', 'recaudador'].includes(this.rol || '');
  }

  // Contabilidad: admin, socio, recaudador pueden ver y entrar
  get canSeeContabilidad(): boolean {
    return ['admin', 'socio', 'recaudador'].includes(this.rol || '');
  }

  // Admin: admin y socio pueden ver y entrar. Recaudador NO lo ve.
  get canSeeAdmin(): boolean {
    return ['admin', 'socio'].includes(this.rol || '');
  }

  // Registrar Usuario: SOLO admin puede ver y entrar. Socio y Recaudador NO lo ven.
  get canSeeRegisterUser(): boolean {
    return this.rol === 'admin';
  }

  // No necesitamos propiedades 'disable' para los hexágonos, ya que ahora ocultamos directamente
  // si el rol no tiene permiso para ver.

  // Métodos de navegación existentes
  async logOut(): Promise<void> {
    await this.authService.logOut();
    this.router.navigate(['/auth/login']);
  }

  goToRegister(): void {
    // La navegación solo se ejecutará si el *ngIf permitió ver el botón
    this.router.navigate(['/register']);
  }

  goTo(route: string): void {
    // La navegación solo se ejecutará si el *ngIf permitió ver el botón
    this.router.navigate([route]);
  }
}