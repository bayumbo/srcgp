import { Component } from '@angular/core';

import { CommonModule,} from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { LibroDiarioService } from '../../Services/comprobante.service';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-estados',
  standalone: true,
  templateUrl: './estados.component.html',
  styleUrls: ['./stylesconta.css'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
})
export class EstadosComponent {}
