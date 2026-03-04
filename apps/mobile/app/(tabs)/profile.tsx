import { StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';

export default function ProfileScreen() {
  const { user } = useAuthStore();

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Attend</Text>
        <TouchableOpacity
          style={styles.photoCircle}
          onPress={() => router.push('/(tabs)/profile-card')}
          activeOpacity={0.8}
        >
          <View style={styles.photoInner}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.hint}>Tap your profile photo to view details</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: { fontSize: 22, fontWeight: 'bold' },
  photoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: { color: '#fff', fontSize: 20, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 15, opacity: 0.6 },
});
