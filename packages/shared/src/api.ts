function readEnv(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) return process.env[key];
  } catch {
    /* browser bundles have no process */
  }
  return undefined;
}

export const API_BASE = readEnv('EXPO_PUBLIC_API_URL') || readEnv('VITE_API_URL') || 'http://localhost:8000';

export const ENDPOINTS = {
  LOGIN: '/api/v1/auth/login',
  ME: '/api/v1/auth/me',
  VERIFY_EMAIL: '/api/v1/auth/verify-email',
  RESEND_VERIFICATION: '/api/v1/auth/resend-verification',
  COLLEGES: '/api/v1/colleges',
  COLLEGE_UPLOAD_LOGO: '/api/v1/colleges/upload-logo',
  collegeById: (id: string) => `/api/v1/colleges/${id}`,
  USERS: '/api/v1/users',
  USERS_PENDING: '/api/v1/users/pending',
  userById: (id: string) => `/api/v1/users/${id}`,
  userApprove: (id: string) => `/api/v1/users/${id}/approve`,
  DEPARTMENTS: '/api/v1/departments',
  departmentById: (id: string) => `/api/v1/departments/${id}`,
  SUBJECTS: '/api/v1/subjects',
  subjectById: (id: string) => `/api/v1/subjects/${id}`,
  
  // Sections
  subjectSections: (subjectId: string) => `/api/v1/subjects/${subjectId}/sections`,
  subjectEnrolledStudentIds: (subjectId: string) => `/api/v1/subjects/${subjectId}/enrolled-student-ids`,
  sectionById: (sectionId: string) => `/api/v1/sections/${sectionId}`,
  sectionTeachers: (sectionId: string) => `/api/v1/sections/${sectionId}/teachers`,
  sectionTeacher: (sectionId: string, teacherId: string) => `/api/v1/sections/${sectionId}/teachers/${teacherId}`,
  sectionStudents: (sectionId: string) => `/api/v1/sections/${sectionId}/students`,
  sectionStudent: (sectionId: string, studentId: string) => `/api/v1/sections/${sectionId}/students/${studentId}`,
  MY_SECTIONS: '/api/v1/my-sections',
  
  STUDENTS: '/api/v1/students',
  STUDENTS_PENDING_APPROVAL: '/api/v1/students/pending-approval',
  STUDENTS_GENERATE_EMBEDDINGS: '/api/v1/students/generate-embeddings',
  studentById: (id: string) => `/api/v1/students/${id}`,
  studentApproveEnrollment: (id: string) => `/api/v1/students/${id}/approve-enrollment`,
  studentDenyEnrollment: (id: string) => `/api/v1/students/${id}/deny-enrollment`,
  studentReviewPhoto: (id: string, kind: string) => `/api/v1/students/${id}/review-photo/${kind}`,
  addStudentFace: (id: string) => `/api/v1/students/${id}/add-face`,
  ENROLL_STUDENT: '/api/v1/students/enroll',
  RECOGNIZE: '/api/v1/recognize',
  RECOGNIZE_TEST: '/api/v1/recognize/test',
  RECOGNIZE_STREAM_START: '/api/v1/recognize/stream/start',
  RECOGNIZE_STREAM: '/api/v1/recognize/stream',
  RECOGNIZE_STREAM_END: '/api/v1/recognize/stream/end',
  ATTENDANCE: '/api/v1/attendance',
  ATTENDANCE_REPORT: '/api/v1/attendance/report',
  ATTENDANCE_REPORT_SIMPLE_EXCEL: '/api/v1/attendance/report/simple-excel',
  ATTENDANCE_REPORT_SIMPLE_PDF: '/api/v1/attendance/report/simple-pdf',
  ATTENDANCE_SUBJECTS_WITH_REPORTS: '/api/v1/attendance/subjects-with-reports',
  ATTENDANCE_CLASSES: '/api/v1/attendance/classes',
  attendanceClasses: (subjectId: string, sectionId?: string, classDate?: string) => {
    const params = new URLSearchParams({ subject_id: subjectId });
    if (sectionId) params.set('section_id', sectionId);
    if (classDate) params.set('class_date', classDate);
    return `/api/v1/attendance/classes?${params.toString()}`;
  },
  attendanceClassById: (classId: string) => `/api/v1/attendance/classes/${classId}`,
  attendanceClassSave: (classId: string) => `/api/v1/attendance/classes/${classId}/save`,
  attendanceClassStudents: (classId: string) => `/api/v1/attendance/classes/${classId}/students`,
  attendanceClassStudent: (classId: string, studentId: string) =>
    `/api/v1/attendance/classes/${classId}/students/${studentId}`,
  attendanceList: (subjectId: string, sectionId?: string) => 
    `/api/v1/attendance/list?subject_id=${subjectId}${sectionId ? `&section_id=${sectionId}` : ''}`,
  attendanceById: (id: string) => `/api/v1/attendance/${id}`,
  attendanceDeleteReport: (subjectId: string) => `/api/v1/attendance/report/subject/${subjectId}`,
  ADMIN_STATS: '/api/v1/admin/stats',
  PUBLIC_COLLEGES: '/api/v1/public/colleges',
  publicDepartments: (collegeId: string) => `/api/v1/public/colleges/${collegeId}/departments`,
  PUBLIC_STUDENT_LOOKUP: '/api/v1/public/students/lookup',
  PUBLIC_STUDENT_VERIFY: '/api/v1/public/students/verify-email',
  PUBLIC_STUDENT_ID_PREVIEW: '/api/v1/public/students/id-preview',
  PUBLIC_STUDENT_ID_CARD: '/api/v1/public/students/id-card',
  PUBLIC_STUDENT_COMPARE: '/api/v1/public/students/compare-face',
  PUBLIC_STUDENT_FACES: '/api/v1/public/students/faces',
} as const;

export function subjectStudentsUrl(subjectId: string) {
  return `/api/v1/subjects/${subjectId}/students`;
}
