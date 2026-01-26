import { Routes } from '@angular/router';

export const REPORTES_ROUTES: Routes = [

  {
    path: 'nuevo-registro',
    loadComponent: () =>
      import('./pages/formularios/nuevo-registro/nuevo-registro.component')
    .then(m => m.NuevoRegistroComponent)
  },
  {
    path: 'actualizar/:uid/:id',
    loadComponent: () =>
      import('./pages/formularios/actualizar-registro/actualizar-registro.component')
        .then(m => m.ActualizarRegistroComponent)
  },
  {
    path: 'lista-reportes',
    loadComponent: () =>
      import('./pages/lista-reportes/lista-reportes.component').then(m => m.ReporteListaComponent)
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/lista-reportes/lista-reportes.component').then(m => m.ReporteListaComponent)
  },
  {
    path: 'realizar-pago/:uid/:id',
  loadComponent: () =>
    import('./pages/formularios/realizar-pago/realizar-pago.component')
      .then(m => m.RealizarPagoComponent)
  },
    {
    path: 'realizar-pago-dia/:diaId/:unidadDocId',
    loadComponent: () =>
      import('./pages/formularios/realizar-pago/realizar-pago.component')
        .then(m => m.RealizarPagoComponent)
  },
  {
    path: 'cuentas-por-cobrar',
    loadComponent: () =>
      import('./pages/cuentas-por-cobrar/cuentas-por-cobrar.component')
        .then(m => m.CuentasPorCobrarComponent)
  },
  {
    path: 'cierre-caja',
    loadComponent: () =>
      import('./pages/cierre-caja/cierre-caja.component').then(m => m.CierreCajaComponent)
  }
 ];
