import { StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

export default function ProfileCardScreen() {
  const { user } = useAuthStore();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name || '—'}</Text>
        <Text style={styles.role}>{user?.role ? formatRole(user.role) : '—'}</Text>
        {user?.college_name && (
          <Text style={styles.college}>{user.college_name}</Text>
        )}
        <Text style={styles.email}>{user?.email || '—'}</Text>
        <Text style={styles.contact}>{user?.contact_number || '—'}</Text>
      </View>
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => router.push('/(tabs)/profile-edit')}
      >
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: 'rgba(0,122,255,0.08)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.2)',
  },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  role: { fontSize: 16, opacity: 0.8, marginBottom: 8, textTransform: 'capitalize' },
  college: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  email: { fontSize: 15, marginBottom: 6 },
  contact: { fontSize: 15 },
  editButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  editButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
});
