import { useState, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';

export default function CreateTeacherScreen() {
  const router = useRouter();
  const { user, token, setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get(ENDPOINTS.ME).then(({ data }) => {
      const parsed = userSchema.safeParse(data);
      if (parsed.success) setAuth(token!, parsed.data);
    }).catch(() => {});
  }, [token]);

  const collegeId = user?.college_id ?? '';
  const departmentId = user?.department_id ?? '';

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
      Alert.alert('Validation Error', 'You must be assigned to a department to add teachers.');
      return;
    }
    setLoading(true);
    try {
      await api.post(ENDPOINTS.USERS, {
        email: trimmedEmail,
        password,
        role: 'TEACHER',
        college_id: collegeId,
        department_id: departmentId,
        name: trimmedName || undefined,
      });
      Alert.alert('Success', 'Teacher created. They will receive a verification email.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      Alert.alert('Failed', ax?.response?.data?.detail ?? 'Could not create teacher.');
    } finally {
      setLoading(false);
    }
  };

  if (String(user?.role ?? '').toUpperCase() !== 'DEPARTMENT_ADMIN') {
    return (
      <View style={styles.container}>
        <Text>Only Department Admin can add teachers.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Add Teacher</Text>
      <Text style={styles.subtitle}>Assign a Teacher to take attendance in your department</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="teacher@example.com"
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

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add Teacher</Text>}
      </TouchableOpacity>
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
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
