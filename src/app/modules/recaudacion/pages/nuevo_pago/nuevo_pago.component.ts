import { Component } from '@angular/core';
import { RecaudacionService } from '../../services/recaudacion.service';

@Component({
  selector: 'app-nuevo-pago',
  templateUrl: './nuevo_pago.component.html',
  styleUrls: ['./nuevo_pago.component.scss']
})
export class NuevoPagoComponent {
  constructor(private recaudacionService: RecaudacionService) {}

  registrarPago() {
    const pago = {
      monto: 100,
      fecha: new Date().toISOString(),
      usuario_id: 'USR001',
      empresa_id: 'EMP456',
      metodo_pago: 'Efectivo',
      estado: 'Pagado'
    };

    this.recaudacionService.registrarPago(pago).then(() => {
      console.log('Pago registrado exitosamente');
    });
  }
}