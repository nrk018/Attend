import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';
import { useSubjects } from '@/lib/queries';

export default function AttendanceScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const isTeacher = user?.role === 'TEACHER';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { data: subjects = [] } = useSubjects(
    user?.department_id ?? null,
    !!isTeacher
  );

  const handleTakeAttendance = () => {
    const subject = subjects.find((s) => s.id === selectedSubject);
    router.push({
      pathname: '/(tabs)/attendance-camera',
      params: {
        subject_id: selectedSubject!,
        subject_name: subject?.name ?? '',
      },
    });
  };

  const handleTestRecognition = () => {
    router.push({
      pathname: '/(tabs)/attendance-camera',
      params: { test_mode: 'true' },
    });
  };

  if (user?.role !== 'TEACHER' && user?.role !== 'DEPARTMENT_ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return (
      <View style={styles.container}>
        <Text>Teachers can take attendance.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Take Attendance</Text>
      <Text style={styles.subtitle}>
        {isSuperAdmin ? 'Test recognition or select subject' : 'Select subject and open camera'}
      </Text>

      {isSuperAdmin && (
        <TouchableOpacity style={styles.testBtn} onPress={handleTestRecognition}>
          <Text style={styles.testBtnText}>Test Recognition</Text>
          <Text style={styles.testBtnHint}>Capture photo or live stream to test face recognition</Text>
        </TouchableOpacity>
      )}

      {(subjects.length > 0 || !isSuperAdmin) && (
        <>
          {isSuperAdmin && subjects.length > 0 && <Text style={styles.divider}>— or take attendance —</Text>}
          {subjects.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.subjectBtn, selectedSubject === s.id && styles.subjectBtnActive]}
              onPress={() => setSelectedSubject(s.id)}
            >
              <Text>{s.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.button, !selectedSubject && styles.buttonDisabled]}
            onPress={handleTakeAttendance}
            disabled={!selectedSubject}
          >
            <Text style={styles.buttonText}>Open Camera</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { opacity: 0.7, marginBottom: 24 },
  subjectBtn: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 8,
  },
  subjectBtnActive: { borderColor: '#007AFF', backgroundColor: 'rgba(0,122,255,0.1)' },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  testBtn: {
    backgroundColor: '#34C759',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  testBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  testBtnHint: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 6 },
  divider: { textAlign: 'center', opacity: 0.6, marginBottom: 16 },
});
