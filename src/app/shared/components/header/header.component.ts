// src/app/shared/components/header/header.ts

import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { doc, getDoc, Firestore } from '@angular/fire/firestore';

@Component({
  standalone: true,
  selector: 'app-header',
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  menuLateralAbierto = false;
  menuUsuarioAbierto = false;
  iniciales: string = '';
  nombreEmpresa: string = '...';
  rolUsuario: string = '';

  private elementRef = inject(ElementRef);
  private router = inject(Router);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);

  async ngOnInit() {
    try {
      const user = await this.authService.getUser();
      if (user?.uid) {
        const ref = doc(this.firestore, `usuarios/${user.uid}`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const nombres = data['nombres'] || '';
          const apellidos = data['apellidos'] || '';
          this.iniciales =
            (nombres[0] || '').toUpperCase() + (apellidos[0] || '').toUpperCase();
          this.nombreEmpresa = data['empresa'] || 'Mi Empresa';
          this.rolUsuario = data['rol'] || '';
          console.log('Rol del usuario en Header:', this.rolUsuario);
        }
      }
    } catch (error) {
      console.error('Error al obtener los datos del usuario en Header:', error);
    }
  }

  // --- NUEVA LÓGICA DE PERMISOS PARA SIDEBAR (HEADER) ---

  // El sidebar completo (incluyendo el botón de toggle) es visible para admin, socio y recaudador.
  get canAccessSidebar(): boolean {
    return ['admin', 'socio', 'recaudador'].includes(this.rolUsuario);
  }

  // Reportes en Sidebar: admin, socio, recaudador pueden ver y entrar
  get canSeeReportsInSidebar(): boolean {
    return ['admin', 'socio', 'recaudador'].includes(this.rolUsuario);
  }

  // Contabilidad en Sidebar: admin, socio, recaudador pueden ver y entrar
  get canSeeContabilidadInSidebar(): boolean {
    return ['admin', 'socio', 'recaudador'].includes(this.rolUsuario);
  }

  // Admin en Sidebar: admin y socio pueden ver y entrar. Recaudador NO lo ve.
  get canSeeAdminInSidebar(): boolean {
    return ['admin', 'socio'].includes(this.rolUsuario);
  }
  
  // No se necesita disableAdminInSidebar ya que el recaudador no lo verá.

  // Perfil en menú de usuario (dropdown derecha): siempre visible para usuario logueado
  get canSeeProfileOption(): boolean {
    return !!this.rolUsuario;
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.menuLateralAbierto = false;
      this.menuUsuarioAbierto = false;
    }
  }

  toggleMenuLateral() {
    if (this.canAccessSidebar) { // Solo si el sidebar es accesible para el rol
      this.menuLateralAbierto = !this.menuLateralAbierto;
      this.menuUsuarioAbierto = false;
    }
  }

  toggleMenuUsuario() {
    this.menuUsuarioAbierto = !this.menuUsuarioAbierto;
    this.menuLateralAbierto = false;
  }

  goTo(ruta: string) {
    this.router.navigate([ruta]);
    this.menuLateralAbierto = false;
    this.menuUsuarioAbierto = false;
  }

  async salir() {
    try {
      await this.authService.logOut();
      this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}