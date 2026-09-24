import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ENDPOINTS } from '@attend/shared';

export function useColleges() {
  return useQuery({
    queryKey: ['colleges'],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.COLLEGES);
      return data ?? [];
    },
    retry: (count, err) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403) return false;
      if (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK') return false;
      return count < 1;
    },
    retryDelay: 1000,
  });
}

export function useCollege(collegeId: string | null) {
  return useQuery({
    queryKey: ['colleges', collegeId],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.collegeById(collegeId!));
      return data;
    },
    enabled: !!collegeId,
  });
}

export function useStats(collegeId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: ['stats', collegeId],
    queryFn: async () => {
      const url = collegeId
        ? `${ENDPOINTS.ADMIN_STATS}?college_id=${collegeId}`
        : ENDPOINTS.ADMIN_STATS;
      const { data } = await api.get(url);
      return data;
    },
    enabled,
  });
}

export function useDepartments(collegeId: string | null) {
  return useQuery({
    queryKey: ['departments', collegeId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/departments?college_id=${collegeId}`);
      return data ?? [];
    },
    enabled: !!collegeId,
  });
}

export function useUsers(collegeId: string | null) {
  return useQuery({
    queryKey: ['users', collegeId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/users?college_id=${collegeId}`);
      return data ?? [];
    },
    enabled: !!collegeId,
  });
}

export function useStudents(
  collegeId: string | null,
  departmentId: string | null = null,
  enabled = true,
  includePhotos = true
) {
  return useQuery({
    queryKey: ['students', collegeId, departmentId, includePhotos],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (collegeId) params.set('college_id', collegeId);
      if (departmentId) params.set('department_id', departmentId);
      if (!includePhotos) params.set('include_photos', 'false');
      const { data } = await api.get(`/api/v1/students?${params.toString()}`);
      return data ?? [];
    },
    enabled: (!!collegeId || !!departmentId) && enabled,
  });
}

export function useGenerateEmbeddings(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(ENDPOINTS.STUDENTS_GENERATE_EMBEDDINGS, { college_id: collegeId });
      return data as { generated: number; skipped: number; failed: string[] };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students', collegeId] }),
  });
}

export function useCreateCollege() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; logo_url?: string }) =>
      api.post('/api/v1/colleges', { name: body.name, logo_url: body.logo_url || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['colleges'] }),
  });
}

export function useUpdateCollege(collegeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; logo_url?: string }) =>
      api.patch(`/api/v1/colleges/${collegeId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['colleges'] });
      queryClient.invalidateQueries({ queryKey: ['colleges', collegeId] });
    },
  });
}

export async function uploadCollegeLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(ENDPOINTS.COLLEGE_UPLOAD_LOGO, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.url;
}

export function useCreateSuperAdmin(collegeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; name?: string; contact_number?: string }) =>
      api.post('/api/v1/users', {
        ...body,
        role: 'SUPER_ADMIN',
        college_id: collegeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', collegeId] });
    },
  });
}

export function useCreateDepartment(collegeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post('/api/v1/departments', { college_id: collegeId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments', collegeId] });
    },
  });
}

export function useUpdateDepartment(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, name }: { departmentId: string; name: string }) =>
      api.patch(ENDPOINTS.departmentById(departmentId), { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments', collegeId] });
    },
  });
}

export function useDeleteDepartment(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) =>
      api.delete(ENDPOINTS.departmentById(departmentId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments', collegeId] });
    },
  });
}

export function useSubjects(departmentId: string | null) {
  return useQuery({
    queryKey: ['subjects', departmentId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/subjects?department_id=${departmentId}`);
      return data ?? [];
    },
    enabled: !!departmentId,
  });
}

export function useCreateSubject(departmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post('/api/v1/subjects', { department_id: departmentId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects', departmentId] });
    },
  });
}

export function useUpdateSubject(departmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectId, name }: { subjectId: string; name: string }) =>
      api.put(`/api/v1/subjects/${subjectId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects', departmentId] });
    },
  });
}

export function useDeleteSubject(departmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: string) => api.delete(`/api/v1/subjects/${subjectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects', departmentId] });
    },
  });
}

