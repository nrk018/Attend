import { StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from '@/components/Themed';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export function DashboardHeader() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const hasCollegeLogo = !!user?.college_logo_url;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.logoRow}>
        <Text style={styles.logo}>Attend</Text>
        {hasCollegeLogo && (
          <>
            <Text style={styles.separator}>|</Text>
            <Image
              source={{ uri: user!.college_logo_url! }}
              style={styles.collegeLogo}
              resizeMode="contain"
            />
          </>
        )}
      </View>
      <TouchableOpacity
        style={styles.photoCircle}
        onPress={() => router.push('/(tabs)/profile-card')}
        activeOpacity={0.8}
      >
        <Text style={styles.initials}>{initials}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 56,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { fontSize: 22, fontWeight: 'bold' },
  separator: { fontSize: 18, opacity: 0.5, marginHorizontal: 8 },
  collegeLogo: { width: 72, height: 72, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 },
  photoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
