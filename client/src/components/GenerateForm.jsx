import { useState } from 'react';
import axios from 'axios';

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const today = new Date().toISOString().split('T')[0];

const DEFAULT_PARAMS = {
  populationSize: 10,
  seed: '',
  referenceDate: today,
  gender: 'any',
  ageMin: 0,
  ageMax: 80,
  state: 'Massachusetts',
  city: '',
};

function GenerateForm({ apiBase, configReady, onJobStarted }) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = e => {
    const { name, value, type } = e.target;
    setParams(p => ({ ...p, [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        ...params,
        seed: params.seed === '' ? undefined : Number(params.seed),
        ageMin: params.ageMin === '' ? undefined : Number(params.ageMin),
        ageMax: params.ageMax === '' ? undefined : Number(params.ageMax),
      };
      const { data } = await axios.post(`${apiBase}/api/generate`, body);
      onJobStarted(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="generate-form" onSubmit={handleSubmit}>
      {!configReady && (
        <div className="message warning">
          ⚠️ Please configure the FHIR server before generating patients.
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="populationSize">Population Size</label>
          <input
            id="populationSize"
            name="populationSize"
            type="number"
            min={1}
            max={1000}
            value={params.populationSize}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="seed">Random Seed (optional)</label>
          <input
            id="seed"
            name="seed"
            type="number"
            placeholder="Leave blank for random"
            value={params.seed}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="referenceDate">Reference Date</label>
          <input
            id="referenceDate"
            name="referenceDate"
            type="date"
            value={params.referenceDate}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="gender">Gender</label>
          <select id="gender" name="gender" value={params.gender} onChange={handleChange}>
            <option value="any">Any</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="ageMin">Age Min</label>
          <input
            id="ageMin"
            name="ageMin"
            type="number"
            min={0}
            max={120}
            value={params.ageMin}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="ageMax">Age Max</label>
          <input
            id="ageMax"
            name="ageMax"
            type="number"
            min={0}
            max={120}
            value={params.ageMax}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="state">State</label>
          <select id="state" name="state" value={params.state} onChange={handleChange}>
            {US_STATES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="city">City (optional)</label>
          <input
            id="city"
            name="city"
            type="text"
            placeholder="Boston"
            value={params.city}
            onChange={handleChange}
          />
        </div>
      </div>

      {error && <div className="message error">{error}</div>}

      <button
        type="submit"
        className="btn-primary btn-large"
        disabled={submitting || !configReady}
      >
        {submitting ? 'Submitting...' : '🚀 Generate & Post to FHIR Server'}
      </button>
    </form>
  );
}

export default GenerateForm;
