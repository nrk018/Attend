import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ENDPOINTS } from '@attend/shared';

export function useColleges(enabled = true) {
  return useQuery({
    queryKey: ['colleges'],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.COLLEGES);
      return data ?? [];
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

export function useSubjects(departmentId: string | null, isTeacher: boolean) {
  return useQuery({
    queryKey: ['subjects', departmentId, isTeacher],
    queryFn: async () => {
      const url = isTeacher ? '/api/v1/subjects' : `/api/v1/subjects?department_id=${departmentId}`;
      const { data } = await api.get(url);
      return data ?? [];
    },
    enabled: isTeacher || !!departmentId,
  });
}

export function useAttendanceList(subjectId: string | null) {
  return useQuery({
    queryKey: ['attendance-list', subjectId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/attendance/list?subject_id=${subjectId}`);
      return data ?? [];
    },
    enabled: !!subjectId,
  });
}

export function useSubjectsWithReports(departmentId: string | null) {
  return useQuery({
    queryKey: ['subjects-with-reports', departmentId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/attendance/subjects-with-reports?department_id=${departmentId}`);
      return data ?? [];
    },
    enabled: !!departmentId,
  });
}

export function useStudents(collegeId: string | null, departmentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['students', collegeId, departmentId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (collegeId) params.set('college_id', collegeId);
      if (departmentId) params.set('department_id', departmentId);
      const { data } = await api.get(`/api/v1/students?${params.toString()}`);
      return data ?? [];
    },
    enabled,
  });
}
