import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, ROUTES } from '@angular/router';

import { APP_ROUTES } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { environment} from '../environments/environment';
export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), 
  provideRouter(APP_ROUTES), 
  provideAnimationsAsync(), 
  provideFirebaseApp(() => initializeApp(environment.firebase)), 
  provideAuth(() => getAuth()), provideFirestore(() => getFirestore()), 
  provideFunctions(() => getFunctions()), 
  provideStorage(() => getStorage())]
};
