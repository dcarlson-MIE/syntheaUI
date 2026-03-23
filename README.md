# Synthea FHIR Generator UI

A full-stack web application for generating synthetic patient data with [Synthea](https://github.com/synthetichealth/synthea) and posting it to a FHIR server using SMART on FHIR Backend Services authentication.

## Architecture

```
/
├── synthea/            (git submodule)
├── server/             (Node.js/Express API)
│   ├── index.js
│   ├── routes/
│   │   ├── config.js   (FHIR server config CRUD)
│   │   └── generate.js (Synthea run + FHIR post)
│   └── Dockerfile
├── client/             (React + Vite frontend)
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── ConfigPanel.jsx
│   │       ├── GenerateForm.jsx
│   │       └── JobResults.jsx
│   └── Dockerfile
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 18+
- Java 11+ (for running Synthea)
- npm

### 1. Clone and initialize submodule

```bash
git clone <this-repo>
cd syntheaUI
git submodule update --init --recursive
```

### 2. Start the backend

```bash
cd server
npm install
npm start
# Server runs on http://localhost:3001
```

### 3. Start the frontend

```bash
cd client
npm install
npm run dev
# App runs on http://localhost:5173
```

### 4. Configure FHIR server

Open http://localhost:5173, fill in:
- **FHIR Server URL** — base URL of your FHIR R4 server
- **Token Endpoint** — SMART on FHIR token URL
- **Client ID** — your registered client ID
- **Private Key** — RSA private key in PEM format (RS384 or RS256)
- **Scope** — default: `system/*.write`

### 5. Generate patients

Fill in the generation form and click **Generate & Post to FHIR Server**.

On first run, Synthea will be built automatically (`./gradlew build -x test`), which takes several minutes. Subsequent runs reuse the built JAR.

## Docker Compose

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Get config (private key masked) |
| `POST` | `/api/config` | Save FHIR server config |
| `POST` | `/api/generate` | Start a generation job |
| `GET` | `/api/status/:jobId` | Poll job status |

## Authentication

Implements [SMART on FHIR Backend Services](https://www.hl7.org/fhir/smart-app-launch/backend-services.html):
- Signs a JWT assertion with RS384 (or RS256)
- Exchanges it for an access token via `client_credentials` grant
- Uses the Bearer token for all FHIR API calls
