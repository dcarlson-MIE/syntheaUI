const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: configRoutes, getAppJwks } = require('./routes/config');
const generateRoutes = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse-proxy headers (X-Forwarded-Proto, X-Forwarded-Host)
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Synthea FHIR server listening on port ${PORT}`);
});
