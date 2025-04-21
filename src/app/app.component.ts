import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { getApps } from 'firebase/app';
import { ReportesService } from './modules/reportes/services/reportes.service';
import { HeaderComponent } from '@shared/components/header/header.component';

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
        private reportesService: ReportesService
  ) {
    console.log('Firebase apps en AppComponent:', getApps());
    
    (window as any).reportesService = this.reportesService;
  }
}