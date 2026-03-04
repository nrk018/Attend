import { useEffect } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';

export default function DashboardScreen() {
  const { user, logout, setAuth, token } = useAuthStore();
  const displayUser = user;

  useEffect(() => {
    if (!token) return;
    api.get(ENDPOINTS.ME).then(({ data }) => {
      const parsed = userSchema.safeParse(data);
      if (parsed.success) {
        setAuth(token!, parsed.data);
      }
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (displayUser && (!displayUser.name?.trim() || !displayUser.contact_number?.trim())) {
      router.replace('/(tabs)/profile-edit');
    }
  }, [displayUser]);

  const isSuperAdmin = String(displayUser?.role ?? '').toUpperCase() === 'SUPER_ADMIN';
  const isDeptAdmin = String(displayUser?.role ?? '').toUpperCase() === 'DEPARTMENT_ADMIN';

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Dashboard</Text>
      <Text style={styles.title}>Welcome, {displayUser?.name || displayUser?.email}</Text>
      {isSuperAdmin && (
        <TouchableOpacity
          style={[styles.button, styles.superAdminBtn]}
          onPress={() => router.push('/(tabs)/create-department-admin')}
        >
          <Text style={styles.buttonText}>Create Department Admin</Text>
        </TouchableOpacity>
      )}
      {isDeptAdmin && (
        <TouchableOpacity
          style={[styles.button, styles.deptAdminBtn]}
          onPress={() => router.push('/(tabs)/create-teacher')}
        >
          <Text style={styles.buttonText}>Add Teacher</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/enroll')}>
        <Text style={styles.buttonText}>Enroll Student</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/attendance')}>
        <Text style={styles.buttonText}>Take Attendance</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/reports')}>
        <Text style={styles.buttonText}>View Reports</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => {
          logout();
          router.replace('/(auth)/login');
        }}
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8, opacity: 0.8 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  superAdminBtn: { backgroundColor: '#34C759' },
  deptAdminBtn: { backgroundColor: '#5856D6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  logoutButton: { marginTop: 24, padding: 12, alignItems: 'center' },
  logoutText: { color: '#ff3b30', fontSize: 16 },
});
