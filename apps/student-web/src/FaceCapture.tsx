import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ENDPOINTS } from '@attend/shared';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

const POSES = [
  { key: 'front', label: 'Front', hint: 'Look straight at the camera.' },
  { key: 'left', label: 'Left', hint: 'Turn your head to the left, then hold still.' },
  { key: 'right', label: 'Right', hint: 'Turn your head to the right, then hold still.' },
] as const;

type PoseKey = (typeof POSES)[number]['key'];

type Score = { score: number; match: boolean; auto?: boolean };

type Props = {
  busy: boolean;
  error: string;
  session: string;
  idCardPreview: string;
  onSubmit: (front: File, left: File, right: File) => void;
};

export default function FaceCapture({ busy, error, session, idCardPreview, onSubmit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState('');
  const [poseIndex, setPoseIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shots, setShots] = useState<Partial<Record<PoseKey, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PoseKey, string>>>({});
  const [scores, setScores] = useState<Partial<Record<PoseKey, Score>>>({});
  const [scoreBusy, setScoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setCamError('Allow camera access, then reload this page.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const snap = (index: number) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const pose = POSES[index].key;
      const file = new File([blob], `${pose}.jpg`, { type: 'image/jpeg' });
      setShots((s) => ({ ...s, [pose]: file }));
      setPreviews((p) => {
        if (p[pose]) URL.revokeObjectURL(p[pose]!);
        return { ...p, [pose]: URL.createObjectURL(blob) };
      });
      setScoreBusy(true);
      try {
        const form = new FormData();
        form.append('live', file);
        const { data } = await api.post(ENDPOINTS.PUBLIC_STUDENT_COMPARE, form, {
          headers: { Authorization: `Bearer ${session}` },
        });
        setScores((s) => ({ ...s, [pose]: { score: Number(data.score), match: !!data.match, auto: !!data.auto_enroll } }));
      } catch {
        setScores((s) => ({ ...s, [pose]: { score: 0, match: false } }));
      } finally {
        setScoreBusy(false);
      }
    }, 'image/jpeg', 0.92);
  };

  const startTimer = () => {
    if (!ready || countdown !== null) return;
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      snap(poseIndex);
      setCountdown(null);
      return;
    }
    const id = window.setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [countdown, poseIndex]);

  useEffect(() => {
    const pose = POSES[poseIndex].key;
    if (!shots[pose]) return;
    if (poseIndex >= POSES.length - 1) return;
    const next = POSES[poseIndex + 1].key;
    if (shots[next]) return;
    const id = window.setTimeout(() => setPoseIndex((i) => i + 1), 1200);
    return () => window.clearTimeout(id);
  }, [shots, poseIndex]);

  const current = POSES[poseIndex];
  const allReady = !!(shots.front && shots.left && shots.right);

  const retake = (index: number) => {
    const pose = POSES[index].key;
    setShots((s) => {
      const next = { ...s };
      delete next[pose];
      return next;
    });
    setPreviews((p) => {
      if (p[pose]) URL.revokeObjectURL(p[pose]!);
      const next = { ...p };
      delete next[pose];
      return next;
    });
    setScores((s) => {
      const next = { ...s };
      delete next[pose];
      return next;
    });
    setPoseIndex(index);
    setCountdown(3);
  };

  return (
    <div>
      <h1>Add your face</h1>
      <p>
        Consent: these live photos are used only for attendance matching. We capture front, then left,
        then right with a 3-second timer.
      </p>
      {camError && <p className="error">{camError}</p>}
      <div className="camera-wrap">
        <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
        {countdown !== null && <div className="countdown">{countdown || ''}</div>}
        {!ready && !camError && <div className="camera-status">Starting camera…</div>}
      </div>
      <p className="pose-hint">
        <strong>{current.label}.</strong> {current.hint}
        {scoreBusy ? ' Scoring against ID card…' : ''}
      </p>
      <div className="compare-row">
        <div className="id-preview">
          {idCardPreview ? <img src={idCardPreview} alt="ID card" /> : <span>ID card</span>}
          <span className="shot-label">ID card</span>
        </div>
        <div className="shot-row">
          {POSES.map((p, i) => (
            <button
              key={p.key}
              type="button"
              className={`shot-thumb ${poseIndex === i ? 'active' : ''} ${scores[p.key]?.match ? 'match' : ''} ${scores[p.key] && !scores[p.key]?.match ? 'nomatch' : ''}`}
              onClick={() => shots[p.key] && retake(i)}
              disabled={!shots[p.key]}
            >
              {previews[p.key] ? <img src={previews[p.key]} alt={p.label} /> : <span>{p.label}</span>}
              {scores[p.key] && (
                <span className="score-pill">
                  {Math.round(scores[p.key]!.score * 100)}% vs ID
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {Object.values(scores).some((s) => s && !s.auto) && (
        <p>Low match confidence will go to Super Admin for approval instead of finishing automatically.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="btn-row">
        <button
          type="button"
          className="ghost"
          onClick={() => (shots[current.key] ? retake(poseIndex) : startTimer())}
          disabled={!ready || countdown !== null || busy}
        >
          {countdown !== null ? 'Capturing…' : shots[current.key] ? `Retake ${current.label}` : `Start ${current.label} timer`}
        </button>
        <button
          type="button"
          disabled={busy || !allReady}
          onClick={() => allReady && onSubmit(shots.front!, shots.left!, shots.right!)}
        >
          {busy ? 'Matching…' : 'Finish registration'}
        </button>
      </div>
    </div>
  );
}
