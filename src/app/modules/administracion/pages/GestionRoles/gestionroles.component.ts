import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService, Usuario } from 'src/app/core/auth/services/usuarios.service';
import { AuthService } from 'src/app/core/auth/services/auth.service'; // <-- Importa AuthService
import { Functions, httpsCallable } from '@angular/fire/functions';
import { UnidadesSyncService } from 'src/app/core/auth/services/unidades-sync.service';
@Component({
  selector: 'app-gestionroles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestionroles.component.html',
  styleUrls: ['./gestionroles.component.scss']
})
export class GestionRolesComponent implements OnInit {
  sincronizandoUnidades = false;
  resultadoSync: any = null;
  todosLosUsuarios: Usuario[] = [];
  usuariosFiltrados: Usuario[] = [];
  usuariosPaginados: Usuario[] = [];

  rolesDisponibles = ['usuario', 'admin', 'socio', 'recaudador'];
  mostrarSoloActivos = false;
  mostrarToast = false;
  cargando = true;
  busquedaActiva = false;
  cedulaBuscada = '';
  mostrarMensajeNoCoincidencias = false;

  // 🔢 Paginación
  paginaActual = 1;
  itemsPorPagina = 15;
  totalPaginas = 0;

  // Propiedad para verificar si el usuario logueado es socio
  esSocio: boolean = false; // Se inicializa en false

  constructor(
    public usuariosService: UsuariosService,
    private router: Router,
    private authService: AuthService, // <-- Inyecta AuthService
    private functions: Functions,
    private unidadesSyncService: UnidadesSyncService
  ) {}
  async sincronizarUnidades() {
    try {
      this.sincronizandoUnidades = true;
      this.resultadoSync = null;

      const res = await this.unidadesSyncService.sincronizarUnidadesGlobales();
      this.resultadoSync = res;

      // aquí puede mostrar un toast o alert
      alert(`Sincronización completa. Creadas/actualizadas: ${res.creadas}. Usuarios procesados: ${res.usuariosProcesados}`);
    } catch (e: any) {
      console.error(e);
      alert('Error al sincronizar unidades. Revise consola.');
    } finally {
      this.sincronizandoUnidades = false;
    }
  }


  ngOnInit(): void {
    // Suscribirse para obtener el rol del usuario actual desde AuthService
    this.authService.currentUserRole$.subscribe(role => { // <-- CAMBIO AQUÍ
      this.esSocio = role === 'socio';
    });

    this.usuariosService.usuarios$.subscribe(lista => {
      const listaConEstado = lista.map(usuario => ({
        ...usuario,
        estado: usuario.estado ?? true
      }));
      this.todosLosUsuarios = listaConEstado;
      this.filtrarUsuarios(listaConEstado);
      this.cargando = false;
    });

    this.usuariosService.cargarPrimerosUsuarios();
  }

  filtrarUsuarios(lista: Usuario[]): void {
    const base = this.mostrarSoloActivos ? lista.filter(u => u.estado) : lista;
    this.usuariosFiltrados = base;
    this.totalPaginas = Math.ceil(base.length / this.itemsPorPagina);
    this.paginaActual = 1;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    this.usuariosPaginados = this.usuariosFiltrados.slice(inicio, fin);
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
      this.paginaActual = nuevaPagina;
      this.actualizarPaginacion();
    }
  }

  onEstadoChange(event: Event, uid: string): void {
    if (this.esSocio) {
      event.preventDefault(); // Evita que se cambie el estado si es socio
      return;
    }
    const input = event.target as HTMLInputElement;
    this.cambiarEstado(uid, input.checked);
  }

  async cambiarEstado(uid: string, estado: boolean): Promise<void> {
    if (this.esSocio) return;
    await this.usuariosService.actualizarEstado(uid, estado);
    this.todosLosUsuarios = this.todosLosUsuarios.map(usuario =>
      usuario.uid === uid ? { ...usuario, estado } : usuario
    );
    this.filtrarUsuarios(this.todosLosUsuarios);
  }

  async guardarNuevoRol(uid: string, nuevoRol: string): Promise<void> {
  if (this.esSocio) return;

  await this.usuariosService.actualizarRol(uid, nuevoRol);

  // Actualiza la lista visualmente
  this.todosLosUsuarios = this.todosLosUsuarios.map(usuario =>
    usuario.uid === uid ? { ...usuario, rol: nuevoRol, nuevoRol: nuevoRol } : usuario
  );
  this.filtrarUsuarios(this.todosLosUsuarios);

  // ⬇️ LLAMAR sincronización automática del claim
  try {
    const asignarFn = httpsCallable(this.functions, 'asignarRolDesdeFirestore');
    await asignarFn({ uid });
    console.log(`✅ Claim actualizado para UID: ${uid}`);
  } catch (error) {
    console.error('❌ Error al sincronizar claim:', error);
    // No detiene el proceso visual si falla
  }

  this.mostrarToast = true;
  setTimeout(() => (this.mostrarToast = false), 3000);
}

  onToggleFiltro(event: Event): void {
    if (this.esSocio) {
      event.preventDefault(); // Evita que se cambie el filtro si es socio
      return;
    }
    const input = event.target as HTMLInputElement;
    this.mostrarSoloActivos = input.checked;
    this.buscarPorCedula();
  }

  buscarPorCedula(): void {
    // La búsqueda se mantiene activa para socios
    const termino = this.cedulaBuscada.trim().toLowerCase();
    this.busquedaActiva = termino.length > 0;

    if (this.busquedaActiva) {
      const coincidencias = this.todosLosUsuarios.filter(usuario =>
        usuario.cedula.toLowerCase().includes(termino) ||
        `${usuario.nombres} ${usuario.apellidos}`.toLowerCase().includes(termino)
      );

      if (coincidencias.length > 0) {
        this.filtrarUsuarios(coincidencias);
      } else {
        this.mostrarMensajeNoCoincidencias = true;
        setTimeout(() => {
          this.mostrarMensajeNoCoincidencias = false;
        }, 3000);
        this.usuariosFiltrados = [];
        this.usuariosPaginados = [];
        this.totalPaginas = 0;
        this.paginaActual = 0;
        return;
      }
    } else {
      this.mostrarMensajeNoCoincidencias = false;
      this.filtrarUsuarios(this.todosLosUsuarios);
    }
  }

  verPerfil(uid: string): void {
    // El botón de ver perfil se mantiene activo para socios
    this.router.navigate(['/perfil', uid]);
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }

  generarArrayPaginas(): number[] {
    return Array.from({ length: this.totalPaginas }, (_, i) => i + 1);
  }
}
