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
import { useDepartments } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';

export default function CreateDepartmentAdminScreen() {
  const router = useRouter();
  const { user, token, setAuth } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    api.get(ENDPOINTS.ME).then(({ data }) => {
      const parsed = userSchema.safeParse(data);
      if (parsed.success) setAuth(token!, parsed.data);
    }).catch(() => {});
  }, [token]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);

  const collegeId = user?.college_id ?? '';
  const { data: departments = [] } = useDepartments(collegeId || null);
  const selectedDept = departments.find((d: { id: string }) => d.id === departmentId);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Validation Error', 'Email and password are required.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }
    if (!departmentId) {
      Alert.alert('Validation Error', 'Please select a department.');
      return;
    }
    setLoading(true);
    try {
      await api.post(ENDPOINTS.USERS, {
        email: trimmedEmail,
        password,
        role: 'DEPARTMENT_ADMIN',
        college_id: collegeId,
        department_id: departmentId,
        name: trimmedName || undefined,
      });
      Alert.alert('Success', 'Department Admin created. They will receive a verification email.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      Alert.alert('Failed', ax?.response?.data?.detail ?? 'Could not create user.');
    } finally {
      setLoading(false);
    }
  };

  if (String(user?.role ?? '').toUpperCase() !== 'SUPER_ADMIN') {
    return (
      <View style={styles.container}>
        <Text>Only Super Admin can create Department Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Create Department Admin</Text>
      <Text style={styles.subtitle}>Assign a Department Admin to manage a department</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="admin@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Min 6 characters"
        secureTextEntry
      />
      <Text style={styles.label}>Name (optional)</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Full name"
      />
      <Text style={styles.label}>Department</Text>
      <TouchableOpacity style={styles.select} onPress={() => setDeptModalOpen(true)}>
        <Text style={styles.selectText}>{selectedDept?.name ?? 'Select department'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Department Admin</Text>}
      </TouchableOpacity>

      <Modal visible={deptModalOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setDeptModalOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Department</Text>
            <FlatList
              data={departments}
              keyExtractor={(d: { id: string }) => d.id}
              renderItem={({ item }: { item: { id: string; name: string } }) => (
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
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
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
