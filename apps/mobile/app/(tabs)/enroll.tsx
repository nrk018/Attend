import { useState, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';
import { useColleges, useDepartments } from '@/lib/queries';

export default function EnrollScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [collegeModalOpen, setCollegeModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const effectiveCollegeId = collegeId || user?.college_id || '';
  const { data: colleges = [] } = useColleges(isPlatformAdmin);
  const { data: departments = [] } = useDepartments(
    isPlatformAdmin ? (collegeId || null) : (user?.college_id || null)
  );

  useEffect(() => {
    if (user?.college_id && !isPlatformAdmin) setCollegeId(user.college_id);
  }, [user?.college_id, isPlatformAdmin]);

  useEffect(() => {
    if (user?.department_id && (user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'TEACHER')) setDepartmentId(user.department_id);
  }, [user?.department_id, user?.role]);

  useEffect(() => {
    if (isPlatformAdmin && !collegeId) setDepartmentId('');
  }, [collegeId, isPlatformAdmin]);

  const selectedCollege = colleges.find((c) => c.id === effectiveCollegeId);
  const selectedDept = departments.find((d) => d.id === departmentId);
  const isDeptAdmin = user?.role === 'DEPARTMENT_ADMIN';
  const isTeacher = user?.role === 'TEACHER';

  const canProceedFromStep1 = effectiveCollegeId && departmentId;

  const handleContinueFromStep1 = () => {
    if (!canProceedFromStep1) return;
    setStep(2);
  };

  const handleEnroll = () => {
    setFieldError(null);
    const effectiveDeptId = departmentId || user?.department_id || '';
    const trimmedRegNo = regNo.trim();
    const trimmedName = name.trim();
    if (!trimmedRegNo || !trimmedName) {
      setFieldError('Registration number and name are required');
      Alert.alert('Validation Error', 'Please enter registration number and name.');
      return;
    }
    if (!effectiveCollegeId || !effectiveDeptId) {
      setFieldError('Department is required');
      return;
    }
    const params = new URLSearchParams({
      reg_no: trimmedRegNo,
      name: trimmedName,
      college_id: effectiveCollegeId,
      department_id: effectiveDeptId,
    });
    router.push(`/(tabs)/enroll-camera?${params.toString()}`);
  };

  if (user?.role !== 'DEPARTMENT_ADMIN' && user?.role !== 'SUPER_ADMIN' && user?.role !== 'PLATFORM_ADMIN' && user?.role !== 'TEACHER') {
    return (
      <View style={styles.container}>
        <Text>Only admins and teachers can enroll students.</Text>
      </View>
    );
  }

  const isSuperAdmin = String(user?.role ?? '').toUpperCase() === 'SUPER_ADMIN';

  if (step === 1) {
    return (
      <ScrollView style={styles.container}>
        {isSuperAdmin && (
          <TouchableOpacity
            style={[styles.viewStudentsBtn, styles.createDeptAdminBtn]}
            onPress={() => router.push('/(tabs)/create-department-admin')}
          >
            <Text style={styles.viewStudentsText}>Create Department Admin</Text>
          </TouchableOpacity>
        )}
        {isDeptAdmin && (
          <TouchableOpacity
            style={[styles.viewStudentsBtn, styles.addTeacherBtn]}
            onPress={() => router.push('/(tabs)/create-teacher')}
          >
            <Text style={styles.viewStudentsText}>Add Teacher</Text>
          </TouchableOpacity>
        )}
        {!isTeacher && (
          <TouchableOpacity
            style={styles.viewStudentsBtn}
            onPress={() => router.push('/(tabs)/student-list')}
          >
            <Text style={styles.viewStudentsText}>View Students • Edit Details</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.stepTitle}>Step 1: Select Department</Text>
        <Text style={styles.stepHint}>Choose the department first. You can add student details next.</Text>
        {isPlatformAdmin && (
          <>
            <Text style={styles.label}>College</Text>
            <TouchableOpacity style={styles.select} onPress={() => setCollegeModalOpen(true)}>
              <Text style={styles.selectText}>{selectedCollege?.name ?? 'Select college'}</Text>
            </TouchableOpacity>
          </>
        )}
        <Text style={styles.label}>Department</Text>
        {(isDeptAdmin || isTeacher) ? (
          <View style={styles.select}>
            <Text style={styles.selectText}>{selectedDept?.name ?? '—'}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.select, !effectiveCollegeId && styles.selectDisabled]}
            onPress={() => effectiveCollegeId && setDeptModalOpen(true)}
            disabled={!effectiveCollegeId}
          >
            <Text style={styles.selectText}>
              {selectedDept?.name ?? (effectiveCollegeId ? 'Select department' : 'Select college first')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, !canProceedFromStep1 && styles.buttonDisabled]}
          onPress={handleContinueFromStep1}
          disabled={!canProceedFromStep1}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>

        <Modal visible={collegeModalOpen} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setCollegeModalOpen(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select College</Text>
              <FlatList
                data={colleges}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setCollegeId(item.id);
                      setCollegeModalOpen(false);
                    }}
                  >
                    <Text>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity style={styles.modalClose} onPress={() => setCollegeModalOpen(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={deptModalOpen} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setDeptModalOpen(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Department</Text>
              <FlatList
                data={departments}
                keyExtractor={(d) => d.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setDepartmentId(item.id);
                      setDeptModalOpen(false);
                    }}
                  >
                    <Text>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity style={styles.modalClose} onPress={() => setDeptModalOpen(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backLink} onPress={() => setStep(1)}>
        <Text style={styles.backLinkText}>← Change department</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>Step 2: Student Details</Text>
      <Text style={styles.deptBadge}>{selectedDept?.name}</Text>

      <Text style={styles.label}>Registration No</Text>
      <TextInput style={styles.input} value={regNo} onChangeText={setRegNo} placeholder="e.g. 2024001" />
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Student name" />

      {fieldError && <Text style={styles.error}>{fieldError}</Text>}
      <TouchableOpacity style={styles.button} onPress={handleEnroll} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enroll (Open Camera)</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  stepTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  stepHint: { fontSize: 14, opacity: 0.7, marginBottom: 24 },
  deptBadge: { fontSize: 14, opacity: 0.8, marginBottom: 20 },
  viewStudentsBtn: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,122,255,0.15)',
    borderRadius: 8,
  },
  createDeptAdminBtn: { backgroundColor: 'rgba(52,199,89,0.25)' },
  addTeacherBtn: { backgroundColor: 'rgba(88,86,214,0.25)' },
  viewStudentsText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  backLink: { alignSelf: 'flex-start', marginBottom: 16 },
  backLinkText: { color: '#007AFF', fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  select: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  selectDisabled: { opacity: 0.6 },
  selectText: { fontSize: 16 },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ff3b30', marginTop: 8, fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  modalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalClose: { marginTop: 16, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: '#007AFF' },
});
