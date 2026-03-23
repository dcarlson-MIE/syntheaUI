const express = require('express');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

// Private/reserved IP ranges to block for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,                                           // loopback
  /^10\./,                                            // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,                      // RFC 1918
  /^192\.168\./,                                      // RFC 1918
  /^169\.254\./,                                      // link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,        // RFC 6598 shared
  /^0\./,                                             // IANA reserved
  /^::1$/,                                            // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                                 // IPv6 unique-local
  /^fd[0-9a-f]{2}:/i,                                 // IPv6 unique-local
  /^fe80:/i,                                          // IPv6 link-local
];

function isPrivateIp(address) {
  return PRIVATE_IP_PATTERNS.some(re => re.test(address));
}

async function validateUrl(urlString, fieldName) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`${fieldName} is not a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use HTTPS`);
  }

  const hostname = parsed.hostname;

  // If the hostname is already a bare IP, check it directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`${fieldName} must not point to a private or reserved address`);
    }
    return;
  }

  // Otherwise resolve via DNS and check all returned addresses
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw new Error(`${fieldName} hostname could not be resolved: ${err.message}`);
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`${fieldName} resolves to a private or reserved address`);
    }
  }
}

const configWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many configuration requests, please try again later.' },
});

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
router.post('/', configWriteLimit, async (req, res) => {
  const { fhirServerUrl, tokenEndpoint, clientId, privateKey, scope } = req.body;

  if (!fhirServerUrl || !tokenEndpoint || !clientId) {
    return res.status(400).json({ error: 'fhirServerUrl, tokenEndpoint, and clientId are required' });
  }

  // Validate URLs to prevent SSRF
  try {
    await validateUrl(fhirServerUrl, 'fhirServerUrl');
    await validateUrl(tokenEndpoint, 'tokenEndpoint');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const existing = readConfig();

  // Ensure data directory exists before writing
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const updated = {
    fhirServerUrl: fhirServerUrl.trim(),
    tokenEndpoint: tokenEndpoint.trim(),
    clientId: clientId.trim(),
    scope: (scope || 'system/*.write').trim(),
    // keep existing private key if none provided in this request
    privateKey: privateKey && privateKey.trim() ? privateKey.trim() : (existing.privateKey || ''),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), { encoding: 'utf8', mode: 0o600 });
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
