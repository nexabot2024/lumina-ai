#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

const APIs = [
  {
    name: 'OpenAI',
    key: 'OPENAI_API_KEY',
    url: 'https://platform.openai.com/api-keys',
    description: 'Para generar prompts con GPT-4 y imágenes con DALL-E 3',
    free: 'Sí ($5 crédito inicial)',
  },
  {
    name: 'AI33Pro',
    key: 'AI33PRO_API_KEY',
    url: 'Tu panel de control',
    description: 'Para generar audio profesional (TTS)',
    free: 'No (servicios pagos)',
  },
  {
    name: 'Pixabay',
    key: 'PIXABAY_API_KEY',
    url: 'https://pixabay.com/api/',
    description: 'Para descargar videos y fotos de stock gratis',
    free: '✅ Completamente gratis',
  },
  {
    name: 'Pexels',
    key: 'PEXELS_API_KEY',
    url: 'https://www.pexels.com/api/',
    description: 'Para descargar videos y fotos de stock gratis',
    free: '✅ Completamente gratis',
  },
];

async function main() {
  console.log('\n🎬 AI Video Generator - Setup Wizard\n');
  console.log('=' .repeat(50));
  console.log('Este script te guiará a través de la configuración\n');

  // Show APIs info
  console.log('📋 APIS NECESARIAS:\n');
  APIs.forEach((api, i) => {
    console.log(`${i + 1}. ${api.name}`);
    console.log(`   Gratis: ${api.free}`);
    console.log(`   Desc:   ${api.description}`);
    console.log(`   URL:    ${api.url}\n`);
  });

  console.log('=' .repeat(50));
  console.log('\n⏳ Te guiaremos a obtener cada key...\n');

  const env = {};

  for (const api of APIs) {
    console.log(`\n🔑 ${api.name}`);
    console.log(`Descripción: ${api.description}`);
    console.log(`Enlace: ${api.url}`);

    if (api.free === 'Sí ($5 crédito inicial)') {
      console.log('\n💡 Cómo obtenerlo:');
      console.log('1. Ve a https://platform.openai.com/api-keys');
      console.log('2. Crea una cuenta con Google o Email');
      console.log('3. Click en "Create new secret key"');
      console.log('4. Copia la key (aparece una sola vez)');
    }

    if (api.free.includes('gratis')) {
      console.log('\n💡 Cómo obtenerlo:');
      console.log(`1. Ve a ${api.url}`);
      console.log('2. Regístrate gratuitamente');
      console.log('3. Busca "API Key" en tu panel');
      console.log('4. Copia y pega aquí');
    }

    const value = await question(`\n➜ ${api.key}: `);

    if (value.trim()) {
      env[api.key] = value.trim();
      console.log('✅ Key guardada');
    } else {
      console.log('⏭️  Saltando... Puedes configurarlo manualmente en backend/.env');
    }
  }

  // Add other env vars
  env.PORT = process.env.PORT || 5000;
  env.NODE_ENV = 'development';
  env.FRONTEND_URL = 'http://localhost:5173';

  // Write .env file
  const envPath = path.join(__dirname, 'backend', '.env');
  const envContent = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Archivo creado: backend/.env`);
  } catch (err) {
    console.log(`\n❌ Error al crear .env: ${err.message}`);
    console.log('Crea manualmente el archivo backend/.env con:');
    console.log(envContent);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('\n🎉 Setup completado!\n');
  console.log('Próximos pasos:\n');
  console.log('1. Terminal 1 - Backend:');
  console.log('   cd backend && npm run dev\n');
  console.log('2. Terminal 2 - Frontend:');
  console.log('   cd frontend && npm run dev\n');
  console.log('3. Abre: http://localhost:5173\n');
  console.log('¡A crear videos increíbles! 🚀\n');

  rl.close();
}

main().catch(console.error);
