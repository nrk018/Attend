export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  DEPARTMENT_ADMIN: 'DEPARTMENT_ADMIN',
  TEACHER: 'TEACHER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  PLATFORM_ADMIN: ['SUPER_ADMIN'],
  SUPER_ADMIN: ['DEPARTMENT_ADMIN'],
  DEPARTMENT_ADMIN: ['TEACHER'],
  TEACHER: [],
};

export const CAPABILITIES = {
  manageColleges: 'manageColleges',
  manageSuperAdmins: 'manageSuperAdmins',
  manageDepartments: 'manageDepartments',
  manageDeptAdmins: 'manageDeptAdmins',
  provisionStudents: 'provisionStudents',
  manageSubjects: 'manageSubjects',
  manageSections: 'manageSections',
  assignSectionStudents: 'assignSectionStudents',
  createTeachers: 'createTeachers',
  enrollFaces: 'enrollFaces',
  takeAttendance: 'takeAttendance',
  viewAssignedRoster: 'viewAssignedRoster',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  PLATFORM_ADMIN: [
    CAPABILITIES.manageColleges,
    CAPABILITIES.manageSuperAdmins,
  ],
  SUPER_ADMIN: [
    CAPABILITIES.manageDepartments,
    CAPABILITIES.manageDeptAdmins,
    CAPABILITIES.provisionStudents,
  ],
  DEPARTMENT_ADMIN: [
    CAPABILITIES.manageSubjects,
    CAPABILITIES.manageSections,
    CAPABILITIES.assignSectionStudents,
    CAPABILITIES.createTeachers,
    CAPABILITIES.enrollFaces,
  ],
  TEACHER: [CAPABILITIES.takeAttendance, CAPABILITIES.viewAssignedRoster],
};

export function can(role: Role | string | null | undefined, capability: Capability): boolean {
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role as Role].includes(capability);
}

export function isRole(value: string | null | undefined, role: Role): boolean {
  return String(value ?? '').toUpperCase() === role;
}
