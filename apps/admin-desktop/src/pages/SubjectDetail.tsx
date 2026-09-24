import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useDepartments,
  useSubject,
  useSubjectSections,
  useSubjectStudents,
  useStudents,
  useAssignStudentsToSection,
  useRemoveStudentFromSection,
} from '../lib/queries';

type SubjectStudent = {
  id: string;
  reg_no: string;
  name: string;
  primary_image_url?: string | null;
  section_id?: string | null;
  section_name?: string | null;
};

type DeptStudent = { id: string; reg_no: string; name: string; primary_image_url?: string | null };

function StudentPhoto({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  if (!url || failed) {
    return <span style={styles.avatarFallback}>{initials}</span>;
  }
  return (
    <img
      src={url}
      alt=""
      style={styles.avatar}
      onError={() => setFailed(true)}
    />
  );
}

function errorDetail(err: unknown): string {
  const res =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { detail?: unknown } } }).response
      : null;
  const detail = res?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: string }).message);
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Request failed';
}

export default function SubjectDetail() {
  const { collegeId, departmentId, subjectId } = useParams();
  const [addToSection, setAddToSection] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState<{
    sectionId: string;
    sectionName: string;
    student: SubjectStudent;
  } | null>(null);
  const [collapseOverride, setCollapseOverride] = useState<Record<string, boolean>>({});

  const { data: subject, isLoading: subjectLoading } = useSubject(subjectId ?? null);
  const { data: departments = [] } = useDepartments(collegeId ?? null);
  const { data: sections = [], isLoading: sectionsLoading } = useSubjectSections(subjectId ?? null);
  const { data: students = [], isLoading: studentsLoading } = useSubjectStudents(subjectId ?? null);
  const { data: departmentStudents = [], isLoading: deptStudentsLoading } = useStudents(
    collegeId ?? null,
    departmentId ?? null,
    !!(collegeId || departmentId),
    false
  );

  const assignStudents = useAssignStudentsToSection(subjectId ?? null);
  const removeStudent = useRemoveStudentFromSection(subjectId ?? null);

  const department = departments.find((d: { id: string }) => d.id === departmentId);
  const isLoading = subjectLoading || sectionsLoading || studentsLoading;

  const studentsBySection = useMemo(() => {
    const map = new Map<string, SubjectStudent[]>();
    for (const sec of sections as { id: string }[]) {
      map.set(sec.id, []);
    }
    const unassigned: SubjectStudent[] = [];
    for (const s of students as SubjectStudent[]) {
      if (s.section_id && map.has(s.section_id)) {
        map.get(s.section_id)!.push(s);
      } else {
        unassigned.push(s);
      }
    }
    return { map, unassigned };
  }, [sections, students]);

  const enrolledIds = useMemo(
    () =>
      new Set(
        (students as SubjectStudent[])
          .filter((s) => s.section_id)
          .map((s) => String(s.id))
      ),
    [students]
  );

  const availableStudents = useMemo(() => {
    const list = (departmentStudents as DeptStudent[]).filter(
      (s) => !enrolledIds.has(String(s.id))
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.reg_no?.toLowerCase().includes(q)
    );
  }, [departmentStudents, enrolledIds, search]);

  const isCollapsed = (id: string, count: number) =>
    id in collapseOverride ? collapseOverride[id] : count === 0;

  const toggleSection = (id: string, count: number) => {
    setCollapseOverride((prev) => ({
      ...prev,
      [id]: !(id in prev ? prev[id] : count === 0),
    }));
  };

  const openAdd = (sec: { id: string; name: string }) => {
    setError('');
    setSelectedIds([]);
    setSearch('');
    setAddToSection(sec);
    setCollapseOverride((prev) => ({ ...prev, [sec.id]: false }));
  };

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addToSection || selectedIds.length === 0) return;
    setError('');
    try {
      await assignStudents.mutateAsync({ sectionId: addToSection.id, studentIds: selectedIds });
      setAddToSection(null);
    } catch (err) {
      setError(errorDetail(err));
    }
  };

  const handleRemove = async () => {
    if (!removeConfirm) return;
    setError('');
    try {
      await removeStudent.mutateAsync({
        sectionId: removeConfirm.sectionId,
        studentId: removeConfirm.student.id,
      });
      setRemoveConfirm(null);
    } catch (err) {
      setError(errorDetail(err) || 'Failed to remove student');
    }
  };

  return (
    <>
      <p style={styles.crumb}>
        <Link to={`/colleges/${collegeId}/departments`} style={styles.crumbLink}>Departments</Link>
        <span style={styles.crumbSep}>/</span>
        <Link to={`/colleges/${collegeId}/departments/${departmentId}/subjects`} style={styles.crumbLink}>
          Subjects
        </Link>
        <span style={styles.crumbSep}>/</span>
        <span>{subject?.name ?? 'Subject'}</span>
      </p>
      <h1>{subject?.name ?? 'Subject'}</h1>
      {department && <p style={styles.subtitle}>{department.name}</p>}
      {error && !addToSection && !removeConfirm && <p style={styles.error}>{error}</p>}

      {isLoading ? (
        <p>Loading...</p>
      ) : sections.length === 0 ? (
        <p style={styles.empty}>No sections yet. Create sections from the mobile app.</p>
      ) : (
        (sections as { id: string; name: string }[]).map((sec) => {
          const rows = studentsBySection.map.get(sec.id) ?? [];
          const collapsed = isCollapsed(sec.id, rows.length);
          return (
            <section key={sec.id} style={collapsed ? styles.sectionCardCollapsed : styles.sectionCard}>
              <div style={{ ...styles.sectionHeader, marginBottom: collapsed ? 0 : 12 }}>
                <button
                  type="button"
                  style={styles.toggleBtn}
                  onClick={() => toggleSection(sec.id, rows.length)}
                  aria-expanded={!collapsed}
                >
                  <span style={{ ...styles.chevron, transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
                    ▼
                  </span>
                  <span style={styles.sectionTitle}>
                    Section {sec.name}
                    <span style={styles.count}> ({rows.length})</span>
                  </span>
                </button>
                <button type="button" style={styles.addBtn} onClick={() => openAdd(sec)}>
                  Add students
                </button>
              </div>
              {!collapsed && (
                rows.length === 0 ? (
                  <p style={styles.empty}>No students in this section.</p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.thPhoto}></th>
                        <th style={styles.th}>Reg No</th>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id}>
                          <td style={styles.tdPhoto}>
                            <StudentPhoto url={s.primary_image_url} name={s.name} />
                          </td>
                          <td style={styles.td}>{s.reg_no}</td>
                          <td style={styles.td}>{s.name}</td>
                          <td style={styles.td}>
                            <button
                              type="button"
                              style={styles.removeBtn}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setError('');
                                setRemoveConfirm({ sectionId: sec.id, sectionName: sec.name, student: s });
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </section>
          );
        })
      )}

      {studentsBySection.unassigned.length > 0 && (() => {
        const collapsed = isCollapsed('unassigned', studentsBySection.unassigned.length);
        return (
          <section style={collapsed ? styles.sectionCardCollapsed : styles.sectionCard}>
            <div style={{ ...styles.sectionHeader, marginBottom: collapsed ? 0 : 12 }}>
              <button
                type="button"
                style={styles.toggleBtn}
                onClick={() => toggleSection('unassigned', studentsBySection.unassigned.length)}
                aria-expanded={!collapsed}
              >
                <span style={{ ...styles.chevron, transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
                  ▼
                </span>
                <span style={styles.sectionTitle}>
                  Not in a section
                  <span style={styles.count}> ({studentsBySection.unassigned.length})</span>
                </span>
              </button>
            </div>
            {!collapsed && (
              <>
                <p style={styles.empty}>These students are enrolled in the subject but not assigned to a section. Use Add students on a section above.</p>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.thPhoto}></th>
                      <th style={styles.th}>Reg No</th>
                      <th style={styles.th}>Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsBySection.unassigned.map((s) => (
                      <tr key={s.id}>
                        <td style={styles.tdPhoto}>
                          <StudentPhoto url={s.primary_image_url} name={s.name} />
                        </td>
                        <td style={styles.td}>{s.reg_no}</td>
                        <td style={styles.td}>{s.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        );
      })()}

      <Link to={`/colleges/${collegeId}/departments/${departmentId}/subjects`} style={styles.backLink}>
        ← Back to Subjects
      </Link>

      {addToSection && (
        <div style={styles.overlay} onClick={() => setAddToSection(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add students to Section {addToSection.name}</h3>
            <p style={styles.modalHint}>Only students not already in a section of this subject are listed.</p>
            {error && <p style={styles.error}>{error}</p>}
            <input
              type="search"
              placeholder="Search by name or reg no"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.search}
            />
            <form onSubmit={handleAdd}>
              <div style={styles.studentList}>
                {deptStudentsLoading ? (
                  <p style={styles.empty}>Loading students…</p>
                ) : availableStudents.length === 0 ? (
                  <p style={styles.empty}>
                    {search
                      ? 'No match.'
                      : (departmentStudents as DeptStudent[]).length === 0
                        ? 'No students in this department yet. Enroll them first.'
                        : 'All department students are already in a section of this subject.'}
                  </p>
                ) : (
                  availableStudents.map((s) => (
                  <label key={s.id} style={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                    />
                    <StudentPhoto url={s.primary_image_url} name={s.name} />
                    <span>
                      <strong>{s.name}</strong>
                      <span style={styles.reg}>{s.reg_no}</span>
                    </span>
                  </label>
                  ))
                )}
              </div>
              <p style={styles.selectedCount}>{selectedIds.length} selected</p>
              <div style={styles.modalActions}>
                <button type="button" style={styles.cancelBtn} onClick={() => setAddToSection(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.saveBtn}
                  disabled={selectedIds.length === 0 || assignStudents.isPending}
                >
                  {assignStudents.isPending ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div style={styles.overlay} onClick={() => setRemoveConfirm(null)}>
          <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Remove student?</h3>
            <p style={styles.modalHint}>
              Remove {removeConfirm.student.name} ({removeConfirm.student.reg_no}) from Section {removeConfirm.sectionName}?
            </p>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setRemoveConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                style={styles.deleteConfirmBtn}
                onClick={handleRemove}
                disabled={removeStudent.isPending}
              >
                {removeStudent.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  crumb: { margin: '0 0 8px', fontSize: 13, opacity: 0.75 },
  crumbLink: { color: '#007AFF', textDecoration: 'none' },
  crumbSep: { margin: '0 8px', opacity: 0.5 },
  subtitle: { opacity: 0.7, marginTop: 0, marginBottom: 24 },
  error: { color: '#ff6b6b', marginBottom: 12 },
  sectionCard: {
    marginBottom: 16,
    padding: 16,
    border: '1px solid #333',
    borderRadius: 12,
    background: '#141414',
  },
  sectionCardCollapsed: {
    marginBottom: 16,
    padding: '10px 16px',
    border: '1px solid #333',
    borderRadius: 12,
    background: '#141414',
  },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 0 },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'transparent',
    border: 'none',
    color: '#e0e0e0',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    flex: 1,
  },
  chevron: {
    display: 'inline-block',
    fontSize: 11,
    opacity: 0.7,
    transition: 'transform 0.15s ease',
    width: 12,
  },
  sectionTitle: { fontSize: 18, margin: 0, fontWeight: 600 },
  count: { opacity: 0.6, fontWeight: 400 },
  empty: { opacity: 0.65, margin: '8px 0 0' },
  addBtn: {
    padding: '8px 14px',
    background: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', opacity: 0.7, fontWeight: 600 },
  thPhoto: { width: 44, padding: '10px 8px 10px 12px', borderBottom: '1px solid #333' },
  td: { padding: '10px 12px', borderBottom: '1px solid #222', verticalAlign: 'middle' },
  tdPhoto: { padding: '8px 8px 8px 12px', borderBottom: '1px solid #222', width: 44, verticalAlign: 'middle' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
    background: '#222',
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#2a2a2a',
    color: '#aaa',
    fontSize: 11,
    fontWeight: 600,
  },
  removeBtn: {
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #ff3b30',
    color: '#ff3b30',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  backLink: { display: 'inline-block', marginTop: 8, color: '#007AFF', textDecoration: 'none' },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 480,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  confirmCard: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 12,
    padding: 24,
    maxWidth: 400,
    width: '90%',
  },
  modalTitle: { margin: '0 0 8px', fontSize: 18 },
  modalHint: { margin: '0 0 16px', color: '#aaa', fontSize: 14, lineHeight: 1.5 },
  search: {
    width: '100%',
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    border: '1px solid #444',
    background: '#0f0f0f',
    color: '#e0e0e0',
    boxSizing: 'border-box',
  },
  studentList: { maxHeight: 280, overflowY: 'auto', border: '1px solid #333', borderRadius: 8 },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderBottom: '1px solid #222',
    cursor: 'pointer',
  },
  reg: { display: 'block', fontSize: 12, opacity: 0.65, fontWeight: 400 },
  selectedCount: { opacity: 0.7, fontSize: 13, margin: '12px 0 0' },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid #555',
    color: '#e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 20px',
    background: '#007AFF',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  deleteConfirmBtn: {
    padding: '10px 20px',
    background: '#ff3b30',
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
};
