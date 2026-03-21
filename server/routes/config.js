const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// GET /api/config - return config with private key masked
router.get('/', (req, res) => {
  const config = readConfig();
  res.json({
    fhirServerUrl: config.fhirServerUrl || '',
    tokenEndpoint: config.tokenEndpoint || '',
    clientId: config.clientId || '',
    scope: config.scope || 'system/*.write',
    hasPrivateKey: !!(config.privateKey && config.privateKey.trim()),
  });
});

// POST /api/config - save config
router.post('/', (req, res) => {
  const { fhirServerUrl, tokenEndpoint, clientId, privateKey, scope } = req.body;

  if (!fhirServerUrl || !tokenEndpoint || !clientId) {
    return res.status(400).json({ error: 'fhirServerUrl, tokenEndpoint, and clientId are required' });
  }

  const existing = readConfig();
  const updated = {
    fhirServerUrl: fhirServerUrl.trim(),
    tokenEndpoint: tokenEndpoint.trim(),
    clientId: clientId.trim(),
    scope: (scope || 'system/*.write').trim(),
    // keep existing private key if none provided in this request
    privateKey: privateKey && privateKey.trim() ? privateKey.trim() : (existing.privateKey || ''),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  res.json({
    success: true,
    fhirServerUrl: updated.fhirServerUrl,
    tokenEndpoint: updated.tokenEndpoint,
    clientId: updated.clientId,
    scope: updated.scope,
    hasPrivateKey: !!updated.privateKey,
  });
});

module.exports = router;
module.exports.readConfig = readConfig;
