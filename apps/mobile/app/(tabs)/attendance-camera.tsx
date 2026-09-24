import { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  TextInput,
  useWindowDimensions,
  View,
  Text,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiBase, uploadForm } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { useSectionStudents } from '@/lib/queries';
import { GlassButton, GlassCard } from '@/components/ui';
import { useThemeColors, spacing, typography, borderRadius } from '@/theme';

interface RecognizeResult {
  student_id: string | null;
  student_name: string | null;
  reg_no: string | null;
  confidence: number;
  face_crop_base64: string | null;
  bbox?: number[];
  unknown: boolean;
}

type ClassStudent = {
  student_id: string;
  student_name: string;
  reg_no: string;
  confidence: number;
  face_crop_base64?: string | null;
  face_crop_url?: string | null;
  source: 'face' | 'manual';
};

type SessionView = 'list' | 'photo' | 'live';

function formatAttendanceError(err: unknown): string {
  const ax = err as {
    response?: { data?: { detail?: string | unknown[] | Record<string, unknown> }; status?: number };
    message?: string;
    code?: string;
  };
  const status = ax?.response?.status;
  const detail = ax?.response?.data?.detail;
  let body = '';
  if (typeof detail === 'string' && detail) body = detail;
  else if (Array.isArray(detail) && detail[0]) {
    const first = detail[0] as { msg?: string };
    body = first?.msg ?? JSON.stringify(detail);
  } else if (detail && typeof detail === 'object') {
    body = JSON.stringify(detail);
  } else {
    body = ax?.message || 'Could not save attendance.';
  }
  const prefix = status ? `(${status}) ` : '';
  const isNetwork =
    !ax?.response ||
    ax?.code === 'ECONNABORTED' ||
    ax?.code === 'ERR_NETWORK' ||
    body.toLowerCase().includes('network');
  if (isNetwork) return `${prefix}${body}\n\nAPI: ${getApiBase()}`;
  return `${prefix}${body}`;
}

