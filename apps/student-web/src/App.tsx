import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ENDPOINTS } from '@attend/shared';
import FaceCapture from './FaceCapture';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

type College = { id: string; name: string };
type Step = 'lookup' | 'check-email' | 'id-card' | 'faces' | 'pending' | 'done' | 'already';
type IdDetect = {
  bbox: number[];
  image_width: number;
  image_height: number;
  det_score: number;
  ocr_name?: string;
  ocr_reg_no?: string;
  name_match?: boolean;
  reg_match?: boolean;
  text_match?: boolean;
};

export default function App() {
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('lookup');
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeId, setCollegeId] = useState('');
  const [regNo, setRegNo] = useState('');
  const [session, setSession] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentReg, setStudentReg] = useState('');
  const [idCard, setIdCard] = useState<File | null>(null);
  const [idDetect, setIdDetect] = useState<IdDetect | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');
  const [emailWarning, setEmailWarning] = useState('');
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [collegesError, setCollegesError] = useState('');
  const [idCardPreview, setIdCardPreview] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);

  const loadColleges = (attempt = 1) => {
    setCollegesLoading(true);
    setCollegesError('');
    api.get(ENDPOINTS.PUBLIC_COLLEGES, { timeout: 15000 }).then(({ data }) => {
      const list = Array.isArray(data) ? data : [];
      setColleges(list);
      setCollegesLoading(false);
      if (!list.length) setCollegesError('No colleges available.');
    }).catch((err) => {
      if (attempt < 2 && (err?.code === 'ECONNABORTED' || !err?.response)) {
        loadColleges(attempt + 1);
        return;
      }
      setCollegesLoading(false);
      setCollegesError(typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : 'Could not load colleges. Try again.');
    });
  };

  useEffect(() => {
    loadColleges();
  }, []);

  useEffect(() => {
    const token = params.get('token');
    if (!token) return;
    setBusy(true);
    setError('');
    api
      .get(ENDPOINTS.PUBLIC_STUDENT_VERIFY, { params: { token } })
      .then(({ data }) => {
        setSession(data.session_token);
        setStudentName(data.student?.name ?? '');
        setStudentReg(data.student?.reg_no ?? '');
        try {
          sessionStorage.setItem('attend_reg_session', JSON.stringify({
            session: data.session_token,
            name: data.student?.name ?? '',
            reg: data.student?.reg_no ?? '',
          }));
        } catch {}
        setStep('id-card');
      })
      .catch((err) => {
        try {
          const saved = JSON.parse(sessionStorage.getItem('attend_reg_session') || '');
          if (saved?.session) {
            setSession(saved.session);
            setStudentName(saved.name || '');
            setStudentReg(saved.reg || '');
            setStep('id-card');
            return;
          }
        } catch {}
        const detail = err?.response?.data?.detail || 'Verification link is invalid or expired.';
        if (typeof detail === 'string' && detail.toLowerCase().includes('already enrolled')) {
          setStep('already');
          return;
        }
        setError(detail);
      })
      .finally(() => setBusy(false));
  }, [params]);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post(ENDPOINTS.PUBLIC_STUDENT_LOOKUP, { college_id: collegeId, reg_no: regNo.trim() });
      if (data?.status === 'already_enrolled') {
        setStep('already');
        return;
      }
      setVerifyUrl(data?.verify_url || '');
      setEmailWarning(data?.email_warning || '');
      setStep('check-email');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not look up that registration number.');
    } finally {
      setBusy(false);
    }
  };

  const loadIdPreview = async (file: File) => {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const heic = type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
    const local = URL.createObjectURL(file);
    if (!heic) {
      setIdCardPreview(local);
      return;
    }
    setPreviewBusy(true);
    setIdCardPreview('');
    try {
      const form = new FormData();
      form.append('id_card', file);
      const { data } = await api.post(ENDPOINTS.PUBLIC_STUDENT_ID_PREVIEW, form, {
        headers: { Authorization: `Bearer ${session}` },
        responseType: 'blob',
      });
      setIdCardPreview(URL.createObjectURL(data));
    } catch {
      setIdCardPreview('');
      setError('Could not preview this photo. Try exporting it as JPEG.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const uploadId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idCard) return;
    setError('');
    setBusy(true);
    const form = new FormData();
    try {
      form.append('id_card', idCard);
      const { data } = await api.post(ENDPOINTS.PUBLIC_STUDENT_ID_CARD, form, {
        headers: { Authorization: `Bearer ${session}` },
        timeout: 120000,
      });
      if (data?.bbox) {
        const detect = {
          bbox: data.bbox,
          image_width: data.image_width,
          image_height: data.image_height,
          det_score: data.det_score,
          ocr_name: data.ocr_name || '',
          ocr_reg_no: data.ocr_reg_no || '',
          name_match: Boolean(data.name_match),
          reg_match: Boolean(data.reg_match),
          text_match: Boolean(data.text_match),
        };
        setIdDetect(detect);
        if (!detect.text_match) {
          setError('The ID card name or registration number does not match this student. Upload the correct card.');
        }
      } else {
        setStep('faces');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not read a face from the ID card. Try a clearer photo.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFaces = async (frontFile: File, leftFile: File, rightFile: File) => {
    setFront(frontFile);
    setLeft(leftFile);
    setRight(rightFile);
    setError('');
    setBusy(true);
    const form = new FormData();
    form.append('front', frontFile);
    form.append('left', leftFile);
    form.append('right', rightFile);
    try {
      const { data } = await api.post(ENDPOINTS.PUBLIC_STUDENT_FACES, form, {
        headers: { Authorization: `Bearer ${session}` },
      });
      setStep(data?.needs_approval || data?.status === 'pending_approval' ? 'pending' : 'done');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not save live photos. Try Finish registration again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className={step === 'id-card' ? 'card card-wide' : 'card'}>
        {step === 'lookup' && params.get('token') && (
          <>
            <h1>Verifying email</h1>
            <p>{busy ? 'Opening your verification link…' : (error || 'Verification link is invalid or expired.')}</p>
            {error && (
              <p>
                <a href="/">Request a new link</a>
              </p>
            )}
          </>
        )}

        {step === 'lookup' && !params.get('token') && (
          <form onSubmit={lookup}>
            <h1>Student registration</h1>
            <p>Enter the college and registration number your Super Admin already added.</p>
            <label>College</label>
            <select value={collegeId} onChange={(e) => setCollegeId(e.target.value)} required disabled={collegesLoading || !colleges.length}>
              <option value="">{collegesLoading ? 'Loading colleges…' : 'Select college'}</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {collegesError && (
              <p className="error">
                {collegesError}{' '}
                <button type="button" onClick={loadColleges} disabled={collegesLoading}>Retry</button>
              </p>
            )}
            <label>Registration number</label>
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        )}

        {step === 'already' && (
          <>
            <h1>Already registered</h1>
            <p>
              {studentReg ? `${studentReg} is` : 'This registration number is'} already enrolled.
              No email was sent.
            </p>
          </>
        )}

        {step === 'check-email' && (
          <>
            <h1>Check your email</h1>
            <p>
              If that registration number is on the roster, we sent a verification link to the email on file.
              Open it on this device to continue.
            </p>
            {emailWarning && <p className="error">{emailWarning}</p>}
            {verifyUrl && (
              <p>
                <a href={verifyUrl}>Continue verification</a>
              </p>
            )}
          </>
        )}

        {step === 'id-card' && (
          <form onSubmit={idDetect?.text_match ? (e) => { e.preventDefault(); setStep('faces'); } : uploadId}>
            <div className="split">
              <div className="split-left">
                <h1>Upload ID card</h1>
                <p>
                  Hello {studentName || 'student'}{studentReg ? ` (${studentReg})` : ''}. Add a clear photo of your
                  ID card. We match the face, name, and registration number on the card to your roster record.
                </p>
                <label>ID card photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setIdCard(file);
                    setIdDetect(null);
                    setError('');
                    if (file) loadIdPreview(file);
                    else setIdCardPreview('');
                  }}
                  required
                />
                {idDetect && (
                  <>
                    <p className="detect-note">
                      Face recognized at {Math.round(idDetect.det_score * 100)}% confidence. The box marks the
                      person we will match against.
                    </p>
                    <div className="match-list">
                      <div className={`match-row ${idDetect.name_match ? 'ok' : 'bad'}`}>
                        <div>
                          <strong>Name</strong>
                          <span>Roster: {studentName || '—'}</span>
                          <span>Card: {idDetect.ocr_name || 'not read'}</span>
                        </div>
                        <em>{idDetect.name_match ? 'Match' : 'No match'}</em>
                      </div>
                      <div className={`match-row ${idDetect.reg_match ? 'ok' : 'bad'}`}>
                        <div>
                          <strong>Registration number</strong>
                          <span>Roster: {studentReg || '—'}</span>
                          <span>Card: {idDetect.ocr_reg_no || 'not read'}</span>
                        </div>
                        <em>{idDetect.reg_match ? 'Match' : 'No match'}</em>
                      </div>
                    </div>
                  </>
                )}
                {error && <p className="error">{error}</p>}
                <button type="submit" disabled={busy || !idCard}>
                  {busy ? 'Reading ID card…' : idDetect?.text_match ? 'Continue to live photos' : idDetect ? 'Try another photo' : 'Continue'}
                </button>
              </div>
              <div className="split-right">
                <div className="id-stage">
                  {previewBusy && <div className="id-stage-empty">Preparing preview…</div>}
                  {!previewBusy && idCardPreview ? (
                    <div className="id-stage-frame">
                      <img src={idCardPreview} alt="ID card preview" />
                      {idDetect && (
                        <>
                          <div
                            className="face-box"
                            style={{
                              left: `${(idDetect.bbox[0] / idDetect.image_width) * 100}%`,
                              top: `${(idDetect.bbox[1] / idDetect.image_height) * 100}%`,
                              width: `${((idDetect.bbox[2] - idDetect.bbox[0]) / idDetect.image_width) * 100}%`,
                              height: `${((idDetect.bbox[3] - idDetect.bbox[1]) / idDetect.image_height) * 100}%`,
                            }}
                          />
                          <span
                            className="face-box-label"
                            style={{
                              left: `${(idDetect.bbox[0] / idDetect.image_width) * 100}%`,
                              top: `${Math.max(0, (idDetect.bbox[1] / idDetect.image_height) * 100 - 6)}%`,
                            }}
                          >
                            Face {Math.round(idDetect.det_score * 100)}%
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="id-stage-empty">ID preview appears here</div>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}

        {step === 'faces' && (
          <FaceCapture
            busy={busy}
            error={error}
            session={session}
            idCardPreview={idCardPreview}
            onSubmit={uploadFaces}
          />
        )}

        {step === 'pending' && (
          <>
            <h1>Sent for Super Admin approval</h1>
            <p>
              {studentName ? `${studentName}, your` : 'Your'} live photos did not match the ID card
              closely enough for automatic registration
              {studentReg ? ` (${studentReg})` : ''}. Super Admin will review them in Approvals.
            </p>
          </>
        )}

        {step === 'done' && (
          <>
            <h1>You are registered</h1>
            <p>
              {studentName ? `${studentName}, your` : 'Your'} registration
              {studentReg ? ` (${studentReg})` : ''} is complete. Check your email for confirmation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
