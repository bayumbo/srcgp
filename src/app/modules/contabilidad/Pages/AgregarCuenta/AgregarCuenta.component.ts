import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CatalogoService } from '../../Services/comprobante.service';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { HostListener } from '@angular/core';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';


@Component({
  selector: 'app-agregar-cuenta',
  standalone: true,
  templateUrl: './agregarcuenta.component.html',
  styleUrls: ['./stylesagregarcuenta.scss'],
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule, FormsModule]
  
})

export class AgregarCuentaComponent implements OnInit {
  formCuenta!: FormGroup;
  cuentasOriginal: any[] = [];
  cuentasFiltradas: any[] = [];
  cuentasPaginadas: any[] = [];
  cuentaEnEdicion: string | null = null;
  cuentaEditada: any = {};
  busqueda: string = '';
  filtroTipo: string = '';
  tiposCuenta: string[] = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'];
  mostrarTabla: boolean = false;
  paginaActual: number = 1;
  registrosPorPagina: number = 10;
  totalPaginas: number = 1;
  


  constructor(private fb: FormBuilder, private catalogoService: CatalogoService) {}

  ngOnInit(): void {
    this.formCuenta = this.fb.group({
      codigo: ['', Validators.required],
      nombre: ['', Validators.required],
      tipo: ['', Validators.required]
    });

    this.obtenerCuentas();
    
  // ✅ Asegura que el scroll comience después del header
  window.scrollTo({ top: 0 });

  // ✅ Agrega padding al body si no existe
  const body = document.querySelector('body');
  if (body) body.setAttribute('style', 'padding-top: 55px');
  }
  
  submenuCuentas = false;
subCodificacion = false;
subTransacciones = false;
subLibros = false;

submenus: Record<SubmenuKeys, boolean> = {
  codificacion: false,
  transacciones: false,
  libros: false
};
  menuAbierto: boolean = false;
  

  toggleSubmenu(nombre: SubmenuKeys, event: Event): void {
    event.preventDefault();
    this.submenus[nombre] = !this.submenus[nombre];
  }



    toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }
 // Cierra si hace clic fuera del menú
 @HostListener('document:click', ['$event'])
 cerrarSiClickFuera(event: MouseEvent) {
   const target = event.target as HTMLElement;
   if (!target.closest('nav') && !target.closest('.menu-toggle')) {
     this.menuAbierto = false;
   }
 }
  async agregarCuenta(): Promise<void> {
    if (this.formCuenta.invalid) {
      this.formCuenta.markAllAsTouched();
      alert('⚠️ Completa todos los campos antes de agregar una cuenta.');
      return;
    }

    await this.catalogoService.agregarCuenta(this.formCuenta.value);
    alert('✅ Cuenta agregada correctamente');
    this.formCuenta.reset();
    this.obtenerCuentas();
  }

  async obtenerCuentas(): Promise<void> {
    this.cuentasOriginal = await this.catalogoService.obtenerCuentas();
    this.aplicarFiltros();

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
  }

  aplicarFiltros(): void {
    const filtradas = this.cuentasOriginal.filter(cuenta => {
      const coincideTexto = cuenta.codigo.toLowerCase().includes(this.busqueda.toLowerCase()) ||
                            cuenta.nombre.toLowerCase().includes(this.busqueda.toLowerCase());
      const coincideTipo = this.filtroTipo ? cuenta.tipo === this.filtroTipo : true;
      return coincideTexto && coincideTipo;
    });

    this.totalPaginas = Math.ceil(filtradas.length / this.registrosPorPagina);
    if (this.paginaActual > this.totalPaginas) {
      this.paginaActual = this.totalPaginas || 1;
    }

    const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
    const fin = inicio + this.registrosPorPagina;
    this.cuentasFiltradas = filtradas;
    this.cuentasPaginadas = filtradas.slice(inicio, fin);
  }

  cambiarPagina(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      this.aplicarFiltros();
    }
  }

  editarCuenta(cuenta: any): void {
    this.cuentaEnEdicion = cuenta.id;
    this.cuentaEditada = { ...cuenta };
  }

  cancelarEdicion(): void {
    this.cuentaEnEdicion = null;
    this.cuentaEditada = {};
  }

  guardarEdicion(id: string): void {
    if (!this.cuentaEditada.codigo || !this.cuentaEditada.nombre || !this.cuentaEditada.tipo) {
      alert('⚠️ Completa todos los campos para guardar.');
      return;
    }

    this.catalogoService.actualizarCuenta(id, this.cuentaEditada)
      .then(() => {
        alert('✅ Cuenta actualizada.');
        this.obtenerCuentas();
        this.cancelarEdicion();
      })
      .catch(err => {
        console.error('❌ Error al actualizar cuenta:', err);
        alert('❌ Hubo un error al guardar los cambios.');
      });
  }

  async eliminarCuenta(id: string): Promise<void> {
    if (confirm('¿Seguro que deseas eliminar esta cuenta?')) {
      await this.catalogoService.eliminarCuenta(id);
      this.obtenerCuentas();
    }
  }

  verCuentasRegistradas(): void {
    this.mostrarTabla = !this.mostrarTabla;
    if (this.mostrarTabla) {
      this.obtenerCuentas();
    }
  }
}
