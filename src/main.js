import { App } from './app/App.js';

const app = new App(document.getElementById('gl'), document.getElementById('ui'));
// exposed for the automated smoke tests in tools/
window.__museum = app;
app.start();
