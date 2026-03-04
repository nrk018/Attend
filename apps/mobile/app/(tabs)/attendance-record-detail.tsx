import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  View,
  Text,
} from 'react-native';

export default function AttendanceRecordDetailScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{
    attendanceId?: string;
    subjectName?: string;
    regNo?: string;
    studentName?: string;
    faceCropUrl?: string;
    timestamp?: string;
  }>();
  const subjectName = Array.isArray(raw.subjectName) ? raw.subjectName[0] : raw.subjectName;
  const regNo = Array.isArray(raw.regNo) ? raw.regNo[0] : raw.regNo;
  const studentName = Array.isArray(raw.studentName) ? raw.studentName[0] : raw.studentName;
  const faceCropUrl = Array.isArray(raw.faceCropUrl) ? raw.faceCropUrl[0] : raw.faceCropUrl;
  const timestamp = Array.isArray(raw.timestamp) ? raw.timestamp[0] : raw.timestamp;

  if (!raw.attendanceId) {
    return (
      <View style={styles.container}>
        <Text>Record not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Attendance Record</Text>
      <Text style={styles.subjectLabel}>Subject: {subjectName || '—'}</Text>
      <Text style={styles.timeLabel}>Time: {(timestamp || '').slice(0, 19) || '—'}</Text>

      {faceCropUrl ? (
        <Image source={{ uri: faceCropUrl }} style={styles.faceImage} />
      ) : (
        <View style={[styles.faceImage, styles.facePlaceholder]}>
          <Text style={styles.facePlaceholderText}>No image</Text>
        </View>
      )}

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Registration No</Text>
        <Text style={styles.detailValue}>{regNo || '—'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Student Name</Text>
        <Text style={styles.detailValue}>{studentName || '—'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#007AFF', fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subjectLabel: { fontSize: 16, marginBottom: 4 },
  timeLabel: { fontSize: 16, marginBottom: 24 },
  faceImage: { width: 160, height: 160, borderRadius: 12, alignSelf: 'center', marginBottom: 24 },
  facePlaceholder: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  facePlaceholderText: { color: '#999', fontSize: 14 },
  detailRow: { marginBottom: 12 },
  detailLabel: { fontSize: 14, opacity: 0.7 },
  detailValue: { fontSize: 18, fontWeight: '500' },
  backLink: { color: '#007AFF', marginTop: 16 },
});
