const express = require('express');
const cors = require('cors');
const path = require('path');

const configRoutes = require('./routes/config');
const generateRoutes = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

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
