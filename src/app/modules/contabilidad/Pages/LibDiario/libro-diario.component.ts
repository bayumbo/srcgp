import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LibroDiarioService } from '../../Services/comprobante.service'; // asegúrate que tengas este servicio listo
import { MatIconModule } from '@angular/material/icon';
type SubmenuKeys = 'codificacion' | 'transacciones' | 'libros';

@Component({
  selector: 'app-libro-diario',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './libro-diario.component.html',
  styleUrls: ['./libro-diario.component.scss']
})
export class LibroDiarioComponent implements OnInit {
  fechaInicio: string = '';
  fechaFin: string = '';
  librosFiltrados: any[] = [];
  buscando: boolean = false;

  constructor(private libroDiarioService: LibroDiarioService) {}

  librosDiario: any[] = []; 
get libroDiario() {
  return this.librosDiario;
}



  ngOnInit(): void {
    
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
  async buscarLibroDiario() {
    if (!this.fechaInicio || !this.fechaFin) {
      alert('⚠️ Selecciona un rango de fechas válido.');
      return;
    }
  
    const fechaInicioDate = new Date(this.fechaInicio);
    const fechaFinDate = new Date(this.fechaFin);
  
    const libros = await this.libroDiarioService.obtenerLibrosEnRango(fechaInicioDate, fechaFinDate);
    this.librosDiario = libros;
  }
  calcularTotalDebe(transacciones: any[]): number {
    return transacciones
      .reduce((acc, t) => acc + (t.debe || 0), 0);
  }
  calcularTotalHaber(transacciones: any[]): number {
    return transacciones
      .reduce((acc, t) => acc + (t.haber || 0), 0);
  }

  public imprimirTodo() {
    const contenido = document.getElementById('contenido-impresion');
    if (!contenido) {
      alert('⚠️ No se encontró el contenido para imprimir.');
      return;
    }
  
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      alert('⚠️ No se pudo acceder al documento de impresión.');
      return;
    }
  
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Libros Diario - Impresión</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #eceff1;
              padding: 20px;
            }
            .grid-libros {
              display: grid;
              gap: 15px;
            }
            .card-libro {
              background-color: #37474f;
              padding: 10px 15px;
              border-radius: 8px;
              color: white;
              font-size: 12px;
              margin-bottom: 15px;
              box-shadow: 0 0 10px rgba(0,0,0,0.3);
            }
            .card-libro p {
              margin: 4px 0;
              line-height: 1.4;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 6px 10px;
              text-align: left;
            }
            th {
              background-color: #455a64;
              color: white;
            }
            tfoot td {
              font-weight: bold;
              background-color: #263238;
              color: white;
            }
          </style>
        </head>
        <body>
          ${contenido.innerHTML}
        </body>
      </html>
    `);
    doc.close();
  
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }}