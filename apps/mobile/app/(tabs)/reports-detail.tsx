import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  View,
  Text,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAttendanceClasses } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { GlassCard, GlassButton, IconBadge } from '@/components/ui';
import { useThemeColors, colors as staticColors, spacing, typography } from '@/theme';

type ClassRow = {
  id: string;
  name: string;
  class_date: string;
  present_count?: number;
  section_name?: string | null;
  section_id?: string | null;
};

export default function ReportsDetailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const raw = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
  }>();
  const subjectId = Array.isArray(raw.subjectId) ? raw.subjectId[0] : raw.subjectId;
  const subjectName = Array.isArray(raw.subjectName) ? raw.subjectName[0] : raw.subjectName;
  const queryClient = useQueryClient();
  const { data: classes = [], isLoading, refetch } = useAttendanceClasses(subjectId ?? null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleDeleteReport = () => {
    if (!subjectId) return;
    Alert.alert(
      'Delete Report',
      'This will remove all classes and attendance for this subject. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { data } = await api.delete(ENDPOINTS.attendanceDeleteReport(subjectId));
              queryClient.invalidateQueries({ queryKey: ['attendance-classes'] });
              queryClient.invalidateQueries({ queryKey: ['attendance-list', subjectId] });
              queryClient.invalidateQueries({ queryKey: ['subjects-with-reports'] });
              Alert.alert('Deleted', `Report deleted (${data?.deleted ?? 0} records).`, [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.detail || 'Failed to delete');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!subjectId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlassCard>
          <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>Subject required.</Text>
        </GlassCard>
        <GlassButton variant="ghost" size="md" onPress={() => router.back()} style={styles.backButton}>
          Back
        </GlassButton>
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

  const rows = classes as ClassRow[];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={[styles.backBtnText, { color: colors.primary }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{subjectName || 'Attendance'}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Tap a class to view and edit the present list
      </Text>

      <GlassButton
        variant="ghost"
        size="md"
        onPress={handleDeleteReport}
        disabled={deleting || rows.length === 0}
        loading={deleting}
        textStyle={{ color: colors.error }}
        leftIcon={<Ionicons name="trash" size={18} color={colors.error} />}
        style={styles.deleteBtn}
      >
        Delete all
      </GlassButton>

      {rows.length === 0 ? (
        <GlassCard>
          <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>
            No classes saved yet for this subject.
          </Text>
        </GlassCard>
      ) : (
        <GlassCard style={styles.tableCard} variant="solid">
          {rows.map((cls, idx) => (
            <TouchableOpacity
              key={cls.id}
              style={[styles.tableRow, idx < rows.length - 1 && styles.tableRowBorder]}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/class-report',
                  params: {
                    classId: cls.id,
                    subjectId,
                    subjectName: subjectName || '',
                  },
                })
              }
              activeOpacity={0.7}
            >
              <IconBadge variant="primary" size="md">
                <Ionicons name="albums-outline" size={18} color={colors.primary} />
              </IconBadge>
              <View style={styles.recordInfo}>
                <Text style={[styles.recordName, { color: colors.textPrimary }]}>
                  {cls.name}
                  {cls.section_name ? ` · ${cls.section_name}` : ''}
                </Text>
                <Text style={[styles.recordRegNo, { color: colors.textMuted }]}>
                  {cls.class_date} · {cls.present_count ?? 0} present
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </GlassCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  backBtnText: { ...typography.body, color: staticColors.primary },
  backButton: { marginTop: spacing.lg },
  title: { ...typography.h1, color: staticColors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: staticColors.textMuted, marginBottom: spacing.lg },
  restrictedText: { ...typography.body, color: staticColors.textSecondary, textAlign: 'center' },
  deleteBtn: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  tableCard: { padding: 0 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: staticColors.border },
  recordInfo: { flex: 1 },
  recordName: { ...typography.body, color: staticColors.textPrimary, fontWeight: '500' },
  recordRegNo: { ...typography.caption, color: staticColors.textMuted },
});
