import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useDepartments } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';

export default function EditStudentScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [student, setStudent] = useState<{
    id: string;
    reg_no: string;
    name: string;
    college_id: string;
    department_id: string;
    department_name?: string;
    primary_image_url?: string | null;
    left_image_url?: string | null;
    right_image_url?: string | null;
  } | null>(null);
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);

  const collegeId = student?.college_id ?? user?.college_id ?? '';
  const { data: departments = [] } = useDepartments(collegeId || null);
  const selectedDept = departments.find((d) => d.id === departmentId);

  const fetchStudent = useCallback(() => {
    const sid = Array.isArray(studentId) ? studentId[0] : studentId;
    if (!sid) return;
    setLoading(true);
    api
      .get(ENDPOINTS.studentById(sid))
      .then(({ data }) => {
        setStudent(data);
        setRegNo(data.reg_no ?? '');
        setName(data.name ?? '');
        setDepartmentId(data.department_id ?? '');
      })
      .catch(() => Alert.alert('Error', 'Failed to load student'))
      .finally(() => setLoading(false));
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      fetchStudent();
    }, [fetchStudent])
  );

  const handleSave = async () => {
    if (!studentId || !regNo.trim() || !name.trim()) {
      Alert.alert('Validation Error', 'Registration number and name are required.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(ENDPOINTS.studentById(studentId), {
        reg_no: regNo.trim(),
        name: name.trim(),
        department_id: departmentId || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      Alert.alert('Saved', 'Student details updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      Alert.alert('Error', ax?.response?.data?.detail ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFace = (pose: 'left' | 'right') => {
    const sid = Array.isArray(studentId) ? studentId[0] : studentId;
    if (!sid) return;
    router.push({ pathname: '/(tabs)/add-face-camera', params: { studentId: sid, pose } });
  };

  if (loading || !student) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Edit Student</Text>

      <Text style={styles.label}>Registration No</Text>
      <TextInput style={styles.input} value={regNo} onChangeText={setRegNo} placeholder="e.g. 2024001" />
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Student name" />
      <Text style={styles.label}>Department</Text>
      <TouchableOpacity style={styles.select} onPress={() => setDeptModalOpen(true)}>
        <Text style={styles.selectText}>{selectedDept?.name ?? 'Select department'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Details</Text>}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Face Images</Text>
      <Text style={styles.hint}>All three poses improve recognition. Add any that are missing.</Text>

      <View style={styles.faceStatusRow}>
        <View style={[styles.faceBadge, student.primary_image_url && styles.faceBadgeComplete]}>
          <Text style={styles.faceBadgeLabel}>Front</Text>
          <Text style={styles.faceBadgeStatus}>{student.primary_image_url ? '✓' : '—'}</Text>
        </View>
        <View style={[styles.faceBadge, student.left_image_url && styles.faceBadgeComplete]}>
          <Text style={styles.faceBadgeLabel}>Left</Text>
          <Text style={styles.faceBadgeStatus}>{student.left_image_url ? '✓' : '—'}</Text>
        </View>
        <View style={[styles.faceBadge, student.right_image_url && styles.faceBadgeComplete]}>
          <Text style={styles.faceBadgeLabel}>Right</Text>
          <Text style={styles.faceBadgeStatus}>{student.right_image_url ? '✓' : '—'}</Text>
        </View>
      </View>

      {student.primary_image_url ? (
        <View style={styles.primaryThumb}>
          <Image source={{ uri: student.primary_image_url }} style={styles.primaryThumbImg} />
          <Text style={styles.primaryThumbLabel}>Primary (front) – set at enrollment</Text>
        </View>
      ) : null}

      <View style={styles.faceActions}>
        <TouchableOpacity
          style={[styles.faceBtn, student.left_image_url ? styles.faceBtnComplete : styles.faceBtnMissing]}
          onPress={() => handleAddFace('left')}
        >
          <Text style={styles.faceBtnText}>
            {student.left_image_url ? 'Left ✓ Replace' : 'Add Left Face'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.faceBtn, student.right_image_url ? styles.faceBtnComplete : styles.faceBtnMissing]}
          onPress={() => handleAddFace('right')}
        >
          <Text style={styles.faceBtnText}>
            {student.right_image_url ? 'Right ✓ Replace' : 'Add Right Face'}
          </Text>
        </TouchableOpacity>
      </View>

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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#007AFF', fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
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
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 32, marginBottom: 8 },
  hint: { fontSize: 14, opacity: 0.7, marginBottom: 16 },
  faceStatusRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  faceBadge: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  faceBadgeComplete: { backgroundColor: 'rgba(52,199,89,0.2)' },
  faceBadgeLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8 },
  faceBadgeStatus: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  primaryThumb: { marginBottom: 16, alignItems: 'center' },
  primaryThumbImg: { width: 80, height: 80, borderRadius: 8 },
  primaryThumbLabel: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  faceActions: { gap: 12 },
  faceBtn: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  faceBtnComplete: { backgroundColor: '#34C759' },
  faceBtnMissing: { backgroundColor: '#FF9500' },
  faceBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
