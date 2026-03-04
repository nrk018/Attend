import { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text, View } from '@/components/Themed';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';

const POSES = ['front', 'left', 'right'] as const;
const POSE_STEPS: Record<(typeof POSES)[number], { title: string; instruction: string }> = {
  front: {
    title: '1 of 3: Front',
    instruction: 'Look straight at the camera. Keep your face centered and fully visible.',
  },
  left: {
    title: '2 of 3: Left',
    instruction: 'Turn your head about 30° to your LEFT. Keep your face in frame.',
  },
  right: {
    title: '3 of 3: Right',
    instruction: 'Turn your head about 30° to your RIGHT. Keep your face in frame.',
  },
};

export default function EnrollCameraScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams<{
    reg_no: string | string[];
    name: string | string[];
    college_id: string | string[];
    department_id: string | string[];
  }>();
  const params = {
    reg_no: Array.isArray(rawParams.reg_no) ? rawParams.reg_no[0] : rawParams.reg_no,
    name: Array.isArray(rawParams.name) ? rawParams.name[0] : rawParams.name,
    college_id: Array.isArray(rawParams.college_id) ? rawParams.college_id[0] : rawParams.college_id,
    department_id: Array.isArray(rawParams.department_id) ? rawParams.department_id[0] : rawParams.department_id,
  };
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasPermission = permission?.granted ?? false;
  const [currentPose, setCurrentPose] = useState(0);
  const [photos, setPhotos] = useState<{ path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      setCurrentPose(0);
      setPhotos([]);
    }, [])
  );

  const handleCapture = async () => {
    if (!camera.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) throw new Error('No photo captured');
      const newPhotos = [...photos, { path: photo.uri }];
      setPhotos(newPhotos);
      if (currentPose < POSES.length - 1) {
        setCurrentPose((i) => i + 1);
      } else {
        await submitEnrollment(newPhotos);
      }
    } catch (e) {
      Alert.alert('Capture Failed', String(e));
    } finally {
      setCapturing(false);
    }
  };

  const submitEnrollment = async (photoPaths: { path: string }[]) => {
    if (photoPaths.length !== 3 || !params.reg_no || !params.name || !params.college_id || !params.department_id) {
      Alert.alert('Error', 'Missing data. Please go back and try again.');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('reg_no', params.reg_no);
      formData.append('name', params.name);
      formData.append('college_id', params.college_id);
      formData.append('department_id', params.department_id);
      const toFile = (uri: string, name: string) => ({
        uri: uri.startsWith('file://') ? uri : uri.startsWith('/') ? `file://${uri}` : uri,
        type: 'image/jpeg',
        name,
      });
      formData.append('front', toFile(photoPaths[0].path, 'front.jpg') as unknown as Blob);
      formData.append('left', toFile(photoPaths[1].path, 'left.jpg') as unknown as Blob);
      formData.append('right', toFile(photoPaths[2].path, 'right.jpg') as unknown as Blob);

      const token = require('@/store/auth').useAuthStore.getState().token;
      await api.post(ENDPOINTS.ENROLL_STUDENT, formData, {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        transformRequest: [
          (data, headers) => {
            if (data instanceof FormData) {
              delete (headers as Record<string, unknown>)['Content-Type'];
              return data;
            }
            return data;
          },
        ],
      });
      Alert.alert('Success', `${params.name} enrolled successfully.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      let msg = 'Please try again.';
      if (ax?.response?.data?.detail) {
        msg = ax.response.data.detail;
      } else if (ax?.response?.status === 400) {
        msg = ax?.response?.data?.detail ?? 'Invalid images. Ensure face is clearly visible in all 3 photos.';
      } else if (ax?.message?.toLowerCase().includes('network') || !ax?.response) {
        msg = 'Connection failed. Check your network and that the backend is running.';
      }
      const isFaceError = msg.toLowerCase().includes('face') || msg.toLowerCase().includes('detected');
      Alert.alert(
        'Enrollment Failed',
        msg,
        isFaceError
          ? [
              { text: 'Retake Photos', onPress: () => { setPhotos([]); setCurrentPose(0); } },
              { text: 'Cancel', onPress: () => router.back() },
            ]
          : [
              { text: 'Retry', onPress: () => submitEnrollment(photoPaths) },
              { text: 'Cancel', onPress: () => router.back() },
            ]
      );
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required for enrollment.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>Enrolling student...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />
      <TouchableOpacity
        style={styles.flipBtn}
        onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
      >
        <Text style={styles.flipBtnText}>Flip camera</Text>
      </TouchableOpacity>
      <View style={styles.overlay}>
        <View style={styles.instructionCard}>
          <Text style={styles.stepTitle}>{POSE_STEPS[POSES[currentPose]].title}</Text>
          <Text style={styles.instruction}>{POSE_STEPS[POSES[currentPose]].instruction}</Text>
          <Text style={styles.tip}>Good lighting • Face clearly visible</Text>
        </View>
        <Text style={styles.progress}>
          Photo {photos.length + 1} of 3
        </Text>
        <TouchableOpacity
          style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={capturing}
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
    marginBottom: 16,
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
  progress: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 24,
  },
  captureBtn: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
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
