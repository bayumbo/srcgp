import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  standalone: true,
  selector: 'app-successful',
  imports: [CommonModule,   MatIconModule, MatProgressSpinnerModule],
  templateUrl: './successful.component.html',
  styleUrl: './successful.component.scss'
})
export class PasswordConfirmedComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    // Redirigir automáticamente después de 3 segundos
    setTimeout(() => {
      this.router.navigate(['/auth/login']);
    }, 3000);
  }

}
