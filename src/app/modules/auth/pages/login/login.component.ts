import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [CommonModule]
})
export default class LoginComponent {
  constructor(private router: Router) {}

  goToRegister() {
    this.router.navigate(['./register']);
  }
}
