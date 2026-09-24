import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS } from '@attend/shared';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import {
  usePendingUsers,
  useApproveUser,
  usePendingStudentApprovals,
  useApproveStudentEnrollment,
  useDenyStudentEnrollment,
} from '../lib/queries';

const reviewPhotoCache = new Map<string, string>();
const reviewPhotoPending = new Map<string, Promise<string>>();

function loadReviewPhoto(studentId: string, kind: string): Promise<string> {
  const key = `${studentId}:${kind}`;
  const cached = reviewPhotoCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = reviewPhotoPending.get(key);
  if (pending) return pending;
  const req = api
    .get(ENDPOINTS.studentReviewPhoto(studentId, kind), { responseType: 'blob', timeout: 20000 })
    .then(({ data }) => {
      const url = URL.createObjectURL(data);
      reviewPhotoCache.set(key, url);
      reviewPhotoPending.delete(key);
      return url;
    })
    .catch((err) => {
      reviewPhotoPending.delete(key);
      throw err;
    });
  reviewPhotoPending.set(key, req);
  return req;
}

function ReviewPhoto({ studentId, kind, label }: { studentId: string; kind: string; label: string }) {
  const [src, setSrc] = useState(() => reviewPhotoCache.get(`${studentId}:${kind}`) || '');
  useEffect(() => {
    let alive = true;
    loadReviewPhoto(studentId, kind)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc('');
      });
    return () => {
      alive = false;
    };
  }, [studentId, kind]);
  return (
    <div style={styles.photoBox}>
      {src ? <img src={src} alt={label} style={styles.photo} /> : <span style={styles.photoEmpty}>Loading…</span>}
      <span style={styles.photoLabel}>{label}</span>
    </div>
  );
}

type PendingUser = {
  id: string;
  email: string;
  role: string;
  name?: string;
  college_name?: string;
  created_at?: string;
};

type PendingStudent = {
  id: string;
  name?: string;
  reg_no?: string;
  email?: string;
  department_name?: string;
  face_match_score?: number | null;
  id_card_url?: string | null;
  primary_image_url?: string | null;
};

