import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface AssignedService {
  id: string;
  pickup_address: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  destination?: string;
  notes?: string;
  created_at: string;
  assigned_at?: string;
  customer_name?: string;
  estimated_minutes?: number;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle_plate: string;
}

interface LocationCoords {
  latitude: number;
  longitude: number;
}

export default function DriverHomeScreen() {
  const params = useLocalSearchParams();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [assignedServices, setAssignedServices] = useState<AssignedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const previousServiceCount = useRef(0);

  useEffect(() => {
    if (params.driver) {
      try {
        const driverData = JSON.parse(params.driver as string);
        setDriver(driverData);
      } catch (e) {
        console.error('Error parsing driver:', e);
      }
    }
  }, [params.driver]);

  // Request location permissions and start tracking
  useEffect(() => {
    let isMounted = true;

    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          if (isMounted) {
            setLocationError('Se requiere permiso de ubicación');
            Alert.alert(
              'Permiso Requerido',
              'Para recibir servicios cercanos, necesitamos acceso a tu ubicación.',
              [{ text: 'Entendido' }]
            );
          }
          return;
        }

        // Get initial location
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        if (isMounted) {
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          setLocationError(null);
        }

        // Start watching location changes
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 100,
          },
          (newLocation) => {
            if (isMounted) {
              setCurrentLocation({
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
              });
            }
          }
        );
      } catch (error) {
        console.error('Location error:', error);
        if (isMounted) {
          setLocationError('No se pudo obtener la ubicación');
        }
      }
    };

    startLocationTracking();

    return () => {
      isMounted = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  // Update driver location on server
  useEffect(() => {
    if (driver && currentLocation) {
      updateDriverLocationOnServer();
    }
  }, [driver, currentLocation]);

  const updateDriverLocationOnServer = async () => {
    if (!driver || !currentLocation) return;

    try {
      await fetch(`${API_URL}/api/drivers/update-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driver.id,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }),
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const fetchAssignedServices = useCallback(async () => {
    if (!driver) return;
    
    try {
      const response = await fetch(`${API_URL}/api/services/my-assigned/${driver.id}`);
      const data = await response.json();
      
      // Vibrate if new service assigned
      if (data.length > previousServiceCount.current && previousServiceCount.current > 0) {
        Vibration.vibrate([0, 500, 200, 500]);
        Alert.alert('🚕 Nuevo Servicio', '¡Te han asignado un nuevo servicio!');
      }
      previousServiceCount.current = data.length;
      
      setAssignedServices(data);
    } catch (error) {
      console.error('Error fetching assigned services:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver]);

  useEffect(() => {
    if (driver) {
      fetchAssignedServices();
      // Auto-refresh every 5 seconds to check for new assignments
      const interval = setInterval(fetchAssignedServices, 5000);
      return () => clearInterval(interval);
    }
  }, [driver, fetchAssignedServices]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAssignedServices();
  };

  const handleAcceptService = async (serviceId: string) => {
    if (!driver) return;

    setProcessingId(serviceId);
    try {
      const response = await fetch(
        `${API_URL}/api/services/${serviceId}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driver.id }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        Alert.alert('✅ ¡Servicio Aceptado!', 'Ahora puedes ver los datos del cliente', [
          {
            text: 'Ver Detalles',
            onPress: () => {
              router.push({
                pathname: '/service-detail',
                params: {
                  service: JSON.stringify(data.service),
                  driver: JSON.stringify(driver),
                },
              });
            },
          },
        ]);
        fetchAssignedServices();
      } else {
        Alert.alert('Error', data.detail || 'No se pudo aceptar el servicio');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectService = async (serviceId: string) => {
    if (!driver) return;

    Alert.alert(
      'Rechazar Servicio',
      '¿Estás seguro? El servicio será asignado a otro conductor.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(serviceId);
            try {
              const response = await fetch(
                `${API_URL}/api/services/${serviceId}/reject`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ driver_id: driver.id }),
                }
              );

              const data = await response.json();

              if (response.ok) {
                Alert.alert('Servicio Rechazado', 'El servicio fue asignado a otro conductor');
                fetchAssignedServices();
              } else {
                Alert.alert('Error', data.detail || 'No se pudo rechazar el servicio');
              }
            } catch (error) {
              Alert.alert('Error', 'No se pudo conectar al servidor');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderServiceItem = ({ item }: { item: AssignedService }) => (
    <View style={styles.serviceCard}>
      {/* Assigned Badge */}
      <View style={styles.assignedBadge}>
        <Ionicons name="star" size={16} color="#000" />
        <Text style={styles.assignedText}>ASIGNADO A TI</Text>
      </View>

      {/* Time Estimate */}
      {item.estimated_minutes && (
        <View style={styles.timeEstimate}>
          <Ionicons name="time" size={20} color="#4CAF50" />
          <Text style={styles.timeText}>
            A {item.estimated_minutes} min del cliente
          </Text>
        </View>
      )}

      <View style={styles.serviceHeader}>
        <View style={styles.timeContainer}>
          <Ionicons name="calendar" size={16} color="#888" />
          <Text style={styles.headerTimeText}>{formatTime(item.created_at)}</Text>
        </View>
        {item.customer_name && (
          <Text style={styles.customerName}>{item.customer_name}</Text>
        )}
      </View>

      <View style={styles.addressContainer}>
        <Ionicons name="location" size={24} color="#FF6B6B" />
        <View style={styles.addressTextContainer}>
          <Text style={styles.addressLabel}>Recoger en:</Text>
          <Text style={styles.addressText}>{item.pickup_address}</Text>
        </View>
      </View>

      {item.destination && (
        <View style={styles.addressContainer}>
          <Ionicons name="flag" size={24} color="#4ECDC4" />
          <View style={styles.addressTextContainer}>
            <Text style={styles.addressLabel}>Destino:</Text>
            <Text style={styles.addressText}>{item.destination}</Text>
          </View>
        </View>
      )}

      {item.notes && (
        <View style={styles.notesContainer}>
          <Ionicons name="document-text" size={16} color="#aaa" />
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleRejectService(item.id)}
          disabled={processingId === item.id}
        >
          {processingId === item.id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="close-circle" size={20} color="#fff" />
              <Text style={styles.rejectButtonText}>Rechazar</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAcceptService(item.id)}
          disabled={processingId === item.id}
        >
          {processingId === item.id ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#000" />
              <Text style={styles.acceptButtonText}>ACEPTAR</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Deseas salir de la aplicación?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => {
          if (locationSubscription.current) {
            locationSubscription.current.remove();
          }
          router.replace('/');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Cargando servicios...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.driverInfo}>
          <Ionicons name="person-circle" size={40} color="#FFD700" />
          <View style={styles.driverTextContainer}>
            <Text style={styles.driverName}>{driver?.name || 'Conductor'}</Text>
            <Text style={styles.driverPlate}>{driver?.vehicle_plate}</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.myServicesButton}
            onPress={() =>
              router.push({
                pathname: '/my-services',
                params: { driver: JSON.stringify(driver) },
              })
            }
          >
            <Ionicons name="list" size={24} color="#FFD700" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={24} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Location Status */}
      <View style={styles.locationStatus}>
        {currentLocation ? (
          <View style={styles.locationActive}>
            <Ionicons name="locate" size={16} color="#4CAF50" />
            <Text style={styles.locationActiveText}>GPS Activo - Recibiendo servicios</Text>
          </View>
        ) : (
          <View style={styles.locationInactive}>
            <Ionicons name="locate-outline" size={16} color="#FF6B6B" />
            <Text style={styles.locationInactiveText}>
              {locationError || 'Obteniendo ubicación...'}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Servicios Asignados</Text>
        {assignedServices.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{assignedServices.length}</Text>
          </View>
        )}
      </View>

      {/* Services List */}
      {assignedServices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={80} color="#444" />
          <Text style={styles.emptyText}>No tienes servicios asignados</Text>
          <Text style={styles.emptySubtext}>
            Cuando un cliente pida taxi cerca de ti,{'\n'}el servicio aparecerá aquí automáticamente
          </Text>
          <View style={styles.waitingIndicator}>
            <ActivityIndicator color="#FFD700" size="small" />
            <Text style={styles.waitingText}>Esperando servicios...</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={assignedServices}
          renderItem={renderServiceItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFD700"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    marginTop: 16,
    fontSize: 16,
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
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverTextContainer: {
    marginLeft: 12,
  },
  driverName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  driverPlate: {
    color: '#FFD700',
    fontSize: 14,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  myServicesButton: {
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 8,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 8,
  },
  locationStatus: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
  },
  locationActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationActiveText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  locationInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationInactiveText: {
    color: '#FF6B6B',
    fontSize: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  countBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  serviceCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    gap: 4,
  },
  assignedText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  timeText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTimeText: {
    color: '#888',
    fontSize: 14,
  },
  customerName: {
    color: '#aaa',
    fontSize: 14,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  addressTextContainer: {
    flex: 1,
  },
  addressLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 2,
  },
  addressText: {
    color: '#fff',
    fontSize: 16,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  notesText: {
    color: '#aaa',
    fontSize: 14,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  acceptButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  waitingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
  },
  waitingText: {
    color: '#FFD700',
    fontSize: 14,
  },
});
