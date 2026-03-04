import { useState } from 'react';
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
  Platform,
  Linking,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAttendanceList } from '@/lib/queries';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';

type AttendanceRecord = {
  id: string;
  student_id: string;
  subject_id: string;
  timestamp: string;
  attendance_date: string;
  face_crop_url: string | null;
  students: { reg_no: string; name: string } | null;
  subjects: { name: string } | null;
};

export default function ReportsDetailScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ subjectId?: string; subjectName?: string }>();
  const subjectId = Array.isArray(raw.subjectId) ? raw.subjectId[0] : raw.subjectId;
  const subjectName = Array.isArray(raw.subjectName) ? raw.subjectName[0] : raw.subjectName;
  const queryClient = useQueryClient();
  const { data: records = [], isLoading } = useAttendanceList(subjectId ?? null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);

  const downloadReport = async (type: 'pdf' | 'excel') => {
    if (!subjectId) return;
    setDownloading(type);
    try {
      const endpoint =
        type === 'pdf'
          ? `${ENDPOINTS.ATTENDANCE_REPORT_SIMPLE_PDF}?subject_id=${subjectId}`
          : `${ENDPOINTS.ATTENDANCE_REPORT_SIMPLE_EXCEL}?subject_id=${subjectId}`;
      const { data } = await api.get(endpoint, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      const ext = type === 'pdf' ? 'pdf' : 'xlsx';
      const filename = `attendance_report_${subjectName?.replace(/\s/g, '_') || subjectId}.${ext}`;
      const mimeType = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      if (Platform.OS === 'web') {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        Alert.alert('Opened', `${type === 'pdf' ? 'PDF' : 'Excel'} opened in a new tab.`);
        return;
      }

      try {
        const FileSystem = require('expo-file-system/legacy');
        const Sharing = require('expo-sharing');
        const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
        if (!dir) throw new Error('No storage directory available');
        const path = `${dir}${dir.endsWith('/') ? '' : '/'}${filename}`;

        const bytes = new Uint8Array(data);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        const base64 = btoa(binary);

        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        let opened = false;
        if (Platform.OS === 'android') {
          try {
            const IntentLauncher = require('expo-intent-launcher');
            const contentUri = await FileSystem.getContentUriAsync(path);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: contentUri,
              flags: 1,
              type: mimeType,
            });
            opened = true;
          } catch {
            // Fall through to Sharing
          }
        } else {
          try {
            await Linking.openURL(path);
            opened = true;
          } catch {
            // Fall through to Sharing
          }
        }

        if (!opened && (await Sharing.isAvailableAsync())) {
          const shareUri = Platform.OS === 'android'
            ? await FileSystem.getContentUriAsync(path)
            : path;
          await Sharing.shareAsync(shareUri, {
            mimeType,
            dialogTitle: `Save ${filename}`,
          });
          Alert.alert('Opened', 'Report ready. Use Share to save or open.');
        } else if (!opened) {
          Alert.alert('Opened', `Report saved. Open Files app to view ${filename}`);
        } else {
          Alert.alert('Opened', `${type === 'pdf' ? 'PDF' : 'Excel'} opened.`);
        }
      } catch (saveErr: any) {
        const errMsg = saveErr?.message || String(saveErr);
        Alert.alert(
          'Could not open',
          `Report received (${(data as ArrayBuffer).byteLength} bytes) but could not save or open. ${errMsg}`,
        );
      }
    } catch (e: any) {
      let msg = `Failed to download ${type.toUpperCase()}`;
      if (e?.response?.status === 404) msg = 'No attendance data found.';
      else if (e?.response?.status === 403) msg = 'Access denied.';
      else if (e?.code === 'ECONNABORTED') msg = 'Request timed out. Try again.';
      else if (e?.response?.data) {
        const d = e.response.data;
        if (typeof d === 'string') msg = d;
        else if (d?.detail) msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
        else if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
          try {
            const text = new TextDecoder().decode(d);
            const parsed = JSON.parse(text);
            msg = parsed?.detail || text || msg;
          } catch {
            // keep default msg
          }
        }
      } else if (e?.message) msg = e.message;
      Alert.alert('Error', msg);
    } finally {
      setDownloading(null);
    }
  };

  const handleDeleteReport = () => {
    if (!subjectId) return;
    Alert.alert(
      'Delete Report',
      'This will remove all attendance records and images for this subject. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { data } = await api.delete(ENDPOINTS.attendanceDeleteReport(subjectId));
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

  const byDate = (records as AttendanceRecord[]).reduce<Record<string, AttendanceRecord[]>>((acc, r) => {
    const d = r.attendance_date || (r.timestamp || '').slice(0, 10) || 'Unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(r);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  if (!subjectId) {
    return (
      <View style={styles.container}>
        <Text>Subject required.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{subjectName || 'Attendance'}</Text>
      <Text style={styles.subtitle}>Tap a row to view full details and image</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => downloadReport('pdf')}
          disabled={!!downloading || records.length === 0}
        >
          {downloading === 'pdf' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.downloadBtnText}>Download PDF</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => downloadReport('excel')}
          disabled={!!downloading || records.length === 0}
        >
          {downloading === 'excel' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.downloadBtnText}>Download Excel</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteBtn, (deleting || records.length === 0) && styles.deleteBtnDisabled]}
          onPress={handleDeleteReport}
          disabled={deleting || records.length === 0}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete Report</Text>
          )}
        </TouchableOpacity>
      </View>

      {dates.map((date) => (
        <View key={date} style={styles.dateSection}>
          <Text style={styles.dateHeading}>{date}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colImage]}> </Text>
              <Text style={[styles.tableHeaderCell, styles.colRegNo]}>Reg No</Text>
              <Text style={[styles.tableHeaderCell, styles.colName]}>Name</Text>
              <Text style={[styles.tableHeaderCell, styles.colTime]}>Time</Text>
              <Text style={[styles.tableHeaderCell, styles.colChevron]}> </Text>
            </View>
            {(byDate[date] || []).map((r, idx, arr) => {
              const student = r.students || {};
              const timeStr = (r.timestamp || '').slice(11, 19) || '—';
              const isLast = idx === arr.length - 1;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.tableRow, isLast && styles.tableRowLast]}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/attendance-record-detail',
                      params: {
                        attendanceId: r.id,
                        subjectId: r.subject_id,
                        subjectName: (r.subjects || {}).name || subjectName || '',
                        regNo: student.reg_no || '',
                        studentName: student.name || '',
                        faceCropUrl: r.face_crop_url || '',
                        timestamp: r.timestamp || '',
                      },
                    })
                  }
                >
                  <View style={styles.colImage}>
                    {r.face_crop_url ? (
                      <Image source={{ uri: r.face_crop_url }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]} />
                    )}
                  </View>
                  <Text style={[styles.tableCell, styles.colRegNo]} numberOfLines={1}>{student.reg_no || '—'}</Text>
                  <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>{student.name || '—'}</Text>
                  <Text style={[styles.tableCell, styles.colTime]}>{timeStr}</Text>
                  <Text style={[styles.tableCell, styles.colChevron]}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#007AFF', fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, opacity: 0.7, marginBottom: 24 },
  dateSection: { marginBottom: 24 },
  dateHeading: { fontSize: 16, fontWeight: '600', marginBottom: 12, opacity: 0.9 },
  table: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableHeaderCell: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCell: { fontSize: 14, color: '#333' },
  colImage: { width: 52, marginRight: 8 },
  colRegNo: { width: 90, marginRight: 8 },
  colName: { flex: 1, marginRight: 8 },
  colTime: { width: 70, marginRight: 4 },
  colChevron: { width: 24, fontSize: 18, opacity: 0.5, textAlign: 'center' },
  thumb: { width: 40, height: 40, borderRadius: 20 },
  thumbPlaceholder: { backgroundColor: '#eee' },
  backLink: { color: '#007AFF', marginTop: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 },
  downloadBtn: {
    flex: 1,
    minWidth: 120,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  deleteBtn: {
    flex: 1,
    minWidth: 120,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
