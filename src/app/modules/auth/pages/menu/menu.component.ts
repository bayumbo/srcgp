import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/core/auth/services/auth.service';


@Component({
  standalone: true,
  selector: 'app-menu',
  templateUrl: './menu.component.html',
 
  imports: [CommonModule]
})
export default class MenuComponent {
  private authservice = inject(AuthService);

  async logOut():Promise<void>{
    try{
      await this.authservice.logOut();
    } catch (error){
      console.log(error);
    }
  }
}