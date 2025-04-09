import { Routes } from '@angular/router';

export const CONTABILIDAD_ROUTES: Routes = [
    
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
    path: 'cuentas',
    loadComponent: () =>
      import('./Pages/Cuentas/cuentas.component').then(m => m.CuentasComponent)
  },
  {
    path: 'estados',
    loadComponent: () =>
      import('./Pages/Estados/estados.component').then(m => m.EstadosComponent)
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
