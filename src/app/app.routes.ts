import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './modules/auth/auth.routes';
import { REPORTES_ROUTES } from './modules/reportes/reportes.routes';

export const APP_ROUTES: Routes = [
    { path: 'auth', children: AUTH_ROUTES },
    { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
    { path: 'reportes', children: REPORTES_ROUTES},
];