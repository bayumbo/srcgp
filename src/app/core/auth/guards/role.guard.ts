import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot
} from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const expectedRoles = route.data['roles'] as string[];
  const userRole = authService.getUserRole();

  // Si no hay rol cargado o no está entre los permitidos
  if (!userRole || !expectedRoles.includes(userRole)) {
    router.navigate(['']); // o cambiar a '/unauthorized' si tienes una página de acceso denegado
    return false;
  }

  return true;
};
