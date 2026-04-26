import { useState, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import './App.css'

// ─── CONSTANTS ────────────────────────────────────────────
const API = 'http://localhost:5000/api'
const SPACE_URL = 'https://charanjot-brain-hemorrhage-detector.hf.space'
const DEPLOYED_MODEL_URL = 'https://neuroswift-app-opal.vercel.app/'

const TYPES = [
  {
    key: 'any',
    label: 'Any Hemorrhage',
    short: 'Any',
    color: '#c0392b',
    desc:
      'Overall probability that an intracranial hemorrhage is present (any subtype).'
  },
  {
    key: 'subdural',
    label: 'Subdural',
    short: 'SDH',
    color: '#7c3aed',
    desc:
      'Bleeding between the dura and arachnoid, often related to head trauma; can be acute or chronic.'
  },
  {
    key: 'intraparenchymal',
    label: 'Intraparenchymal',
    short: 'IPH',
    color: '#d97706',
    desc:
      'Bleeding within the brain tissue itself; commonly associated with hypertension, vascular malformations, or anticoagulants.'
  },
  {
    key: 'subarachnoid',
    label: 'Subarachnoid',
    short: 'SAH',
    color: '#0891b2',
    desc:
      'Bleeding into the subarachnoid space; classic causes include aneurysm rupture or trauma.'
  },
  {
    key: 'intraventricular',
    label: 'Intraventricular',
    short: 'IVH',
    color: '#0a6b5e',
    desc:
      'Bleeding into the brain’s ventricular system; may lead to hydrocephalus and requires urgent clinical correlation.'
  },
  {
    key: 'epidural',
    label: 'Epidural',
    short: 'EDH',
    color: '#059669',
    desc:
      'Bleeding between the skull and dura, often arterial (e.g., middle meningeal artery) and typically trauma-related.'
  }
]

function getColor (label) {
  const t = TYPES.find(t => label?.toLowerCase().includes(t.key))
  return t?.color || '#0a6b5e'
}

function getSubtypeName (label) {
  const type = TYPES.find(t => label?.toLowerCase().includes(t.key))
  return type?.label || label || 'Unknown subtype'
}

function getSubtypeDesc (label) {
  const type = TYPES.find(t => label?.toLowerCase().includes(t.key))
  return type?.desc || 'AI estimate only — please confirm clinically.'
}

// ─── PIE CHART ────────────────────────────────────────────
function PieChart ({ confidences }) {
  const [tooltip, setTooltip] = useState(null)
  const size = 200,
    cx = 100,
    cy = 100,
    r = 80,
    inner = 44
  const slices = []
  let cumAngle = -Math.PI / 2

  confidences.forEach((item, idx) => {
    const angle = item.confidence * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    const x2 = cx + r * Math.cos(cumAngle + angle)
    const y2 = cy + r * Math.sin(cumAngle + angle)
    const xi1 = cx + inner * Math.cos(cumAngle)
    const yi1 = cy + inner * Math.sin(cumAngle)
    const xi2 = cx + inner * Math.cos(cumAngle + angle)
    const yi2 = cy + inner * Math.sin(cumAngle + angle)
    const large = angle > Math.PI ? 1 : 0
    const d = `M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`
    slices.push({
      d,
      color: getColor(item.label),
      label: item.label,
      confidence: item.confidence,
      idx
    })
    cumAngle += angle
  })

  const top = confidences[0]
  const topPct = Math.round((top?.confidence || 0) * 100)

  return (
    <div className='pie-wrap'>
      <div className='pie-chart-shell'>
        <svg className='pie-chart-svg' width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map(s => (
            <path
              key={s.idx}
              d={s.d}
              fill={s.color}
              opacity={tooltip?.idx === s.idx ? 1 : 0.82}
              className='pie-slice'
              onMouseMove={e =>
                setTooltip({
                  idx: s.idx,
                  label: s.label,
                  subtype: getSubtypeName(s.label),
                  desc: getSubtypeDesc(s.label),
                  pct: Math.round(s.confidence * 100),
                  x: e.clientX,
                  y: e.clientY
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
          <text
            x={cx}
            y={cy - 6}
            textAnchor='middle'
            fill='var(--text)'
            fontSize='20'
            fontWeight='700'
            fontFamily='JetBrains Mono, monospace'
          >
            {topPct}%
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor='middle'
            fill='var(--text-2)'
            fontSize='10'
            fontFamily='Inter, sans-serif'
          >
            {TYPES.find(t => top?.label?.toLowerCase().includes(t.key))
              ?.short || 'ANY'}
          </text>
        </svg>

        {tooltip && (
          <div
            className='pie-tooltip'
            style={{ top: tooltip.y + 14, left: tooltip.x + 14 }}
          >
            <div className='pie-tooltip-label'>{tooltip.label}</div>
            <div className='pie-tooltip-sub'>Type: {tooltip.subtype}</div>
            <div className='pie-tooltip-desc'>{tooltip.desc}</div>
            <div className='pie-tooltip-val'>{tooltip.pct}% probability</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className='pie-legend'>
        {confidences.map((item, i) => (
          <div key={i} className='pie-legend-row'>
            <div className='pie-legend-dot' style={{ background: getColor(item.label) }} />
            <span className='pie-legend-name'>{item.label}</span>
            <span className='pie-legend-val'>
              {Math.round(item.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PDF GENERATOR ────────────────────────────────────────
async function generateMedicalPDF ({
  patientName,
  patientAge,
  patientId,
  diagnosis,
  confidences,
  filename,
  doctorName,
  doctorEmail,
  isPositive,
  shouldDownload = true
}) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const W = 210,
    M = 20
  let y = 0

  // Header background
  doc.setFillColor(10, 107, 94)
  doc.rect(0, 0, W, 38, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('NeuroSwift AI', M, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Intracranial Hemorrhage Detection Report', M, 24)
  doc.text('AI-Assisted Neuroradiology Analysis — Research Use Only', M, 30)

  // Report ID & date
  doc.setFontSize(9)
  doc.text(`Patient ID: ${patientId || 'N/A'}`, W - M, 18, { align: 'right' })
  doc.text(`Date: ${new Date().toLocaleString()}`, W - M, 25, {
    align: 'right'
  })

  y = 50

  // PATIENT INFORMATION section
  doc.setFillColor(245, 247, 250)
  doc.rect(M, y - 5, W - 2 * M, 36, 'F')
  doc.setDrawColor(226, 229, 234)
  doc.rect(M, y - 5, W - 2 * M, 36, 'S')

  doc.setTextColor(10, 107, 94)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PATIENT INFORMATION', M + 4, y + 2)

  doc.setTextColor(74, 85, 104)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const fields = [
    ['Patient Name', patientName || 'N/A'],
    ['Age', patientAge || 'N/A'],
    ['Patient ID', patientId || 'N/A'],
    ['Scan File', filename || 'N/A'],
    ['Attending Physician', doctorName || 'N/A'],
    ['Physician Contact', doctorEmail || 'N/A']
  ]
  fields.forEach(([k, v], i) => {
    const xPos = i % 2 === 0 ? M + 4 : W / 2 + 4
    const yPos = y + 10 + Math.floor(i / 2) * 8
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(74, 85, 104)
    doc.text(`${k}:`, xPos, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(13, 17, 23)
    doc.text(v, xPos + 36, yPos)
  })

  y += 46

  // DIAGNOSIS section
  const dxColor = isPositive ? [192, 57, 43] : [10, 124, 92]
  doc.setFillColor(...dxColor, 0.08)
  doc.setFillColor(
    isPositive ? 253 : 240,
    isPositive ? 242 : 250,
    isPositive ? 242 : 246
  )
  doc.rect(M, y - 5, W - 2 * M, 28, 'F')
  doc.setDrawColor(...dxColor)
  doc.setLineWidth(0.5)
  doc.rect(M, y - 5, W - 2 * M, 28, 'S')
  doc.setLineWidth(0.2)

  doc.setTextColor(...dxColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DIAGNOSTIC FINDING', M + 4, y + 2)

  doc.setFontSize(12)
  doc.text(
    isPositive ? '⚠ HEMORRHAGE DETECTED' : '✓ NO HEMORRHAGE DETECTED',
    M + 4,
    y + 12
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(74, 85, 104)
  doc.text(diagnosis, M + 4, y + 20)

  y += 38

  // PROBABILITY BREAKDOWN
  doc.setTextColor(10, 107, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('HEMORRHAGE SUBTYPE PROBABILITY ANALYSIS', M, y + 2)
  y += 10

  const typeColors = {
    any: [192, 57, 43],
    subdural: [124, 58, 237],
    intraparenchymal: [217, 119, 6],
    subarachnoid: [8, 145, 178],
    intraventricular: [10, 107, 94],
    epidural: [5, 150, 105]
  }

  ;(confidences || []).forEach(item => {
    const pct = item.confidence
    const pctVal = Math.round(pct * 100)
    const typeKey =
      TYPES.find(t => item.label?.toLowerCase().includes(t.key))?.key || 'any'
    const color = typeColors[typeKey] || [10, 107, 94]
    const barW = (W - 2 * M - 60) * pct

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(74, 85, 104)
    doc.text(item.label, M, y + 4)
    doc.setTextColor(13, 17, 23)
    doc.setFont('helvetica', 'bold')
    doc.text(`${pctVal}%`, W - M, y + 4, { align: 'right' })

    doc.setFillColor(230, 234, 238)
    doc.rect(M + 50, y, W - 2 * M - 60, 4, 'F')
    doc.setFillColor(...color)
    doc.rect(M + 50, y, barW, 4, 'F')

    y += 12
  })

  y += 6

  // Clinical notes
  doc.setFillColor(245, 247, 250)
  doc.rect(M, y - 4, W - 2 * M, 44, 'F')
  doc.setDrawColor(226, 229, 234)
  doc.rect(M, y - 4, W - 2 * M, 44, 'S')

  doc.setTextColor(10, 107, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('RADIOLOGICAL FINDINGS', M + 4, y + 4)

  const top = confidences?.[0]
  const topPct = Math.round((top?.confidence || 0) * 100)
  const findingsText =
    confidences?.length > 0
      ? `The AI system analyzed the submitted DICOM CT scan and computed hemorrhage probabilities across six intracranial subtypes. ${
          isPositive
            ? `The highest probability was observed for ${
                top?.label
              } (${topPct}%), indicating a ${
                topPct >= 70 ? 'high' : 'moderate'
              }-confidence positive finding. Urgent clinical correlation is advised.`
            : `No significant hemorrhage signature was detected. Maximum probability was ${topPct}% for ${top?.label}.`
        }`
      : 'No confidence data returned by the model.'

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(74, 85, 104)
  doc.setFontSize(8.5)
  const lines = doc.splitTextToSize(findingsText, W - 2 * M - 8)
  lines.forEach((line, i) => doc.text(line, M + 4, y + 12 + i * 6))

  y += 54

  // Disclaimer
  doc.setFillColor(253, 248, 238)
  doc.rect(M, y, W - 2 * M, 20, 'F')
  doc.setDrawColor(183, 119, 13)
  doc.setLineWidth(0.3)
  doc.rect(M, y, W - 2 * M, 20, 'S')
  doc.setTextColor(183, 119, 13)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('DISCLAIMER', M + 4, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(
    'This report is generated by an AI system for research and assistive purposes only. It does NOT constitute a clinical diagnosis.',
    M + 4,
    y + 12
  )
  doc.text(
    'All findings must be verified by a licensed medical professional before any clinical decisions are made.',
    M + 4,
    y + 18
  )

  // Footer
  doc.setTextColor(139, 149, 161)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'NEUROSWIFT AI · ICH DETECTION SYSTEM · FOR RESEARCH USE ONLY',
    W / 2,
    290,
    { align: 'center' }
  )

  if (shouldDownload) {
    doc.save(`NeuroSwift_Report_${patientId || Date.now()}.pdf`)
  }
  return doc.output('datauristring').split(',')[1]
}

// ─── NAVBAR ───────────────────────────────────────────────
function Navbar ({ activeNav, setActiveNav, theme, toggleTheme }) {
  const navItems = [
    { key: 'portal', label: 'Log In' },
    { key: 'about', label: 'About' }
  ]
  return (
    <nav className='navbar'>
      <div
        className='nav-brand'
        onClick={() => setActiveNav('home')}
        style={{ cursor: 'pointer' }}
      >
        <div className='nav-logo-mark'>🧠</div>
        <div className='nav-brand-text'>
          <div className='nav-brand-name'>NeuroSwift AI</div>
          <div className='nav-brand-sub'>ICH Detection</div>
        </div>
      </div>

      <div className='nav-links'>
        {navItems.map(n => (
          <button
            key={n.key}
            className={`nav-link ${activeNav === n.key ? 'active' : ''}`}
            onClick={() => setActiveNav(n.key)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className='nav-right'>
        <div className='nav-status'>
          <div className='nav-dot' />
          Clinical AI Service Online
        </div>
        <button
          className='theme-toggle'
          onClick={toggleTheme}
          title='Toggle theme'
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}

// ─── LANDING PAGE ─────────────────────────────────────────
function LandingPage ({ setActiveNav }) {
  return (
    <div className='landing-page'>
      <div className='page'>
        {/* Hero */}
        <section className='landing-hero'>
          <div className='hero-eyebrow'>
            <span>●</span> AI-Powered Neuroradiology
          </div>
          <h1 className='hero-title'>
            Detect Intracranial
            <br />
            <em>Hemorrhage</em> Instantly
          </h1>
          <p className='hero-desc'>
            Upload a DICOM CT scan and receive AI-assisted detection of six
            hemorrhage subtypes in seconds — designed for radiologists and
            clinical researchers.
          </p>
          <p className='hero-note'>
            Professional workflow for hospitals: role-based access, persistent
            reports, and retrievable patient records.
          </p>
          <div className='hero-trust-row'>
            <span className='trust-pill'>DICOM Compatible</span>
            <span className='trust-pill'>Role Based Access</span>
            <span className='trust-pill'>PDF Clinical Reports</span>
          </div>
          <div className='hero-cta-row'>
            <button
              className='btn-primary'
              onClick={() => setActiveNav('portal')}
            >
              Analyze Report →
            </button>
            <button
              className='btn-outline'
              onClick={() => setActiveNav('portal')}
            >
              Doctor / Patient Portal
            </button>
          </div>
        </section>

        {/* Stats */}
        <div className='stats-strip'>
          {[
            { val: '870K+', label: 'Training Images' },
            { val: '6', label: 'Hemorrhage Subtypes' },
            { val: 'Ensemble', label: 'Model Architecture' },
            { val: '< 30s', label: 'Analysis Time' }
          ].map(s => (
            <div className='stat-item' key={s.label}>
              <div className='stat-val'>{s.val}</div>
              <div className='stat-label'>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className='section-header'>
          <div className='section-eyebrow'>Capabilities</div>
          <h2 className='section-title'>Everything you need for CT Analysis</h2>
        </div>

        <div className='features-grid'>
          {[
            {
              icon: '🔬',
              title: 'Six Subtype Classification',
              desc: 'Detect and differentiate subdural, epidural, subarachnoid, intraparenchymal, intraventricular, and any-type hemorrhages with per-class confidence.'
            },
            {
              icon: '📊',
              title: 'Confidence Scoring',
              desc: 'Visual probability breakdowns with bar charts and interactive donut charts — hover to see exact subtype probabilities.'
            },
            {
              icon: '📄',
              title: 'Clinical PDF Reports',
              desc: 'Generate properly formatted medical reports with diagnosis, findings, probability breakdown, and radiological notes — downloadable instantly.'
            },
            {
              icon: '👨‍⚕️',
              title: 'Doctor Portal',
              desc: 'Authenticated doctor workspace to analyze scans, save reports, manage patient records, and generate patient IDs.'
            },
            {
              icon: '🧑‍💼',
              title: 'Patient Portal',
              desc: 'Patients can retrieve their complete diagnostic report using a 6-character ID provided by their doctor.'
            },
            {
              icon: '🔒',
              title: 'Secure & Authenticated',
              desc: 'JWT-based doctor authentication, bcrypt password hashing, and MongoDB-backed persistent report storage.'
            }
          ].map(f => (
            <div className='feature-card' key={f.title}>
              <div className='feature-icon'>{f.icon}</div>
              <div className='feature-title'>{f.title}</div>
              <div className='feature-desc'>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className='section-header' style={{ marginTop: 24 }}>
          <div className='section-eyebrow'>Workflow</div>
          <h2 className='section-title'>How it Works</h2>
        </div>

        <div className='steps-grid'>
          {[
            {
              n: '01',
              title: 'Upload DICOM',
              desc: 'Upload a .dcm CT scan file from any standard imaging source.'
            },
            {
              n: '02',
              title: 'AI Analysis',
              desc: 'ResNet50 + EfficientNet ensemble processes the scan via Hugging Face Spaces.'
            },
            {
              n: '03',
              title: 'Review Results',
              desc: 'View diagnosis, confidence breakdown, processed CT image, and clinical summary.'
            },
            {
              n: '04',
              title: 'Save & Share',
              desc: 'Save the report, generate a patient ID, and download a professional PDF.'
            }
          ].map(s => (
            <div className='step-card' key={s.n}>
              <div className='step-number'>{s.n}</div>
              <div className='step-title'>{s.title}</div>
              <div className='step-desc'>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '20px 0 80px' }}>
          <div className='section-eyebrow' style={{ marginBottom: 12 }}>
            Get Started
          </div>
          <h2 className='section-title' style={{ marginBottom: 20 }}>
            Ready to analyze a scan?
          </h2>
          <div className='hero-cta-row'>
            <button
              className='btn-primary'
              onClick={() => setActiveNav('portal')}
            >
              Analyze Report →
            </button>
            <button
              className='btn-outline'
              onClick={() => setActiveNav('about')}
            >
              Learn About the Project
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ANALYZE PAGE ─────────────────────────────────────────
function AnalyzePage () {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [timestamp, setTimestamp] = useState(null)
  const fileInputRef = useRef(null)

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    const toastId = toast.loading('Uploading scan...')
    try {
      const formData = new FormData()
      formData.append('files', file, file.name)
      const uploadRes = await fetch(`${SPACE_URL}/gradio_api/upload`, {
        method: 'POST',
        body: formData
      })
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
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
      if (!callRes.ok) throw new Error(`Call failed: ${callRes.status}`)
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
      if (!finalData) throw new Error('No data received from model')
      setResult(finalData)
      setTimestamp(Date.now())
      toast.success('Analysis complete!', { id: toastId })
    } catch (err) {
      setError(err.message)
      toast.error(err.message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  const diagnosis = result?.[0] ?? ''
  const confidences = result?.[1]?.confidences || []
  const ctImage = result?.[2]
  const topConf = confidences[0]
  const topPct = Math.round((topConf?.confidence || 0) * 100)

  const cleanDx = diagnosis.toLowerCase()
  const isUncertain = cleanDx.includes('uncertain')
  const isPositive =
    !isUncertain &&
    (cleanDx.includes('hemorrhage') || cleanDx.includes('detected'))
  const statusClass = isUncertain
    ? 'uncertain'
    : isPositive
    ? 'positive'
    : 'negative'

  const ctImageSrc = ctImage
    ? ctImage.url
      ? ctImage.url.startsWith('http')
        ? ctImage.url
        : `${SPACE_URL}${ctImage.url}`
      : typeof ctImage === 'string'
      ? ctImage.startsWith('http')
        ? ctImage
        : `${SPACE_URL}/gradio_api/file=${ctImage}`
      : null
    : null

  return (
    <div className='portal-page'>
      <div className='portal-header'>
        <div className='portal-header-left'>
          <h2>CT Scan Analyzer</h2>
          <p>Upload a DICOM file for AI-assisted hemorrhage detection</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className='nav-status'>
            <div className='nav-dot' />
            ResNet50 · RSNA-ICH
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className='section-label'>Input — DICOM CT Scan</div>
      <div
        className={`upload-zone ${file ? 'has-file' : ''}`}
        onClick={() => fileInputRef.current.click()}
      >
        <div className='upload-icon'>{file ? '✓' : '↑'}</div>
        {file ? (
          <>
            <div className='upload-main'>File loaded</div>
            <div className='file-chip'>
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
            <div className='upload-sub' style={{ marginTop: 8 }}>
              Click to replace
            </div>
          </>
        ) : (
          <>
            <div className='upload-main'>
              Drop DICOM file or click to browse
            </div>
            <div className='upload-sub'>Only .dcm files are supported</div>
          </>
        )}
        <input
          ref={fileInputRef}
          type='file'
          accept='.dcm'
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0]
            if (f) {
              setFile(f)
              setResult(null)
              setError(null)
              toast.success(`Loaded: ${f.name}`)
            }
          }}
        />
      </div>

      <button
        className='btn-analyze'
        onClick={handleAnalyze}
        disabled={!file || loading}
      >
        {loading ? 'Analyzing...' : 'Run Analysis'}
      </button>

      {error && (
        <div className='error-box'>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className='loading-wrap'>
          <div className='loading-spinner' />
          <div className='loading-text'>Processing DICOM scan</div>
          <div className='loading-sub'>This may take 15–30 seconds</div>
        </div>
      )}

      {result && !loading && (
        <div className='results-wrap'>
          {/* Diagnosis banner */}
          <div className={`dx-banner ${statusClass}`}>
            <div className='dx-left'>
              <div className='dx-icon'>
                {isPositive ? '!' : isUncertain ? '⚠' : '✓'}
              </div>
              <div>
                <div className='dx-label'>
                  {isPositive
                    ? 'Hemorrhage Detected'
                    : isUncertain
                    ? 'Uncertain'
                    : 'No Hemorrhage'}
                </div>
                <div className='dx-text'>{diagnosis}</div>
              </div>
            </div>
            {topPct > 0 && <div className='dx-pill'>{topPct}% confidence</div>}
          </div>

          {/* Stat cards */}
          {confidences.length > 0 && (
            <div className='stats-row'>
              <div className='mini-stat'>
                <div className='mini-stat-label'>Top Finding</div>
                <div className='mini-stat-val'>
                  {TYPES.find(t =>
                    topConf?.label?.toLowerCase().includes(t.key)
                  )?.short || 'N/A'}
                </div>
              </div>
              <div className='mini-stat'>
                <div className='mini-stat-label'>Confidence</div>
                <div className='mini-stat-val'>{topPct}%</div>
              </div>
              <div className='mini-stat'>
                <div className='mini-stat-label'>Subtypes Scored</div>
                <div className='mini-stat-val'>{confidences.length}</div>
              </div>
            </div>
          )}

          {/* Charts */}
          {confidences.length > 0 && (
            <div className='two-col'>
              <div className='result-card'>
                <div className='card-head'>Distribution</div>
                <PieChart confidences={confidences} />
              </div>
              <div className='result-card'>
                <div className='card-head'>Subtype Probabilities</div>
                <div className='bars-wrap'>
                  {confidences.map((item, i) => (
                    <div className='bar-row' key={i}>
                      <div className='bar-label-row'>
                        <span className='bar-name'>{item.label}</span>
                        <span className='bar-pct'>
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </div>
                      <div className='bar-track'>
                        <div
                          className='bar-fill'
                          style={{
                            width: `${Math.round(item.confidence * 100)}%`,
                            background: getColor(item.label)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CT Image */}
          {ctImageSrc && (
            <div className='result-card'>
              <div className='card-head'>Processed CT Image</div>
              <div className='ct-img-wrap'>
                <img src={ctImageSrc} alt='Processed CT scan' />
                <div className='ct-img-footer'>
                  {file?.name} · Windowed for hemorrhage detection
                </div>
              </div>
            </div>
          )}

          {/* Download report */}
          <div className='result-card'>
            <div className='card-head'>Analysis Report</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: 4
                  }}
                >
                  AI Neuroradiology Report
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontFamily: 'DM Mono, monospace'
                  }}
                >
                  {timestamp ? new Date(timestamp).toLocaleString() : ''}
                </div>
              </div>
              <button
                className='btn-pdf'
                onClick={() =>
                  generateMedicalPDF({
                    patientName: 'N/A',
                    patientAge: 'N/A',
                    patientId: 'ANON',
                    diagnosis,
                    confidences,
                    filename: file?.name,
                    doctorName: 'N/A',
                    doctorEmail: 'N/A',
                    isPositive
                  })
                }
              >
                ↓ Download PDF Report
              </button>
            </div>
          </div>

          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              padding: '12px 16px',
              background: 'var(--amber-bg)',
              border: '1px solid rgba(183,119,13,0.15)',
              borderRadius: 'var(--r-md)'
            }}
          >
            ⚕ This report is AI-generated for research purposes only. Please
            consult your doctor for clinical advice.
          </div>
        </div>
      )}
      <div className='page-footer' style={{ marginTop: 40 }}>
        NEUROSWIFT AI · ICH DETECTION · RESEARCH USE ONLY
      </div>
    </div>
  )
}

// ─── ROLE SELECTION ───────────────────────────────────────
function RoleSelectPage ({ onSelectRole }) {
  return (
    <div className='role-select-page'>
      <div className='section-eyebrow' style={{ marginBottom: 12 }}>
        Portal Access
      </div>
      <h2 className='role-select-title'>Who are you?</h2>
      <p className='role-select-sub'>
        Select your role to access the appropriate portal
      </p>
      <div className='role-cards'>
        <div className='role-card' onClick={() => onSelectRole('doctor')}>
          <span className='role-card-emoji'>👨‍⚕️</span>
          <div className='role-card-title'>Doctor</div>
          <div className='role-card-desc'>
            Access the doctor portal to upload CT scans, analyze results, save
            reports, and manage patient records.
          </div>
          <div className='role-card-arrow'>Sign In as Doctor →</div>
        </div>
        <div className='role-card' onClick={() => onSelectRole('patient')}>
          <span className='role-card-emoji'>🧑‍💼</span>
          <div className='role-card-title'>Patient</div>
          <div className='role-card-desc'>
            Retrieve your diagnostic report using the 6-character Patient ID
            provided by your doctor after your scan.
          </div>
          <div className='role-card-arrow'>View My Report →</div>
        </div>
      </div>
    </div>
  )
}

// ─── DOCTOR LOGIN ─────────────────────────────────────────
function DoctorLogin ({ onLogin, onBack }) {
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password')
      return
    }
    setLoading(true)
    const toastId = toast.loading('Signing in...')
    try {
      const res = await fetch(`${API}/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      localStorage.setItem('doctor_token', data.token)
      localStorage.setItem('doctor_name', data.name)
      localStorage.setItem('doctor_email', data.email)
      toast.success(`Welcome, Dr. ${data.name}!`, { id: toastId })
      onLogin(data)
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!name || !email || !password) {
      toast.error('Please fill all fields')
      return
    }
    setLoading(true)
    const toastId = toast.loading('Creating account...')
    try {
      const res = await fetch(`${API}/doctor/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      toast.success('Registration successful. Please sign in.', { id: toastId })
      setMode('signin')
      setPassword('')
    } catch (err) {
      toast.error(err.message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='auth-page'>
      <div className='auth-card'>
        <button className='auth-back-btn' onClick={onBack}>
          ← Back
        </button>
        <div className='auth-card-header'>
          <div className='auth-icon'>👨‍⚕️</div>
          <h2 className='auth-title'>
            {mode === 'signin' ? 'Doctor Sign In' : 'Doctor Register'}
          </h2>
          <p className='auth-sub'>
            {mode === 'signin'
              ? 'Access your clinical workspace'
              : 'Create your doctor account to start using the portal'}
          </p>
          <p className='auth-hint'>
            Use your registered doctor credentials to access scan upload and
            report generation tools.
          </p>
        </div>
        <div className='auth-mode-switch'>
          <button
            className={`auth-mode-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => setMode('signin')}
            type='button'
          >
            Sign In
          </button>
          <button
            className={`auth-mode-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
            type='button'
          >
            Register
          </button>
        </div>
        {mode === 'register' && (
          <div className='form-group'>
            <label className='form-label'>Full Name</label>
            <input
              className='form-input'
              type='text'
              placeholder='Dr. John Doe'
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}
        <div className='form-group'>
          <label className='form-label'>Email Address</label>
          <input
            className='form-input'
            type='email'
            placeholder='doctor@hospital.com'
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div className='form-group'>
          <label className='form-label'>Password</label>
          <input
            className='form-input'
            type='password'
            placeholder='••••••••'
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <button
          className='btn-full auth-submit-btn'
          onClick={mode === 'signin' ? handleLogin : handleRegister}
          disabled={loading}
        >
          {mode === 'signin'
            ? loading
              ? 'Signing in...'
              : 'Sign In'
            : loading
            ? 'Registering...'
            : 'Create Account'}
        </button>
        <p className='auth-footer-text'>
          ⚕️ Access restricted to authorized medical personnel only
        </p>
      </div>
    </div>
  )
}

// ─── DOCTOR PORTAL ────────────────────────────────────────
function DoctorPortal ({ onLogout }) {
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

  function getHemorrhagePct (confidences, diagnosis) {
    if (!Array.isArray(confidences) || confidences.length === 0) {
      const dx = (diagnosis || '').toLowerCase()
      if (!dx) return null
      if (dx.includes('uncertain')) return null
      if (dx.includes('no hemorrhage')) return 0
      return null
    }

    const any = confidences.find(
      c => (c?.label || '').toLowerCase().includes('any') // "Any Hemorrhage"
    )
    const top = confidences
      .slice()
      .sort((a, b) => (b?.confidence || 0) - (a?.confidence || 0))[0]
    const v = (any?.confidence ?? top?.confidence ?? null)
    if (typeof v !== 'number') return null
    return Math.round(v * 100)
  }

  const pastReportsWithTrend = useMemo(() => {
    const byPatientKey = new Map()
    const out = pastReports.map(r => ({
      ...r,
      _hemoPct: getHemorrhagePct(r.confidences, r.diagnosis)
    }))

    // compare chronologically (oldest -> newest) per patient
    const chronological = out
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    const trendById = new Map()
    for (const r of chronological) {
      const key = `${(r.patientName || '').toLowerCase()}|${r.patientAge || ''}`
      const prev = byPatientKey.get(key)
      const curr = r._hemoPct

      let trend = { label: '—', kind: 'none', delta: null }
      if (typeof curr === 'number' && typeof prev === 'number') {
        const delta = curr - prev
        if (Math.abs(delta) <= 2) {
          trend = { label: `Stable (${curr}%)`, kind: 'stable', delta }
        } else if (delta < 0) {
          trend = { label: `Better (${curr}%)`, kind: 'better', delta }
        } else {
          trend = { label: `Worse (${curr}%)`, kind: 'worse', delta }
        }
      } else if (typeof curr === 'number') {
        trend = { label: `Baseline (${curr}%)`, kind: 'baseline', delta: null }
      }

      trendById.set(r.patientId, trend)
      byPatientKey.set(key, curr)
    }

    return out.map(r => ({
      ...r,
      _trend: trendById.get(r.patientId) || { label: '—', kind: 'none', delta: null }
    }))
  }, [pastReports])

  const handleDeleteReport = async patientId => {
    const toastId = toast.loading('Deleting...')
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
    const toastId = toast.loading('Saving report...')
    try {
      const reportPdfBase64 = await generateMedicalPDF({
        patientName,
        patientAge,
        patientId: savedId || 'PENDING',
        diagnosis: result[0] ?? '',
        confidences: result[1]?.confidences ?? [],
        filename: file?.name,
        doctorName,
        doctorEmail,
        isPositive,
        shouldDownload: false
      })

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
          filename: file?.name,
          reportPdfBase64
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
    <div className='portal-page'>
      <div className='portal-header'>
        <div className='portal-header-left'>
          <h2>Doctor Portal</h2>
          <p>
            Dr. {doctorName} · {doctorEmail}
          </p>
        </div>
        <div className='portal-header-actions'>
          <button
            className='btn-ghost doctor-action-btn'
            type='button'
            onClick={() => window.open(DEPLOYED_MODEL_URL, '_blank', 'noopener,noreferrer')}
          >
            Open AI Model
          </button>
          <button
            className='btn-ghost doctor-action-btn'
            onClick={loadPastReports}
            disabled={loadingPast}
          >
            {showPast ? 'Hide Reports' : '📋 Past Reports'}
          </button>
          <button className='btn-danger doctor-action-btn' onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Past Reports */}
      {showPast && (
        <div className='doctor-past-reports'>
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
            <div className='reports-table-wrap'>
              <table className='reports-table'>
                <thead>
                  <tr>
                    <th>Patient ID</th>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Diagnosis</th>
                    <th>Trend</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pastReportsWithTrend.map(r => (
                    <tr key={r.patientId}>
                      <td
                        style={{
                          fontFamily: 'DM Mono, monospace',
                          color: 'var(--accent)',
                          letterSpacing: 2
                        }}
                      >
                        {r.patientId}
                      </td>
                      <td>{r.patientName}</td>
                      <td>{r.patientAge || '—'}</td>
                      <td>
                        <span
                          className={
                            r.diagnosis?.toLowerCase().includes('hemorrhage')
                              ? 'badge-positive'
                              : 'badge-negative'
                          }
                        >
                          {r.diagnosis?.slice(0, 28)}
                          {r.diagnosis?.length > 28 ? '…' : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`trend-badge ${r._trend.kind}`}>
                          {r._trend.label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className='btn-report-delete'
                          onClick={() => handleDeleteReport(r.patientId)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className='divider' />
        </div>
      )}

      {/* Patient Info */}
      <div className='section-label'>Patient Information</div>
      <div className='form-row' style={{ marginBottom: 24 }}>
        <div className='form-group' style={{ marginBottom: 0 }}>
          <label className='form-label'>Patient Name *</label>
          <input
            className='form-input'
            placeholder='Full name'
            value={patientName}
            onChange={e => setPatientName(e.target.value)}
          />
        </div>
        <div className='form-group' style={{ marginBottom: 0 }}>
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
      <div className='section-label'>CT Scan Upload</div>
      <div
        className={`upload-zone ${file ? 'has-file' : ''}`}
        onClick={() => document.getElementById('dcm-doctor').click()}
      >
        <div className='upload-icon'>{file ? '✓' : '↑'}</div>
        {file ? (
          <>
            <div className='upload-main'>File loaded</div>
            <div className='file-chip'>
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          </>
        ) : (
          <>
            <div className='upload-main'>Drop DICOM or click to browse</div>
            <div className='upload-sub'>Only .dcm files</div>
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
      >
        {loading ? 'Analyzing...' : 'Run Analysis'}
      </button>

      {loading && (
        <div className='loading-wrap'>
          <div className='loading-spinner' />
          <div className='loading-text'>Running inference</div>
          <div className='loading-sub'>Processing DICOM — 15–30 seconds</div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className='results-wrap doctor-results-wrap'>
          <div className={`dx-banner ${isPositive ? 'positive' : 'negative'}`}>
            <div className='dx-left'>
              <div className='dx-icon'>{isPositive ? '!' : '✓'}</div>
              <div>
                <div className='dx-label'>
                  {isPositive ? 'Hemorrhage Detected' : 'No Hemorrhage'}
                </div>
                <div className='dx-text'>{diagnosis}</div>
              </div>
            </div>
          </div>

          <div className='two-col'>
            <div className='result-card'>
              <div className='card-head'>Distribution</div>
              <PieChart confidences={confidences} />
            </div>
            <div className='result-card'>
              <div className='card-head'>Subtype Probabilities</div>
              <div className='bars-wrap'>
                {confidences.map((item, i) => (
                  <div className='bar-row' key={i}>
                    <div className='bar-label-row'>
                      <span className='bar-name'>{item.label}</span>
                      <span className='bar-pct'>
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </div>
                    <div className='bar-track'>
                      <div
                        className='bar-fill'
                        style={{
                          width: `${Math.round(item.confidence * 100)}%`,
                          background: getColor(item.label)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!savedId ? (
            <button className='btn-save' onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Report & Generate Patient ID'}
            </button>
          ) : (
            <div className='saved-box'>
              <div className='saved-title'>✓ Report Saved Successfully</div>
              <div className='saved-sub'>Share this ID with your patient:</div>
              <div className='saved-id'>{savedId}</div>
              <div className='saved-note'>
                Patient can retrieve their report using this ID on the Patient
                Portal
              </div>
              <button
                className='btn-pdf'
                onClick={() =>
                  generateMedicalPDF({
                    patientName,
                    patientAge,
                    patientId: savedId,
                    diagnosis,
                    confidences,
                    filename: file?.name,
                    doctorName,
                    doctorEmail,
                    isPositive
                  })
                }
              >
                ↓ Download PDF Report
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PATIENT PORTAL ───────────────────────────────────────
function PatientPortal () {
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
    <div className='patient-page'>
      <div className='portal-header' style={{ marginBottom: 24 }}>
        <div className='portal-header-left'>
          <h2>Patient Portal</h2>
          <p>Retrieve your diagnostic report using your Patient ID</p>
        </div>
      </div>

      {/* Search */}
      <div className='patient-search-card'>
        <div className='section-label'>Your Patient ID</div>
        <div className='search-row'>
          <input
            className='form-input search-id-input'
            placeholder='AB12CD'
            value={patientId}
            maxLength={6}
            onChange={e => setPatientId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            className='btn-search'
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

      {/* Report card — always shown, blank if no report */}
      <div className='patient-report-card'>
        <div className='report-card-header'>
          <div>
            <div className='report-card-title'>Diagnostic Report</div>
            <div className='report-card-sub' style={{ marginTop: 4 }}>
              {report
                ? `Patient ID: ${report.patientId}`
                : 'Enter your Patient ID above to retrieve your report'}
            </div>
          </div>
          {report && (
            <button
              className='btn-pdf'
              onClick={() => window.open(`${API}/reports/${report.patientId}/pdf`, '_blank')}
            >
              ↓ Download PDF
            </button>
          )}
        </div>

        <div className='report-body'>
          {/* Patient info grid */}
          <div className='section-label'>Patient Information</div>
          <div className='report-info-grid'>
            {[
              ['Patient Name', report?.patientName],
              ['Age', report?.patientAge || 'N/A'],
              ['Patient ID', report?.patientId],
              [
                'Scan Date',
                report ? new Date(report.createdAt).toLocaleString() : null
              ],
              ['Attending Physician', report?.doctorName],
              ['Physician Contact', report?.doctorEmail]
            ].map(([label, val]) => (
              <div className='report-info-item' key={label}>
                <div className='report-info-label'>{label}</div>
                {val ? (
                  <div
                    className='report-info-val'
                    style={
                      label === 'Patient ID'
                        ? {
                            fontFamily: 'DM Mono, monospace',
                            color: 'var(--accent)',
                            letterSpacing: 3,
                            fontSize: 16
                          }
                        : {}
                    }
                  >
                    {val}
                  </div>
                ) : (
                  <div className='report-info-val blank' />
                )}
              </div>
            ))}
          </div>

          <div className='divider' />

          {/* Diagnosis */}
          <div className='section-label'>Diagnosis</div>
          {report ? (
            <div
              className={`dx-banner ${isPositive ? 'positive' : 'negative'}`}
              style={{ marginBottom: 20 }}
            >
              <div className='dx-left'>
                <div className='dx-icon'>{isPositive ? '!' : '✓'}</div>
                <div>
                  <div className='dx-label'>
                    {isPositive ? 'Hemorrhage Detected' : 'No Hemorrhage'}
                  </div>
                  <div className='dx-text'>{report.diagnosis}</div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                height: 72,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                opacity: 0.5,
                marginBottom: 20
              }}
            />
          )}

          {/* Probability bars */}
          <div className='section-label'>Subtype Probabilities</div>
          {report?.confidences?.length > 0 ? (
            <div className='bars-wrap' style={{ marginBottom: 20 }}>
              {report.confidences.map((item, i) => (
                <div className='bar-row' key={i}>
                  <div className='bar-label-row'>
                    <span className='bar-name'>{item.label}</span>
                    <span className='bar-pct'>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                  <div className='bar-track'>
                    <div
                      className='bar-fill'
                      style={{
                        width: `${Math.round(item.confidence * 100)}%`,
                        background: getColor(item.label)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                marginBottom: 20
              }}
            >
              {[1, 2, 3, 4].map(i => (
                <div key={i}>
                  <div
                    style={{
                      height: 12,
                      background: 'var(--border)',
                      borderRadius: 4,
                      marginBottom: 8,
                      width: `${60 + i * 8}%`,
                      opacity: 0.4
                    }}
                  />
                  <div
                    style={{
                      height: 5,
                      background: 'var(--border)',
                      borderRadius: 4,
                      width: '100%',
                      opacity: 0.3
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className='disclaimer-box'>
            ⚕ This report is AI-generated for research and assistive purposes
            only. It does not constitute a clinical diagnosis. Please consult
            your physician for medical advice.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ABOUT PAGE ───────────────────────────────────────────
function AboutPage () {
  const TEAM = [
    {
      name: 'Chenika',
      role: 'Full-Stack Developer',
      avatar: 'CH',
      color: '#0a6b5e',
      desc: 'MERN stack developer responsible for designing and engineering the full-stack architecture — React frontend, Node/Express backend, and MongoDB data layer.',
      tags: ['React', 'Node.js', 'Express', 'MongoDB', 'REST APIs', 'UI Design']
    },
    {
      name: 'Charanjot Kaur',
      role: 'ML / DL Engineer',
      avatar: 'CK',
      color: '#7c3aed',
      desc: 'Leads the machine learning pipeline — from raw DICOM preprocessing and windowing to training ResNet50 and EfficientNet ensembles. Deployed inference API on Hugging Face Spaces.',
      tags: [
        'Deep Learning',
        'PyTorch',
        'Computer Vision',
        'DICOM',
        'ResNet',
        'Hugging Face'
      ]
    },
    {
      name: 'Ankush Rana',
      role: 'Research Lead',
      avatar: 'AR',
      color: '#0891b2',
      desc: 'Drives the research backbone — conducting literature reviews on ICH detection, evaluating model performance against clinical benchmarks, and ensuring neuroradiology standards compliance.',
      tags: [
        'Clinical Research',
        'Literature Review',
        'Model Evaluation',
        'Medical Imaging',
        'Validation'
      ]
    }
  ]

  return (
    <div className='about-page'>
      <div className='about-hero'>
        <div className='section-eyebrow' style={{ marginBottom: 14 }}>
          About the Project
        </div>
        <h1 className='about-hero-title'>
          NeuroSwift <em>AI</em>
        </h1>
        <p className='about-hero-sub'>
          AI-Assisted Intracranial Hemorrhage Detection from DICOM CT Scans
        </p>
      </div>

      <div className='about-summary'>
        <div className='about-summary-body'>
          <p>
            NeuroSwift AI is an end-to-end deep learning system designed to
            assist clinicians in rapid detection of intracranial hemorrhage
            (ICH) from non-contrast CT scans. Built on the RSNA Intracranial
            Hemorrhage Detection dataset — comprising over 870,000 labeled DICOM
            images — the system classifies six distinct hemorrhage subtypes.
          </p>
          <p>
            The model ensemble (ResNet50 + EfficientNet) delivers per-class
            probability confidence scores alongside a windowed CT visualization.
            Results are presented through a clinical-grade web interface with
            downloadable AI-generated PDF reports intended for radiologist
            review.
          </p>
          <p>
            This tool is designed strictly for research and assistive purposes
            and is not a replacement for qualified neuroradiological assessment.
          </p>
        </div>
        <div className='about-stats'>
          {[
            { val: '870K+', label: 'Dataset Images' },
            { val: '6', label: 'Hemorrhage Types' },
            { val: 'Ensemble', label: 'Architecture' },
            { val: 'HF Spaces', label: 'Deployment' }
          ].map(s => (
            <div className='about-stat' key={s.label}>
              <div className='about-stat-val'>{s.val}</div>
              <div className='about-stat-label'>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className='section-label' style={{ marginBottom: 20 }}>
        Development Team
      </div>
      <div className='team-grid'>
        {TEAM.map(m => (
          <div
            className='team-card'
            key={m.name}
            style={{ '--member-color': m.color }}
          >
            <div
              className='team-avatar'
              style={{
                background: `${m.color}15`,
                border: `1px solid ${m.color}30`,
                color: m.color
              }}
            >
              {m.avatar}
            </div>
            <div className='team-name'>{m.name}</div>
            <div className='team-role' style={{ color: m.color }}>
              {m.role}
            </div>
            <p className='team-desc'>{m.desc}</p>
            <div className='team-tags'>
              {m.tags.map(t => (
                <span
                  className='team-tag'
                  key={t}
                  style={{
                    borderColor: `${m.color}30`,
                    color: m.color,
                    background: `${m.color}0d`
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className='page-footer'>
        NEUROSWIFT AI · ACADEMIC PROJECT · 2024–2025
      </div>
    </div>
  )
}

// ─── PORTAL ROUTER ────────────────────────────────────────
function PortalPage () {
  const [role, setRole] = useState(null)
  const [doctorLoggedIn, setDoctorLoggedIn] = useState(
    !!localStorage.getItem('doctor_token')
  )

  if (!role) return <RoleSelectPage onSelectRole={setRole} />

  if (role === 'doctor') {
    if (doctorLoggedIn)
      return (
        <DoctorPortal
          onLogout={() => {
            setDoctorLoggedIn(false)
            setRole(null)
          }}
        />
      )
    return (
      <DoctorLogin
        onLogin={() => setDoctorLoggedIn(true)}
        onBack={() => setRole(null)}
      />
    )
  }

  if (role === 'patient')
    return (
      <div>
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <button className='auth-back-btn' onClick={() => setRole(null)}>
            ← Back to Portal Selection
          </button>
        </div>
        <PatientPortal />
      </div>
    )
}

function Footer ({ onNavigate }) {
  return (
    <footer className='site-footer'>
      <div className='site-footer-inner'>
        <div className='footer-top'>
          <div className='footer-brand'>
            <div className='footer-logo'>🧠</div>
            <div>
              <div className='footer-name'>NeuroSwift AI</div>
              <div className='footer-sub'>Intracranial Hemorrhage Detection</div>
            </div>
          </div>

          <div className='footer-links'>
            <button className='footer-link' onClick={() => onNavigate('home')}>
              Home
            </button>
            <button className='footer-link' onClick={() => onNavigate('portal')}>
              Portal
            </button>
            <button className='footer-link' onClick={() => onNavigate('about')}>
              About
            </button>
          </div>
        </div>

        <div className='footer-bottom'>
          <div className='footer-disclaimer'>
            AI-generated outputs are for research/assistive use only and do not
            constitute a clinical diagnosis.
          </div>
          <div className='footer-meta'>
            © {new Date().getFullYear()} NeuroSwift · Built with MERN + Hugging
            Face Spaces
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── ROOT ─────────────────────────────────────────────────
export default function App () {
  const [activeNav, setActiveNav] = useState('home')
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('neuroscan-theme')
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('neuroscan-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  // Apply theme on mount/update
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className='app-shell' data-theme={theme}>
      <Navbar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      {activeNav === 'home' && <LandingPage setActiveNav={setActiveNav} />}
      {activeNav === 'analyze' && <AnalyzePage />}
      {activeNav === 'portal' && <PortalPage />}
      {activeNav === 'about' && <AboutPage />}
      <Footer onNavigate={setActiveNav} />
    </div>
  )
}
