// App.tsx
import { Client } from '@stomp/stompjs';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import SockJS from 'sockjs-client';

interface LocationUpdate {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export default function App() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [otherLocations, setOtherLocations] = useState<LocationUpdate[]>([]);
  const stompClient = useRef<Client | null>(null);
  const userId = useRef<string>(`user_${Math.random().toString(36).substr(2, 9)}`);

  // Configurar WebSocket con SockJS
  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('http://192.168.18.11:8080/ws-location'), // Asegúrate que este endpoint esté habilitado con SockJS en el backend
      onConnect: () => {
        console.log('Conectado al WebSocket');
        client.subscribe('/topic/locations', (message) => {
          const locations = JSON.parse(message.body) as LocationUpdate[];
          setOtherLocations(locations.filter(loc => loc.userId !== userId.current));
        });
      },
      onStompError: (frame) => {
        console.error('Error en WebSocket:', frame.headers.message);
      },
      debug: (str) => {
        console.log('DEBUG:', str);
      },
      reconnectDelay: 5000,
    });

    stompClient.current = client;
    client.activate();

    return () => {
      client.deactivate();
    };
  }, []);

  // Obtener ubicación y enviar actualizaciones
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const startLocationUpdates = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      sendLocationUpdate(loc);

      intervalId = setInterval(async () => {
        const newLoc = await Location.getCurrentPositionAsync({});
        setLocation(newLoc);
        sendLocationUpdate(newLoc);
      }, 5000);
    };

    const sendLocationUpdate = (loc: Location.LocationObject) => {
      if (stompClient.current && stompClient.current.connected) {
        const update: LocationUpdate = {
          userId: userId.current,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: new Date().toISOString(),
        };

        console.log("Ubicación a enviar:", JSON.stringify(update));

        stompClient.current.publish({
          destination: '/app/update-location',
          body: JSON.stringify(update),
        });
      }
    };

    startLocationUpdates();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>{errorMsg || 'Obteniendo ubicación...'}</Text>
      </View>
    );
  }

  const region: Region = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <MapView style={styles.map} region={region}>
      {/* Tu ubicación */}
      <Marker
        coordinate={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }}
        title="Tu ubicación"
        description="Aquí estás tú"
        pinColor="blue"
      />

      {/* Otras ubicaciones */}
      {otherLocations.map((loc, index) => (
        <Marker
          key={`${loc.userId}-${index}`}
          coordinate={{
            latitude: loc.latitude,
            longitude: loc.longitude,
          }}
          title={`Usuario ${loc.userId.substring(0, 5)}`}
          description={`Actualizado: ${new Date(loc.timestamp).toLocaleTimeString()}`}
          pinColor="red"
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