export default function Approvals() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canApprove = user?.role === 'PLATFORM_ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: pending = [], isLoading, isError, error } = usePendingUsers(canApprove);
  const { data: pendingStudents = [], isLoading: studentsLoading } = usePendingStudentApprovals(isSuperAdmin);
  const approveUser = useApproveUser(user?.college_id ?? null);
  const approveStudent = useApproveStudentEnrollment();
  const denyStudent = useDenyStudentEnrollment();
  const [confirm, setConfirm] = useState<PendingUser | null>(null);
  const [confirmStudent, setConfirmStudent] = useState<PendingStudent | null>(null);
  const [denyTarget, setDenyTarget] = useState<PendingStudent | null>(null);

  if (!canApprove) {
    return <p>Only Platform Admin and Super Admin can approve accounts.</p>;
  }

  const handleApprove = async () => {
    if (!confirm) return;
    try {
      await approveUser.mutateAsync(confirm.id);
      setConfirm(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Failed to approve user.');
    }
  };

  const handleApproveStudent = async () => {
    if (!confirmStudent) return;
    try {
      await approveStudent.mutateAsync(confirmStudent.id);
      setConfirmStudent(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Failed to approve student.');
    }
  };

  const handleDenyStudent = async () => {
    if (!denyTarget) return;
    try {
      await denyStudent.mutateAsync(denyTarget.id);
      setDenyTarget(null);
    } catch (e: any) {
      const detail = typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : '';
      if (detail.toLowerCase().includes('not waiting')) {
        queryClient.setQueryData(['students', 'pending-approval'], (current: unknown) =>
          Array.isArray(current) ? current.filter((s: { id?: string }) => s?.id !== denyTarget.id) : []
        );
        setDenyTarget(null);
        return;
      }
      alert(detail || 'Failed to deny student.');
    }
  };

  return (
    <>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Approvals</h1>
          <p style={styles.subtitle}>
            Activate pending staff accounts, and review student face matches that were too low to auto-enroll.
          </p>
        </div>
      </div>

      {isSuperAdmin && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Student face matches</h2>
          {studentsLoading && <p>Loading...</p>}
          {!studentsLoading && pendingStudents.length === 0 && (
            <p style={styles.empty}>No low-confidence student registrations waiting.</p>
          )}
          {pendingStudents.length > 0 && (
            <div style={styles.studentGrid}>
              {pendingStudents.map((s: PendingStudent) => (
                <div key={s.id} style={styles.studentCard}>
                  <div style={styles.photoRow}>
                    <ReviewPhoto studentId={s.id} kind="id" label="ID card" />
                    <ReviewPhoto studentId={s.id} kind="front" label="Front" />
                    <ReviewPhoto studentId={s.id} kind="left" label="Left" />
                    <ReviewPhoto studentId={s.id} kind="right" label="Right" />
                  </div>
                  <strong>{s.name || 'Student'}</strong>
                  <span style={styles.meta}>{s.reg_no || '—'}</span>
                  <span style={styles.meta}>{s.department_name || s.email || '—'}</span>
                  <span style={styles.score}>
                    Match {s.face_match_score != null ? `${Math.round(Number(s.face_match_score) * 100)}%` : 'low'}
                  </span>
                  <div style={styles.actionRow}>
                    <button type="button" style={styles.denyBtn} onClick={() => setDenyTarget(s)}>
                      Deny
                    </button>
                    <button type="button" style={styles.approveBtn} onClick={() => setConfirmStudent(s)}>
                      Approve enrollment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Staff accounts</h2>

      {isLoading && <p>Loading...</p>}
      {isError && (
        <p style={styles.error}>
          {error?.response?.data?.detail ?? 'Could not load pending users.'}
        </p>
      )}
      {!isLoading && pending.length === 0 && (
        <p style={styles.empty}>No accounts waiting for approval.</p>
      )}

      {pending.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>College</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((u: PendingUser) => (
              <tr key={u.id}>
                <td style={styles.td}>{u.name || '—'}</td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>{u.role.replace(/_/g, ' ')}</td>
                <td style={styles.td}>{u.college_name || '—'}</td>
                <td style={styles.td}>
                  <button type="button" style={styles.approveBtn} onClick={() => setConfirm(u)}>
                    Approve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      </section>

      {denyTarget && (
        <div style={styles.overlay}>
          <div style={styles.confirmCard}>
            <h3 style={styles.confirmTitle}>Deny this student?</h3>
            <p style={styles.confirmText}>
              <strong>{denyTarget.name || 'Student'}</strong>
              {denyTarget.reg_no ? ` (${denyTarget.reg_no})` : ''} can upload live photos again. The ID card stays on file.
            </p>
            <div style={styles.confirmActions}>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => setDenyTarget(null)}
                disabled={denyStudent.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.denyConfirmBtn}
                onClick={handleDenyStudent}
                disabled={denyStudent.isPending}
              >
                {denyStudent.isPending ? 'Denying...' : 'Deny'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmStudent && (
        <div style={styles.overlay}>
          <div style={styles.confirmCard}>
            <h3 style={styles.confirmTitle}>Approve this student?</h3>
            <p style={styles.confirmText}>
              <strong>{confirmStudent.name || 'Student'}</strong>
              {confirmStudent.reg_no ? ` (${confirmStudent.reg_no})` : ''} will be enrolled even though the
              live-to-ID match was low.
            </p>
            <div style={styles.confirmActions}>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => setConfirmStudent(null)}
                disabled={approveStudent.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.sendBtn}
                onClick={handleApproveStudent}
                disabled={approveStudent.isPending}
              >
                {approveStudent.isPending ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div style={styles.overlay}>
          <div style={styles.confirmCard}>
            <h3 style={styles.confirmTitle}>Approve this account?</h3>
            <p style={styles.confirmText}>
              <strong>{confirm.email}</strong> ({confirm.role.replace(/_/g, ' ')}) will be able to sign in immediately.
            </p>
            <div style={styles.confirmActions}>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => setConfirm(null)}
                disabled={approveUser.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.sendBtn}
                onClick={handleApprove}
                disabled={approveUser.isPending}
              >
                {approveUser.isPending ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { marginBottom: 24 },
  title: { margin: 0 },
  subtitle: { margin: '8px 0 0', opacity: 0.7, maxWidth: 640 },
  section: { marginBottom: 36 },
  sectionTitle: { margin: '0 0 12px', fontSize: 18 },
  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 },
  studentCard: {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: 14,
    display: 'grid',
    gap: 6,
  },
  photoRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 8 },
  photoBox: { minHeight: 120, background: '#0b0b0b', borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: 140, objectFit: 'cover', display: 'block' },
  photoEmpty: { display: 'block', padding: 24, fontSize: 12, opacity: 0.6 },
  photoLabel: { display: 'block', fontSize: 11, opacity: 0.7, marginTop: 4 },
  actionRow: { display: 'flex', gap: 8, marginTop: 8 },
  denyBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #666',
    color: '#e0e0e0',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  denyConfirmBtn: {
    padding: '10px 20px',
    background: '#c62828',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  meta: { fontSize: 13, opacity: 0.7 },
  score: { fontSize: 13, fontWeight: 700, color: '#ffb020' },
  empty: { opacity: 0.7 },
  error: { color: '#ff6b6b' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', opacity: 0.7, fontWeight: 600 },
  td: { padding: '10px 12px', borderBottom: '1px solid #222' },
  approveBtn: {
    padding: '6px 12px',
    background: '#00C853',
    border: 'none',
    color: '#000',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  confirmCard: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 12,
    padding: 24,
    maxWidth: 400,
    width: '90%',
  },
  confirmTitle: { margin: '0 0 12px', fontSize: 18 },
  confirmText: { margin: '0 0 20px', color: '#aaa', fontSize: 14, lineHeight: 1.5 },
  confirmActions: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid #555',
    color: '#e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
  },
  sendBtn: {
    padding: '10px 20px',
    background: '#00C853',
    border: 'none',
    color: '#000',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
};
