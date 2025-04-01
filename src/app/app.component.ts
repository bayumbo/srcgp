import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RecaudacionService } from './modules/recaudacion/services/recaudacion.service';
import { ReportesService } from './modules/reportes/services/reportes.service';
import { CommonModule } from '@angular/common';
import { getApps } from 'firebase/app';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'srcgp';

  constructor(
    private recaudacionService: RecaudacionService,
    private reportesService: ReportesService,
    
  ) {
    console.log('Firebase apps en AppComponent:', getApps());
    // Exponer los servicios a la ventana global
    (window as any).recaudacionService = this.recaudacionService;
    (window as any).reportesService = this.reportesService;
  }
}