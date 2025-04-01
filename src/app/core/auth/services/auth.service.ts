import { inject, Injectable } from '@angular/core';
import { Auth, authState, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    UserCredential } from '@angular/fire/auth';


export interface Credential {
    email:string;
    password:string;
}

@Injectable({providedIn: 'root'})
export class AuthService {
   private auth: Auth=inject(Auth)

   readonly authState$ = authState(this.auth);
   
   signUpWithEmailAndPassword(Credential:Credential): Promise<UserCredential> {
    return createUserWithEmailAndPassword(
        this.auth, 
        Credential.email, 
        Credential.password
    )
   }
    loginWithEmailAndPassword(Credential:Credential){
        return signInWithEmailAndPassword
        (
            this.auth,
            Credential.email,
            Credential.password
        )
    }
    logOut():Promise<void>{
        return this.auth.signOut();
    }
}