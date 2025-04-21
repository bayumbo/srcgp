import { Routes } from '@angular/router';

export const CONTABILIDAD_ROUTES: Routes = [
    
  {
    path: '',
    loadComponent: () =>
      import('./Pages/AgregarCuenta/AgregarCuenta.component').then(m => m.AgregarCuentaComponent)
  },
  {
    path: 'agregar-cuenta',
    loadComponent: () =>
      import('./Pages/AgregarCuenta/AgregarCuenta.component').then(m => m.AgregarCuentaComponent)
  },
  {
    path: 'balances',
    loadComponent: () =>
      import('./Pages/Balances/blances.component').then(m => m.BalanceComponent)
  },
  {
    path: 'comprobante-egresos',
    loadComponent: () =>
      import('./Pages/ComprobanteEgresos/indexconta.component').then(m => m.IndexContaComponent)
  },

  {
    path: 'estados',
    loadComponent: () =>
      import('./Pages/Estados/estados.component').then(m => m.EstadosComponent)
  },
  {
    path: 'estado-resultados',
    loadComponent: () =>
      import('./Pages/EstadosResultados/estadosresultados.component').then(m => m.EstadosResultadosComponent)
  },

  {
    path: 'libdiario',
    loadComponent: () =>
      import('./Pages/LibDiario/libdiario.component').then(m => m.LibroDiarioComponent)
  },

  {
    path: 'libmayor',
    loadComponent: () =>
      import('./Pages/LibMayor/libmayor.component').then(m => m.LibroMayorComponent)
  },

];
