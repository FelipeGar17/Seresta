import { createInterface } from 'node:readline';
import { detectIntentDetailed } from './intent-detector.js';
import { extractEntities } from './entity-extractor.js';

// Permite probar el detector escribiendo mensajes directamente en la consola.
const consoleInterface = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Mensaje> ',
});

console.log('Detector de intenciones. Escribe "salir" para terminar.');
consoleInterface.prompt();
let lastBotQuestion: string | undefined;

consoleInterface.on('line', (line) => {
  if (line.trim().toLowerCase() === 'salir') {
    consoleInterface.close();
    return;
  }

  if (line.startsWith('/bot ')) {
    lastBotQuestion = line.slice('/bot '.length).trim();
    console.log(`Contexto del bot guardado: ${lastBotQuestion}`);
    consoleInterface.prompt();
    return;
  }

  const detection = detectIntentDetailed(line, { lastBotQuestion });
  const entities = extractEntities(line, {
    normalizedIntent: detection.normalized,
  });
  console.log(`Intención: ${detection.intent}`);
  console.log(`Intenciones: ${detection.intents.join(', ') || 'ninguna'}`);
  console.log(`Puntaje de regla: ${detection.score}`);
  console.log(`Coincidencias: ${detection.matched.join(', ') || 'ninguna'}`);
  console.log(
    `Negadas: ${detection.negatedIntents.join(', ') || 'ninguna'}`,
  );
  console.log(`Entidades: ${JSON.stringify(entities)}`);
  lastBotQuestion = undefined;
  consoleInterface.prompt();
});

consoleInterface.on('close', () => {
  console.log('Prueba finalizada.');
});
