import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { ReportesService } from '../../../services/reportes.service';
import { Router } from '@angular/router';


 
@Component({
  selector: 'app-nuevo-registro',
  standalone: true,
  imports: [CommonModule, FormsModule], 
  templateUrl: './nuevo-registro.component.html',
  styleUrls: ['./nuevo-registro.component.scss']
})
export class NuevoRegistroComponent {
  reporte: NuevoRegistro = {
    adminPagada: 0,
    administracion: 0,
    minBasePagados: 0,
    minutosAtraso: 0,
    minutosBase: 0,
    minutosPagados: 0,
    multas: 0,
    multasPagadas: 0,
    nombre: '',
    unidad: ''
  };

  resultado: string | null = null;
  private router = inject(Router);
  constructor(private reportesService: ReportesService) {}
  
  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }

  async enviar() {
    try {
      const docRef = await this.reportesService.guardarReporteDiario(this.reporte);
      this.resultado = docRef.id;
    } catch (error) {
      console.error('❌ Error al guardar reporte:', error);
    }
  }
}