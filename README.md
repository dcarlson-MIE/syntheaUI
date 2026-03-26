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

#### Node.js 18+ and npm

**macOS (Homebrew):**
```bash
brew install node
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:** Download from https://nodejs.org/

Verify:
```bash
node --version   # should be v18 or higher
npm --version
```

---

#### Java 11+ (required to build and run Synthea)

**macOS (Homebrew):**
```bash
brew install openjdk
sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk \
  /Library/Java/JavaVirtualMachines/openjdk.jdk
```

**Ubuntu/Debian:**
```bash
sudo apt-get install -y openjdk-21-jdk
```

**Windows:** Download from https://adoptium.net/

Verify:
```bash
java -version   # should be 11 or higher
```

---

#### Git

**macOS (Homebrew):**
```bash
brew install git
```

**Ubuntu/Debian:**
```bash
sudo apt-get install -y git
```

Verify:
```bash
git --version
```

---

### 1. Clone and initialize submodule

```bash
git clone <this-repo>
cd syntheaUI
git submodule update --init --recursive
```

---

## Local Development Setup

### 2a. Start the backend

```bash
cd server
npm install
npm start
# API runs on http://localhost:3001
```

### 3a. Start the frontend

```bash
cd client
npm install
npm run dev
# App runs on http://localhost:5173
```

---

## Server / Production Setup (e.g. port 3000)

If you are deploying on a server where the frontend is served on a specific port
(e.g. port 3000), use the startup script to run backend + frontend in the background.

### 2b + 3b Automated (recommended)

```bash
chmod +x start-server.sh

# Hostname only
./start-server.sh --host syntheaui.os.mieweb.org --scheme https --app-port 3000 --api-port 3001

# Full URL also works
./start-server.sh --host https://syntheaui.os.mieweb.org --app-port 3000 --api-port 3001
```

Important:
- Do not include a path in `--host`.
- Do not append `:3001` to `--host`; use `--api-port 3001` instead.

Check runtime deployment details:

```bash
./start-server.sh --check --host https://syntheaui.os.mieweb.org --app-port 3000 --api-port 3001
```

This verifies:
- `/api/health/details` (effective public URL and proxy headers)
- `/.well-known/jwks.json` (public JWKS reachability)

---

### Manual fallback

If you prefer to run commands yourself, configure via environment variables:

### 2b. Configure environment

```bash
# Tell the API which origin is allowed (the URL users hit in their browser)
export CLIENT_ORIGIN=http://your-server.example.com:3000

# Start the backend (port defaults to 3001, override if needed)
cd server
npm install
npm start
```

### 3b. Build and serve the frontend

The frontend needs to know the backend API URL **at build time**:

```bash
cd client
npm install
VITE_API_URL=http://your-server.example.com:3001 npm run build
# Serve the dist/ folder on port 3000 with any static file server, e.g.:
npx serve -s dist -l 3000
```

Or use the provided Docker Compose approach (see below) which handles this automatically.

---

### 4. Configure FHIR server

Open the app in your browser, fill in:
- **FHIR Server URL** — base URL of your FHIR R4 server
- **Token Endpoint** — SMART on FHIR token URL
- **Client ID** — your registered client ID
- **Scope** — default: `system/*.write`

The app generates and manages its own signing key pair and publishes a discoverable JWKS endpoint at:

`https://<your-host>/.well-known/jwks.json`

Register that JWKS URL with your authorization server for `private_key_jwt` client authentication.

### 5. Generate patients

Fill in the generation form and click **Generate & Post to FHIR Server**.

On first run, Synthea will be built automatically (`./gradlew build -x test`), which takes several minutes. Subsequent runs reuse the built JAR.

---

## Docker Compose

Copy and edit the root `.env` file before starting:

```bash
cp .env.example .env
# Edit .env to set your ports and URLs
```

**Local defaults** (no changes needed):
```bash
docker-compose up --build
# Frontend: http://localhost:5173
# API:      http://localhost:3001
```

**Server deployment on port 3000** — set in `.env`:
```
CLIENT_PORT=3000
CLIENT_ORIGIN=https://your-server.example.com
VITE_API_URL=https://your-server.example.com
PUBLIC_API_URL=https://your-server.example.com
```

Then:
```bash
docker-compose up --build
# Frontend: https://your-server.example.com
# API:      https://your-server.example.com (proxied to backend)
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/health/details` | Deployment diagnostics (proxy/public URL/JWKS) |
| `GET` | `/api/config` | Get config (private key masked) |
| `POST` | `/api/config` | Save FHIR server config |
| `POST` | `/api/generate` | Start a generation job |
| `GET` | `/api/status/:jobId` | Poll job status |

## Authentication

Implements [SMART on FHIR Backend Services](https://www.hl7.org/fhir/smart-app-launch/backend-services.html):
- Signs a JWT assertion with RS384 (or RS256)
- Exchanges it for an access token via `client_credentials` grant
- Uses the Bearer token for all FHIR API calls
