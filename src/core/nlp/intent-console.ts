import { createInterface } from 'node:readline';
import { detectIntent } from './intent-detector.js';

// Permite probar el detector escribiendo mensajes directamente en la consola.
const consoleInterface = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Mensaje> ',
});

console.log('Detector de intenciones. Escribe "salir" para terminar.');
consoleInterface.prompt();

consoleInterface.on('line', (line) => {
  if (line.trim().toLowerCase() === 'salir') {
    consoleInterface.close();
    return;
  }

  console.log(`Intención: ${detectIntent(line)}`);
  consoleInterface.prompt();
});

consoleInterface.on('close', () => {
  console.log('Prueba finalizada.');
});
