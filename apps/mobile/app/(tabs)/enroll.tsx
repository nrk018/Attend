import { useMemo, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  View,
  Text,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { useStudents } from '@/lib/queries';
import { can, CAPABILITIES } from '@attend/shared';
import { GlassCard } from '@/components/ui';
import { useThemeColors, spacing, typography } from '@/theme';

type RosterStudent = {
  id: string;
  name: string;
  reg_no: string;
  enrollment_status?: string | null;
};

export default function EnrollScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const allowed = can(user?.role, CAPABILITIES.enrollFaces);
  const { data: students = [], isLoading } = useStudents(
    user?.college_id ?? null,
    user?.department_id ?? null,
    allowed && !!(user?.college_id || user?.department_id),
    false
  );

  const pending = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students as RosterStudent[]).filter((s) => {
      if (s.enrollment_status === 'enrolled') return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.reg_no.toLowerCase().includes(q);
    });
  }, [students, query]);

  if (!allowed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlassCard>
          <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>
            Only Department Admins can enroll faces for students already on the roster.
          </Text>
        </GlassCard>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Enroll faces</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Super Admin adds student details. Pick a rostered student and capture front, left, and right.
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or registration number"
        placeholderTextColor={colors.textMuted}
        style={[styles.search, { color: colors.textPrimary, borderColor: colors.border }]}
      />
      {isLoading ? (
        <Text style={{ color: colors.textMuted }}>Loading roster…</Text>
      ) : pending.length === 0 ? (
        <GlassCard>
          <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>
            No students waiting for face enrollment in this department.
          </Text>
        </GlassCard>
      ) : (
        pending.map((student) => (
          <TouchableOpacity
            key={student.id}
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/enroll-camera',
                params: { student_id: student.id, name: student.name, reg_no: student.reg_no },
              })
            }
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{student.name}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{student.reg_no}</Text>
            </View>
            <Ionicons name="camera-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { ...typography.title, marginBottom: 8 },
  subtitle: { ...typography.body, marginBottom: 16 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  restrictedText: { ...typography.body },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  rowTitle: { ...typography.subtitle },
  rowSubtitle: { marginTop: 2 },
});
