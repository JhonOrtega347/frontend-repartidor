import { Client } from '@stomp/stompjs';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

// Polyfill para WebSocket en React Native
if (!global.WebSocket) {
  global.WebSocket = require('websocket').w3cwebsocket;
}

interface LocationData {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp?: number;
}

export default function App() {
  const [myLocation, setMyLocation] = useState({ 
    latitude: -12.0464, 
    longitude: -77.0428 
  });
  const [locations, setLocations] = useState<Record<string, { 
    latitude: number, 
    longitude: number 
  }>>({});
  const [userId, setUserId] = useState<string>('');
  const clientRef = useRef<Client | null>(null);

  // Obtener ID único del dispositivo
  useEffect(() => {
    const getDeviceId = async () => {
      try {
        let deviceId: string | null = null;
        if (Platform.OS === 'android') {
          deviceId = await Application.getAndroidId();
        } else {
          const iosId = await Application.getIosIdForVendorAsync();
          deviceId = iosId ?? null;
        }
        setUserId(deviceId || `${Platform.OS}_${Math.random().toString(36).substr(2, 9)}`);
      } catch (error) {
        console.error('Error getting device ID:', error);
        setUserId(`${Platform.OS}_${Math.random().toString(36).substr(2, 9)}`);
      }
    };

    getDeviceId();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // 1. Configuración del cliente STOMP
    const stompClient = new Client({
      brokerURL: 'ws://192.168.18.9:8080/ws',
      debug: (str) => console.log('STOMP:', str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    // 2. Manejadores de conexión
    stompClient.onConnect = () => {
      console.log('✅ Conectado al WebSocket');
      
      stompClient.subscribe('/topic/locations', (message) => {
        try {
          const data: LocationData = JSON.parse(message.body);
          console.log('📍 Mensaje recibido:', data);
          
          if (data.userId && data.userId !== userId) {
            setLocations(prev => ({
              ...prev,
              [data.userId]: { 
                latitude: data.latitude, 
                longitude: data.longitude 
              }
            }));
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
    };

    stompClient.onStompError = (frame) => {
      console.error('🚨 Error STOMP:', frame.headers.message);
    };

    stompClient.onWebSocketError = (error) => {
      console.error('🚨 WebSocket Error:', error);
    };

    // 3. Activar conexión
    stompClient.activate();
    clientRef.current = stompClient;

    // 4. Obtener ubicación
    const startLocationUpdates = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permiso de ubicación denegado');
        return;
      }

      console.log('📍Iniciando seguimiento de ubicación...');
      
      const locationWatcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          };
          
          setMyLocation(coords);

          if (clientRef.current?.connected) {
            clientRef.current.publish({
              destination: '/app/update-location',
              body: JSON.stringify({
                userId,
                latitude: coords.latitude,
                longitude: coords.longitude,
                timestamp: Date.now()
              })
            });
          }
        }
      );

      return () => locationWatcher.remove();
    };

    const cleanupLocation = startLocationUpdates();

    // 5. Limpieza
    return () => {
      console.log('🧹 Limpiando recursos...');
      if (clientRef.current?.connected) {
        clientRef.current.deactivate();
      }
      cleanupLocation.then(cleanup => cleanup?.());
    };
  }, [userId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mapa en Tiempo Real</Text>
      <MapView
        style={styles.map}
        region={{
          ...myLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={true}
        userInterfaceStyle="light"
      >
        <Marker
          coordinate={myLocation}
          title="Tú"
          pinColor="blue"
        />

        {Object.entries(locations).map(([id, coord]) => (
          <Marker
            key={id}
            coordinate={coord}
            title={`Usuario ${id}`}
            pinColor="red"
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    padding: 20,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  map: { 
    flex: 1,
    width: '100%',
    height: '100%'
  },
});
