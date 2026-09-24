import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useStudents,
  useDepartments,
  useCreateStudent,
  useUpdateStudent,
  useDeleteStudent,
  useGenerateEmbeddings,
} from '../lib/queries';
import { useAuthStore } from '../store/auth';
import { createStudentSchema } from '@attend/shared';

type Student = {
  id: string;
  reg_no: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  department_id: string;
  enrollment_status?: string | null;
};

const emptyForm = { reg_no: '', name: '', email: '', phone: '', department_id: '' };

export default function Students() {
  const { collegeId } = useParams();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: students = [], isLoading } = useStudents(collegeId ?? null);
  const { data: departments = [] } = useDepartments(collegeId ?? null);
  const createStudent = useCreateStudent(collegeId ?? null);
  const updateStudent = useUpdateStudent(collegeId ?? null);
  const deleteStudent = useDeleteStudent(collegeId ?? null);
  const generateEmbeddings = useGenerateEmbeddings(collegeId ?? null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<Student | null>(null);
  const [error, setError] = useState('');

  const deptName = (id: string) => departments.find((d: { id: string; name: string }) => d.id === id)?.name ?? id;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsed = createStudentSchema.safeParse({
      ...form,
      college_id: collegeId,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }
    try {
      await createStudent.mutateAsync(parsed.data);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to add student');
    }
  };

  const startEdit = (s: Student) => {
    setEditing(s);
    setEditForm({
      reg_no: s.reg_no,
      name: s.name,
      email: s.email ?? '',
      phone: s.phone ?? '',
      department_id: s.department_id,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateStudent.mutateAsync({
        studentId: editing.id,
        ...editForm,
      });
      setEditing(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Failed to update student');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteStudent.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Failed to delete student');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Students</h1>
        {collegeId && isSuperAdmin && (
          <button
            type="button"
            style={styles.embedBtn}
            onClick={async () => {
              try {
                const res = await generateEmbeddings.mutateAsync();
                const msg = res.generated > 0
                  ? `Generated ${res.generated} embedding(s).`
                  : res.skipped > 0
                    ? 'All students already have embeddings.'
                    : 'No face images need embeddings.';
                alert(res.failed?.length ? `${msg}\n\nFailed: ${res.failed.join('; ')}` : msg);
              } catch (e: any) {
                alert(e?.response?.data?.detail ?? 'Failed to generate embeddings');
              }
            }}
            disabled={generateEmbeddings.isPending}
          >
            {generateEmbeddings.isPending ? 'Generating...' : 'Generate embeddings'}
          </button>
        )}
      </div>

      {isSuperAdmin && (
        <form onSubmit={handleCreate} style={styles.form}>
          <input style={styles.input} placeholder="Registration number" value={form.reg_no} onChange={(e) => setForm((f) => ({ ...f, reg_no: e.target.value }))} />
          <input style={styles.input} placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input style={styles.input} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input style={styles.input} placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <select style={styles.input} value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
            <option value="">Department</option>
            {departments.map((d: { id: string; name: string }) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button type="submit" style={styles.addBtn} disabled={createStudent.isPending}>
            {createStudent.isPending ? 'Adding…' : 'Add to roster'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      )}

      <div style={styles.tableWrap}>
        {isLoading && <p style={styles.loading}>Loading...</p>}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Reg No</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Department</th>
              <th style={styles.th}>Status</th>
              {isSuperAdmin && <th style={styles.th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((s: Student) => (
              <tr key={s.id}>
                <td style={styles.td}>{s.reg_no}</td>
                <td style={styles.td}>{s.name}</td>
                <td style={styles.td}>{s.email ?? '—'}</td>
                <td style={styles.td}>{s.phone ?? '—'}</td>
                <td style={styles.td}>{deptName(s.department_id)}</td>
                <td style={styles.td}>{s.enrollment_status ?? 'provisioned'}</td>
                {isSuperAdmin && (
                  <td style={styles.td}>
                    <button type="button" style={styles.editBtn} onClick={() => startEdit(s)}>Edit</button>
                    <button type="button" style={styles.deleteBtn} onClick={() => setDeleteConfirm(s)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3>Edit Student</h3>
            <input style={styles.modalInput} value={editForm.reg_no} onChange={(e) => setEditForm((f) => ({ ...f, reg_no: e.target.value }))} />
            <input style={styles.modalInput} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <input style={styles.modalInput} type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            <input style={styles.modalInput} value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            <select style={styles.modalInput} value={editForm.department_id} onChange={(e) => setEditForm((f) => ({ ...f, department_id: e.target.value }))}>
              {departments.map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" style={styles.saveBtn} onClick={saveEdit} disabled={updateStudent.isPending}>
                {updateStudent.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3>Delete student?</h3>
            <p>Delete {deleteConfirm.name} ({deleteConfirm.reg_no})? This cannot be undone.</p>
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button type="button" style={styles.deleteConfirmBtn} onClick={confirmDelete} disabled={deleteStudent.isPending}>
                {deleteStudent.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { margin: 0, fontSize: 28 },
  form: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: '1 1 160px',
    minWidth: 140,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #444',
    background: '#0f0f0f',
    color: '#e0e0e0',
    boxSizing: 'border-box',
    fontSize: 14,
  },
  addBtn: {
    flex: '0 0 auto',
    padding: '10px 16px',
    background: '#007AFF',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  embedBtn: {
    padding: '8px 14px',
    background: '#34C759',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  tableWrap: { overflowX: 'auto', border: '1px solid #4a4a4a', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, lineHeight: 1.35 },
  th: {
    border: '1px solid #4a4a4a',
    padding: '8px 10px',
    textAlign: 'left',
    background: '#161616',
    color: '#f0f0f0',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    border: '1px solid #3a3a3a',
    padding: '7px 10px',
    color: '#d8d8d8',
    verticalAlign: 'middle',
  },
  loading: { padding: 12, margin: 0 },
  editBtn: { padding: '3px 7px', marginRight: 6, background: 'transparent', border: '1px solid #007AFF', color: '#007AFF', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  deleteBtn: { padding: '3px 7px', background: 'transparent', border: '1px solid #ff3b30', color: '#ff3b30', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%' },
  modalInput: { width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #444', background: '#0f0f0f', color: '#e0e0e0', boxSizing: 'border-box' },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { padding: '10px 20px', background: 'transparent', border: '1px solid #555', color: '#e0e0e0', borderRadius: 8, cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', background: '#007AFF', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  deleteConfirmBtn: { padding: '10px 20px', background: '#ff3b30', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  error: { color: '#ff6b6b', gridColumn: '1 / -1', margin: 0 },
};
