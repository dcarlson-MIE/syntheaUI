const express = require('express');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { readConfig } = require('./config');

const router = express.Router();

const SYNTHEA_DIR = path.join(__dirname, '..', '..', 'synthea');
const SYNTHEA_OUTPUT = path.join(SYNTHEA_DIR, 'output', 'fhir');

// In-memory job store
const jobs = {};

const JWT_EXPIRATION_SECONDS = 300;

function ensureSyntheaInstalled() {
  if (!fs.existsSync(SYNTHEA_DIR) || !fs.statSync(SYNTHEA_DIR).isDirectory()) {
    throw new Error('Synthea directory not found. Run: git submodule update --init --recursive');
  }

  const gradlew = path.join(SYNTHEA_DIR, 'gradlew');
  if (!fs.existsSync(gradlew)) {
    throw new Error('Synthea is not initialized (missing gradlew). Run: git submodule update --init --recursive');
  }

  try {
    fs.accessSync(gradlew, fs.constants.X_OK);
  } catch {
    throw new Error('Synthea gradlew is not executable. Run: chmod +x synthea/gradlew');
  }
}

function findSyntheaJar() {
  const buildLibs = path.join(SYNTHEA_DIR, 'build', 'libs');
  if (!fs.existsSync(buildLibs)) return null;
  
  const files = fs.readdirSync(buildLibs).filter(f => 
    f.endsWith('.jar') && 
    !f.includes('sources') && 
    !f.includes('javadoc')
  );
  
  if (files.length === 0) return null;
  
  // Prefer fat JARs with dependencies bundled
  // Try common patterns: with-dependencies, all, uberjar, fat, assembly, then largest
  const fatJarPatterns = ['with-dependencies', 'all', 'uberjar', 'fat', 'assembly'];
  for (const pattern of fatJarPatterns) {
    const match = files.find(f => f.includes(pattern));
    if (match) return path.join(buildLibs, match);
  }
  
  // Fall back to largest remaining JAR
  const largest = files.reduce((prev, curr) => {
    const prevStats = fs.statSync(path.join(buildLibs, prev));
    const currStats = fs.statSync(path.join(buildLibs, curr));
    return currStats.size > prevStats.size ? curr : prev;
  });
  
  return path.join(buildLibs, largest);
}

async function buildSynthea(jobId) {
  return new Promise((resolve, reject) => {
    jobs[jobId].logs.push('Building Synthea JAR (this may take several minutes)...');
    jobs[jobId].phase = 'building';

    const gradlew = path.join(SYNTHEA_DIR, 'gradlew');
    const child = spawn(gradlew, ['build', '-x', 'test'], {
      cwd: SYNTHEA_DIR,
      env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME || '' },
    });

    child.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) jobs[jobId].logs.push(line);
    });
    child.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line) jobs[jobId].logs.push(line);
    });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Synthea build failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

function buildSyntheaArgs(params) {
  const args = [];

  if (params.seed !== undefined && params.seed !== null && params.seed !== '') {
    args.push('-s', String(params.seed));
  }
  if (params.populationSize) {
    args.push('-p', String(params.populationSize));
  }
  if (params.referenceDate) {
    // Synthea expects --referenceDate YYYY-MM-DD
    args.push('--referenceDate', params.referenceDate);
  }
  if (params.gender && params.gender !== 'any') {
    args.push('-g', params.gender.toUpperCase());
  }
  if (params.ageMin !== undefined && params.ageMin !== null && params.ageMin !== '') {
    args.push('--minAge', String(params.ageMin));
  }
  if (params.ageMax !== undefined && params.ageMax !== null && params.ageMax !== '') {
    args.push('--maxAge', String(params.ageMax));
  }

  // state and city are positional args at the end
  const state = params.state || 'Massachusetts';
  args.push(state);
  if (params.city && params.city.trim()) {
    args.push(params.city.trim());
  }

  return args;
}

