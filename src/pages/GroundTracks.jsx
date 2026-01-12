import React, { useEffect, useState } from 'react';
import { Container, Typography, Box, CircularProgress } from '@mui/material';
import { MapContainer, TileLayer, Polyline, LayersControl, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const { Overlay } = LayersControl;

const GroundTracks = () => {
  const [manifest, setManifest] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/tracks/index.json')
      .then(res => res.json())
      .then(data => {
        setManifest(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load manifest:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
      <CircularProgress />
    </Box>
  );

  const activityTypes = ['Hike', 'Bike ride', 'Backpacking', 'Walk'];

  return (
    <Container maxWidth="xl" sx={{ height: 'calc(100vh - 120px)', py: 2 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>Ground Tracks</Typography>
      
      <Box sx={{ height: '100%', borderRadius: 4, overflow: 'hidden', border: '1px solid divider' }}>
        <MapContainer center={[35.5951, -82.5515]} zoom={11} style={{ height: '100%' }}>
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; OpenStreetMap contributors' 
          />

          <LayersControl position="topright">
            {activityTypes.map(type => (
              <Overlay checked name={type} key={type}>
                <Box component="span">
                  {manifest.filter(h => h.type === type).map(hike => (
                    <TrackLine key={hike.id} hike={hike} />
                  ))}
                </Box>
              </Overlay>
            ))}
          </LayersControl>
        </MapContainer>
      </Box>
    </Container>
  );
};

const TrackLine = ({ hike }) => {
    const [coordinates, setCoordinates] = useState(hike.preview || []);
    const [isHighRes, setIsHighRes] = useState(false);
  
    const loadHighResTrack = () => {
      if (isHighRes) return;
      fetch(hike.trackUrl)
        .then(res => res.json())
        .then(data => {
          setCoordinates(data);
          setIsHighRes(true);
        });
    };
  
    return (
      <Polyline
        positions={coordinates}
        pathOptions={{ 
          color: hike.type === 'Bike ride' ? '#ef5350' : '#42a5f5', 
          weight: 4, //isHighRes ? 4 : 2,
          opacity: isHighRes ? 1 : 0.6
        }}
        eventHandlers={{
          mouseover: loadHighResTrack,
          click: () => {
            if (hike.hasBlog) window.location.href = `/blog/${hike.id}`;
          }
        }}
      >
        <Tooltip sticky>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{hike.name}</Typography>
          <Typography variant="caption">
              {new Date(hike.date).toLocaleDateString()} • {hike.type}
          </Typography>
        </Tooltip>
      </Polyline>
    );
  };

export default GroundTracks;