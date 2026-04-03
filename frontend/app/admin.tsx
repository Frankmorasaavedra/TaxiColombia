import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle_plate: string;
  is_active: boolean;
}

interface Stats {
  total_drivers: number;
  total_services: number;
  pending_services: number;
  accepted_services: number;
  completed_services: number;
}

export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState<'drivers' | 'services' | 'stats'>('services');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  // New Driver Form
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverPlate, setDriverPlate] = useState('');

  // New Service Form
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [pickupZone, setPickupZone] = useState('');  // Zona general (visible para todos)
  const [pickupAddress, setPickupAddress] = useState('');  // Dirección exacta (solo al aceptar)
  const [pickupLatitude, setPickupLatitude] = useState('');
  const [pickupLongitude, setPickupLongitude] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    fetchDrivers();
    fetchStats();
  }, []);

  const fetchDrivers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/drivers`);
      const data = await response.json();
      setDrivers(data.filter((d: Driver) => d.is_active));
    } catch (error) {
      console.error('Error fetching drivers:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAddDriver = async () => {
    if (!driverName.trim() || !driverPhone.trim() || !driverPlate.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: driverName.trim(),
          phone: driverPhone.trim(),
          vehicle_plate: driverPlate.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('¡Éxito!', 'Conductor registrado exitosamente');
        setShowDriverModal(false);
        setDriverName('');
        setDriverPhone('');
        setDriverPlate('');
        fetchDrivers();
        fetchStats();
      } else {
        Alert.alert('Error', data.detail || 'No se pudo registrar el conductor');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleGetCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Se requiere permiso de ubicación');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setPickupLatitude(location.coords.latitude.toString());
      setPickupLongitude(location.coords.longitude.toString());
      Alert.alert('¡Éxito!', 'Ubicación obtenida correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo obtener la ubicación');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleAddService = async () => {
    if (!customerPhone.trim() || !pickupAddress.trim() || !pickupZone.trim()) {
      Alert.alert('Error', 'Teléfono, zona y dirección exacta son requeridos');
      return;
    }

    setLoading(true);
    try {
      const serviceData: any = {
        customer_phone: customerPhone.trim(),
        customer_name: customerName.trim() || undefined,
        pickup_zone: pickupZone.trim(),  // Zona general (visible para todos)
        pickup_address: pickupAddress.trim(),  // Dirección exacta (solo al aceptar)
        destination: destination.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      // Add coordinates if provided
      if (pickupLatitude && pickupLongitude) {
        serviceData.pickup_latitude = parseFloat(pickupLatitude);
        serviceData.pickup_longitude = parseFloat(pickupLongitude);
      }

      const response = await fetch(`${API_URL}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('¡Éxito!', 'Servicio creado. Los taxistas verán solo la zona, no la dirección exacta.');
        setShowServiceModal(false);
        setCustomerPhone('');
        setCustomerName('');
        setPickupZone('');
        setPickupAddress('');
        setCustomerPhone('');
        setCustomerName('');
        setPickupAddress('');
        setPickupLatitude('');
        setPickupLongitude('');
        setDestination('');
        setNotes('');
        fetchStats();
      } else {
        Alert.alert('Error', data.detail || 'No se pudo crear el servicio');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDriver = (driver: Driver) => {
    Alert.alert(
      'Desactivar Conductor',
      `¿Deseas desactivar a ${driver.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/drivers/${driver.id}`, {
                method: 'DELETE',
              });
              fetchDrivers();
              fetchStats();
            } catch (error) {
              Alert.alert('Error', 'No se pudo desactivar el conductor');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Deseas salir del panel admin?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => router.replace('/') },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-checkmark" size={32} color="#FFD700" />
          <Text style={styles.headerTitle}>Panel Admin</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'services' && styles.activeTab]}
          onPress={() => setActiveTab('services')}
        >
          <Ionicons
            name="car"
            size={20}
            color={activeTab === 'services' ? '#FFD700' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'services' && styles.activeTabText]}>
            Servicios
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'drivers' && styles.activeTab]}
          onPress={() => setActiveTab('drivers')}
        >
          <Ionicons
            name="people"
            size={20}
            color={activeTab === 'drivers' ? '#FFD700' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'drivers' && styles.activeTabText]}>
            Conductores
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.activeTab]}
          onPress={() => {
            setActiveTab('stats');
            fetchStats();
          }}
        >
          <Ionicons
            name="stats-chart"
            size={20}
            color={activeTab === 'stats' ? '#FFD700' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.activeTabText]}>
            Estadísticas
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'services' && (
          <View style={styles.tabContent}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowServiceModal(true)}
            >
              <Ionicons name="add-circle" size={24} color="#000" />
              <Text style={styles.addButtonText}>Nueva Solicitud de Servicio</Text>
            </TouchableOpacity>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={24} color="#4ECDC4" />
              <Text style={styles.infoText}>
                Agrega la ubicación GPS del cliente para que los taxistas vean el tiempo estimado de llegada. 
                Los servicios se ordenarán por cercanía automáticamente.
              </Text>
            </View>

            {stats && (
              <View style={styles.quickStats}>
                <View style={styles.quickStatItem}>
                  <Text style={styles.quickStatNumber}>{stats.pending_services}</Text>
                  <Text style={styles.quickStatLabel}>Pendientes</Text>
                </View>
                <View style={styles.quickStatItem}>
                  <Text style={styles.quickStatNumber}>{stats.accepted_services}</Text>
                  <Text style={styles.quickStatLabel}>En Progreso</Text>
                </View>
                <View style={styles.quickStatItem}>
                  <Text style={styles.quickStatNumber}>{stats.completed_services}</Text>
                  <Text style={styles.quickStatLabel}>Completados</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'drivers' && (
          <View style={styles.tabContent}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowDriverModal(true)}
            >
              <Ionicons name="person-add" size={24} color="#000" />
              <Text style={styles.addButtonText}>Registrar Nuevo Conductor</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Conductores Activos ({drivers.length})</Text>

            {drivers.map((driver) => (
              <View key={driver.id} style={styles.driverCard}>
                <View style={styles.driverInfo}>
                  <Ionicons name="person-circle" size={40} color="#FFD700" />
                  <View style={styles.driverTextContainer}>
                    <Text style={styles.driverName}>{driver.name}</Text>
                    <Text style={styles.driverPhone}>{driver.phone}</Text>
                    <Text style={styles.driverPlate}>{driver.vehicle_plate}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteDriver(driver)}
                >
                  <Ionicons name="trash" size={20} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ))}

            {drivers.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#444" />
                <Text style={styles.emptyText}>No hay conductores registrados</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'stats' && stats && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Resumen General</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="people" size={32} color="#FFD700" />
                <Text style={styles.statNumber}>{stats.total_drivers}</Text>
                <Text style={styles.statLabel}>Conductores</Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons name="car" size={32} color="#4ECDC4" />
                <Text style={styles.statNumber}>{stats.total_services}</Text>
                <Text style={styles.statLabel}>Total Servicios</Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons name="time" size={32} color="#FF9800" />
                <Text style={styles.statNumber}>{stats.pending_services}</Text>
                <Text style={styles.statLabel}>Pendientes</Text>
              </View>

              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
                <Text style={styles.statNumber}>{stats.completed_services}</Text>
                <Text style={styles.statLabel}>Completados</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add Driver Modal */}
      <Modal visible={showDriverModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Conductor</Text>
              <TouchableOpacity onPress={() => setShowDriverModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nombre Completo</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor="#666"
                value={driverName}
                onChangeText={setDriverName}
              />

              <Text style={styles.inputLabel}>Número de Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 3001234567"
                placeholderTextColor="#666"
                value={driverPhone}
                onChangeText={setDriverPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Placa del Vehículo</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: ABC123"
                placeholderTextColor="#666"
                value={driverPlate}
                onChangeText={setDriverPlate}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddDriver}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.submitButtonText}>Registrar Conductor</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Service Modal */}
      <Modal visible={showServiceModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva Solicitud</Text>
              <TouchableOpacity onPress={() => setShowServiceModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Teléfono del Cliente *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 3109876543"
                placeholderTextColor="#666"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Nombre del Cliente (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: María García"
                placeholderTextColor="#666"
                value={customerName}
                onChangeText={setCustomerName}
              />

              <View style={styles.zoneSection}>
                <Text style={styles.sectionHeader}>📍 Ubicación</Text>
                
                <Text style={styles.inputLabel}>Zona General * (visible para todos los taxistas)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Calle 72, Llano Largo"
                  placeholderTextColor="#666"
                  value={pickupZone}
                  onChangeText={setPickupZone}
                />

                <Text style={styles.inputLabel}>Dirección Exacta * (solo visible al aceptar)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Ej: Calle 72 #10-25, Edificio Torres del Parque, Apto 302"
                  placeholderTextColor="#666"
                  value={pickupAddress}
                  onChangeText={setPickupAddress}
                  multiline
                />
              </View>

              {/* GPS Location Section */}
              <View style={styles.locationSection}>
                <Text style={styles.inputLabel}>Ubicación GPS (para ordenar por cercanía)</Text>
                <TouchableOpacity
                  style={styles.getLocationButton}
                  onPress={handleGetCurrentLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="locate" size={20} color="#fff" />
                      <Text style={styles.getLocationText}>Obtener Ubicación Actual</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.coordsRow}>
                  <View style={styles.coordInput}>
                    <Text style={styles.coordLabel}>Latitud</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ej: 4.6097"
                      placeholderTextColor="#666"
                      value={pickupLatitude}
                      onChangeText={setPickupLatitude}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.coordInput}>
                    <Text style={styles.coordLabel}>Longitud</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ej: -74.0817"
                      placeholderTextColor="#666"
                      value={pickupLongitude}
                      onChangeText={setPickupLongitude}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.inputLabel}>Destino (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Aeropuerto El Dorado"
                placeholderTextColor="#666"
                value={destination}
                onChangeText={setDestination}
              />

              <Text style={styles.inputLabel}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Ej: Edificio azul, apartamento 302"
                placeholderTextColor="#666"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddService}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.submitButtonText}>Crear Solicitud</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  logoutButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  tabText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFD700',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickStatItem: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  quickStatNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
  },
  driverCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverTextContainer: {
    gap: 2,
  },
  driverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  driverPhone: {
    fontSize: 14,
    color: '#aaa',
  },
  driverPlate: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#FFD700',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationSection: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  zoneSection: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  getLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  getLocationText: {
    color: '#fff',
    fontWeight: '600',
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordInput: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
});
