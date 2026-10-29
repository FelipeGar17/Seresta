import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type {
  ConfiguracionNegocio,
  ServiceCatalogEntry,
} from '../types.js';
import { loadBusinessConfig } from '../../config/load-config.js';
import {
  analyzeMessage,
  analyzeMessageWithCatalog,
  type MessageAnalysis,
} from './message-analysis.js';

const argumentValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const parseManualCatalog = (path: string): ServiceCatalogEntry[] => {
  const content = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const raw = Array.isArray(content)
    ? content
    : content && typeof content === 'object' && 'services' in content
      ? (content as { services?: unknown }).services
      : undefined;

  if (!Array.isArray(raw)) {
    throw new Error(
      `Catálogo inválido en "${path}": se esperaba un arreglo o { services: [] }.`,
    );
  }

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Servicio inválido en "${path}" (índice ${index}).`);
    }

    const candidate = entry as {
      id?: unknown;
      name?: unknown;
      aliases?: unknown;
    };

    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
      throw new Error(
        `Servicio inválido en "${path}" (índice ${index}): falta id.`,
      );
    }
    if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
      throw new Error(
        `Servicio inválido en "${path}" (índice ${index}): falta name.`,
      );
    }
    if (
      candidate.aliases !== undefined &&
      (!Array.isArray(candidate.aliases) ||
        candidate.aliases.some((alias) => typeof alias !== 'string'))
    ) {
      throw new Error(
        `Servicio inválido en "${path}" (índice ${index}): aliases debe ser un arreglo de textos.`,
      );
    }

    return {
      id: candidate.id.trim(),
      name: candidate.name,
      ...(candidate.aliases && candidate.aliases.length > 0
        ? { aliases: [...candidate.aliases] }
        : {}),
    };
  });
};

const configPath =
  argumentValue('--config') ??
  argumentValue('-c') ??
  process.env.BUSINESS_CONFIG_PATH;
const catalogPath =
  argumentValue('--catalog') ?? process.env.CATALOG_PATH;

let business: ConfiguracionNegocio | undefined;
let manualCatalog: ServiceCatalogEntry[] | undefined;

if (configPath) {
  business = loadBusinessConfig(configPath);
  console.log(
    `Configuración cargada: ${business.name} (${business.businessId}).`,
  );
  console.log(
    'Catálogo NLP derivado de ConfiguracionNegocio.services (solo servicios activos).',
  );
} else if (catalogPath) {
  manualCatalog = parseManualCatalog(catalogPath);
  console.log(
    `Catálogo manual cargado: ${manualCatalog.length} servicio(s).`,
  );
  console.log(
    'Aviso: --catalog es un modo de diagnóstico aislado. En producción el catálogo se deriva de ConfiguracionNegocio.services.',
  );
} else {
  console.log(
    'Sin configuración: no hay catálogo y solo se usarán marcos genéricos.',
  );
  console.log(
    'Usa --config <negocio.json>, -c <negocio.json> o BUSINESS_CONFIG_PATH para el catálogo de producción.',
  );
}

const analyze = (line: string): MessageAnalysis => {
  if (business) {
    return analyzeMessage(line, business, { lastBotQuestion });
  }

  return analyzeMessageWithCatalog(line, manualCatalog, { lastBotQuestion });
};

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

  const analysis = analyze(line);

  console.log(`Intención: ${analysis.detection.intent}`);
  console.log(
    `Intenciones: ${analysis.detection.intents.join(', ') || 'ninguna'}`,
  );
  console.log(`Puntaje de regla: ${analysis.detection.score}`);
  console.log(
    `Coincidencias: ${analysis.detection.matched.join(', ') || 'ninguna'}`,
  );
  console.log(
    `Marcos: ${
      analysis.detection.frames
        .map((frame) => `${frame.phrase}${frame.catalogBacked ? '*' : ''}`)
        .join(', ') || 'ninguno'
    }`,
  );
  console.log(
    `Negadas: ${analysis.detection.negatedIntents.join(', ') || 'ninguna'}`,
  );
  console.log(`Catálogo usado: ${analysis.catalog.length} servicio(s).`);
  console.log(`Entidades: ${JSON.stringify(analysis.entities)}`);

  lastBotQuestion = undefined;
  consoleInterface.prompt();
});

consoleInterface.on('close', () => {
  console.log('Prueba finalizada.');
});
