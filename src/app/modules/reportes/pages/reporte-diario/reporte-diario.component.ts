import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reporte-diario',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reporte-diario.component.html',
})
export class ReporteDiarioComponent {
  pagos = [
    { conductor: 'Juan Pérez', unidad: 'TX-001', monto: 15000, fecha: '2025-03-24' },
    { conductor: 'Ana Gómez', unidad: 'TX-002', monto: 18000, fecha: '2025-03-24' },
    { conductor: 'Carlos Ruiz', unidad: 'TX-003', monto: 17000, fecha: '2025-03-24' },
  ];
}