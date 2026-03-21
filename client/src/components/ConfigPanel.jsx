import { useState } from 'react';
import axios from 'axios';

function ConfigPanel({ apiBase, config, onConfigSaved }) {
  const [form, setForm] = useState({
    fhirServerUrl: '',
    tokenEndpoint: '',
    clientId: '',
    privateKey: '',
    scope: 'system/*.write',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Pre-fill form from loaded config (excluding privateKey)
  useState(() => {
    if (config) {
      setForm(f => ({
        ...f,
        fhirServerUrl: config.fhirServerUrl || '',
        tokenEndpoint: config.tokenEndpoint || '',
        clientId: config.clientId || '',
        scope: config.scope || 'system/*.write',
      }));
    }
  }, [config]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await axios.post(`${apiBase}/api/config`, form);
      onConfigSaved(data);
      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      // Clear private key from form after save for security
      setForm(f => ({ ...f, privateKey: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="config-form" onSubmit={handleSave}>
      {config && (
        <div className="config-status">
          <span className={`status-dot ${config.fhirServerUrl ? 'online' : 'offline'}`} />
          {config.fhirServerUrl
            ? `Connected to: ${config.fhirServerUrl}`
            : 'Not configured'}
          {config.hasPrivateKey && <span className="badge">🔑 Key loaded</span>}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="fhirServerUrl">FHIR Server URL</label>
        <input
          id="fhirServerUrl"
          name="fhirServerUrl"
          type="url"
          placeholder="https://fhir.example.com/fhir"
          value={form.fhirServerUrl}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="tokenEndpoint">Token Endpoint URL</label>
        <input
          id="tokenEndpoint"
          name="tokenEndpoint"
          type="url"
          placeholder="https://auth.example.com/token"
          value={form.tokenEndpoint}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="clientId">Client ID</label>
        <input
          id="clientId"
          name="clientId"
          type="text"
          placeholder="my-client-id"
          value={form.clientId}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="scope">Scope</label>
        <input
          id="scope"
          name="scope"
          type="text"
          placeholder="system/*.write"
          value={form.scope}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="privateKey">
          Private Key (RSA PEM)
          {config?.hasPrivateKey && <span className="hint"> — leave blank to keep existing key</span>}
        </label>
        <textarea
          id="privateKey"
          name="privateKey"
          rows={8}
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
          value={form.privateKey}
          onChange={handleChange}
          className="monospace"
          spellCheck={false}
        />
      </div>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </form>
  );
}

export default ConfigPanel;
