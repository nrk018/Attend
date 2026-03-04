import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { api, API_BASE, ENDPOINTS } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { loginSchema, loginResponseSchema } from '@attend/shared';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const testConnection = async () => {
    try {
      const { data } = await api.get('/health');
      Alert.alert('Connection OK', `Backend at ${API_BASE} responded: ${JSON.stringify(data)}`);
    } catch (e: any) {
      const msg = e?.response ? `Server error: ${e.response.status}` : `Cannot reach ${API_BASE}`;
      Alert.alert('Connection Failed', msg);
    }
  };

  const handleLogin = async () => {
    setFieldError(null);
    const parseResult = loginSchema.safeParse({ email, password });
    if (!parseResult.success) {
      const msg = parseResult.error.errors[0]?.message ?? 'Invalid input';
      setFieldError(msg);
      Alert.alert('Validation Error', msg);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(ENDPOINTS.LOGIN, parseResult.data);
      const parsed = loginResponseSchema.parse(data);
      setAuth(parsed.access_token, parsed.user);
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e?.name === 'ZodError') {
        Alert.alert('Error', 'Invalid response from server');
      } else if (e?.response?.status === 403 && e?.response?.data?.detail === 'email_not_verified') {
        router.replace({ pathname: '/(auth)/verify-email', params: { email } });
      } else if (!e?.response) {
        const isTimeout = e?.code === 'ECONNABORTED' || e?.message?.toLowerCase().includes('timeout');
        const msg = isTimeout
          ? 'Request timed out. Ensure the backend is running (npm run backend).'
          : `Could not reach ${API_BASE}. Same WiFi? Backend running? Try: ipconfig getifaddr en0`;
        Alert.alert('Connection Failed', msg);
      } else {
        Alert.alert('Login Failed', e.response?.data?.detail || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Attend</Text>
        <Text style={styles.subtitle}>Attendance, Automated</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signUpLink} onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={styles.signUpText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signUpLink} onPress={testConnection}>
          <Text style={[styles.signUpText, { opacity: 0.6, fontSize: 14 }]}>Test connection</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  inner: { padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signUpLink: { marginTop: 16, alignItems: 'center' },
  signUpText: { color: '#007AFF', fontSize: 16 },
});
