import { Routes } from '@angular/router';

export const REPORTES_ROUTES: Routes = [
  {
    path: 'nuevo-registro',
    loadComponent: () =>
      import('./pages/formularios/nuevo-registro/nuevo-registro.component').then(m => m.NuevoRegistroComponent)
  },
  {
    path: 'actualizar/:id',
    loadComponent: () =>
      import('./pages/formularios/actualizar-registro/actualizar-registro.component').then(m => m.ActualizarRegistroComponent)
  },
  {
    path: 'lista-reportes',
    loadComponent: () =>
      import('./pages/lista-reportes/lista-reportes.component').then(m => m.ReporteListaComponent)
  },
  { 
    path: 'fecha',
    loadComponent: () =>
      import('./pages/reporte-fecha/reporte-fecha.component').then(m => m.ReporteFechaComponent)
  },
  {
    path: 'mensual',
    loadComponent: () =>
      import('./pages/reporte-mensual/reporte-mensual.component').then(m => m.ReporteMensualComponent)
  }
];