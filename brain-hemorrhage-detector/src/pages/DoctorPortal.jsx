import { useState } from 'react'
import { toast } from 'sonner'

const API = 'http://localhost:5000/api'
const SPACE_URL = 'https://charanjot-brain-hemorrhage-detector.hf.space'

const TYPES = [
  { key: 'any', color: '#1d6aff' },
  { key: 'subdural', color: '#a855f7' },
  { key: 'intraparenchymal', color: '#f97316' },
  { key: 'subarachnoid', color: '#eab308' },
  { key: 'intraventricular', color: '#06b6d4' },
  { key: 'epidural', color: '#10b981' }
]

export default function DoctorPortal ({ onLogout }) {
  const [file, setFile] = useState(null)
  const [patientName, setPatientName] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pastReports, setPastReports] = useState([])
  const [showPast, setShowPast] = useState(false)
  const [loadingPast, setLoadingPast] = useState(false)

  const doctorName = localStorage.getItem('doctor_name')
  const doctorEmail = localStorage.getItem('doctor_email')
  const token = localStorage.getItem('doctor_token')

  const handleLogout = () => {
    localStorage.removeItem('doctor_token')
    localStorage.removeItem('doctor_name')
    localStorage.removeItem('doctor_email')
    onLogout()
  }

  const loadPastReports = async () => {
    if (showPast) {
      setShowPast(false)
      return
    }
    setLoadingPast(true)
    const toastId = toast.loading('Loading reports...')
    try {
      const res = await fetch(`${API}/doctor/reports`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPastReports(data)
      setShowPast(true)
      toast.success(`${data.length} report(s) found`, { id: toastId })
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setLoadingPast(false)
    }
  }

  const handleDeleteReport = async patientId => {
    const toastId = toast.loading('Deleting report...')
    try {
      const res = await fetch(`${API}/reports/${patientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPastReports(prev => prev.filter(r => r.patientId !== patientId))
      toast.success('Report deleted', { id: toastId })
    } catch (err) {
      toast.error(err.message, { id: toastId })
    }
  }

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('Please upload a DICOM file')
      return
    }
    if (!patientName) {
      toast.error('Please enter patient name')
      return
    }

    setLoading(true)
    setResult(null)
    setSavedId(null)
    const toastId = toast.loading('Uploading scan...')

    try {
      const formData = new FormData()
      formData.append('files', file, file.name)
      const uploadRes = await fetch(`${SPACE_URL}/gradio_api/upload`, {
        method: 'POST',
        body: formData
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const uploadedPaths = await uploadRes.json()

      toast.loading('Running AI inference...', { id: toastId })

      const callRes = await fetch(`${SPACE_URL}/gradio_api/call/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              path: uploadedPaths[0],
              orig_name: file.name,
              meta: { _type: 'gradio.FileData' }
            }
          ]
        })
      })
      const { event_id } = await callRes.json()

      const resultRes = await fetch(
        `${SPACE_URL}/gradio_api/call/predict/${event_id}`
      )
      const reader = resultRes.body.getReader()
      const decoder = new TextDecoder()
      let buffer = '',
        finalData = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              finalData = JSON.parse(line.slice(5).trim())
            } catch (err) {
              // JSON chunks can be partial; ignore parse failures.
              void err
            }
          }
        }
      }

      if (!finalData) throw new Error('No response from model')
      setResult(finalData)
      toast.success('Analysis complete!', { id: toastId })
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const toastId = toast.loading('Saving report to database...')
    try {
      const res = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patientName,
          patientAge,
          diagnosis: result[0] ?? '',
          confidences: result[1]?.confidences ?? [],
          filename: file?.name
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedId(data.patientId)
      toast.success(`Report saved! Patient ID: ${data.patientId}`, {
        id: toastId,
        duration: 6000
      })
    } catch (err) {
      toast.error('Failed to save: ' + err.message, { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const confidences = result?.[1]?.confidences ?? []
  const diagnosis = result?.[0] ?? ''
  const isPositive =
    diagnosis.toLowerCase().includes('hemorrhage') ||
    diagnosis.toLowerCase().includes('detected')

  return (
    <div className='page-wrapper'>
      {/* Header */}
      <div className='portal-header'>
        <div>
          <h2 className='portal-title'>👨‍⚕️ Doctor Portal</h2>
          <p className='portal-sub'>
            Welcome, <strong>{doctorName}</strong> · {doctorEmail}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className='btn-secondary'
            onClick={loadPastReports}
            disabled={loadingPast}
          >
            {showPast ? 'Hide Reports' : '📋 Past Reports'}
          </button>
          <button className='btn-logout' onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      <div className='divider' />

      {/* Past Reports */}
      {showPast && (
        <div style={{ marginBottom: 32 }}>
          <div className='section-label'>
            Past Reports ({pastReports.length})
          </div>
          {pastReports.length === 0 ? (
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 13,
                padding: '20px 0'
              }}
            >
              No reports saved yet.
            </p>
          ) : (
            <table className='reports-table'>
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Diagnosis</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pastReports.map(r => (
                  <tr key={r.patientId}>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        color: '#1d6aff',
                        letterSpacing: 2
                      }}
                    >
                      {r.patientId}
                    </td>
                    <td>{r.patientName}</td>
                    <td>{r.patientAge || '—'}</td>
                    <td
                      style={{
                        color: r.diagnosis?.toLowerCase().includes('hemorrhage')
                          ? 'var(--red)'
                          : 'var(--green)',
                        fontSize: 12
                      }}
                    >
                      {r.diagnosis?.slice(0, 35)}
                      {r.diagnosis?.length > 35 ? '...' : ''}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className='btn-delete'
                        onClick={() => handleDeleteReport(r.patientId)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className='divider' />
        </div>
      )}

      {/* Patient Info */}
      <div className='section-label'>Patient Information</div>
      <div className='form-row'>
        <div className='form-group'>
          <label className='form-label'>Patient Name *</label>
          <input
            className='form-input'
            placeholder='Full name'
            value={patientName}
            onChange={e => setPatientName(e.target.value)}
          />
        </div>
        <div className='form-group'>
          <label className='form-label'>Age</label>
          <input
            className='form-input'
            placeholder='e.g. 45'
            value={patientAge}
            onChange={e => setPatientAge(e.target.value)}
          />
        </div>
      </div>

      {/* Upload */}
      <div className='section-label' style={{ marginTop: 24 }}>
        CT Scan Upload
      </div>
      <div
        className={`upload-zone ${file ? 'has-file' : ''}`}
        onClick={() => document.getElementById('dcm-doctor').click()}
      >
        <div className='upload-icon-wrap'>{file ? '✓' : '↑'}</div>
        {file ? (
          <>
            <div className='upload-main-text'>File loaded</div>
            <div className='file-info'>
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          </>
        ) : (
          <>
            <div className='upload-main-text'>
              Drop DICOM or click to browse
            </div>
            <div className='upload-sub-text'>Only .dcm files</div>
          </>
        )}
        <input
          id='dcm-doctor'
          type='file'
          accept='.dcm'
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0]
            if (f) {
              setFile(f)
              setResult(null)
              setSavedId(null)
              toast.success(`Loaded: ${f.name}`)
            }
          }}
        />
      </div>

      <button
        className='btn-analyze'
        onClick={handleAnalyze}
        disabled={loading || !file || !patientName}
        style={{ marginTop: 16 }}
      >
        {loading ? 'Analyzing...' : 'Run Analysis'}
      </button>

      {loading && (
        <div className='loading-wrap'>
          <div className='loading-ring' />
          <div className='loading-title'>Running inference</div>
          <div className='loading-sub'>Processing DICOM — 15–30 seconds</div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className='results-wrap' style={{ marginTop: 32 }}>
          <div
            className={`diagnosis-banner ${
              isPositive ? 'positive' : 'negative'
            }`}
          >
            <div className='diagnosis-left'>
              <div className='diagnosis-icon'>{isPositive ? '!' : '✓'}</div>
              <div>
                <div className='diagnosis-label'>
                  {isPositive ? 'Hemorrhage Detected' : 'No Hemorrhage'}
                </div>
                <div className='diagnosis-text'>{diagnosis}</div>
              </div>
            </div>
          </div>

          <div className='result-card' style={{ marginTop: 16 }}>
            <div className='card-title'>
              <div className='card-title-dot' />
              Subtype Probabilities
            </div>
            <div className='bars-wrap'>
              {confidences.map((item, i) => {
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

          {!savedId ? (
            <button
              className='btn-analyze'
              onClick={handleSave}
              disabled={saving}
              style={{ marginTop: 16, background: '#00d68f' }}
            >
              {saving ? 'Saving...' : '💾 Save Report & Generate Patient ID'}
            </button>
          ) : (
            <div className='saved-box'>
              <div className='saved-title'>✅ Report Saved Successfully!</div>
              <div className='saved-sub'>Share this ID with your patient:</div>
              <div className='saved-id'>{savedId}</div>
              <div className='saved-note'>
                Patient can view their report using this ID on the Patient
                Portal
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
