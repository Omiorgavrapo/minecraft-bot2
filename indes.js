const bedrock = require('bedrock-protocol');
const express = require('express');

// ====== CONFIG (pode sobrescrever via variáveis de ambiente no painel do MCServerHost) ======
const HOST = process.env.MC_HOST || 'tavernaredstone.mcsh.io';
const PORT = Number(process.env.MC_PORT || 19132);
const BOT_NAME = process.env.MC_BOT_NAME || 'zé_servizin';
// A lib não aceita 'auto' — precisa ser uma versão exata que ela suporta.
// Troque pela versão que seu servidor realmente roda (veja a lista de "Supported versions" no log de deploy).
const MC_VERSION = process.env.MC_VERSION || '1.26.30';
const RECONNECT_MS = 60_000;
const SPAWN_TIMEOUT_MS = 20_000;

// ====== HTTP keep-alive (Render exige escutar na porta que ele define em process.env.PORT) ======
const app = express();
const HTTP_PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot rodando! ✅'));
app.get('/status', (req, res) => res.json({ spawned, host: HOST, port: PORT }));
app.listen(HTTP_PORT, () => console.log(`HTTP ativo na porta ${HTTP_PORT}`));

let client = null;
let reconnectTimer = null;
let spawned = false;

function agendar(ms) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(conectarBot, ms);
}

function fechar() {
  spawned = false;
  if (client) {
    try { client.removeAllListeners(); client.close(); } catch (e) {}
    client = null;
  }
}

function conectarBot() {
  fechar();
  console.log(`🤖 Conectando em ${HOST}:${PORT} (versão: ${MC_VERSION})...`);

  try {
    client = bedrock.createClient({
      host: HOST,
      port: PORT,
      username: BOT_NAME,
      offline: true,
      skipPing: true,
      version: MC_VERSION,
      profilesFolder: false,
      // XUID/plataforma falsos pra passar por addons que checam esses campos
      extra: {
        DeviceOS: 1,
        PlatformUserId: '2535400000000001',
        ThirdPartyName: BOT_NAME,
        SelfSignedId: '00000000-0000-0000-0000-000000000001'
      }
    });
  } catch (e) {
    console.log('❌ Erro ao criar client:', e.message);
    agendar(RECONNECT_MS);
    return;
  }

  const timeout = setTimeout(() => {
    console.log('⏱️ Timeout esperando spawn!');
    fechar();
    agendar(RECONNECT_MS);
  }, SPAWN_TIMEOUT_MS);

  client.on('spawn', () => {
    clearTimeout(timeout);
    spawned = true;
    console.log('✅ Bot entrou e ficou!');
  });

  client.on('kick', (reason) => {
    clearTimeout(timeout);
    console.log('❌ Kickado:', JSON.stringify(reason));
    fechar();
    agendar(RECONNECT_MS);
  });

  client.on('error', (err) => {
    clearTimeout(timeout);
    console.log('⚠️ Erro:', err.message);
    fechar();
    agendar(RECONNECT_MS);
  });

  client.on('close', () => {
    clearTimeout(timeout);
    if (spawned) {
      console.log('🔄 Caiu. Reconectando em 60s...');
    }
    fechar();
    agendar(RECONNECT_MS);
  });
}

// ====== Checagem de versão nova da lib (avisa no log, não instala sozinho em runtime) ======
async function checarAtualizacaoDaLib() {
  try {
    const pkg = require('bedrock-protocol/package.json');
    const res = await fetch('https://registry.npmjs.org/bedrock-protocol/latest');
    const data = await res.json();
    if (data.version && data.version !== pkg.version) {
      console.log(`ℹ️ Existe uma versão nova de bedrock-protocol: ${data.version} (você está usando ${pkg.version}). Rode "npm update bedrock-protocol" e reinicie o bot.`);
    }
  } catch (e) {
    // sem internet pro registry, sem problema, só não avisa
  }
}

conectarBot();
checarAtualizacaoDaLib();
setInterval(checarAtualizacaoDaLib, 24 * 60 * 60 * 1000); // checa 1x por dia
setInterval(() => console.log('🔁 Ciclo ativo...'), 50 * 60 * 1000);
