import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportesService } from '../../services/reportes.service';

@Component({
  selector: 'app-reporte-diario',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reporte-diario.component.html',
  styleUrls: ['./reporte-diario.component.scss']
})
export class ReporteDiarioComponent implements OnInit {
  // Aquí guardaremos los datos que llegan de Firestore
  registros: any[] = [];

  constructor(private reportesService: ReportesService) {}

  ngOnInit(): void {
    // Llamamos al servicio para obtener los datos
    this.reportesService.obtenerNominaRecaudacion().subscribe((data) => {
      this.registros = data;
    });
  }

  // Ejemplo de acción al hacer clic en "Pagar"
  pagar(registro: any) {
    console.log('Pagando registro:', registro);
    // Aquí iría la lógica para realizar un pago o actualizar un campo en Firestore
  }

  // Ejemplo de acción para "Editar" o "Nuevo Registro"
  nuevoRegistro() {
    console.log('Ir a formulario de nuevo registro...');
  }

  filtrar() {
    console.log('Abrir modal o filtrar datos...');
  }
}