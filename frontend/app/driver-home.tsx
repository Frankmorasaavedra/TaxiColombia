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
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Service {
  id: string;
  pickup_address: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  destination?: string;
  notes?: string;
  created_at: string;
  customer_name?: string;
  distance_km?: number;
  estimated_minutes?: number;
  is_nearest?: boolean;
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
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
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
              'Para ver los servicios y su distancia, necesitamos acceso a tu ubicación.',
              [{ text: 'Entendido' }]
            );
          }
          return;
        }

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

  const fetchServices = useCallback(async () => {
    if (!driver) return;
    
    try {
      let url = `${API_URL}/api/services/available?driver_id=${driver.id}`;
      
      if (currentLocation) {
        url += `&driver_lat=${currentLocation.latitude}&driver_lon=${currentLocation.longitude}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      // Vibrate if new service available
      if (data.length > previousServiceCount.current && previousServiceCount.current >= 0) {
        if (data.length > 0 && previousServiceCount.current > 0) {
          Vibration.vibrate([0, 300, 100, 300]);
        }
      }
      previousServiceCount.current = data.length;
      
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver, currentLocation]);

  useEffect(() => {
    if (driver) {
      fetchServices();
      const interval = setInterval(fetchServices, 5000);
      return () => clearInterval(interval);
    }
  }, [driver, fetchServices]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServices();
  };

  const handleAcceptService = async (service: Service) => {
    if (!driver) return;

    // Show warning if not the nearest
    if (service.is_nearest === false) {
      Alert.alert(
        '⚠️ Hay un conductor más cercano',
        'Solo el conductor más cercano puede tomar este servicio. ¿Deseas intentar de todas formas?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Intentar', onPress: () => tryAcceptService(service.id) }
        ]
      );
    } else {
      tryAcceptService(service.id);
    }
  };

  const tryAcceptService = async (serviceId: string) => {
    if (!driver) return;
    
    setAcceptingId(serviceId);
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
        Alert.alert('✅ ¡Servicio Aceptado!', data.message, [
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
        fetchServices();
      } else {
        Alert.alert('❌ No disponible', data.detail || 'No se pudo aceptar el servicio');
        fetchServices(); // Refresh to update is_nearest status
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar al servidor');
    } finally {
      setAcceptingId(null);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeColor = (minutes: number | undefined | null) => {
    if (!minutes) return '#aaa';
    if (minutes <= 3) return '#4CAF50';
    if (minutes <= 7) return '#FFD700';
    if (minutes <= 15) return '#FF9800';
    return '#FF6B6B';
  };

  const renderServiceItem = ({ item }: { item: Service }) => (
    <View style={[
      styles.serviceCard,
      item.is_nearest && styles.nearestServiceCard
    ]}>
      {/* Nearest Badge */}
      {item.is_nearest && (
        <View style={styles.nearestBadge}>
          <Ionicons name="star" size={16} color="#000" />
          <Text style={styles.nearestText}>¡ERES EL MÁS CERCANO!</Text>
        </View>
      )}

      {/* Time/Distance Badge */}
      {item.estimated_minutes !== null && item.estimated_minutes !== undefined && (
        <View style={[
          styles.timeBadge,
          { backgroundColor: getTimeColor(item.estimated_minutes) }
        ]}>
          <Ionicons name="time" size={18} color="#000" />
          <Text style={styles.timeText}>
            {item.estimated_minutes} min
          </Text>
          {item.distance_km !== null && item.distance_km !== undefined && (
            <Text style={styles.distanceText}>
              ({item.distance_km} km)
            </Text>
          )}
        </View>
      )}

      <View style={styles.serviceHeader}>
        <View style={styles.headerTimeContainer}>
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

      <TouchableOpacity
        style={[
          styles.acceptButton,
          item.is_nearest && styles.nearestAcceptButton,
          acceptingId === item.id && styles.acceptingButton,
        ]}
        onPress={() => handleAcceptService(item)}
        disabled={acceptingId === item.id}
      >
        {acceptingId === item.id ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#000" />
            <Text style={styles.acceptButtonText}>
              {item.is_nearest ? 'ACEPTAR SERVICIO' : 'INTENTAR ACEPTAR'}
            </Text>
          </>
        )}
      </TouchableOpacity>
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
            <Text style={styles.locationActiveText}>GPS Activo</Text>
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
        <Text style={styles.title}>Servicios Disponibles</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{services.length}</Text>
        </View>
      </View>

      {/* Info */}
      {currentLocation && services.length > 0 && (
        <View style={styles.infoBar}>
          <Ionicons name="information-circle" size={16} color="#4ECDC4" />
          <Text style={styles.infoText}>
            Solo el conductor más cercano puede aceptar cada servicio
          </Text>
        </View>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={80} color="#444" />
          <Text style={styles.emptyText}>No hay servicios disponibles</Text>
          <Text style={styles.emptySubtext}>Desliza hacia abajo para actualizar</Text>
        </View>
      ) : (
        <FlatList
          data={services}
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
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#000',
    fontWeight: 'bold',
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  infoText: {
    color: '#4ECDC4',
    fontSize: 12,
  },
  listContent: {
    padding: 16,
  },
  serviceCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  nearestServiceCard: {
    borderLeftColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  nearestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    gap: 4,
  },
  nearestText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    gap: 4,
  },
  timeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  distanceText: {
    color: '#000',
    fontSize: 12,
    opacity: 0.8,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTimeContainer: {
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
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  nearestAcceptButton: {
    backgroundColor: '#4CAF50',
  },
  acceptingButton: {
    backgroundColor: '#999',
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
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
});
