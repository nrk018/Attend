import { useEffect } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { DashboardHeader } from '@/components/DashboardHeader';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@attend/shared';
import { userSchema } from '@attend/shared';
import { useAuthStore } from '@/store/auth';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { token, setAuth } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    api.get(ENDPOINTS.ME).then(({ data }) => {
      const parsed = userSchema.safeParse(data);
      if (parsed.success) setAuth(token!, parsed.data);
    }).catch(() => {});
  }, [token]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          header: () => <DashboardHeader />,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="enroll"
        options={{
          title: 'Enroll Student',
          header: () => <DashboardHeader />,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.badge.plus', android: 'person-add', web: 'person-add' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          header: () => <DashboardHeader />,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'camera.fill', android: 'camera', web: 'camera' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          header: () => <DashboardHeader />,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null, title: 'Profile' }}
      />
      <Tabs.Screen
        name="profile-card"
        options={{ href: null, title: 'Profile', header: () => <DashboardHeader /> }}
      />
      <Tabs.Screen
        name="profile-edit"
        options={{ href: null, title: 'Edit Profile', header: () => <DashboardHeader /> }}
      />
      <Tabs.Screen
        name="two"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="enroll-camera"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="attendance-camera"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="student-list"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="edit-student"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="add-face-camera"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="create-department-admin"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="create-teacher"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="reports-detail"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="attendance-record-detail"
        options={{ href: null }}
      />
    </Tabs>
  );
}
