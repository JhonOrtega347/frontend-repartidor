import { Client } from '@stomp/stompjs';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import MapView, { Marker } from 'react-native-maps';
// Polyfill para WebSocket en React Native
if (!global.WebSocket) {
  global.WebSocket = require('websocket').w3cwebsocket;
}

const WS_URL = 'ws://192.168.18.9:8080/ws'; // ip local de mi backend 
const [userId, setUserId] = useState<string>('');
useEffect(() => {
  const getDeviceId = async () => {
    const deviceId = await DeviceInfo.getUniqueId();
    setUserId(deviceId);
    console.log('ID del dispositivo:', deviceId);
  };
  getDeviceId();
}, []);

interface LocationData {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
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
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    // 1. Configuración del cliente STOMP
    if (!userId) return;
    const stompClient = new Client({
      brokerURL: WS_URL,
      debug: (str) => console.log('STOMP:', str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    // 2. Manejadores de conexión
    stompClient.onConnect = () => {
      console.log('✅ Conectado al WebSocket');
      
      stompClient.subscribe('/topic/locations', (message) => {
        console.log('Mensaje recibido: ', message.body);
        const data = JSON.parse(message.body);
        if (data.userId !== userId){
          setLocations(prev =>({...prev, [data.userId]: data }));
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
          console.log('📍Nueva ubicación:', coords); // Debug
          
          setMyLocation(coords);

          if (stompClient.connected) {
            stompClient.publish({
              destination: '/app/update-location',
              body: JSON.stringify({
                userId,
                latitude: coords.latitude,
                longitude: coords.longitude
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
      // Corrección: Ejecuta la limpieza dentro del then
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
        showsUserLocation={true} // Activa el punto azul nativo
        userInterfaceStyle="light"
      >
        {/* Marcador personalizado para tu ubicación */}
        <Marker
          coordinate={myLocation}
          title="Tú"
          pinColor="blue"
        />

        {/* Marcadores para otros usuarios */}
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
