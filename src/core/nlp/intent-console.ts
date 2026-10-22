import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ServiceCatalogEntry } from '../types.js';
import { detectIntentDetailed } from './intent-detector.js';
import { extractEntities } from './entity-extractor.js';

const loadCatalog = (): ServiceCatalogEntry[] | undefined => {
  const cliArgument = process.argv.indexOf('--catalog');
  const path =
    (cliArgument >= 0 ? process.argv[cliArgument + 1] : undefined) ??
    process.env.CATALOG_PATH;

  if (!path) return undefined;

  const content = JSON.parse(readFileSync(path, 'utf-8')) as
    | ServiceCatalogEntry[]
    | { services?: ServiceCatalogEntry[] };

  return Array.isArray(content) ? content : (content.services ?? []);
};

const catalog = loadCatalog();

if (catalog) {
  console.log(`Catálogo cargado: ${catalog.length} servicio(s).`);
} else {
  console.log(
    'Sin catálogo: los servicios no se resuelven. Usa --catalog <archivo> o CATALOG_PATH.',
  );
}

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

  const detection = detectIntentDetailed(line, {
    lastBotQuestion,
    services: catalog,
  });
  const entities = extractEntities(line, {
    normalizedIntent: detection.normalized,
    services: catalog,
  });
  console.log(`Intención: ${detection.intent}`);
  console.log(`Intenciones: ${detection.intents.join(', ') || 'ninguna'}`);
  console.log(`Puntaje de regla: ${detection.score}`);
  console.log(`Coincidencias: ${detection.matched.join(', ') || 'ninguna'}`);
  console.log(
    `Marcos: ${
      detection.frames
        .map((frame) => `${frame.phrase}${frame.catalogBacked ? '*' : ''}`)
        .join(', ') || 'ninguno'
    }`,
  );
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
