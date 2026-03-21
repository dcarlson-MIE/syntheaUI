import { useState, useEffect } from 'react';
import ConfigPanel from './components/ConfigPanel';
import GenerateForm from './components/GenerateForm';
import JobResults from './components/JobResults';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [config, setConfig] = useState(null);
  const [serverOnline, setServerOnline] = useState(null);
  const [activeJob, setActiveJob] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false));

    fetch(`${API_BASE}/api/config`)
      .then(r => r.json())
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🏥 Synthea FHIR Generator</h1>
          <div className="server-status">
            <span className={`status-dot ${serverOnline === null ? 'unknown' : serverOnline ? 'online' : 'offline'}`} />
            <span>{serverOnline === null ? 'Connecting...' : serverOnline ? 'Server Online' : 'Server Offline'}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>FHIR Server Configuration</h2>
          <ConfigPanel
            apiBase={API_BASE}
            config={config}
            onConfigSaved={setConfig}
          />
        </section>

        <section className="panel">
          <h2>Generate Synthetic Patients</h2>
          <GenerateForm
            apiBase={API_BASE}
            configReady={config?.hasPrivateKey && config?.fhirServerUrl}
            onJobStarted={setActiveJob}
          />
        </section>

        {activeJob && (
          <section className="panel">
            <h2>Generation Results</h2>
            <JobResults apiBase={API_BASE} jobId={activeJob} onClose={() => setActiveJob(null)} />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
