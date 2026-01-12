import React, { useState, useEffect, useMemo } from 'react';
import { 
  Container, Typography, Box, Paper, Button, 
  Slider, Stack, Divider, Alert, Card, CardContent,
  TextField, MenuItem, FormControl, InputLabel, Select,
  Checkbox, FormControlLabel
} from '@mui/material';
import gpxParser from 'gpxparser';
import simplify from 'simplify-js';
import tzlookup from 'tz-lookup';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapBounds({ points }) {
  const map = useMap();
  
  useEffect(() => { 
    if (points?.length) {
      const lats = points.map(p => p.x);
      const lons = points.map(p => p.y);
      const bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
      ];
      map.fitBounds(bounds, { padding: [50, 50] }); 
    }
  }, [points, map]);
  
  return null;
}

const calculateDistance = (coords) => {
    if (coords.length < 2) return 0;
    let total = 0;
    const R = 3958.8; // Radius of Earth in miles
    for (let i = 0; i < coords.length - 1; i++) {
      const [lat1, lon1] = coords[i];
      const [lat2, lon2] = coords[i + 1];
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += R * c;
    }
    return total;
};

/** Helper to ensure dates conform to yyyy-MM-ddThh:mm for HTML5 input
 * @param {string} dateStr - Input date string in various formats
 * @returns {string} - Formatted date string suitable for datetime-local input
 */
const formatToDateTimeLocal = (dateStr) => {
    if (!dateStr) return '';
    const cleanDate = dateStr.replace(/\./g, '-');
    // If it's just a date YYYY-MM-DD, add noon as default time
    if (cleanDate.length === 10) return `${cleanDate}T12:00`;
    // If it's full ISO, truncate to minutes
    return cleanDate.substring(0, 16);
};

