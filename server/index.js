const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: configRoutes, getAppJwks } = require('./routes/config');
const generateRoutes = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy headers (X-Forwarded-Proto, X-Forwarded-Host)
app.set('trust proxy', true);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/.well-known/jwks.json', (req, res) => {
  try {
    res.json(getAppJwks());
  } catch (err) {
    console.error('Failed to build JWKS:', err.message);
    res.status(500).json({ error: 'Failed to build JWKS' });
  }
});

app.use('/api/config', configRoutes);
app.use('/api', generateRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health/details', (req, res) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = forwardedProto ? String(forwardedProto).split(',')[0].trim() : req.protocol;
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost ? String(forwardedHost).split(',')[0].trim() : req.get('host');
  const derivedBaseUrl = `${proto}://${host}`;
  const publicApiUrl = process.env.PUBLIC_API_URL ? process.env.PUBLIC_API_URL.trim().replace(/\/$/, '') : null;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT,
    trustProxy: app.get('trust proxy'),
    env: {
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || null,
      PUBLIC_API_URL: publicApiUrl,
    },
    request: {
      protocol: req.protocol,
      host: req.get('host') || null,
      xForwardedProto: forwardedProto || null,
      xForwardedHost: forwardedHost || null,
      derivedBaseUrl,
    },
    effectiveJwksUrl: `${publicApiUrl || derivedBaseUrl}/.well-known/jwks.json`,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Synthea FHIR server listening on port ${PORT}`);
});
