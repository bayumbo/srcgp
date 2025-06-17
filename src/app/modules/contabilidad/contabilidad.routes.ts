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
    path: 'documentos',
    loadComponent: () =>
      import('./Pages/DocumentosContabilidad/documentos-contabilidad.component').then(m => m.DocumentosContabilidadComponent)
  },


  {
    path: 'transaccion-general',
    loadComponent: () =>
      import('./Pages/TransaccionGeneral/Transacciongeneral.component').then(m => m.TransaccionesGeneralesComponent)
  },

  {
    path: 'centro-costos',
    loadComponent: () =>
      import('./Pages/CentroCostos/centro-costos.component').then(m => m.CentroCostosComponent)
  },

  {
    path: 'compras-varias',
    loadComponent: () =>
      import('./Pages/compras-varias/compras-varias.component').then(m => m.ComprasVariasComponent)
  },


  {
    path: 'asiento-apertura',
    loadComponent: () =>
      import('./Pages/asiento-apertura/asiento-apertura.component').then(m => m.AsientoAperturaComponent)
  },




  {
    path: 'comprobante-ingresos',
    loadComponent: () =>
      import('./Pages/comprobante-ingresos/comprobante-ingreso.component').then(m => m.ComprobanteIngresoComponent)
  },


  {
    path: 'balances',
    loadComponent: () =>
      import('./Pages/Balances/blances.component').then(m => m.BalanceComprobacionComponent)
    
  },
  {
    path: 'comprobante-egresos',
    loadComponent: () =>
      import('./Pages/ComprobanteEgresos/indexconta.component').then(m => m.IndexContaComponent)
  },

  {
    path: 'estados',
    loadComponent: () =>
      import('./Pages/Estados/estados.component').then(m => m.EstadoFinancieroComponent)
  },
  {
    path: 'estado-resultados',
    loadComponent: () =>
      import('./Pages/EstadosResultados/estadosresultados.component').then(m => m.EstadoResultadosComponent)
  },

  {
    path: 'libdiario',
    loadComponent: () =>
      import('./Pages/LibDiario/libro-diario.component').then(m => m.LibroDiarioComponent)
  },

  {
    path: 'libmayor',
    loadComponent: () =>
      import('./Pages/LibMayor/libmayor.component').then(m => m.LibroMayorComponent)
  },

];
