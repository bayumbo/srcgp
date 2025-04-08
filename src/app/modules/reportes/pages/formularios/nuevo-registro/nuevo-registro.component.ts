import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { ReportesService } from '../../../services/reportes.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

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
    // ✅ No incluimos fechaModificacion aquí porque la pone el servidor
  };

  resultado: string | null = null;
  id: string | null = null;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);

  constructor(private reportesService: ReportesService) {
    this.cargarSiEsEdicion();
  }

  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }

  async cargarSiEsEdicion() {
    this.id = this.route.snapshot.paramMap.get('id');

    if (this.id) {
      const ref = doc(this.firestore, 'reportesDiarios', this.id); // ✅ colección correcta
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.reporte = snap.data() as NuevoRegistro;
      } else {
        alert('❌ Registro no encontrado');
        this.router.navigate(['/reportes/lista-reportes']);
      }
    }
  }

  async enviar() {

    console.log(' Intentando enviar formulario...', this.reporte);
    const nombreValido = this.reporte.nombre && this.reporte.nombre.trim().length > 0;
    const unidadValida = this.reporte.unidad && this.reporte.unidad.trim().length > 0;
  
    if (!nombreValido || !unidadValida) {
      alert('⚠️ Por favor completa los campos obligatorios: Nombre y Unidad.');
      return;
    }
  
    try {
      if (this.id) {
        await this.reportesService.actualizarReporteDiario(this.id, this.reporte);
        this.resultado = `Registro actualizado: ${this.id}`;
      } else {
        const docRef = await this.reportesService.guardarReporteDiario(this.reporte);
        this.resultado = docRef.id;
      }
  
      this.router.navigate(['/reportes/lista-reportes']);
    } catch (error) {
      console.error('❌ Error al guardar reporte:', error);
    }
  }
}