import { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, View, Text, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth';
import { useMySections, useAttendanceClasses, useAttendanceClass } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { GlassCard, GlassButton, IconBadge } from '@/components/ui';
import { useThemeColors, colors as staticColors, spacing, typography, shadows } from '@/theme';

type MySectionItem = { id: string; name: string; created_at?: string };
type MySectionsSubject = { subject_id: string; subject_name: string; sections: MySectionItem[] };
type ClassRow = {
  id: string;
  name: string;
  class_date: string;
  present_count?: number;
  section_name?: string | null;
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AttendanceScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [classDate, setClassDate] = useState(localToday);
  const [creatingClass, setCreatingClass] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isTeacherOrDeptAdmin = user?.role === 'TEACHER' || user?.role === 'DEPARTMENT_ADMIN';
  const { data: mySectionsData = [], isLoading: mySectionsLoading } = useMySections();

  const mySections = mySectionsData as MySectionsSubject[];
  const subjectsFromMySections = mySections.map((s) => ({ id: s.subject_id, name: s.subject_name }));
  const selectedSubjectData = mySections.find((s) => s.subject_id === selectedSubject);
  const sectionsFromMySections = selectedSubjectData?.sections ?? [];
  const sectionReady = !!selectedSubject && (sectionsFromMySections.length === 0 || !!selectedSection);
  const { data: dayClasses = [], isLoading: classesLoading, isError: classesError, refetch: refetchClasses } = useAttendanceClasses(
    sectionReady ? selectedSubject : null,
    selectedSection,
    classDate
  );
  const { data: expandedClass, isLoading: expandedLoading } = useAttendanceClass(expandedClassId);

  useEffect(() => {
    setSelectedSection(null);
    setExpandedClassId(null);
  }, [selectedSubject]);

  useEffect(() => {
    setExpandedClassId(null);
  }, [classDate, selectedSection]);

  const openClassSession = (cls: { id: string; name: string; class_date?: string }) => {
    const subject = subjectsFromMySections.find((s) => s.id === selectedSubject);
    const section = sectionsFromMySections.find((s) => s.id === selectedSection);
    router.push({
      pathname: '/(tabs)/attendance-camera',
      params: {
        class_id: cls.id,
        class_name: cls.name,
        class_date: cls.class_date || classDate,
        subject_id: selectedSubject!,
        subject_name: subject?.name ?? '',
        section_id: selectedSection ?? '',
        section_name: section?.name ?? '',
      },
    });
  };

  const handleStartNewClass = async () => {
    if (!selectedSubject) return;
    setCreatingClass(true);
    try {
      const { data } = await api.post(ENDPOINTS.ATTENDANCE_CLASSES, {
        subject_id: selectedSubject,
        section_id: selectedSection || undefined,
        class_date: classDate,
      });
      await refetchClasses();
      openClassSession({ id: data.id, name: data.name, class_date: data.class_date || classDate });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown }; status?: number }; message?: string };
      const detail = ax?.response?.data?.detail;
      let msg = ax?.message || 'Please try again.';
      if (typeof detail === 'string' && detail) msg = detail;
      else if (Array.isArray(detail) && detail[0]) {
        const first = detail[0] as { msg?: string };
        msg = first?.msg || JSON.stringify(detail);
      } else if (detail) msg = JSON.stringify(detail);
      Alert.alert('Could not start class', msg);
    } finally {
      setCreatingClass(false);
    }
  };

  const handleTestRecognition = () => {
    router.push({
      pathname: '/(tabs)/attendance-camera',
      params: { test_mode: 'true' },
    });
  };

  if (
    user?.role !== 'TEACHER' &&
    user?.role !== 'DEPARTMENT_ADMIN' &&
    user?.role !== 'SUPER_ADMIN'
  ) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlassCard>
          <Text style={[styles.restrictedText, { color: colors.textSecondary }]}>
            Teachers can take attendance.
          </Text>
        </GlassCard>
      </View>
    );
  }

  if (mySectionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading...</Text>
      </View>
    );
  }

  if (mySections.length === 0 && isTeacherOrDeptAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Take Attendance</Text>
          <GlassCard variant="solid">
            <View style={styles.emptyStateContent}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>
                No sections assigned
              </Text>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                You can only take attendance for sections you are assigned to. Contact your department admin to get assigned to a section.
              </Text>
            </View>
          </GlassCard>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Take Attendance</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {isSuperAdmin
          ? 'Test recognition or select subject'
          : 'Select subject, date, then start or resume a class'}
      </Text>

      {isSuperAdmin && (
        <TouchableOpacity
          style={[styles.testCard, shadows.glow]}
          onPress={handleTestRecognition}
          activeOpacity={0.8}
        >
          <IconBadge variant="success" size="lg" style={styles.testIcon}>
            <Ionicons name="scan" size={24} color={colors.success} />
          </IconBadge>
          <View style={styles.testTextContainer}>
            <Text style={[styles.testTitle, { color: colors.success }]}>Test Recognition</Text>
            <Text style={[styles.testHint, { color: colors.textSecondary }]}>
              Capture photo or live stream to test face recognition
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.success} />
        </TouchableOpacity>
      )}

      {subjectsFromMySections.length > 0 && (
        <>
          {isSuperAdmin && subjectsFromMySections.length > 0 && (
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={[styles.dividerText, { color: colors.textMuted }]}>or take attendance</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>STEP 1: SELECT SUBJECT</Text>
          <GlassCard style={styles.subjectsCard} variant="solid">
            {subjectsFromMySections.map((s, index) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.subjectItem,
                  selectedSubject === s.id && styles.subjectItemActive,
                  index < subjectsFromMySections.length - 1 && styles.subjectItemBorder,
                ]}
                onPress={() => setSelectedSubject(s.id)}
                activeOpacity={0.7}
              >
                <View style={styles.subjectInfo}>
                  <IconBadge
                    variant={selectedSubject === s.id ? 'primary' : 'secondary'}
                    size="md"
                  >
                    <Ionicons
                      name="book-outline"
                      size={20}
                      color={
                        selectedSubject === s.id
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  </IconBadge>
                  <Text
                    style={[
                      styles.subjectName,
                      { color: selectedSubject === s.id ? colors.primary : colors.textPrimary },
                      selectedSubject === s.id && styles.subjectNameActive,
                    ]}
                  >
                    {s.name}
                  </Text>
                </View>
                {selectedSubject === s.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </GlassCard>

          {selectedSubject && (
            <>
              <Text style={[styles.stepLabel, { color: colors.textMuted }]}>STEP 2: SELECT SECTION</Text>
              {sectionsFromMySections.length === 0 ? (
                <GlassCard variant="solid" style={styles.noSectionsCard}>
                  <View style={styles.noSectionsContent}>
                    <Ionicons name="information-circle-outline" size={24} color={colors.textMuted} />
                    <Text style={[styles.noSectionsText, { color: colors.textSecondary }]}>
                      No sections found for this subject.
                    </Text>
                  </View>
                </GlassCard>
              ) : (
                <GlassCard style={styles.subjectsCard} variant="solid">
                  {sectionsFromMySections.map((s, index) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.subjectItem,
                        selectedSection === s.id && styles.subjectItemActive,
                        index < sectionsFromMySections.length - 1 && styles.subjectItemBorder,
                      ]}
                      onPress={() => setSelectedSection(s.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.subjectInfo}>
                        <IconBadge
                          variant={selectedSection === s.id ? 'primary' : 'secondary'}
                          size="md"
                        >
                          <Text
                            style={[
                              styles.sectionIcon,
                              { color: selectedSection === s.id ? colors.primary : colors.textMuted },
                            ]}
                          >
                            {s.name}
                          </Text>
                        </IconBadge>
                        <Text
                          style={[
                            styles.subjectName,
                            { color: selectedSection === s.id ? colors.primary : colors.textPrimary },
                            selectedSection === s.id && styles.subjectNameActive,
                          ]}
                        >
                          Section {s.name}
                        </Text>
                      </View>
                      {selectedSection === s.id && (
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </GlassCard>
              )}
            </>
          )}

          {sectionReady && (
            <>
              <Text style={[styles.stepLabel, { color: colors.textMuted }]}>STEP 3: CLASS DATE</Text>
              <GlassCard variant="solid" style={styles.dateCard}>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    onPress={() => setClassDate((d) => shiftIsoDate(d, -1))}
                    style={styles.dateArrow}
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={styles.dateCenter}>
                    <Text style={[styles.dateValue, { color: colors.textPrimary }]}>
                      {formatDisplayDate(classDate)}
                    </Text>
                    {classDate !== localToday() && (
                      <TouchableOpacity onPress={() => setClassDate(localToday())}>
                        <Text style={[styles.todayLink, { color: colors.primary }]}>Jump to today</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setClassDate((d) => shiftIsoDate(d, 1))}
                    style={styles.dateArrow}
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </GlassCard>

              <Text style={[styles.stepLabel, { color: colors.textMuted }]}>STEP 4: CLASS</Text>
              {classesLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
              ) : classesError ? (
                <GlassCard variant="solid" style={styles.noSectionsCard}>
                  <Text style={[styles.noSectionsText, { color: colors.textSecondary }]}>
                    Could not load classes. Pull back and try again, or start a new period.
                  </Text>
                </GlassCard>
              ) : (dayClasses as ClassRow[]).length > 0 ? (
                <GlassCard style={styles.subjectsCard} variant="solid">
                  {(dayClasses as ClassRow[]).map((cls, index, arr) => {
                    const expanded = expandedClassId === cls.id;
                    const records = (expandedClass?.records || []) as {
                      student_id: string;
                      students?: { name?: string; reg_no?: string } | null;
                      source?: string;
                    }[];
                    return (
                      <View
                        key={cls.id}
                        style={index < arr.length - 1 && !expanded ? styles.subjectItemBorder : undefined}
                      >
                        <TouchableOpacity
                          style={styles.subjectItem}
                          onPress={() => setExpandedClassId(expanded ? null : cls.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.subjectInfo}>
                            <IconBadge variant="primary" size="md">
                              <Ionicons name="albums-outline" size={20} color={colors.primary} />
                            </IconBadge>
                            <View>
                              <Text style={[styles.subjectName, { color: colors.textPrimary }]}>{cls.name}</Text>
                              <Text style={[styles.classMeta, { color: colors.primary }]}>
                                {cls.present_count ?? 0} present · tap to view list
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                        {expanded && (
                          <View style={styles.presentList}>
                            {expandedLoading ? (
                              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                            ) : records.length === 0 ? (
                              <Text style={[styles.classMeta, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                                No students marked yet.
                              </Text>
                            ) : (
                              records.map((r) => (
                                <View key={r.student_id} style={styles.presentRow}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.presentName, { color: colors.textPrimary }]}>
                                      {r.students?.name || 'Student'}
                                    </Text>
                                    <Text style={[styles.classMeta, { color: colors.textMuted }]}>
                                      {r.students?.reg_no || '—'}
                                      {r.source === 'manual' ? ' · Manual' : ''}
                                    </Text>
                                  </View>
                                </View>
                              ))
                            )}
                            <GlassButton
                              variant="secondary"
                              size="md"
                              onPress={() => openClassSession(cls)}
                              style={styles.resumeBtn}
                            >
                              Resume capture
                            </GlassButton>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </GlassCard>
              ) : (
                <GlassCard variant="solid" style={styles.noSectionsCard}>
                  <Text style={[styles.noSectionsText, { color: colors.textSecondary }]}>
                    No class yet on this date. Start a new period.
                  </Text>
                </GlassCard>
              )}

              <GlassButton
                variant="primary"
                size="lg"
                onPress={handleStartNewClass}
                disabled={creatingClass}
                loading={creatingClass}
                style={styles.cameraButton}
                leftIcon={<Ionicons name="add-circle" size={20} color={colors.textOnPrimary} />}
              >
                Start new class
              </GlassButton>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    ...typography.h1,
    color: staticColors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: staticColors.textMuted,
    marginBottom: spacing.xl,
  },
  restrictedText: {
    ...typography.body,
    color: staticColors.textSecondary,
    textAlign: 'center',
  },
  emptyStateContent: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyStateTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyStateText: {
    ...typography.body,
    textAlign: 'center',
    color: staticColors.textSecondary,
  },
  testCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  testIcon: {
    marginRight: spacing.md,
  },
  testTextContainer: {
    flex: 1,
  },
  testTitle: {
    ...typography.body,
    color: staticColors.success,
    fontWeight: '700',
  },
  testHint: {
    ...typography.caption,
    color: staticColors.textSecondary,
    marginTop: 2,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: staticColors.border,
  },
  dividerText: {
    ...typography.caption,
    color: staticColors.textMuted,
    marginHorizontal: spacing.md,
  },
  subjectsCard: {
    padding: 0,
    marginBottom: spacing.lg,
  },
  subjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  subjectItemActive: {
    backgroundColor: 'rgba(0, 200, 83, 0.05)',
  },
  subjectItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: staticColors.border,
  },
  subjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  subjectName: {
    ...typography.body,
    color: staticColors.textPrimary,
  },
  subjectNameActive: {
    color: staticColors.primary,
    fontWeight: '600',
  },
  stepLabel: {
    ...typography.caption,
    letterSpacing: 1,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  sectionIcon: {
    fontWeight: '700',
    fontSize: 14,
  },
  loadingText: {
    ...typography.body,
    textAlign: 'center',
    padding: spacing.lg,
  },
  noSectionsCard: {
    marginBottom: spacing.lg,
  },
  noSectionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  noSectionsText: {
    ...typography.caption,
    flex: 1,
  },
  cameraButton: {
    marginTop: spacing.md,
  },
  dateCard: {
    marginBottom: spacing.lg,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateArrow: {
    padding: spacing.sm,
  },
  dateCenter: {
    alignItems: 'center',
    flex: 1,
  },
  dateValue: {
    ...typography.h3,
    textAlign: 'center',
  },
  todayLink: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  classMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  presentList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  presentRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: staticColors.border,
  },
  presentName: {
    ...typography.body,
    fontWeight: '600',
  },
  resumeBtn: {
    marginTop: spacing.md,
  },
});
