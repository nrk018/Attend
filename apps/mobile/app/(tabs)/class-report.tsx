import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  View,
  Text,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAttendanceClass, useSectionStudents } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { downloadAttendanceReport, reportDownloadError } from '@/lib/downloadReport';
import { GlassCard, GlassButton, IconBadge } from '@/components/ui';
import { useThemeColors, colors as staticColors, spacing, typography } from '@/theme';

type ClassRecord = {
  id: string;
  student_id: string;
  timestamp?: string;
  face_crop_url?: string | null;
  source?: string;
  students?: { name?: string; reg_no?: string } | null;
};

export default function ClassReportScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const raw = useLocalSearchParams<{
    classId?: string;
    subjectId?: string;
    subjectName?: string;
  }>();
  const classId = Array.isArray(raw.classId) ? raw.classId[0] : raw.classId;
  const subjectId = Array.isArray(raw.subjectId) ? raw.subjectId[0] : raw.subjectId;
  const subjectName = Array.isArray(raw.subjectName) ? raw.subjectName[0] : raw.subjectName;
  const { data, isLoading, refetch } = useAttendanceClass(classId ?? null);
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const sectionId = data?.section_id as string | undefined;
  const { data: roster = [] } = useSectionStudents(searchOpen && sectionId ? sectionId : null);

  const records = (data?.records || []) as ClassRecord[];
  const presentIds = useMemo(() => new Set(records.map((r) => r.student_id)), [records]);

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (roster as { id: string; name: string; reg_no: string }[]).filter((s) => {
      if (presentIds.has(s.id)) return false;
      if (!q) return true;
      return s.name?.toLowerCase().includes(q) || s.reg_no?.toLowerCase().includes(q);
    });
  }, [roster, presentIds, searchQuery]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-class', classId] });
    queryClient.invalidateQueries({ queryKey: ['attendance-classes'] });
    queryClient.invalidateQueries({ queryKey: ['subjects-with-reports'] });
  };

  const download = async (type: 'pdf' | 'excel') => {
    if (!subjectId) return;
    setDownloading(type);
    try {
      await downloadAttendanceReport({
        type,
        subjectId,
        subjectName,
        classId,
      });
    } catch (e) {
      Alert.alert('Error', reportDownloadError(e, type));
    } finally {
      setDownloading(null);
    }
  };

  const removeStudent = (studentId: string, name: string) => {
    if (!classId) return;
    Alert.alert('Remove student', `Remove ${name} from this class?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(studentId);
          try {
            await api.delete(ENDPOINTS.attendanceClassStudent(classId, studentId));
            invalidate();
            await refetch();
          } catch (e: any) {
            Alert.alert('Error', e.response?.data?.detail || 'Could not remove student');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const addStudent = async (student: { id: string; name: string }) => {
    if (!classId) return;
    setBusyId(student.id);
    try {
      await api.post(ENDPOINTS.attendanceClassStudents(classId), { student_id: student.id });
      invalidate();
      await refetch();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Could not add student');
    } finally {
      setBusyId(null);
    }
  };

  const deleteClass = () => {
    if (!classId) return;
    Alert.alert('Delete class', 'This removes the class report and its attendance list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.delete(ENDPOINTS.attendanceClassById(classId));
            invalidate();
            Alert.alert('Deleted', 'Class removed.', [
              {
                text: 'OK',
                onPress: () => {
                  if (subjectId) {
                    router.replace({
                      pathname: '/(tabs)/reports-detail',
                      params: { subjectId, subjectName: subjectName || '' },
                    });
                  } else {
                    router.back();
                  }
                },
              },
            ]);
          } catch (e: any) {
            Alert.alert('Error', e.response?.data?.detail || 'Could not delete class');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const continueCapture = () => {
    if (!classId || !data) return;
    router.push({
      pathname: '/(tabs)/attendance-camera',
      params: {
        class_id: classId,
        class_name: data.name || '',
        class_date: data.class_date || '',
        subject_id: data.subject_id || subjectId || '',
        subject_name: data.subject_name || subjectName || '',
        section_id: data.section_id || '',
        section_name: data.section_name || '',
      },
    });
  };

  if (!classId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlassCard>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Class required.</Text>
        </GlassCard>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (subjectId) {
              router.replace({
                pathname: '/(tabs)/reports-detail',
                params: { subjectId, subjectName: subjectName || '' },
              });
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={[styles.backBtnText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {data?.name || 'Class'}
          {data?.section_name ? ` · ${data.section_name}` : ''}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {data?.subject_name || subjectName} · {data?.class_date} · {records.length} present
        </Text>

        <View style={styles.actions}>
          <GlassButton
            variant="secondary"
            size="md"
            onPress={() => download('pdf')}
            disabled={!!downloading || records.length === 0}
            loading={downloading === 'pdf'}
            style={styles.actionButton}
          >
            PDF
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="md"
            onPress={() => download('excel')}
            disabled={!!downloading || records.length === 0}
            loading={downloading === 'excel'}
            style={styles.actionButton}
          >
            Excel
          </GlassButton>
          <GlassButton
            variant="ghost"
            size="md"
            onPress={deleteClass}
            disabled={deleting}
            loading={deleting}
            textStyle={{ color: colors.error }}
            style={styles.actionButton}
          >
            Delete
          </GlassButton>
        </View>

        <View style={styles.actions}>
          <GlassButton variant="primary" size="md" onPress={continueCapture} style={styles.actionButton}>
            Continue capture
          </GlassButton>
          <GlassButton
            variant="secondary"
            size="md"
            onPress={() => {
              setSearchQuery('');
              setSearchOpen(true);
            }}
            style={styles.actionButton}
          >
            Add student
          </GlassButton>
        </View>

        <GlassCard style={styles.tableCard} variant="solid">
          {records.map((r, idx) => {
            const student = r.students || {};
            return (
              <View
                key={r.id || r.student_id}
                style={[styles.tableRow, idx < records.length - 1 && styles.tableRowBorder]}
              >
                {r.face_crop_url ? (
                  <Image source={{ uri: r.face_crop_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Ionicons name="person" size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.recordInfo}>
                  <Text style={[styles.recordName, { color: colors.textPrimary }]}>{student.name || '—'}</Text>
                  <Text style={[styles.recordRegNo, { color: colors.textMuted }]}>
                    {student.reg_no || '—'} · {r.source === 'manual' ? 'Manual' : 'Face'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeStudent(r.student_id, student.name || 'student')}
                  disabled={busyId === r.student_id}
                >
                  {busyId === r.student_id ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          {records.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No students on this class list yet.</Text>
          )}
        </GlassCard>
      </ScrollView>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSearchOpen(false)}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
            <Text style={[styles.recordName, { color: colors.textPrimary }]}>Search section</Text>
            <View style={{ width: 40 }} />
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Name or reg no"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.searchInput,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.card },
            ]}
            autoFocus
          />
          <ScrollView>
            {filteredRoster.map((s) => (
              <TouchableOpacity key={s.id} style={styles.tableRow} onPress={() => addStudent(s)} disabled={!!busyId}>
                <IconBadge variant="secondary" size="md">
                  <Ionicons name="person" size={16} color={colors.textMuted} />
                </IconBadge>
                <View style={styles.recordInfo}>
                  <Text style={[styles.recordName, { color: colors.textPrimary }]}>{s.name}</Text>
                  <Text style={[styles.recordRegNo, { color: colors.textMuted }]}>{s.reg_no}</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))}
            {filteredRoster.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No matching students to add.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xl },
  backBtnText: { ...typography.body, color: staticColors.primary },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionButton: { flex: 1 },
  tableCard: { padding: 0, marginTop: spacing.md },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: staticColors.border },
  thumb: { width: 44, height: 44, borderRadius: 22 },
  thumbPlaceholder: {
    backgroundColor: staticColors.surfaceGlass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordInfo: { flex: 1 },
  recordName: { ...typography.body, fontWeight: '500' },
  recordRegNo: { ...typography.caption },
  empty: { ...typography.body, textAlign: 'center', padding: spacing.lg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
