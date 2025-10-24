import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DocumentosService } from '../../Services/comprobante.service';
import { DocumentoContable } from '../../Services/comprobante.service';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';


@Component({
  selector: 'app-documentos-contabilidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './documentos-contabilidad.component.html',
  styleUrls: ['./documentos-contabilidad.component.scss']
})
export class DocumentosContabilidadComponent implements OnInit {
  formDoc: FormGroup;
  documentos: DocumentoContable[] = [];
  editandoId: string | null = null;


   // Paginación y búsqueda
   filtro = '';
   paginaActual = 1;
   registrosPorPagina = 7;

   constructor(private fb: FormBuilder, private docService: DocumentosService) {
     this.formDoc = this.fb.group({
       codigo: ['', Validators.required],
       descripcion: ['', Validators.required],
     });
   }


   async ngOnInit(): Promise<void> {
    this.documentos = (await this.docService.obtenerDocumentos())
      .filter(d => !!d.codigo && !!d.descripcion);

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
  async guardarDocumento() {
    if (this.formDoc.invalid) return;

    const data = this.formDoc.value;

    if (this.editandoId) {
      await this.docService.actualizarDocumento(this.editandoId, data);
      this.editandoId = null;
    } else {
      await this.docService.agregarDocumento(data);
    }

    this.documentos = await this.docService.obtenerDocumentos(); // recargar tabla
    this.formDoc.reset();
  }

  editar(doc: any) {
    this.formDoc.setValue({
      codigo: doc.codigo,
      descripcion: doc.descripcion,
    });
    this.editandoId = doc.id;
  }
  async eliminar(id: string) {
    await this.docService.eliminarDocumento(id);
    this.documentos = await this.docService.obtenerDocumentos();
  }



 // 🔍 Búsqueda y paginación
 get documentosFiltrados() {
  return this.documentos.filter(doc =>
    doc.codigo.toLowerCase().includes(this.filtro.toLowerCase()) ||
    doc.descripcion.toLowerCase().includes(this.filtro.toLowerCase())
  );
}

get totalPaginas() {
  return Math.ceil(this.documentosFiltrados.length / this.registrosPorPagina);
}

get documentosPaginados() {
  const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
  return this.documentosFiltrados.slice(inicio, inicio + this.registrosPorPagina);
}
irPrimeraPagina() {
  this.paginaActual = 1;
}

irAnteriorPagina() {
  if (this.paginaActual > 1) {
    this.paginaActual--;
  }
}

irSiguientePagina() {
  if (this.paginaActual < this.totalPaginas) {
    this.paginaActual++;
  }
}

irUltimaPagina() {
  this.paginaActual = this.totalPaginas;
}

}

