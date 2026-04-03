import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Service {
  id: string;
  customer_phone: string;
  customer_name?: string;
  pickup_address: string;
  destination?: string;
  notes?: string;
  status: string;
  created_at: string;
  accepted_at?: string;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicle_plate: string;
}

export default function MyServicesScreen() {
  const params = useLocalSearchParams();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const fetchMyServices = useCallback(async () => {
    if (!driver) return;
    
    try {
      const response = await fetch(`${API_URL}/api/services/my-services/${driver.id}`);
      const data = await response.json();
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver]);

  useEffect(() => {
    if (driver) {
      fetchMyServices();
    }
  }, [driver, fetchMyServices]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyServices();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#FF9800';
      case 'completed':
        return '#4CAF50';
      default:
        return '#666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'En Progreso';
      case 'completed':
        return 'Completado';
      default:
        return status;
    }
  };

  const renderServiceItem = ({ item }: { item: Service }) => (
    <TouchableOpacity
      style={styles.serviceCard}
      onPress={() =>
        router.push({
          pathname: '/service-detail',
          params: {
            service: JSON.stringify(item),
            driver: JSON.stringify(driver),
          },
        })
      }
    >
      <View style={styles.serviceHeader}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar" size={16} color="#aaa" />
          <Text style={styles.dateText}>{formatDate(item.accepted_at || item.created_at)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>

      <View style={styles.addressContainer}>
        <Ionicons name="location" size={20} color="#FF6B6B" />
        <Text style={styles.addressText} numberOfLines={2}>
          {item.pickup_address}
        </Text>
      </View>

      {item.destination && (
        <View style={styles.addressContainer}>
          <Ionicons name="flag" size={20} color="#4ECDC4" />
          <Text style={styles.addressText} numberOfLines={1}>
            {item.destination}
          </Text>
        </View>
      )}

      <View style={styles.customerContainer}>
        <Ionicons name="person" size={16} color="#aaa" />
        <Text style={styles.customerText}>
          {item.customer_name || 'Cliente'} • {item.customer_phone}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mis Servicios</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Cargando tus servicios...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Servicios</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Services List */}
      {services.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-outline" size={80} color="#444" />
          <Text style={styles.emptyText}>No tienes servicios aún</Text>
          <Text style={styles.emptySubtext}>Acepta servicios para verlos aquí</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  headerBackButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
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
  listContent: {
    padding: 16,
  },
  serviceCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    color: '#aaa',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  addressText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  customerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    gap: 6,
  },
  customerText: {
    color: '#aaa',
    fontSize: 13,
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
