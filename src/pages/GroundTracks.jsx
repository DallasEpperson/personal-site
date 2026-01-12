import React from 'react';
import { Box, Typography, Container } from '@mui/material';
import { MapContainer, TileLayer, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const GroundTrack = () => {
  // Center roughly on the Blue Ridge for now
  const position = [35.5951, -82.5515];

  return (
    <Container maxWidth="xl" sx={{ height: 'calc(100vh - 160px)', py: 2 }}>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Ground Tracks
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Exploring the world via GPS telemetry
        </Typography>
      </Box>

      <Box sx={{ 
        height: '100%', 
        width: '100%', 
        borderRadius: 2, 
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 3
      }}>
        <MapContainer center={position} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <LayersControl position="topright">
            {/* TODO depperson add Hike/Bike/Backpacking overlays here next */}
          </LayersControl>
        </MapContainer>
      </Box>
    </Container>
  );
};

export default GroundTrack;