async function runSynthea(jobId, params, jarPath) {
  return new Promise((resolve, reject) => {
    jobs[jobId].logs.push('Running Synthea...');
    jobs[jobId].phase = 'generating';

    // Clean previous FHIR output
    if (fs.existsSync(SYNTHEA_OUTPUT)) {
      fs.readdirSync(SYNTHEA_OUTPUT).forEach(f => {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(SYNTHEA_OUTPUT, f));
      });
    }

    const syntheaArgs = ['-jar', jarPath, ...buildSyntheaArgs(params)];
    jobs[jobId].logs.push(`java ${syntheaArgs.join(' ')}`);

    const child = spawn('java', syntheaArgs, { cwd: SYNTHEA_DIR });

    child.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) jobs[jobId].logs.push(line);
    });
    child.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line) jobs[jobId].logs.push(line);
    });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Synthea run failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function getAccessToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.clientId,
    sub: config.clientId,
    aud: config.tokenEndpoint,
    jti: uuidv4(),
    exp: now + JWT_EXPIRATION_SECONDS,
    iat: now,
  };

  // Try RS384 first, fall back to RS256
  let token;
  try {
    token = jwt.sign(payload, config.privateKey, { algorithm: 'RS384' });
  } catch (rs384Err) {
    console.warn('RS384 signing failed, falling back to RS256:', rs384Err.message);
    token = jwt.sign(payload, config.privateKey, { algorithm: 'RS256' });
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: token,
    scope: config.scope || 'system/*.write',
  });

  const response = await axios.post(config.tokenEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

async function postBundleToFhir(bundle, accessToken, fhirServerUrl, jobId) {
  const results = { posted: 0, failed: 0, details: [] };
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/fhir+json',
    'Accept': 'application/fhir+json',
  };

  if (!bundle.entry || bundle.entry.length === 0) return results;

  // If bundle is a transaction type, try posting as a whole bundle first
  if (bundle.type === 'transaction') {
    try {
      await axios.post(fhirServerUrl, bundle, { headers });
      results.posted = bundle.entry.length;
      results.details.push({ type: 'Bundle(transaction)', status: 'success', count: bundle.entry.length });
      return results;
    } catch (err) {
      jobs[jobId]?.logs.push(`Transaction bundle post failed, falling back to individual resources: ${err.message}`);
    }
  }

  // Post each entry individually
  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (!resource || !resource.resourceType) continue;

    const resourceType = resource.resourceType;
    const resourceId = resource.id;

    try {
      if (resourceId) {
        await axios.put(`${fhirServerUrl}/${resourceType}/${resourceId}`, resource, { headers });
      } else {
        await axios.post(`${fhirServerUrl}/${resourceType}`, resource, { headers });
      }
      results.posted++;
      results.details.push({ type: resourceType, id: resourceId, status: 'success' });
    } catch (err) {
      results.failed++;
      results.details.push({
        type: resourceType,
        id: resourceId,
        status: 'failed',
        error: err.response?.data?.issue?.[0]?.diagnostics || err.message,
      });
    }
  }

  return results;
}

async function processJob(jobId, params) {
  const config = readConfig();

  if (!config.fhirServerUrl || !config.tokenEndpoint || !config.clientId || !config.privateKey) {
    throw new Error('FHIR server configuration is incomplete. Please configure the FHIR server first.');
  }

  ensureSyntheaInstalled();

  // Ensure synthea JAR exists
  let jarPath = findSyntheaJar();
  if (!jarPath) {
    await buildSynthea(jobId);
    jarPath = findSyntheaJar();
    if (!jarPath) throw new Error('Could not find Synthea JAR after build');
  } else {
    jobs[jobId].logs.push(`Using existing Synthea JAR: ${path.basename(jarPath)}`);
  }

  await runSynthea(jobId, params, jarPath);

  // Read generated FHIR files
  if (!fs.existsSync(SYNTHEA_OUTPUT)) {
    throw new Error(`Synthea output directory not found: ${SYNTHEA_OUTPUT}`);
  }

  const fhirFiles = fs.readdirSync(SYNTHEA_OUTPUT).filter(f => f.endsWith('.json'));
  jobs[jobId].logs.push(`Found ${fhirFiles.length} FHIR bundle file(s)`);
  jobs[jobId].phase = 'posting';

  if (fhirFiles.length === 0) {
    throw new Error('No FHIR files generated by Synthea');
  }

  // Get access token
  jobs[jobId].logs.push('Obtaining FHIR access token...');
  const accessToken = await getAccessToken(config);
  jobs[jobId].logs.push('Access token obtained successfully');

  let totalPosted = 0;
  let totalFailed = 0;
  const allDetails = [];
  let patientsGenerated = 0;

  for (const file of fhirFiles) {
    jobs[jobId].logs.push(`Posting resources from ${file}...`);
    const bundle = JSON.parse(fs.readFileSync(path.join(SYNTHEA_OUTPUT, file), 'utf8'));

    if (bundle.entry) {
      const patientEntries = bundle.entry.filter(e => e.resource?.resourceType === 'Patient');
      patientsGenerated += patientEntries.length;
    }

    const results = await postBundleToFhir(bundle, accessToken, config.fhirServerUrl, jobId);
    totalPosted += results.posted;
    totalFailed += results.failed;
    allDetails.push(...results.details);
    jobs[jobId].logs.push(`  → ${results.posted} posted, ${results.failed} failed`);
  }

  return { patientsGenerated, totalPosted, totalFailed, details: allDetails };
}

// POST /api/generate
router.post('/generate', async (req, res) => {
  const jobId = uuidv4();
  jobs[jobId] = {
    id: jobId,
    status: 'running',
    phase: 'starting',
    logs: [`Job ${jobId} started`],
    startedAt: new Date().toISOString(),
    result: null,
    error: null,
  };

  res.status(202).json({ jobId, status: 'running' });

  processJob(jobId, req.body)
    .then(result => {
      jobs[jobId].status = 'completed';
      jobs[jobId].phase = 'done';
      jobs[jobId].result = result;
      jobs[jobId].completedAt = new Date().toISOString();
      jobs[jobId].logs.push(`✓ Done: ${result.patientsGenerated} patients, ${result.totalPosted} resources posted, ${result.totalFailed} failed`);
    })
    .catch(err => {
      jobs[jobId].status = 'failed';
      jobs[jobId].error = err.message;
      jobs[jobId].completedAt = new Date().toISOString();
      jobs[jobId].logs.push(`✗ Error: ${err.message}`);
      console.error(`Job ${jobId} failed:`, err);
    });
});

// GET /api/status/:jobId
router.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

module.exports = router;
