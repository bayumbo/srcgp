import {
  Component,
  inject,
  OnInit,
  ChangeDetectorRef,
  ViewChild,
  HostListener,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})

export class HeaderComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('menuRef') menuRef!: ElementRef;
  @ViewChild('avatarRef') avatarRef!: ElementRef;
  @ViewChild('menuLateralRef') menuLateralRef!: ElementRef;

  nombreCompleto: string = '';
  rol: string = '';
  nombreEmpresa: string = '...';
  isMenuOpen: boolean = false;
  menuLateralAbierto: boolean = false;

  async ngOnInit(): Promise<void> {
    console.log('Componente iniciado 🚀');
    const usuario = await this.authService.obtenerDatosUsuarioActual();
    if (usuario) {
      this.nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
      this.rol = usuario.rol;
      this.nombreEmpresa = usuario.empresa ?? 'Empresa no registrada';
      this.cdr.detectChanges();
    } else {
      console.warn('⚠ No se encontró un usuario logueado o no tiene datos.');
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedAvatar = this.avatarRef?.nativeElement.contains(target);
    const clickedInsideMenu = this.menuRef?.nativeElement.contains(target);
    const clickedInsideLateral = this.menuLateralRef?.nativeElement.contains(target);

    if (!clickedInsideMenu && !clickedAvatar) {
      this.isMenuOpen = false;
    }

    if (!clickedInsideLateral && this.menuLateralAbierto) {
      this.menuLateralAbierto = false;
    }
  }

  getIniciales(): string {
    return this.nombreCompleto
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  toggleMenuLateral(): void {
    this.menuLateralAbierto = !this.menuLateralAbierto;
    console.log('Toggle ejecutado ✅ Estado del menú lateral:', this.menuLateralAbierto);
  }

  navegar(ruta: string): void {
    this.menuLateralAbierto = false;
    this.router.navigate([ruta]);
  }

  irPerfil(): void {
    this.router.navigate(['/perfil']);
    this.isMenuOpen = false;
  }

  async logOut(): Promise<void> {
    await this.authService.logOut();
    this.router.navigate(['/auth/login']);
  }
}
