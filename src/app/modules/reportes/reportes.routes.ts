import { Routes } from '@angular/router';


    export const REPORTES_ROUTES: Routes = [
        {
          path: 'diario', 
          loadComponent: () =>
            import('../reportes/pages/reporte-diario/reporte-diario.component').then(m => m.ReporteDiarioComponent),
        },
        {
          path: 'fecha',
          loadComponent: () =>
            import('../reportes/pages/reporte-fecha/reporte-fecha.component').then(m => m.ReporteFechaComponent),
        },
        {
          path: 'mensual',
          loadComponent: () =>
            import('../reportes/pages/reporte-mensual/reporte-mensual.component').then(m => m.ReporteMensualComponent),
        },
      ];