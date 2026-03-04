import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';
import { useAuthStore } from '@/store/auth';

export default function ProfileEditScreen() {
  const { user, token, setAuth } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [contactNumber, setContactNumber] = useState(user?.contact_number ?? '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedContact = contactNumber.trim();
    if (!trimmedName || !trimmedContact) {
      Alert.alert('Required', 'Please enter both name and contact number.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.patch(ENDPOINTS.ME, {
        name: trimmedName,
        contact_number: trimmedContact,
      });
      const parsed = userSchema.safeParse(data);
      if (parsed.success) {
        setAuth(token!, parsed.data);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to update profile');
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
        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Update your name and contact number</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Contact Number"
          value={contactNumber}
          onChangeText={setContactNumber}
          keyboardType="phone-pad"
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  inner: { padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 16, marginBottom: 24, opacity: 0.7 },
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
});
