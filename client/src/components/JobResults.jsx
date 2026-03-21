import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const POLL_INTERVAL = 2000;

const PHASE_LABELS = {
  starting: 'Starting...',
  building: 'Building Synthea JAR...',
  generating: 'Generating patients...',
  posting: 'Posting to FHIR server...',
  done: 'Complete',
};

function JobResults({ apiBase, jobId, onClose }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const logRef = useRef(null);
  const timerRef = useRef(null);

  const fetchJob = useCallback(async () => {
    try {
      const { data } = await axios.get(`${apiBase}/api/status/${jobId}`);
      setJob(data);
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(timerRef.current);
      }
    } catch (err) {
      setError(err.message);
      clearInterval(timerRef.current);
    }
  }, [apiBase, jobId]);

  useEffect(() => {
    fetchJob();
    timerRef.current = setInterval(fetchJob, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchJob]);

  if (error) {
    return (
      <div className="job-results">
        <div className="message error">Error polling job: {error}</div>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    );
  }

  if (!job) {
    return <div className="job-results"><div className="spinner" /> Loading...</div>;
  }

  return (
    <div className="job-results">
      <div className="job-header">
        <div className="job-status-row">
          <StatusBadge status={job.status} />
          <span className="phase-label">{PHASE_LABELS[job.phase] || job.phase}</span>
          {job.status === 'running' && <div className="spinner-inline" />}
        </div>
        <button className="btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      {job.status === 'completed' && job.result && (
        <div className="result-summary">
          <div className="stat-card">
            <span className="stat-value">{job.result.patientsGenerated}</span>
            <span className="stat-label">Patients Generated</span>
          </div>
          <div className="stat-card success">
            <span className="stat-value">{job.result.totalPosted}</span>
            <span className="stat-label">Resources Posted</span>
          </div>
          <div className={`stat-card ${job.result.totalFailed > 0 ? 'error' : ''}`}>
            <span className="stat-value">{job.result.totalFailed}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>
      )}

      {job.status === 'failed' && (
        <div className="message error">
          ❌ {job.error}
        </div>
      )}

      <div className="log-section">
        <h3>Activity Log</h3>
        <div className="log-box" ref={logRef}>
          {(job.logs || []).map((line, i) => (
            <div key={i} className="log-line">{line}</div>
          ))}
        </div>
      </div>

      {job.result?.details && job.result.details.length > 0 && (
        <div className="details-section">
          <h3>Resource Details ({job.result.details.length} entries)</h3>
          <div className="details-table-wrapper">
            <table className="details-table">
              <thead>
                <tr>
                  <th>Resource Type</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {job.result.details.map((d, i) => (
                  <tr key={i} className={d.status === 'failed' ? 'row-error' : ''}>
                    <td>{d.type}</td>
                    <td className="monospace small">{d.id || '—'}</td>
                    <td>
                      <span className={`badge ${d.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="small">{d.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    running: { cls: 'badge-warning', label: '⏳ Running' },
    completed: { cls: 'badge-success', label: '✓ Completed' },
    failed: { cls: 'badge-error', label: '✗ Failed' },
  };
  const { cls, label } = map[status] || { cls: '', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default JobResults;
