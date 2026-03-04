import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';
import { useSubjectsWithReports } from '@/lib/queries';

export default function ReportsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const departmentId = user?.department_id ?? null;
  const { data: subjects = [], isLoading } = useSubjectsWithReports(departmentId);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance Reports</Text>
        <ActivityIndicator size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance Reports</Text>
      <Text style={styles.subtitle}>
        {subjects.length === 0
          ? 'No attendance data yet. Reports appear after you capture attendance.'
          : 'Tap a subject to view attendance by date'}
      </Text>
      {subjects.map((s) => (
        <TouchableOpacity
          key={s.id}
          style={styles.subjectBtn}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/reports-detail',
              params: { subjectId: s.id, subjectName: s.name },
            })
          }
        >
          <Text style={styles.subjectName}>{s.name}</Text>
          <Text style={styles.downloadText}>View ›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
  subjectBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 8,
  },
  subjectName: { fontSize: 16, fontWeight: '500' },
  downloadText: { color: '#007AFF', fontSize: 14 },
});
