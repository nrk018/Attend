import { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text, View } from '@/components/Themed';
import { API_BASE } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';

const POSE_INSTRUCTIONS: Record<string, { title: string; instruction: string }> = {
  left: {
    title: 'Left Face',
    instruction: 'Turn your head about 30° to your LEFT. Keep your face in frame.',
  },
  right: {
    title: 'Right Face',
    instruction: 'Turn your head about 30° to your RIGHT. Keep your face in frame.',
  },
};

export default function AddFaceCameraScreen() {
  const router = useRouter();
  const { studentId, pose } = useLocalSearchParams<{ studentId: string; pose: string }>();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasPermission = permission?.granted ?? false;
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  const poseKey = pose === 'left' || pose === 'right' ? pose : 'left';
  const { title, instruction } = POSE_INSTRUCTIONS[poseKey] ?? POSE_INSTRUCTIONS.left;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const handleCapture = async () => {
    if (!camera.current || capturing || uploading || !studentId) return;
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) throw new Error('No photo captured');

      setCapturing(false);
      setUploading(true);

      const sid = Array.isArray(studentId) ? studentId[0] : studentId;
      if (!sid) throw new Error('Missing student');

      const formData = new FormData();
      const uri = photo.uri.startsWith('file://') ? photo.uri : photo.uri.startsWith('/') ? `file://${photo.uri}` : photo.uri;
      const file = { uri, type: 'image/jpeg', name: `${poseKey}.jpg` } as unknown as Blob;

      if (poseKey === 'left') {
        formData.append('left', file);
      } else {
        formData.append('right', file);
      }

      const token = require('@/store/auth').useAuthStore.getState().token;
      const url = `${API_BASE}${ENDPOINTS.addStudentFace(sid)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Upload failed: ${res.status}`);
      }

      Alert.alert('Success', `${title} added successfully.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const err = e as Error & { response?: { data?: { detail?: string } } };
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Upload failed';
      Alert.alert('Failed', msg);
    } finally {
      setCapturing(false);
      setUploading(false);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (uploading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>Uploading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
      <TouchableOpacity
        style={styles.flipBtn}
        onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
      >
        <Text style={styles.flipBtnText}>Flip camera</Text>
      </TouchableOpacity>
      <View style={styles.overlay}>
        <View style={styles.instructionCard}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.instruction}>{instruction}</Text>
          <Text style={styles.tip}>Good lighting • Face clearly visible</Text>
        </View>
        <TouchableOpacity
          style={[styles.captureBtn, (capturing || uploading) && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={capturing || uploading}
        >
          <Text style={styles.captureBtnText}>{capturing ? '...' : 'Capture'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flipBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    zIndex: 10,
  },
  flipBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 48,
  },
  instructionCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  tip: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  captureBtn: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backBtn: { marginTop: 12, alignItems: 'center' },
  backBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 16 },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignSelf: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
