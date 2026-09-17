import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Container, Typography, Box, Paper, Button, 
  Slider, Stack, Divider, Alert, Card, CardContent,
  TextField, MenuItem, FormControl, InputLabel, Select,
  Checkbox, FormControlLabel, ToggleButton, ToggleButtonGroup,
  CircularProgress, Chip, Tooltip as MuiTooltip
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/CloudDownload';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteIcon from '@mui/icons-material/Delete';
import PanToolIcon from '@mui/icons-material/PanTool';
import CreateIcon from '@mui/icons-material/Create';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import gpxParser from 'gpxparser';
import simplify from 'simplify-js';
import tzlookup from 'tz-lookup';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** Helper to auto-zoom the map when a new track file is loaded or recenter is requested.
 * Triggers ONLY when fitTrigger changes, preserving view state during rapid point editing.
 */
function MapBounds({ points, fitTrigger }) {
  const map = useMap();
  
  useEffect(() => { 
    if (points?.length && fitTrigger) {
      const lats = points.map(p => p.x);
      const lons = points.map(p => p.y);
      const bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
      ];
      map.fitBounds(bounds, { padding: [50, 50] }); 
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTrigger, map]);
  
  return null;
}

/** Component to capture the Leaflet map instance into parent state */
function MapController({ setMapInstance }) {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);
  return null;
}

/** Calculate total elevation gain from an array of points.
 * @param {Array<{ele: number}>} points - Array of points with elevation data.
 * @returns {number} - Elevation gain in meters.
 */
const calculateElevationGain = (points) => {
  if (points.length < 2) return 0;
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].ele !== undefined && points[i - 1].ele !== undefined) {
      const diff = points[i].ele - points[i - 1].ele;
      if (diff > 0) gain += diff;
    }
  }
  return gain;
};

/** Calculates Great Circle distance using Haversine formula.
 * @param {Array<[number, number]>} coords - Array of [lat, lon] pairs.
 * @returns {number} - Distance in meters.
 */