export function useSubject(subjectId: string | null) {
  return useQuery({
    queryKey: ['subject', subjectId],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.subjectById(subjectId!));
      return data as { id: string; name: string; department_id: string };
    },
    enabled: !!subjectId,
  });
}

export function useSubjectSections(subjectId: string | null) {
  return useQuery({
    queryKey: ['sections', subjectId],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.subjectSections(subjectId!));
      return data ?? [];
    },
    enabled: !!subjectId,
  });
}

export function useSubjectStudents(subjectId: string | null) {
  return useQuery({
    queryKey: ['subject-students', subjectId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/subjects/${subjectId}/students`);
      return data ?? [];
    },
    enabled: !!subjectId,
  });
}

export function useAssignStudentsToSection(subjectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, studentIds }: { sectionId: string; studentIds: string[] }) => {
      const { data } = await api.post(ENDPOINTS.sectionStudents(sectionId), { student_ids: studentIds });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-students', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useRemoveStudentFromSection(subjectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, studentId }: { sectionId: string; studentId: string }) => {
      const { data } = await api.post(`/api/v1/sections/${sectionId}/students/${studentId}/remove`);
      return data;
    },
    onMutate: async ({ sectionId, studentId }) => {
      const key = ['subject-students', subjectId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: Array<{ id: string; section_id?: string | null }> = []) =>
        old.filter((s) => !(s.id === studentId && s.section_id === sectionId))
      );
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-students', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useCreateUser(collegeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; role: string; name?: string; contact_number?: string; college_id: string; department_id?: string }) =>
      api.post('/api/v1/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', collegeId] });
    },
  });
}

export function useDeleteUser(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(ENDPOINTS.userById(userId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', collegeId] });
      queryClient.invalidateQueries({ queryKey: ['users', 'pending'] });
    },
  });
}

export function usePendingUsers(enabled = true) {
  return useQuery({
    queryKey: ['users', 'pending'],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.USERS_PENDING);
      return data ?? [];
    },
    enabled,
  });
}

export function usePendingStudentApprovals(enabled = true) {
  return useQuery({
    queryKey: ['students', 'pending-approval'],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.STUDENTS_PENDING_APPROVAL);
      return data ?? [];
    },
    enabled,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
}

export function useApproveStudentEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { data } = await api.post(ENDPOINTS.studentApproveEnrollment(studentId));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', 'pending-approval'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useDenyStudentEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { data } = await api.post(ENDPOINTS.studentDenyEnrollment(studentId));
      return data;
    },
    onSuccess: (_data, studentId) => {
      queryClient.setQueryData(['students', 'pending-approval'], (current: unknown) =>
        Array.isArray(current) ? current.filter((s: { id?: string }) => s?.id !== studentId) : []
      );
      queryClient.invalidateQueries({ queryKey: ['students', 'pending-approval'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useApproveUser(collegeId: string | null = null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post(ENDPOINTS.userApprove(userId));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', collegeId] });
      queryClient.invalidateQueries({ queryKey: ['users', 'pending'] });
    },
  });
}

export function useCreateStudent(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      reg_no: string;
      name: string;
      email: string;
      phone: string;
      department_id: string;
      college_id: string;
    }) => api.post(ENDPOINTS.STUDENTS, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', collegeId] });
    },
  });
}

export function useUpdateStudent(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId,
      reg_no,
      name,
      email,
      phone,
      department_id,
    }: {
      studentId: string;
      reg_no?: string;
      name?: string;
      email?: string;
      phone?: string;
      department_id?: string;
    }) => api.patch(ENDPOINTS.studentById(studentId), { reg_no, name, email, phone, department_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', collegeId] });
    },
  });
}

export function useDeleteStudent(collegeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => api.delete(ENDPOINTS.studentById(studentId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', collegeId] });
    },
  });
}
