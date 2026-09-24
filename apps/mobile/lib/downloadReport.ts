import { Alert, Platform, Linking } from 'react-native';
import { api } from './api';
import { ENDPOINTS } from '@attend/shared';

export async function downloadAttendanceReport(opts: {
  type: 'pdf' | 'excel';
  subjectId: string;
  subjectName?: string;
  classId?: string;
}): Promise<void> {
  const { type, subjectId, subjectName, classId } = opts;
  const params = new URLSearchParams({ subject_id: subjectId });
  if (classId) params.set('class_id', classId);
  const endpoint =
    type === 'pdf'
      ? `${ENDPOINTS.ATTENDANCE_REPORT_SIMPLE_PDF}?${params.toString()}`
      : `${ENDPOINTS.ATTENDANCE_REPORT_SIMPLE_EXCEL}?${params.toString()}`;
  const { data } = await api.get(endpoint, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  const ext = type === 'pdf' ? 'pdf' : 'xlsx';
  const filename = `attendance_report_${(subjectName || subjectId).replace(/\s/g, '_')}.${ext}`;
  const mimeType =
    type === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (Platform.OS === 'web') {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    Alert.alert('Opened', `${type === 'pdf' ? 'PDF' : 'Excel'} opened in a new tab.`);
    return;
  }

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
  await FileSystem.writeAsStringAsync(path, btoa(binary), {
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
      // Fall through
    }
  } else {
    try {
      await Linking.openURL(path);
      opened = true;
    } catch {
      // Fall through
    }
  }

  if (!opened && (await Sharing.isAvailableAsync())) {
    const shareUri = Platform.OS === 'android' ? await FileSystem.getContentUriAsync(path) : path;
    await Sharing.shareAsync(shareUri, { mimeType, dialogTitle: `Save ${filename}` });
    Alert.alert('Opened', 'Report ready. Use Share to save or open.');
  } else if (!opened) {
    Alert.alert('Opened', `Report saved. Open Files app to view ${filename}`);
  } else {
    Alert.alert('Opened', `${type === 'pdf' ? 'PDF' : 'Excel'} opened.`);
  }
}

export function reportDownloadError(e: any, type: 'pdf' | 'excel'): string {
  let msg = `Failed to download ${type.toUpperCase()}`;
  if (e?.response?.status === 404) return 'No attendance data found.';
  if (e?.response?.status === 403) return 'Access denied.';
  if (e?.code === 'ECONNABORTED') return 'Request timed out. Try again.';
  if (e?.response?.data) {
    const d = e.response.data;
    if (typeof d === 'string') return d;
    if (d?.detail) return typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail);
  }
  if (e?.message) return e.message;
  return msg;
}
