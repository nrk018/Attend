import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { DashboardHeader } from '@/components/DashboardHeader';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';
import { useAuthStore } from '@/store/auth';
import { useThemeColors } from '@/theme';

export default function TabLayout() {
  const { token, hasHydrated, setAuth, user } = useAuthStore();
  const colors = useThemeColors();
  const pathname = usePathname();
  const hideChrome = /attendance-camera|enroll-camera|add-face-camera/.test(pathname ?? '');

  useEffect(() => {
    if (!token) return;
    api
      .get(ENDPOINTS.ME)
      .then(({ data }) => {
        const parsed = userSchema.safeParse(data);
        if (parsed.success) setAuth(token!, parsed.data);
      })
      .catch(() => {});
  }, [token]);

  if (hasHydrated && !token) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!hideChrome && <DashboardHeader />}
      <Tabs
        style={styles.tabs}
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: hideChrome
            ? { display: 'none', height: 0 }
            : {
                backgroundColor: colors.tabBar,
                borderTopWidth: 0,
                elevation: 0,
                shadowOpacity: 0,
              },
          sceneStyle: { flex: 1, backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="enroll"
          options={{
            title: 'Enroll',
            href: user?.role === 'DEPARTMENT_ADMIN' ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-add" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            title: 'Attendance',
            href: user?.role === 'TEACHER' ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="camera" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            href: user?.role === 'TEACHER' || user?.role === 'DEPARTMENT_ADMIN' ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{ href: null, title: 'Profile' }}
        />
        <Tabs.Screen
          name="profile-card"
          options={{ href: null, title: 'Profile' }}
        />
        <Tabs.Screen
          name="profile-edit"
          options={{ href: null, title: 'Edit Profile' }}
        />
        <Tabs.Screen name="two" options={{ href: null }} />
        <Tabs.Screen name="enroll-camera" options={{ href: null }} />
        <Tabs.Screen name="attendance-camera" options={{ href: null }} />
        <Tabs.Screen name="student-list" options={{ href: null }} />
        <Tabs.Screen name="edit-student" options={{ href: null }} />
        <Tabs.Screen name="add-face-camera" options={{ href: null }} />
        <Tabs.Screen name="create-department-admin" options={{ href: null }} />
        <Tabs.Screen name="create-teacher" options={{ href: null }} />
        <Tabs.Screen name="reports-detail" options={{ href: null }} />
        <Tabs.Screen name="class-report" options={{ href: null }} />
        <Tabs.Screen name="attendance-record-detail" options={{ href: null }} />
        <Tabs.Screen name="manage-sections" options={{ href: null }} />
        <Tabs.Screen name="section-students" options={{ href: null }} />
        <Tabs.Screen name="teacher-list" options={{ href: null }} />
        <Tabs.Screen name="department-hub" options={{ href: null }} />
        <Tabs.Screen name="manage-sections-detail" options={{ href: null }} />
        <Tabs.Screen name="section-students-detail" options={{ href: null }} />
        <Tabs.Screen name="section-students-list" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabs: {
    flex: 1,
  },
});