const calculateDistanceInMeters = (coords) => {
  if (coords.length < 2) return 0;
  let total = 0;
  const R = 6371000; // Radius of Earth in meters
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

/** Converts a UTC ISO string to a naïve local string for the MUI datetime-local picker.
 */
const utcToLocalNaive = (utcString, timezone) => {
  if (!utcString) return '';
  const date = new Date(utcString);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = formatter.formatToParts(date);
  const hash = parts.reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${hash.year}-${hash.month}-${hash.day}T${hash.hour}:${hash.minute}`;
};

/** Converts a naïve local string back to a UTC ISO string.
 */
const localNaiveToUtc = (localNaive, timezone) => {
  if (!localNaive) return '';
  return new Date(new Date(localNaive).toLocaleString('en-US', { timeZone: timezone || 'UTC' })).toISOString();
};

/** Stringifies a manifest entry while minifying internal coordinate arrays
 */
const minifyManifestEntry = (entry) => {
  const json = JSON.stringify(entry, null, 2);
  return json.replace(/\[\s+([\d.-]+),\s+([\d.-]+)\s+\]/g, '[$1,$2]')
             .replace(/\[\s+([\s\S]*?)\s+\]/g, (match) => match.replace(/\s+/g, ''));
};

const ImportTool = () => {
  const [rawPoints, setRawPoints] = useState([]); 
  const [history, setHistory] = useState([]);
  const [metadata, setMetadata] = useState({ name: '', date: '', tz: '' });
  const [activityType, setActivityType] = useState('Hike');
  const [hasBlog, setHasBlog] = useState(false);
  const [epsilon, setEpsilon] = useState(0.00002); 
  const [error, setError] = useState(null);
  const [trimRange, setTrimRange] = useState([0, 100]);
  const [fitTrigger, setFitTrigger] = useState(0);

  // OSM Overpass Integration states
  const [mapInstance, setMapInstance] = useState(null);
  const [osmNodes, setOsmNodes] = useState([]);
  const [osmWays, setOsmWays] = useState([]);
  const [isFetchingOsm, setIsFetchingOsm] = useState(false);
  const [osmStatusMsg, setOsmStatusMsg] = useState(null);
  const [editMode, setEditMode] = useState('none'); // 'none' (pan), 'append', 'prepend'

  /** Save current points state for undo */
  const pushHistory = useCallback((currentPoints) => {
    setHistory(prev => [...prev.slice(-30), currentPoints]);
  }, []);

  /** Main file processing logic. Handles GPX, Legacy GeoJSON, and simple JSON arrays.
   */
  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    setTrimRange([0, 100]);

    const text = await file.text();
    let points = [];
    let name = file.name.replace(/\.[^/.]+$/, "");
    let rawDate = new Date().toISOString();

    try {
      if (text.includes('<gpx')) {
        const gpx = new gpxParser();
        gpx.parse(text);
        
        if (!gpx.tracks[0]) throw new Error("GPX file contains no tracks.");
        
        points = gpx.tracks[0].points.map(p => ({ 
          x: p.lat, 
          y: p.lon, 
          ele: p.ele 
        }));
        
        name = gpx.tracks[0].name || name;

        const gpxDate = gpx.metadata?.time || 
                        gpx.tracks[0].points[0]?.time || 
                        gpx.tracks[0].time;

        rawDate = gpxDate ? gpxDate.toString() : new Date().toISOString();
        const typeMap = {
          'walking': 'Walk',
          'hiking': 'Hike',
          'cycling': 'Bike ride'
        };
        const stravaType = gpx.tracks[0].type?.toLowerCase();
        if (typeMap[stravaType]) setActivityType(typeMap[stravaType]);
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
      setHistory([]);
      setRawPoints(points);
      setFitTrigger(prev => prev + 1);
      setMetadata({
        name,
        date: new Date(rawDate).toISOString(),
        tz
      });
    } catch (err) {
      setError(`Import Failed: ${err.message}`);
      console.error(err);
    }
  };

  /** Initialize a new blank track */
  const startBlankTrack = () => {
    setError(null);
    setHistory([]);
    setRawPoints([]);
    setTrimRange([0, 100]);

    // Use current map center or default for timezone lookup
    let lat = 35.5951, lon = -82.5515;
    if (mapInstance) {
      const center = mapInstance.getCenter();
      lat = center.lat;
      lon = center.lng;
    }
    const tz = tzlookup(lat, lon);
    
    setMetadata({
      name: 'New Custom Track',
      date: new Date().toISOString(),
      tz
    });
    setEditMode('append');
  };

  /** Fetch trail data from OpenStreetMap via Overpass API for current bounding box */
  const fetchOsmData = async () => {
    if (!mapInstance) {
      setError("Map instance not initialized.");
      return;
    }

    const zoom = mapInstance.getZoom();
    if (zoom < 12) {
      setError("Please zoom in closer before fetching OSM trails to avoid fetching too much data.");
      return;
    }

    setIsFetchingOsm(true);
    setError(null);
    setOsmStatusMsg(null);

    try {
      const bounds = mapInstance.getBounds();
      const s = bounds.getSouth().toFixed(5);
      const w = bounds.getWest().toFixed(5);
      const n = bounds.getNorth().toFixed(5);
      const e = bounds.getEast().toFixed(5);

      const overpassQuery = `[out:json][timeout:25];
        (
          way["highway"~"path|footway|track|bridleway|steps|pedestrian|cycleway|unclassified|service"](${s},${w},${n},${e});
        );
        out body;
        >;
        out skel qt;`;

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(overpassQuery),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!res.ok) {
        throw new Error(`Overpass API server returned status ${res.status}`);
      }

      const data = await res.json();
      const nodesMap = new Map();
      const waysList = [];

      data.elements.forEach(elem => {
        if (elem.type === 'node') {
          nodesMap.set(elem.id, { id: elem.id, lat: elem.lat, lon: elem.lon });
        }
      });

      data.elements.forEach(elem => {
        if (elem.type === 'way' && elem.nodes) {
          const coords = elem.nodes
            .map(nid => nodesMap.get(nid))
            .filter(Boolean)
            .map(n => [n.lat, n.lon]);
          if (coords.length > 1) {
            waysList.push(coords);
          }
        }
      });

      const nodesArray = Array.from(nodesMap.values());
      setOsmNodes(nodesArray);
      setOsmWays(waysList);

      if (nodesArray.length === 0) {
        setOsmStatusMsg("No trail nodes found in the current map view.");
      } else {
        setOsmStatusMsg(`Fetched ${nodesArray.length} trail nodes in view.`);
      }
    } catch (err) {
      console.error("OSM Fetch Error:", err);
      setError(`OSM Fetch Failed: ${err.message}`);
    } finally {
      setIsFetchingOsm(false);
    }
  };

  /** Click handler for an OSM node on the map */
  const handleNodeClick = (node) => {
    if (editMode === 'none') return;

    pushHistory(rawPoints);

    const newPoint = { x: node.lat, y: node.lon };

    if (editMode === 'append') {
      setRawPoints(prev => [...prev, newPoint]);
    } else if (editMode === 'prepend') {
      setRawPoints(prev => [newPoint, ...prev]);
    }

    // Update timezone if rawPoints was previously empty
    if (rawPoints.length === 0) {
      const tz = tzlookup(node.lat, node.lon);
      setMetadata(prev => ({ ...prev, tz }));
    }
  };

  /** Undo last added/prepended point */
  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRawPoints(previous);
    setHistory(prev => prev.slice(0, -1));
  };

  /** Clear all points */
  const handleClearTrack = () => {
    if (window.confirm("Are you sure you want to clear all track points?")) {
      pushHistory(rawPoints);
      setRawPoints([]);
    }
  };

  const trimmedRawPoints = useMemo(() => {
    if (rawPoints.length === 0) return [];
    const startIdx = Math.floor((trimRange[0] / 100) * (rawPoints.length - 1));
    const endIdx = Math.ceil((trimRange[1] / 100) * (rawPoints.length - 1));
    return rawPoints.slice(startIdx, endIdx + 1);
  }, [rawPoints, trimRange]);

  // Convert {x,y} to [lat,lon] for Leaflet
  const ghostPoints = useMemo(() => rawPoints.map(p => [p.x, p.y]), [rawPoints]);
  
  const simplifiedPoints = useMemo(() => {
    if (trimmedRawPoints.length === 0) return [];
    const simplified = simplify(trimmedRawPoints, epsilon, true);
    return simplified.map(p => [p.x, p.y]);
  }, [trimmedRawPoints, epsilon]);

  const rawDistMeters = useMemo(() => calculateDistanceInMeters(ghostPoints), [ghostPoints]);
  const simplifiedDistMeters = useMemo(() => calculateDistanceInMeters(simplifiedPoints), [simplifiedPoints]);
  
  // Convert to miles/feet for UI display only
  const rawDistMi = rawDistMeters * 0.000621371;
  const simplifiedDistMi = simplifiedDistMeters * 0.000621371;
  const mileageLossFeet = (rawDistMi - simplifiedDistMi) * 5280;

  const generateId = useCallback(() => {
    if (!metadata.date || !metadata.name) return 'pending';
    
    const utcPart = metadata.date
      .replace(/[-:]/g, '')  // Remove dashes and colons
      .split('.')[0]         // Remove milliseconds
      .replace('T', '-');    // Separator
    
    const nameSlug = metadata.name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  
    return `${utcPart}-${nameSlug}`;
  }, [metadata.date, metadata.name]);

  /** Manifest Entry Generator. 
   */
  const manifestEntry = useMemo(() => {
    if (rawPoints.length === 0) return null;
    
    const lats = rawPoints.map(p => p.x);
    const lons = rawPoints.map(p => p.y);
    const gainMeters = rawPoints[0]?.ele !== undefined ? calculateElevationGain(rawPoints) : null;
    const fileName = generateId();

    return {
      id: fileName,
      name: metadata.name,
      date: metadata.date,
      tz: metadata.tz,
      distanceMeters: Math.round(rawDistMeters),
      elevationGainMeters: gainMeters ? Math.round(gainMeters) : undefined,
      type: activityType,
      hasBlog: hasBlog,
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
      ], 
      preview: simplify(rawPoints, 0.002, true).map(p => [p.x, p.y]),
      trackUrl: `/data/tracks/${fileName}.json`
    };
  }, [rawPoints, metadata, activityType, hasBlog, rawDistMeters, generateId]);

  /** Handles the export of the simplified track.
   */
  const handleExport = async () => {
    const fileName = generateId();
    if (fileName === 'pending') {
      alert("Please ensure Name and Date are set.");
      return;
    }

    const trackData = JSON.stringify(simplifiedPoints);

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${fileName}.json`,
          types: [{
            description: 'JSON Track File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        const writable = await handle.createWritable();
        await writable.write(trackData);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Save As failed:", err);
        }
        return;
      }
    } else {
      const blob = new Blob([trackData], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }

    navigator.clipboard.writeText(minifyManifestEntry(manifestEntry) + ",");
    alert(`Manifest entry for ${fileName} copied to clipboard!`);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>Track Preprocessor & Builder</Typography>
      
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
        {/* Left Control Panel */}
        <Box sx={{ width: { xs: '100%', lg: '400px' } }}>
          <Paper sx={{ p: 3, position: 'sticky', top: 20 }}>
            
            {/* Source Selection Buttons */}
            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
              <Button 
                variant="contained" 
                component="label" 
                fullWidth 
                startIcon={<UploadFileIcon />}
              >
                Upload File
                <input type="file" hidden onChange={processFile} />
              </Button>
              <Button 
                variant="outlined" 
                fullWidth 
                startIcon={<CreateIcon />}
                onClick={startBlankTrack}
              >
                Start Blank
              </Button>
            </Stack>

            {/* OSM Overpass Toolbar Card */}
            <Card variant="outlined" sx={{ mb: 3, borderColor: 'primary.main', bgcolor: 'background.paper' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DownloadIcon fontSize="small" color="primary" /> OpenStreetMap Trail Query
                </Typography>
                
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="medium"
                  disabled={isFetchingOsm}
                  onClick={fetchOsmData}
                  startIcon={isFetchingOsm ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
                  sx={{ mb: 2 }}
                >
                  {isFetchingOsm ? 'Fetching Trails...' : 'Fetch OSM Trails in View'}
                </Button>

                {osmStatusMsg && (
                  <Chip 
                    label={osmStatusMsg} 
                    size="small" 
                    color="info" 
                    variant="outlined" 
                    sx={{ width: '100%', mb: 2 }} 
                  />
                )}

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  POINT INSERTION MODE:
                </Typography>
                
                <ToggleButtonGroup
                  value={editMode}
                  exclusive
                  onChange={(_, newMode) => setEditMode(newMode || 'none')}
                  fullWidth
                  size="small"
                  sx={{ mb: 2 }}
                >
                  <ToggleButton value="none" aria-label="pan mode">
                    <MuiTooltip title="Pan Map Normally (Node click off)">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PanToolIcon fontSize="small" />
                        <Typography variant="caption">Pan</Typography>
                      </Stack>
                    </MuiTooltip>
                  </ToggleButton>
                  <ToggleButton value="append" aria-label="append mode" color="primary">
                    <MuiTooltip title="Click OSM node to append to end of track">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <AddIcon fontSize="small" />
                        <Typography variant="caption">Append</Typography>
                      </Stack>
                    </MuiTooltip>
                  </ToggleButton>
                  <ToggleButton value="prepend" aria-label="prepend mode" color="secondary">
                    <MuiTooltip title="Click OSM node to prepend to start of track">
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <AddIcon fontSize="small" />
                        <Typography variant="caption">Prepend</Typography>
                      </Stack>
                    </MuiTooltip>
                  </ToggleButton>
                </ToggleButtonGroup>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FitScreenIcon />}
                    disabled={rawPoints.length === 0}
                    onClick={() => setFitTrigger(prev => prev + 1)}
                    fullWidth
                  >
                    Recenter
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<UndoIcon />}
                    disabled={history.length === 0}
                    onClick={handleUndo}
                    fullWidth
                  >
                    Undo
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    disabled={rawPoints.length === 0}
                    onClick={handleClearTrack}
                    fullWidth
                  >
                    Clear
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {rawPoints.length > 0 && (
              <Stack spacing={3}>
                <Box>
                  <Typography variant="overline" color="inherit" sx={{ fontWeight: 'bold' }}>
                    Privacy Trim (Start & End)
                  </Typography>
                  <Stack direction="column" spacing={2}>
                    <Slider
                      value={trimRange}
                      step={0.1}
                      min={0}
                      max={100}
                      onChange={(_, newValue) => setTrimRange(newValue)}
                      sx={{ flexGrow: 1 }}
                    />
                    <Stack direction="row" spacing={2} justifyContent="center">
                      <TextField
                        size="small"
                        label="Start %"
                        type="number"
                        slotProps={{
                          htmlInput: { 
                            step: 0.1, 
                            min: 0, 
                            max: trimRange[1],
                            inputMode: 'decimal' 
                          }
                        }}
                        value={trimRange[0]}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          setTrimRange([val, trimRange[1]]);
                        }}
                        sx={{ width: 100 }}
                      />
                      <TextField
                        size="small"
                        label="End %"
                        type="number"
                        slotProps={{
                          htmlInput: { 
                            step: 0.1, 
                            min: trimRange[0], 
                            max: 100,
                            inputMode: 'decimal' 
                          }
                        }}
                        value={trimRange[1]}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 100 : parseFloat(e.target.value);
                          setTrimRange([trimRange[0], val]);
                        }}
                        sx={{ width: 100 }}
                      />
                    </Stack>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Remove path segments near sensitive locations.
                  </Typography>
                </Box>

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
                        <Typography variant="h6">{simplifiedDistMi.toFixed(2)} mi</Typography>
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
                      Points: {rawPoints.length} → {simplifiedPoints.length} ({rawPoints.length > 0 ? Math.round((1 - simplifiedPoints.length / rawPoints.length) * 100) : 0}% reduction)
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
                      label={`Local Time (${metadata.tz})`}
                      type="datetime-local" 
                      fullWidth 
                      value={utcToLocalNaive(metadata.date, metadata.tz)}
                      onChange={(e) => {
                        const newUtc = localNaiveToUtc(e.target.value, metadata.tz);
                        setMetadata({...metadata, date: newUtc});
                      }} 
                      InputLabelProps={{ shrink: true }}
                      helperText={`Stored UTC: ${metadata.date}`}
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
                  <pre>{manifestEntry ? minifyManifestEntry(manifestEntry) + ',' : 'No data'}</pre>
                </Paper>
              </Stack>
            )}
          </Paper>
        </Box>

        {/* Right Leaflet Map Area */}
        <Box sx={{ flexGrow: 1, height: '80vh', borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider', position: 'relative' }}>
          <MapContainer center={[35.5951, -82.5515]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
            <MapController setMapInstance={setMapInstance} />

            {/* Render fetched OSM trail ways as faint background lines */}
            {osmWays.map((way, idx) => (
              <Polyline
                key={`osm-way-${idx}`}
                positions={way}
                pathOptions={{ color: '#ff9800', weight: 2, opacity: 0.35 }}
              />
            ))}

            {/* Render fetched OSM trail nodes as interactive small circles */}
            {osmNodes.map((node) => (
              <CircleMarker
                key={`osm-node-${node.id}`}
                center={[node.lat, node.lon]}
                radius={editMode === 'none' ? 2 : 4}
                pathOptions={{
                  color: editMode === 'append' ? '#1976d2' : (editMode === 'prepend' ? '#9c27b0' : '#ff9800'),
                  fillColor: editMode === 'append' ? '#2196f3' : (editMode === 'prepend' ? '#ab47bc' : '#ffa726'),
                  fillOpacity: editMode === 'none' ? 0.3 : 0.85,
                  weight: 1
                }}
                eventHandlers={{
                  click: () => handleNodeClick(node)
                }}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                  {editMode === 'append' ? 'Click to Append to End' : (editMode === 'prepend' ? 'Click to Prepend to Start' : 'OSM Node (Switch mode to add)')}
                </Tooltip>
              </CircleMarker>
            ))}

            {/* Active Track rendering */}
            {rawPoints.length > 0 && (
              <>
                <Polyline 
                    key={`original-${rawPoints.length}`}
                    positions={ghostPoints} 
                    pathOptions={{ color: '#555', weight: 1, opacity: 0.2 }} 
                />
                
                <Polyline 
                    key={`trimmed-${trimmedRawPoints.length}`}
                    positions={trimmedRawPoints.map(p => [p.x, p.y])} 
                    pathOptions={{ color: '#D3D', weight: 3, opacity: 0.5, dashArray: '5, 10' }} 
                />

                <Polyline 
                    positions={simplifiedPoints} 
                    pathOptions={{ color: '#2196f3', weight: 4 }} 
                />

                {/* Start Point Indicator (Green) */}
                <CircleMarker
                  center={[rawPoints[0].x, rawPoints[0].y]}
                  radius={7}
                  pathOptions={{ color: '#ffffff', fillColor: '#4caf50', fillOpacity: 1, weight: 2 }}
                >
                  <Tooltip permanent direction="top" offset={[0, -8]}>
                    <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>START</span>
                  </Tooltip>
                </CircleMarker>

                {/* End Point Indicator (Red) */}
                {rawPoints.length > 1 && (
                  <CircleMarker
                    center={[rawPoints[rawPoints.length - 1].x, rawPoints[rawPoints.length - 1].y]}
                    radius={7}
                    pathOptions={{ color: '#ffffff', fillColor: '#f44336', fillOpacity: 1, weight: 2 }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -8]}>
                      <span style={{ fontWeight: 'bold', color: '#c62828' }}>END</span>
                    </Tooltip>
                  </CircleMarker>
                )}

                <MapBounds points={rawPoints} fitTrigger={fitTrigger} />
              </>
            )}
          </MapContainer>
        </Box>
      </Stack>
    </Container>
  );
};

export default ImportTool;