const ImportTool = () => {
  const [rawPoints, setRawPoints] = useState([]); 
  const [metadata, setMetadata] = useState({ name: '', date: '', tz: '' });
  const [activityType, setActivityType] = useState('Hike');
  const [hasBlog, setHasBlog] = useState(false);
  const [epsilon, setEpsilon] = useState(0.00002); 
  const [error, setError] = useState(null);

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);

    const text = await file.text();
    let points = [];
    let name = file.name.replace(/\.[^/.]+$/, "");
    let rawDate = new Date().toISOString();

    try {
      if (text.includes('<gpx')) {
        const gpx = new gpxParser();
        gpx.parse(text);
        if (!gpx.tracks[0]) throw new Error("GPX file contains no tracks.");
        points = gpx.tracks[0].points.map(p => ({ x: p.lat, y: p.lon }));
        name = gpx.tracks[0].name || name;
        rawDate = gpx.tracks[0].time ? gpx.tracks[0].time.toString() : rawDate;
      } else {
        const json = JSON.parse(text);
        if (json.features && json.features[0].geometry.coordinates) {
          let coords = json.features[0].geometry.coordinates;
          if (json.outAndBack) {
            const returnTrip = [...coords].reverse().slice(1);
            coords = [...coords, ...returnTrip];
          }
          points = coords.map(c => ({ x: c[1], y: c[0] }));
          name = json.hikeName || name;
          rawDate = json.timestamp || json.hikeDate || rawDate;
        } else if (Array.isArray(json)) {
          points = json.map(p => ({ x: p[0], y: p[1] }));
        }
      }

      if (points.length === 0) throw new Error("No coordinate data found.");
      
      const tz = tzlookup(points[0].x, points[0].y);
      setRawPoints(points);
      setMetadata({ 
        name, 
        date: formatToDateTimeLocal(rawDate),
        tz 
      });
    } catch (err) {
      setError(`Import Failed: ${err.message}`);
      console.error(err);
    }
  };

  const ghostPoints = useMemo(() => rawPoints.map(p => [p.x, p.y]), [rawPoints]);
  
  const simplifiedPoints = useMemo(() => {
    if (rawPoints.length === 0) return [];
    const simplified = simplify(rawPoints, epsilon, true);
    return simplified.map(p => [p.x, p.y]);
  }, [rawPoints, epsilon]);

  const rawDist = useMemo(() => calculateDistance(ghostPoints), [ghostPoints]);
  const simplifiedDist = useMemo(() => calculateDistance(simplifiedPoints), [simplifiedPoints]);
  const mileageLossFeet = (rawDist - simplifiedDist) * 5280;

  const generateId = () => {
    if (!metadata.date || !metadata.name) return 'pending';
    
    const datePart = metadata.date.replace(':', ''); 
    
    const nameSlug = metadata.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces/hyphens)
      .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with single hyphen
      .replace(/^-+|-+$/g, '');  // Trim hyphens from ends
  
    return `${datePart}-${nameSlug}`;
  };

  const handleExport = () => {
    const fileName = generateId();
    if (fileName === 'pending') {
      alert("Please ensure Name and Date are set.");
      return;
    }
    
    const trackData = JSON.stringify(simplifiedPoints);
    const blob = new Blob([trackData], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.json`;
    link.click();
  
    const previewPoints = simplify(rawPoints, 0.005, true).map(p => [p.x, p.y]);
  
    const entry = {
      id: fileName,
      name: metadata.name,
      date: metadata.date,
      type: activityType,
      hasBlog: hasBlog,
      bounds: simplifiedPoints.length > 0 ? [simplifiedPoints[0], simplifiedPoints[simplifiedPoints.length - 1]] : [],
      preview: previewPoints,
      trackUrl: `/data/tracks/${fileName}.json`
    };
    
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2) + ",");
    alert(`Exported: ${fileName}.json\nManifest entry copied to clipboard.`);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 800 }}>Track Preprocessor</Typography>
      
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
        <Box sx={{ width: { xs: '100%', lg: '380px' } }}>
          <Paper sx={{ p: 3, position: 'sticky', top: 20 }}>
            <Button variant="contained" component="label" fullWidth size="large" sx={{ mb: 3 }}>
              Upload GPX or JSON
              <input type="file" hidden onChange={processFile} />
            </Button>

            {rawPoints.length > 0 && (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="overline" color="text.secondary">Simplification</Typography>
                  <Slider 
                    value={epsilon} 
                    min={0} max={0.0003} step={0.000005} 
                    onChange={(_, v) => setEpsilon(v)} 
                  />
                  <Typography variant="body2">
                    Precision: ~{(epsilon * 111139).toFixed(1)}m (Epsilon: {epsilon.toFixed(6)})
                  </Typography>
                </Box>

                <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
                  <CardContent sx={{ p: '12px !important' }}>
                    <Typography variant="caption" color="text.secondary">MILEAGE & PRECISION</Typography>
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                      <Box>
                        <Typography variant="h6">{simplifiedDist.toFixed(2)} mi</Typography>
                        <Typography variant="caption">Simplified</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" color={mileageLossFeet > 100 ? "error.main" : "text.secondary"}>
                          -{mileageLossFeet.toFixed(0)} ft
                        </Typography>
                        <Typography variant="caption">Distance Loss</Typography>
                      </Box>
                    </Stack>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2">
                      Points: {rawPoints.length} → {simplifiedPoints.length} ({Math.round((1 - simplifiedPoints.length / rawPoints.length) * 100)}% reduction)
                    </Typography>
                  </CardContent>
                </Card>

                <Divider />

                <Box>
                  <Typography variant="overline" color="text.secondary">Metadata</Typography>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField 
                      label="Name" 
                      fullWidth 
                      value={metadata.name} 
                      onChange={(e) => setMetadata({...metadata, name: e.target.value})} 
                    />
                    <TextField 
                      label="Date & Local Time" 
                      type="datetime-local" 
                      fullWidth 
                      value={metadata.date}
                      onChange={(e) => setMetadata({...metadata, date: e.target.value})} 
                      InputLabelProps={{ shrink: true }}
                      helperText={`Timezone: ${metadata.tz || 'Detecting...'}`}
                    />
                    <FormControl fullWidth>
                      <InputLabel>Activity Type</InputLabel>
                      <Select 
                        value={activityType} 
                        label="Activity Type" 
                        onChange={(e) => setActivityType(e.target.value)}
                      >
                        <MenuItem value="Hike">Hike</MenuItem>
                        <MenuItem value="Bike ride">Bike ride</MenuItem>
                        <MenuItem value="Backpacking">Backpacking</MenuItem>
                        <MenuItem value="Walk">Walk</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControlLabel 
                      control={<Checkbox checked={hasBlog} onChange={(e) => setHasBlog(e.target.checked)} />} 
                      label="Has associated blog post?" 
                    />
                  </Stack>
                </Box>

                <Button variant="contained" color="success" size="large" onClick={handleExport}>
                  Export & Copy Manifest
                </Button>

                <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.900', color: 'lime', fontSize: '10px', overflowX: 'auto' }}>
                <pre>{`{
  "id": "${generateId()}",
  "name": "${metadata.name}",
  "date": "${metadata.date}",
  "type": "${activityType}",
  "hasBlog": ${hasBlog},
  "bounds": ${JSON.stringify(simplifiedPoints.length > 0 ? [simplifiedPoints[0], simplifiedPoints[simplifiedPoints.length - 1]] : [])},
  "preview": ${JSON.stringify(simplify(rawPoints, 0.005, true).map(p => [p.x, p.y]))},
  "trackUrl": "/data/tracks/${generateId()}.json"
},`}</pre>
                </Paper>
              </Stack>
            )}
          </Paper>
        </Box>

        <Box sx={{ flexGrow: 1, height: '75vh', borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
          <MapContainer center={[35.5951, -82.5515]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
            {rawPoints.length > 0 && (
              <>
                <Polyline 
                    key={`ghost-${rawPoints.length}`} 
                    positions={ghostPoints} 
                    pathOptions={{ color: '#D3D', weight: 3, opacity: 0.4, dashArray: '5, 10' }} 
                />
                <Polyline 
                    positions={simplifiedPoints} 
                    pathOptions={{ color: '#2196f3', weight: 4 }} 
                />
                <MapBounds points={rawPoints} />
              </>
            )}
          </MapContainer>
        </Box>
      </Stack>
    </Container>
  );
};

export default ImportTool;