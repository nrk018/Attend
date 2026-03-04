import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuthStore } from '@/store/auth';
import { useStudents } from '@/lib/queries';

export default function StudentListScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isDeptAdmin = user?.role === 'DEPARTMENT_ADMIN';

  const collegeId = isPlatformAdmin ? null : (user?.college_id ?? null);
  const departmentId = isDeptAdmin ? (user?.department_id ?? null) : null;

  const { data: students = [], isLoading } = useStudents(
    collegeId,
    departmentId,
    user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'PLATFORM_ADMIN'
  );

  const canManage = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'PLATFORM_ADMIN';

  if (!canManage) {
    return (
      <View style={styles.container}>
        <Text>Only admins can view the student list.</Text>
      </View>
    );
  }

  if (isLoading) {
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
      <Text style={styles.title}>Students</Text>
      <Text style={styles.subtitle}>{students.length} student(s)</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colRegNo]}>Reg No</Text>
          <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
          <Text style={[styles.tableHeaderCell, styles.colDept]}>Department</Text>
          <Text style={[styles.tableHeaderCell, styles.colChevron]}> </Text>
        </View>
        {students.map((item, idx) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.tableRow, idx === students.length - 1 && styles.tableRowLast]}
            onPress={() => router.push({ pathname: '/(tabs)/edit-student', params: { studentId: item.id } })}
          >
            <Text style={[styles.tableCell, styles.colRegNo]} numberOfLines={1}>{item.reg_no}</Text>
            <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.tableCell, styles.colDept]} numberOfLines={1}>{item.department_name ?? '—'}</Text>
            <Text style={[styles.tableCell, styles.colChevron]}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#007AFF', fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, opacity: 0.7, marginBottom: 20 },
  table: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableHeaderCell: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCell: { fontSize: 14, color: '#333' },
  colRegNo: { width: 100, marginRight: 12 },
  colName: { flex: 1, marginRight: 12 },
  colDept: { width: 120, marginRight: 8 },
  colChevron: { width: 24, fontSize: 18, opacity: 0.5, textAlign: 'center' },
});
