import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CentroCostosService} from '../../Services/comprobante.service';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';


@Component({
  selector: 'app-centro-costos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './centro-costos.component.html',
  styleUrls: ['./centro-costos.component.scss']
})
export class CentroCostosComponent implements OnInit {
  form: FormGroup;
  centros: any[] = [];
  editandoId: string | null = null;

  filtro = '';
  paginaActual = 1;
  registrosPorPagina = 7;

  constructor(private fb: FormBuilder, private servicio: CentroCostosService) {
    this.form = this.fb.group({
      codigo: ['', Validators.required],
      descripcion: ['', Validators.required],
    });
  }

  async ngOnInit() {
    await this.cargar();

    // Ocultar preloader
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 500);
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

  @HostListener('document:click', ['$event'])
  cerrarSiClickFuera(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('nav') && !target.closest('.menu-toggle')) {
      this.menuAbierto = false;
    }
  }


  async cargar() {
    this.centros = await this.servicio.obtenerCentros();
  }

  async guardar() {
    if (this.form.invalid) return;
    const data = this.form.value;
    if (this.editandoId) {
      await this.servicio.actualizarCentro(this.editandoId, data);
      this.editandoId = null;
    } else {
      await this.servicio.agregarCentro(data);
    }
    this.form.reset();
    await this.cargar();
  }

  editar(c: any) {
    this.form.setValue({ codigo: c.codigo, descripcion: c.descripcion });
    this.editandoId = c.id!;
  }

  async eliminar(id: string) {
    await this.servicio.eliminarCentro(id);
    await this.cargar();
  }

  get centrosFiltrados() {
    return this.centros.filter(c =>
      c.codigo.toLowerCase().includes(this.filtro.toLowerCase()) ||
      c.descripcion.toLowerCase().includes(this.filtro.toLowerCase())
    );
  }

  get totalPaginas() {
    return Math.ceil(this.centrosFiltrados.length / this.registrosPorPagina);
  }

  get centrosPaginados() {
    const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
    return this.centrosFiltrados.slice(inicio, inicio + this.registrosPorPagina);
  }

  irPrimeraPagina() {
    this.paginaActual = 1;
  }

  irAnteriorPagina() {
    if (this.paginaActual > 1) this.paginaActual--;
  }

  irSiguientePagina() {
    if (this.paginaActual < this.totalPaginas) this.paginaActual++;
  }

  irUltimaPagina() {
    this.paginaActual = this.totalPaginas;
  }
}