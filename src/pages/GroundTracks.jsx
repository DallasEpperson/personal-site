import React, { useEffect, useState } from 'react';
import { 
  Container, Typography, Box, CircularProgress, 
  Menu, MenuItem, ListItemText, ListItemIcon, Divider 
} from '@mui/material';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import { MapContainer, TileLayer, Polyline, LayersControl, Tooltip, useMapEvents, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const { Overlay } = LayersControl;

const metersToMiles = (m) => (m * 0.000621371).toFixed(2);
const metersToFeet = (m) => Math.round(m * 3.28084);

const formatHikeTime = (dateStr, tz) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: tz, timeZoneName: 'short',
  }).format(new Date(dateStr));
};

/** Spatial check to see if a click is near a line segment.
 * @param {Object} clickLatLng - { lat: number, lng: number }
 * @param {Array} points - Array of [lat, lng] pairs defining the line
 * @param {number} tolerance - Distance tolerance
*/
const isPointNearLine = (clickLatLng, points, tolerance = 0.0004) => {
  return points.some((p, i) => {
    if (i === 0) return false;
    const p1 = points[i - 1];
    const p2 = p;
    
    const minLat = Math.min(p1[0], p2[0]) - tolerance;
    const maxLat = Math.max(p1[0], p2[0]) + tolerance;
    const minLng = Math.min(p1[1], p2[1]) - tolerance;
    const maxLng = Math.max(p1[1], p2[1]) + tolerance;

    if (clickLatLng.lat < minLat || clickLatLng.lat > maxLat || 
        clickLatLng.lng < minLng || clickLatLng.lng > maxLng) return false;

    const dy = p2[0] - p1[0];
    const dx = p2[1] - p1[1];
    if (dx === 0 && dy === 0) return false;

    const t = ((clickLatLng.lat - p1[0]) * dy + (clickLatLng.lng - p1[1]) * dx) / (dy * dy + dx * dx);
    const nearestLat = p1[0] + Math.max(0, Math.min(1, t)) * dy;
    const nearestLng = p1[1] + Math.max(0, Math.min(1, t)) * dx;

    const dist = Math.sqrt(Math.pow(clickLatLng.lat - nearestLat, 2) + Math.pow(clickLatLng.lng - nearestLng, 2));
    return dist < tolerance;
  });
};

const GroundTracks = () => {
  const [manifest, setManifest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadedData, setLoadedData] = useState({}); 
  const [highlightedId, setHighlightedId] = useState(null);

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

  const handleHikeSelect = (hike) => {
    setAnchorEl(null);
    if (hike.hasBlog) window.location.href = `/blog/${hike.id}`;
  };

  const MapClickHandler = () => {
    const map = useMapEvents({
      click: (e) => {
        const currentZoom = map.getZoom();
        const tolerance = (40 / Math.pow(2, currentZoom)); 
  
        const nearby = manifest.filter(hike => {
          const [[minLat, minLng], [maxLat, maxLng]] = hike.bounds;
          if (e.latlng.lat < minLat - tolerance || e.latlng.lat > maxLat + tolerance ||
              e.latlng.lng < minLng - tolerance || e.latlng.lng > maxLng + tolerance) {
            return false;
          }
  
          const pointsToCheck = loadedData[hike.id] || hike.preview;
          return isPointNearLine(e.latlng, pointsToCheck, tolerance);
        });
  
        if (nearby.length === 1) {
          handleHikeSelect(nearby[0]);
        } else if (nearby.length > 1) {
          const sorted = [...nearby].sort((a, b) => new Date(b.date) - new Date(a.date));
          setCandidates(sorted);
          setAnchorEl({ mouseX: e.containerPoint.x, mouseY: e.containerPoint.y });
        }
      },
    });
    return null;
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;

  const activityTypes = ['Hike', 'Bike ride', 'Backpacking', 'Walk'];

  return (
    <Container maxWidth="xl" sx={{ height: 'calc(100vh - 120px)', py: 2 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>Ground Tracks</Typography>
      
      <Box sx={{ height: '100%', borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        <MapContainer center={[35.5951, -82.5515]} zoom={11} style={{ height: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          
          <MapClickHandler />

          <LayersControl position="topright">
            {activityTypes.map(type => {
              const filtered = manifest.filter(h => h.type === type);
              if (filtered.length === 0) return null;
              return (
                <Overlay checked name={type} key={type}>
                  <LayerGroup>
                    {filtered.map(hike => (
                      <TrackLine 
                        key={hike.id} 
                        hike={hike}
                        isHighlighted={highlightedId === hike.id}
                        onDataLoaded={(data) => setLoadedData(prev => ({ ...prev, [hike.id]: data }))}
                      />
                    ))}
                  </LayerGroup>
                </Overlay>
              );
            })}
          </LayersControl>
        </MapContainer>
      </Box>

      <Menu
        open={!!anchorEl}
        onClose={() => { setAnchorEl(null); setHighlightedId(null); }}
        anchorReference="anchorPosition"
        anchorPosition={anchorEl ? { top: anchorEl.mouseY, left: anchorEl.mouseX } : undefined}
      >
        <Typography variant="overline" sx={{ px: 2, color: 'text.secondary', display: 'block', mb: 1 }}>
          Select Activity:
        </Typography>
        <Divider />
        {candidates.map(hike => (
          <MenuItem
            key={hike.id}
            onClick={() => handleHikeSelect(hike)}
            onMouseEnter={() => setHighlightedId(hike.id)}
            onMouseLeave={() => setHighlightedId(null)}
          >
            <ListItemIcon>
              {hike.type === 'Bike ride' ? <DirectionsBikeIcon fontSize="small" /> : <DirectionsWalkIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText 
              primary={hike.name} 
              secondary={`${new Date(hike.date).toLocaleDateString()} • ${metersToMiles(hike.distanceMeters)} mi`} 
            />
          </MenuItem>
        ))}
      </Menu>
    </Container>
  );
};

const TrackLine = ({ hike, onDataLoaded, isHighlighted }) => {
  const [coordinates, setCoordinates] = useState(hike.preview || []);
  const [isHighRes, setIsHighRes] = useState(false);

  const loadHighRes = () => {
    if (isHighRes) return;
    fetch(hike.trackUrl)
      .then(res => res.json())
      .then(data => {
        setCoordinates(data);
        setIsHighRes(true);
        onDataLoaded(data);
      });
  };

  return (
    <Polyline
      positions={coordinates}
      pathOptions={{ 
        color: isHighlighted? '#FFFF00' : (hike.type === 'Bike ride' ? '#ef5350' : '#42a5f5'), 
        weight: isHighlighted? 8 : 6,
        opacity: isHighlighted? 1 : (isHighRes ? 1 : 0.6),
        zIndexOffset: isHighlighted? 1000 : 0,
      }}
      eventHandlers={{ mouseover: loadHighRes }}
    >
      <Tooltip sticky>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{hike.name}</Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          {formatHikeTime(hike.date, hike.tz)} • {hike.type}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
          {metersToMiles(hike.distanceMeters)} miles
          {hike.elevationGainMeters && ` • ${metersToFeet(hike.elevationGainMeters).toLocaleString()} ft gain`}
        </Typography>
      </Tooltip>
    </Polyline>
  );
};

export default GroundTracks;