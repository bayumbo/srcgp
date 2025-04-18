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
        }
      }
    } catch (error) {
      console.error('Error al obtener las iniciales del usuario:', error);
    }
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.menuLateralAbierto = false;
      this.menuUsuarioAbierto = false;
    }
  }

  toggleMenuLateral() {
    this.menuLateralAbierto = !this.menuLateralAbierto;
    this.menuUsuarioAbierto = false;
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
