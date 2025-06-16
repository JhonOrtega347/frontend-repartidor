import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
// @ts-ignore
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const WS_URL = 'http://192.168.18.9:8080/ws';
const userId = Platform.OS + '_' + Math.floor(Math.random() * 10000);

export default function App() {
  const [myLocation, setMyLocation] = useState({ latitude: 0, longitude: 0 });
  const [locations, setLocations] = useState<Record<string, { latitude: number, longitude: number }>>({});

  const connectWebSocket = () => {
    const socket = new SockJS(WS_URL);
    const client = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        console.log('✅ Conectado al WebSocket');
  
        client.subscribe('/topic/locations', (message) => {
          const data = JSON.parse(message.body);
          if (!data?.userId || !data?.latitude) return;
  
          setLocations((prev) => ({
            ...prev,
            [data.userId]: { latitude: data.latitude, longitude: data.longitude },
          }));
        });
      },
      debug: (str) => console.log(str),
      reconnectDelay: 5000,
    });
  
    client.activate();
    return client;
  };
  
  useEffect(() => {
    const client = connectWebSocket(); // Cannot find name 'connectWebSocket'.
    const startLocationUpdates = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permiso denegado');
        return;
      }
  
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
  
          setMyLocation(coords);
  
          client.publish({
            destination: '/app/update-location',
            body: JSON.stringify({
              userId,
              latitude: coords.latitude,
              longitude: coords.longitude,
              timestamp: Date.now(),
            }),
          });
        }
      );
    };
  
    startLocationUpdates(); // ejecuta la async, pero NO la retorna
  
    return () => {
      client.deactivate(); // cleanup correcto
    };
  }, []);
  

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mapa en Tiempo Real</Text>
      <MapView
        style={styles.map}
        region={{
          latitude: myLocation.latitude || -12.0464,
          longitude: myLocation.longitude || -77.0428,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {Object.entries(locations).map(([id, coord]) => (
          <Marker
            key={id}
            coordinate={coord}
            title={id === userId ? 'Tú' : `Usuario ${id}`}
            pinColor={id === userId ? 'blue' : 'red'}
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
  map: { flex: 1 },
});