export default function AttendanceCameraScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const rawParams = useLocalSearchParams<{
    subject_id?: string;
    subject_name?: string;
    section_id?: string;
    section_name?: string;
    class_id?: string;
    class_name?: string;
    class_date?: string;
    test_mode?: string;
  }>();
  const param = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const params = {
    subject_id: param(rawParams.subject_id),
    subject_name: param(rawParams.subject_name),
    section_id: param(rawParams.section_id),
    section_name: param(rawParams.section_name),
    class_id: param(rawParams.class_id),
    class_name: param(rawParams.class_name),
    class_date: param(rawParams.class_date),
    test_mode: param(rawParams.test_mode),
  };
  const isTestMode = params.test_mode === 'true';
  const { width: screenW, height: screenH } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasPermission = permission?.granted ?? false;
  const [view, setView] = useState<SessionView>('photo');
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingClass, setLoadingClass] = useState(!isTestMode && !!params.class_id);
  const [classStudents, setClassStudents] = useState<ClassStudent[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('[]');
  const [testResults, setTestResults] = useState<RecognizeResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveOverlay, setLiveOverlay] = useState<{
    results: RecognizeResult[];
    imgW: number;
    imgH: number;
  } | null>(null);
  const [livePaused, setLivePaused] = useState(false);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureInProgressRef = useRef(false);
  const presentIds = new Set(classStudents.map((s) => s.student_id));

  const { data: sectionRoster = [] } = useSectionStudents(
    searchOpen && params.section_id ? params.section_id : null
  );

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (isTestMode || !params.class_id) {
      setLoadingClass(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(ENDPOINTS.attendanceClassById(params.class_id!));
        if (cancelled) return;
        const records = (data?.records || []) as Array<{
          student_id: string;
          confidence?: number;
          face_crop_url?: string | null;
          source?: string;
          students?: { name?: string; reg_no?: string } | null;
        }>;
        const loaded: ClassStudent[] = records
          .filter((r) => r.student_id)
          .map((r) => ({
            student_id: r.student_id,
            student_name: r.students?.name || 'Student',
            reg_no: r.students?.reg_no || '',
            confidence: Number(r.confidence ?? 1),
            face_crop_url: r.face_crop_url,
            source: r.source === 'manual' ? 'manual' : 'face',
          }));
        setClassStudents(loaded);
        setSavedSnapshot(JSON.stringify(loaded.map((s) => s.student_id).sort()));
        setDirty(false);
        if (loaded.length > 0) setView('list');
      } catch (err) {
        Alert.alert('Could not load class', formatAttendanceError(err));
      } finally {
        if (!cancelled) setLoadingClass(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTestMode, params.class_id]);

  const mergeStudents = useCallback((incoming: ClassStudent[]) => {
    setClassStudents((prev) => {
      const byId = new Map(prev.map((s) => [s.student_id, s]));
      for (const s of incoming) {
        const existing = byId.get(s.student_id);
        if (!existing || (s.source === 'face' && s.confidence >= existing.confidence)) {
          byId.set(s.student_id, { ...existing, ...s });
        }
      }
      return Array.from(byId.values());
    });
    setDirty(true);
  }, []);

  const removeStudent = (studentId: string) => {
    setClassStudents((prev) => prev.filter((s) => s.student_id !== studentId));
    setDirty(true);
  };

  const postRecognize = async (formData: FormData) => {
    const endpoint = isTestMode ? ENDPOINTS.RECOGNIZE_TEST : ENDPOINTS.RECOGNIZE;
    return uploadForm<{ results?: RecognizeResult[]; image_width?: number; image_height?: number }>(
      endpoint,
      formData
    );
  };

  const handleCapture = async () => {
    if (!camera.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) throw new Error('No photo captured');
      const formData = new FormData();
      if (!isTestMode && params.subject_id) formData.append('subject_id', params.subject_id);
      if (!isTestMode && params.section_id) formData.append('section_id', params.section_id);
      formData.append('image', {
        uri: photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as unknown as Blob);
      const data = await postRecognize(formData);
      const list = data?.results ?? [];
      if (isTestMode) {
        setTestResults(list);
        setView('list');
        return;
      }
      const added = list.filter((r) => !r.unknown && r.student_id) as RecognizeResult[];
      mergeStudents(
        added.map((r) => ({
          student_id: r.student_id!,
          student_name: r.student_name || 'Student',
          reg_no: r.reg_no || '',
          confidence: r.confidence,
          face_crop_base64: r.face_crop_base64,
          source: 'face' as const,
        }))
      );
      const newCount = added.filter((r) => r.student_id && !presentIds.has(r.student_id)).length;
      Alert.alert(
        'Photo added',
        newCount > 0
          ? `Added ${newCount} student${newCount === 1 ? '' : 's'}. Take another photo or review the class list.`
          : added.length > 0
            ? 'Those students were already on the list.'
            : 'No matching students in this photo.'
      );
    } catch (err: unknown) {
      Alert.alert('Recognition Failed', formatAttendanceError(err));
    } finally {
      setCapturing(false);
    }
  };

  const startLive = async () => {
    try {
      if (isTestMode) {
        setSessionId('test');
      } else {
        const { data } = await api.post<{ session_id: string }>(ENDPOINTS.RECOGNIZE_STREAM_START, {});
        setSessionId(data?.session_id ?? null);
      }
      setLiveOverlay(null);
      setLivePaused(false);
      setView('live');
    } catch (err) {
      Alert.alert('Failed to start live', formatAttendanceError(err));
    }
  };

  const captureLiveFrame = useCallback(async () => {
    if (!camera.current || !sessionId || (!isTestMode && !params.subject_id)) return;
    if (captureInProgressRef.current) return;
    captureInProgressRef.current = true;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) return;
      const formData = new FormData();
      if (!isTestMode) {
        formData.append('session_id', sessionId);
        formData.append('subject_id', params.subject_id!);
        if (params.section_id) formData.append('section_id', params.section_id);
      }
      formData.append('image', {
        uri: photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`,
        type: 'image/jpeg',
        name: 'frame.jpg',
      } as unknown as Blob);
      const endpoint = isTestMode ? ENDPOINTS.RECOGNIZE_TEST : ENDPOINTS.RECOGNIZE_STREAM;
      const data = await uploadForm<{ results?: RecognizeResult[]; image_width?: number; image_height?: number }>(
        endpoint,
        formData
      );
      const newResults = data?.results ?? [];
      setLiveOverlay({
        results: newResults,
        imgW: Math.max(1, data?.image_width ?? 1),
        imgH: Math.max(1, data?.image_height ?? 1),
      });
      if (newResults.some((r) => !r.unknown)) setLivePaused(true);
    } catch {
      // Ignore frame errors during live
    } finally {
      captureInProgressRef.current = false;
    }
  }, [sessionId, params.subject_id, params.section_id, isTestMode]);

  useEffect(() => {
    if (view === 'live' && sessionId && !livePaused) {
      captureLiveFrame();
      liveIntervalRef.current = setInterval(captureLiveFrame, 1200);
    }
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, [view, sessionId, livePaused, captureLiveFrame]);

  const stopLive = async () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    if (sessionId && !isTestMode) {
      try {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        await uploadForm(ENDPOINTS.RECOGNIZE_STREAM_END, formData);
      } catch {
        // Ignore
      }
    }
    setSessionId(null);
    setLiveOverlay(null);
    setLivePaused(false);
    setView(isTestMode ? 'photo' : 'list');
  };

  const acceptLive = (r: RecognizeResult) => {
    if (!r.student_id || r.unknown) return;
    if (isTestMode) return;
    mergeStudents([
      {
        student_id: r.student_id,
        student_name: r.student_name || 'Student',
        reg_no: r.reg_no || '',
        confidence: r.confidence,
        face_crop_base64: r.face_crop_base64,
        source: 'face',
      },
    ]);
    setLiveOverlay((ov) =>
      ov ? { ...ov, results: ov.results.filter((x) => x.student_id !== r.student_id) } : null
    );
  };

  const handleSave = async () => {
    if (!params.class_id) {
      Alert.alert('No class', 'Start attendance from a class date first.');
      return;
    }
    setSaving(true);
    try {
      const roster = classStudents.map((s) => ({
        student_id: String(s.student_id),
        confidence: Number.isFinite(Number(s.confidence)) ? Number(s.confidence) : 1,
        source: s.source === 'manual' ? 'manual' : 'face',
      }));
      await api.post(ENDPOINTS.attendanceClassSave(params.class_id), { records: roster });
      const withCrops = classStudents.filter((s) => s.face_crop_base64);
      if (withCrops.length) {
        try {
          await api.post(ENDPOINTS.attendanceClassSave(params.class_id), {
            records: classStudents.map((s) => ({
              student_id: String(s.student_id),
              confidence: Number.isFinite(Number(s.confidence)) ? Number(s.confidence) : 1,
              source: s.source === 'manual' ? 'manual' : 'face',
              face_crop_base64: s.face_crop_base64 || undefined,
            })),
          });
        } catch {
          // Roster is already saved; crops are optional thumbnails.
        }
      }
      setSavedSnapshot(JSON.stringify(classStudents.map((s) => s.student_id).sort()));
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-class', params.class_id] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-classes'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-list'] }),
        queryClient.invalidateQueries({ queryKey: ['subjects-with-reports'] }),
      ]);
      router.replace({
        pathname: '/(tabs)/class-report',
        params: {
          classId: params.class_id,
          subjectId: params.subject_id || '',
          subjectName: params.subject_name || '',
        },
      });
    } catch (err) {
      Alert.alert('Save Failed', formatAttendanceError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    const current = JSON.stringify(classStudents.map((s) => s.student_id).sort());
    const unsaved = dirty || current !== savedSnapshot;
    if (unsaved && !isTestMode) {
      Alert.alert('Exit class?', 'Unsaved changes to this class list will be lost.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => {
            if (view === 'live') stopLive();
            router.back();
          },
        },
      ]);
      return;
    }
    if (view === 'live') stopLive();
    router.back();
  };

  const addManual = (student: { id: string; name: string; reg_no: string }) => {
    if (presentIds.has(student.id)) return;
    mergeStudents([
      {
        student_id: student.id,
        student_name: student.name,
        reg_no: student.reg_no,
        confidence: 1,
        source: 'manual',
      },
    ]);
  };

  const roster = (sectionRoster as { id: string; name: string; reg_no: string }[]).filter((s) => {
    if (presentIds.has(s.id)) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return s.name?.toLowerCase().includes(q) || s.reg_no?.toLowerCase().includes(q);
  });

  const sessionMeta = [params.subject_name, params.section_name, params.class_date]
    .filter(Boolean)
    .join(' · ');

  if (!permission) {
    return <View style={[styles.fill, { backgroundColor: colors.background }]} />;
  }
  if (!hasPermission) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.centeredTitle, { color: colors.textPrimary }]}>Camera needed</Text>
        <Text style={[styles.centeredCopy, { color: colors.textSecondary }]}>
          Camera permission is required for attendance.
        </Text>
        <GlassButton variant="primary" size="lg" onPress={requestPermission}>
          Grant permission
        </GlassButton>
      </View>
    );
  }

  if (loadingClass) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.centeredCopy, { color: colors.textMuted }]}>Loading class…</Text>
      </View>
    );
  }

  const liveMatches =
    liveOverlay?.results.filter((r) => !r.unknown && r.student_id && !presentIds.has(r.student_id)) ?? [];

  if (view === 'photo' || view === 'live') {
    return (
      <View style={styles.cameraRoot}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
        {view === 'live' && liveOverlay && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {liveOverlay.results.map((r, i) => {
              const [x1, y1, x2, y2] = r.bbox || [0, 0, 0, 0];
              const scaleX = screenW / liveOverlay.imgW;
              const scaleY = screenH / liveOverlay.imgH;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.bbox,
                    {
                      left: x1 * scaleX,
                      top: y1 * scaleY,
                      width: (x2 - x1) * scaleX,
                      height: (y2 - y1) * scaleY,
                      borderColor: r.unknown ? '#FF3B30' : colors.primary,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        <View style={[styles.cameraTop, { paddingTop: Math.max(insets.top, 12) }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => (view === 'live' ? stopLive() : isTestMode ? handleExit() : setView('list'))}
            activeOpacity={0.85}
          >
            <BlurView intensity={40} tint="dark" style={styles.camChip}>
              <Ionicons name={view === 'live' || isTestMode ? 'close' : 'chevron-back'} size={18} color="#fff" />
              <Text style={styles.camChipText}>{view === 'live' || isTestMode ? 'Close' : 'List'}</Text>
            </BlurView>
          </TouchableOpacity>
          <BlurView intensity={40} tint="dark" style={[styles.camChip, styles.camTitleChip]}>
            <Text style={styles.camTitle} numberOfLines={1}>
              {isTestMode ? 'Test recognition' : params.class_name || 'Class'}
            </Text>
            {!isTestMode && (
              <Text style={styles.camTitleMeta}>{classStudents.length} present</Text>
            )}
          </BlurView>
          <TouchableOpacity onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} activeOpacity={0.85}>
            <BlurView intensity={40} tint="dark" style={styles.camChip}>
              <Ionicons name="camera-reverse" size={18} color="#fff" />
              <Text style={styles.camChipText}>Flip</Text>
            </BlurView>
          </TouchableOpacity>
        </View>

        {view === 'live' && liveMatches.length > 0 && (
          <ScrollView
            horizontal
            style={[styles.acceptChips, { bottom: 150 + insets.bottom }]}
            contentContainerStyle={styles.acceptChipsContent}
            showsHorizontalScrollIndicator={false}
          >
            {liveMatches.map((r) => (
              <View key={r.student_id} style={styles.acceptChip}>
                {r.face_crop_base64 ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${r.face_crop_base64}` }}
                    style={styles.acceptChipThumb}
                  />
                ) : null}
                <Text style={styles.acceptChipName} numberOfLines={1}>
                  {r.student_name}
                </Text>
                <TouchableOpacity style={styles.acceptChipBtn} onPress={() => acceptLive(r)}>
                  <Text style={styles.acceptChipBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {view === 'live' && livePaused && (
          <TouchableOpacity
            style={[styles.continueBtn, { bottom: 96 + insets.bottom }]}
            onPress={() => {
              setLiveOverlay(null);
              setLivePaused(false);
            }}
          >
            <Text style={styles.continueBtnText}>Continue scanning</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.cameraBottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {view === 'photo' ? (
            <TouchableOpacity style={styles.shutter} onPress={handleCapture} disabled={capturing} activeOpacity={0.85}>
              {capturing ? <ActivityIndicator color="#111" /> : <View style={styles.shutterInner} />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.liveDone} onPress={stopLive} activeOpacity={0.85}>
              <Text style={styles.liveDoneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const studentThumb = (s: ClassStudent) => {
    if (s.face_crop_base64) return { uri: `data:image/jpeg;base64,${s.face_crop_base64}` };
    if (s.face_crop_url) return { uri: s.face_crop_url };
    return null;
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.listHeader, { paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={handleExit} style={styles.backRow} activeOpacity={0.7} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backLabel, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <View style={[styles.countPill, { backgroundColor: colors.primary }]}>
          <Text style={[styles.countPillText, { color: colors.textOnPrimary }]}>
            {isTestMode ? testResults.length : classStudents.length} present
          </Text>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.classTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {isTestMode ? 'Test results' : params.class_name || 'Class'}
        </Text>
        {!isTestMode && !!sessionMeta && (
          <Text style={[styles.classMeta, { color: colors.textMuted }]} numberOfLines={2}>
            {sessionMeta}
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isTestMode ? (
          testResults.length === 0 ? (
            <GlassCard variant="solid" style={styles.emptyCard}>
              <Ionicons name="scan-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No faces yet</Text>
              <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
                Take a photo to test recognition.
              </Text>
            </GlassCard>
          ) : (
            testResults.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.studentRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  r.unknown && { opacity: 0.5 },
                ]}
              >
                {r.face_crop_base64 ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${r.face_crop_base64}` }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.surfaceGlass }]}>
                    <Ionicons name="person" size={18} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.studentCopy}>
                  <Text style={[styles.studentName, { color: colors.textPrimary }]}>
                    {r.unknown ? 'Unknown' : r.student_name}
                  </Text>
                  <Text style={[styles.studentMeta, { color: colors.textMuted }]}>
                    {r.unknown ? 'No match' : `${r.reg_no} · ${(r.confidence * 100).toFixed(0)}%`}
                  </Text>
                </View>
              </View>
            ))
          )
        ) : classStudents.length === 0 ? (
          <GlassCard variant="solid" style={styles.emptyCard}>
            <Ionicons name="people-outline" size={36} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No one marked yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
              Photograph the class, run live scan, or add someone from the roster.
            </Text>
          </GlassCard>
        ) : (
          classStudents.map((s) => {
            const thumb = studentThumb(s);
            return (
              <View
                key={s.student_id}
                style={[styles.studentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {thumb ? (
                  <Image source={thumb} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.surfaceGlass }]}>
                    <Ionicons name="person" size={18} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.studentCopy}>
                  <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.student_name}</Text>
                  <Text style={[styles.studentMeta, { color: colors.textMuted }]}>
                    {s.reg_no || '—'}
                    {s.source === 'manual' ? ' · Manual' : ` · ${(s.confidence * 100).toFixed(0)}%`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeStudent(s.student_id)} hitSlop={8} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={22} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        style={[
          styles.dock,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {isTestMode ? (
          <View style={styles.actionRow}>
            <ActionTile
              icon="camera"
              label="Photo"
              color={colors.textPrimary}
              border={colors.border}
              surface={colors.card}
              onPress={() => setView('photo')}
            />
            <ActionTile
              icon="close"
              label="Close"
              color={colors.textPrimary}
              border={colors.border}
              surface={colors.card}
              onPress={handleExit}
            />
          </View>
        ) : (
          <>
            <View style={styles.actionRow}>
              <ActionTile
                icon="camera"
                label="Photo"
                color={colors.textPrimary}
                border={colors.border}
                surface={colors.card}
                onPress={() => setView('photo')}
              />
              <ActionTile
                icon="videocam"
                label="Live"
                color={colors.textPrimary}
                border={colors.border}
                surface={colors.card}
                onPress={startLive}
              />
              <ActionTile
                icon="search"
                label="Roster"
                color={colors.textPrimary}
                border={colors.border}
                surface={colors.card}
                onPress={() => {
                  setSearchQuery('');
                  setSearchOpen(true);
                }}
              />
            </View>
            <GlassButton variant="primary" size="lg" onPress={handleSave} loading={saving} disabled={saving}>
              Save class ({classStudents.length})
            </GlassButton>
          </>
        )}
      </View>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <View style={[styles.fill, { backgroundColor: colors.background }]}>
          <View style={[styles.listHeader, { paddingTop: Math.max(insets.top, 8) }]}>
            <TouchableOpacity onPress={() => setSearchOpen(false)} style={styles.backRow} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
              <Text style={[styles.backLabel, { color: colors.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.titleBlock}>
            <Text style={[styles.classTitle, { color: colors.textPrimary }]}>Section roster</Text>
            <Text style={[styles.classMeta, { color: colors.textMuted }]}>Tap a student to mark present</Text>
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name or reg no"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.searchInput,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.card },
            ]}
            autoFocus
          />
          <ScrollView contentContainerStyle={styles.listScrollContent}>
            {roster.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.studentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => addManual(s)}
                activeOpacity={0.7}
              >
                <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.surfaceGlass }]}>
                  <Ionicons name="person" size={18} color={colors.textMuted} />
                </View>
                <View style={styles.studentCopy}>
                  <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.name}</Text>
                  <Text style={[styles.studentMeta, { color: colors.textMuted }]}>{s.reg_no}</Text>
                </View>
                <Ionicons name="add-circle" size={24} color={colors.primary} />
              </TouchableOpacity>
            ))}
            {roster.length === 0 && (
              <Text style={[styles.emptyCopy, { color: colors.textMuted, textAlign: 'center', padding: spacing.xl }]}>
                {params.section_id ? 'No matching students left to add.' : 'No section roster available.'}
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ActionTile({
  icon,
  label,
  color,
  border,
  surface,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  border: string;
  surface: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionTile, { borderColor: border, backgroundColor: surface }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  centeredTitle: { ...typography.h3, textAlign: 'center' },
  centeredCopy: { ...typography.body, textAlign: 'center' },
  cameraRoot: { flex: 1, backgroundColor: '#000' },
  cameraTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    zIndex: 4,
  },
  camChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  camTitleChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  camChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  camTitle: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  camTitleMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  cameraBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  liveDone: {
    backgroundColor: '#00C853',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  liveDoneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 6 },
  continueBtn: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#00C853',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
    zIndex: 5,
  },
  continueBtnText: { color: '#fff', fontWeight: '700' },
  acceptChips: { position: 'absolute', left: 0, right: 0, maxHeight: 140, zIndex: 5 },
  acceptChipsContent: { paddingHorizontal: 12, gap: 10 },
  acceptChip: {
    width: 110,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  acceptChipThumb: { width: 48, height: 48, borderRadius: 24, marginBottom: 6 },
  acceptChipName: { color: '#fff', fontSize: 12, fontWeight: '600' },
  acceptChipBtn: {
    marginTop: 6,
    backgroundColor: '#00C853',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  acceptChipBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  backLabel: { ...typography.button, marginLeft: 2 },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  countPillText: { ...typography.caption, fontWeight: '700' },
  titleBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  classTitle: { ...typography.h2 },
  classMeta: { ...typography.bodySmall, marginTop: 4 },
  listScroll: { flex: 1 },
  listScrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { ...typography.h3, textAlign: 'center' },
  emptyCopy: { ...typography.bodySmall, textAlign: 'center' },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  thumb: { width: 44, height: 44, borderRadius: 22 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  studentCopy: { flex: 1 },
  studentName: { ...typography.body, fontWeight: '600' },
  studentMeta: { ...typography.caption, marginTop: 2 },
  removeBtn: { padding: 4 },
  dock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minHeight: 64,
  },
  actionLabel: { ...typography.caption, fontWeight: '700' },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.body,
  },
});
