import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Setup admin on first load
  useEffect(() => {
    setupAdmin();
  }, []);

  const setupAdmin = async () => {
    try {
      await fetch(`${API_URL}/api/admin/setup`, { method: 'POST' });
    } catch (error) {
      console.log('Admin setup:', error);
    }
  };

  const handleDriverLogin = async () => {
    if (!phone.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu número de teléfono');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/drivers/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push({
          pathname: '/driver-home',
          params: { driver: JSON.stringify(data.driver) },
        });
      } else {
        Alert.alert('Error', data.detail || 'Número no registrado');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      Alert.alert('Error', 'Por favor ingresa usuario y contraseña');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin');
      } else {
        Alert.alert('Error', data.detail || 'Credenciales inválidas');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="car" size={80} color="#FFD700" />
            <Text style={styles.title}>Taxi Colombia</Text>
            <Text style={styles.subtitle}>
              {isAdmin ? 'Panel Administrativo' : 'App para Conductores'}
            </Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {!isAdmin ? (
              // Driver Login
              <>
                <Text style={styles.label}>Número de Teléfono</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="call" size={24} color="#666" />
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 3001234567"
                    placeholderTextColor="#999"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleDriverLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Ionicons name="log-in" size={24} color="#000" />
                      <Text style={styles.loginButtonText}>Ingresar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              // Admin Login
              <>
                <Text style={styles.label}>Usuario</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="person" size={24} color="#666" />
                  <TextInput
                    style={styles.input}
                    placeholder="admin"
                    placeholderTextColor="#999"
                    value={adminUsername}
                    onChangeText={setAdminUsername}
                    autoCapitalize="none"
                  />
                </View>

                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed" size={24} color="#666" />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••"
                    placeholderTextColor="#999"
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleAdminLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={24} color="#000" />
                      <Text style={styles.loginButtonText}>Ingresar como Admin</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Toggle Button */}
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setIsAdmin(!isAdmin)}
            >
              <Text style={styles.toggleText}>
                {isAdmin ? '¿Eres conductor? Ingresa aquí' : '¿Eres administrador?'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>🇨🇴 Hecho en Colombia</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    fontSize: 14,
    color: '#FFD700',
    marginBottom: 8,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    height: 50,
    color: '#fff',
    marginLeft: 12,
    fontSize: 16,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
    gap: 8,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#FFD700',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
});
