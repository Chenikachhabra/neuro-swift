import { useState } from 'react'
import { toast } from 'sonner'

const API = 'http://localhost:5000/api'

const TYPES = [
  { key: 'any', color: '#1d6aff' },
  { key: 'subdural', color: '#a855f7' },
  { key: 'intraparenchymal', color: '#f97316' },
  { key: 'subarachnoid', color: '#eab308' },
  { key: 'intraventricular', color: '#06b6d4' },
  { key: 'epidural', color: '#10b981' }
]

export default function PatientPortal () {
  const [patientId, setPatientId] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!patientId.trim()) {
      toast.error('Please enter your Patient ID')
      return
    }
    if (patientId.trim().length !== 6) {
      toast.error('Patient ID must be 6 characters')
      return
    }

    setLoading(true)
    setReport(null)
    const toastId = toast.loading('Searching for your report...')

    try {
      const res = await fetch(`${API}/reports/${patientId.trim()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport(data)
      toast.success('Report found!', { id: toastId })
    } catch {
      toast.error(
        'No report found. Please check your ID or contact your doctor.',
        { id: toastId }
      )
    } finally {
      setLoading(false)
    }
  }

  const isPositive =
    report?.diagnosis?.toLowerCase().includes('hemorrhage') ||
    report?.diagnosis?.toLowerCase().includes('detected')

  return (
    <div className='page-wrapper'>
      <div className='portal-header'>
        <div>
          <h2 className='portal-title'>🧑‍💼 Patient Portal</h2>
          <p className='portal-sub'>
            Enter your Patient ID to view your scan report
          </p>
        </div>
      </div>
      <div className='divider' />

      <div className='search-wrap'>
        <div className='section-label'>Your Patient ID</div>
        <div className='search-row'>
          <input
            className='form-input search-input'
            placeholder='e.g. AB12CD'
            value={patientId}
            maxLength={6}
            onChange={e => setPatientId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            className='btn-analyze search-btn'
            onClick={handleSearch}
            disabled={loading || !patientId.trim()}
          >
            {loading ? 'Searching...' : 'Find Report'}
          </button>
        </div>
        <p className='search-hint'>
          Your 6-character ID was provided by your doctor after the scan
          analysis.
        </p>
      </div>

      {report && (
        <div className='results-wrap' style={{ marginTop: 32 }}>
          <div className='result-card' style={{ marginBottom: 16 }}>
            <div className='card-title'>
              <div className='card-title-dot' />
              Patient Information
            </div>
            {[
              ['Patient Name', report.patientName],
              ['Age', report.patientAge || 'N/A'],
              ['Patient ID', report.patientId],
              ['Scan Date', new Date(report.createdAt).toLocaleString()],
              ['Analyzed By', `${report.doctorName} · ${report.doctorEmail}`]
            ].map(([k, v]) => (
              <div className='report-row' key={k}>
                <div className='report-key'>{k}</div>
                <div
                  className='report-val'
                  style={
                    k === 'Patient ID'
                      ? {
                          fontFamily: 'monospace',
                          color: '#1d6aff',
                          letterSpacing: 3,
                          fontSize: 16
                        }
                      : {}
                  }
                >
                  {v}
                </div>
              </div>
            ))}
          </div>

          <div
            className={`diagnosis-banner ${
              isPositive ? 'positive' : 'negative'
            }`}
            style={{ marginBottom: 16 }}
          >
            <div className='diagnosis-left'>
              <div className='diagnosis-icon'>{isPositive ? '!' : '✓'}</div>
              <div>
                <div className='diagnosis-label'>
                  {isPositive ? 'Hemorrhage Detected' : 'No Hemorrhage'}
                </div>
                <div className='diagnosis-text'>{report.diagnosis}</div>
              </div>
            </div>
          </div>

          <div className='result-card'>
            <div className='card-title'>
              <div className='card-title-dot' />
              Detailed Results
            </div>
            <div className='bars-wrap'>
              {report.confidences?.map((item, i) => {
                const pct = Math.round(item.confidence * 100)
                const color =
                  TYPES.find(t => item.label.toLowerCase().includes(t.key))
                    ?.color || '#1d6aff'
                return (
                  <div className='bar-row' key={i}>
                    <div className='bar-label-row'>
                      <span className='bar-name'>{item.label}</span>
                      <span className='bar-pct'>{pct}%</span>
                    </div>
                    <div className='bar-track'>
                      <div
                        className='bar-fill'
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className='disclaimer' style={{ marginTop: 16 }}>
            ⚕ This report is AI-generated for research purposes only. Please
            consult your doctor for clinical advice.
          </div>
        </div>
      )}
    </div>
  )
}
