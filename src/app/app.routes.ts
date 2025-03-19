import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./modules/auth/auth.routes').then(m => m.routes) },
  { path: 'dashboard', loadChildren: () => import('./modules/dashboard/dashboard.routes').then(m => m.routes) },
  { path: 'collection', loadChildren: () => import('./modules/collection/collection.routes').then(m => m.routes) },
  { path: 'reports', loadChildren: () => import('./modules/reports/reports.routes').then(m => m.routes) },
  { path: 'administration', loadChildren: () => import('./modules/administration/administration.routes').then(m => m.routes) },
  { path: 'accounts-receivable', loadChildren: () => import('./modules/accounts-receivable/accounts-receivable.routes').then(m => m.routes) }
];