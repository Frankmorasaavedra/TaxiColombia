import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
  ActivityIndicator,
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
  pickup_latitude?: number;
  pickup_longitude?: number;
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

export default function ServiceDetailScreen() {
  const params = useLocalSearchParams();
  const [completing, setCompleting] = useState(false);
  
  let service: Service | null = null;
  let driver: Driver | null = null;

  try {
    if (params.service) {
      service = JSON.parse(params.service as string);
    }
    if (params.driver) {
      driver = JSON.parse(params.driver as string);
    }
  } catch (e) {
    console.error('Error parsing params:', e);
  }

  const handleCall = () => {
    if (service?.customer_phone) {
      Linking.openURL(`tel:${service.customer_phone}`);
    }
  };

  const handleWhatsApp = () => {
    if (service?.customer_phone) {
      // Format phone for WhatsApp (remove special chars, add country code if needed)
      let phone = service.customer_phone.replace(/[^0-9]/g, '');
      if (!phone.startsWith('57')) {
        phone = '57' + phone; // Colombia country code
      }
      const message = encodeURIComponent(
        `Hola, soy ${driver?.name} de Taxi Colombia. Estoy en camino a recogerlo. Placa: ${driver?.vehicle_plate}`
      );
      Linking.openURL(`whatsapp://send?phone=${phone}&text=${message}`);
    }
  };

  const handleOpenMaps = () => {
    if (service?.pickup_latitude && service?.pickup_longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${service.pickup_latitude},${service.pickup_longitude}`;
      Linking.openURL(url);
    } else if (service?.pickup_address) {
      const address = encodeURIComponent(service.pickup_address);
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    }
  };

  const handleCompleteService = async () => {
    if (!service || !driver) return;

    Alert.alert(
      'Completar Servicio',
      '¿Deseas marcar este servicio como completado?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Completar',
          onPress: async () => {
            setCompleting(true);
            try {
              const response = await fetch(
                `${API_URL}/api/services/${service.id}/complete?driver_id=${driver.id}`,
                { method: 'POST' }
              );

              if (response.ok) {
                Alert.alert('¡Servicio Completado!', 'El servicio ha sido marcado como completado.', [
                  {
                    text: 'OK',
                    onPress: () => router.back(),
                  },
                ]);
              } else {
                const data = await response.json();
                Alert.alert('Error', data.detail || 'No se pudo completar el servicio');
              }
            } catch (error) {
              Alert.alert('Error', 'No se pudo conectar al servidor');
            } finally {
              setCompleting(false);
            }
          },
        },
      ]
    );
  };

  if (!service) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error cargando servicio</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Detalle del Servicio</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusBadge,
            service.status === 'accepted' && styles.statusAccepted,
            service.status === 'completed' && styles.statusCompleted,
          ]}>
            <Ionicons
              name={service.status === 'completed' ? 'checkmark-circle' : 'time'}
              size={20}
              color="#fff"
            />
            <Text style={styles.statusText}>
              {service.status === 'accepted' ? 'En Progreso' : 'Completado'}
            </Text>
          </View>
        </View>

        {/* Customer Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información del Cliente</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="person" size={24} color="#FFD700" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Nombre</Text>
              <Text style={styles.infoValue}>
                {service.customer_name || 'Cliente'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call" size={24} color="#4ECDC4" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Teléfono</Text>
              <Text style={styles.infoValue}>{service.customer_phone}</Text>
            </View>
          </View>

          {/* Contact Buttons */}
          <View style={styles.contactButtons}>
            <TouchableOpacity style={styles.callButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color="#fff" />
              <Text style={styles.contactButtonText}>Llamar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.whatsappButton} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#fff" />
              <Text style={styles.contactButtonText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ubicación</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="location" size={24} color="#FF6B6B" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Dirección de Recogida</Text>
              <Text style={styles.infoValue}>{service.pickup_address}</Text>
            </View>
          </View>

          {service.destination && (
            <View style={styles.infoRow}>
              <Ionicons name="flag" size={24} color="#4ECDC4" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Destino</Text>
                <Text style={styles.infoValue}>{service.destination}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.mapsButton} onPress={handleOpenMaps}>
            <Ionicons name="navigate" size={24} color="#fff" />
            <Text style={styles.mapsButtonText}>Abrir en Google Maps</Text>
          </TouchableOpacity>
        </View>

        {/* Notes Card */}
        {service.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notas</Text>
            <View style={styles.notesContent}>
              <Ionicons name="document-text" size={24} color="#aaa" />
              <Text style={styles.notesText}>{service.notes}</Text>
            </View>
          </View>
        )}

        {/* Complete Button */}
        {service.status === 'accepted' && (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleCompleteService}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={24} color="#000" />
                <Text style={styles.completeButtonText}>COMPLETAR SERVICIO</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    backgroundColor: '#666',
  },
  statusAccepted: {
    backgroundColor: '#FF9800',
  },
  statusCompleted: {
    backgroundColor: '#4CAF50',
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  whatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  mapsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notesContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  notesText: {
    flex: 1,
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  completeButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 18,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
});
