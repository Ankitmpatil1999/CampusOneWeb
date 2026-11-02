import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './App';
import { appConfig } from './App.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
