/**
 * Types are re-exported from schemas for Zod-inferred types.
 * Legacy interfaces kept for backward compatibility - prefer schemas.
 */
export type { User, College, Department, Subject, Student, LoginResponse } from './schemas';
export type { Role } from './roles';

export interface Attendance {
  id: string;
  student_id: string;
  subject_id: string;
  timestamp: string;
  confidence: number;
  face_crop_url: string | null;
}

export interface RecognitionResult {
  student_id: string;
  student_name: string;
  reg_no: string;
  confidence: number;
  reference_image_url: string;
  face_crop_base64?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
