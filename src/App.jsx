import React, { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { 
  AppBar, Toolbar, Typography, Button, Container, Box, 
  CssBaseline, ThemeProvider, createTheme, useMediaQuery 
} from '@mui/material';
import GroundTracks from './pages/GroundTracks';
import ImportTool from './pages/ImportTool';
import Home from './pages/Home';

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? 'dark' : 'light',
          primary: {
            main: prefersDarkMode ? '#90caf9' : '#222',
          },
          background: {
            default: prefersDarkMode ? '#0a0a0a' : '#fff',
          },
        },
        typography: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        },
      }),
    [prefersDarkMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ flexGrow: 1 }}>
          <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid #eee' }}>
            <Container maxWidth="lg">
              <Toolbar disableGutters>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
                  Waypoint
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button component={Link} to="/" color="inherit">Home</Button>
                  <Button component={Link} to="/ground-tracks" color="inherit">Ground Tracks</Button>
                  <Button component={Link} to="/resume" color="inherit">Resume</Button>
                </Box>
              </Toolbar>
            </Container>
          </AppBar>

          <Box component="main" sx={{ py: 4 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/ground-tracks" element={<GroundTracks />} />
              <Route path="/resume" element={<Typography variant="h4" align="center">Resume Component Coming Soon</Typography>} />
              <Route path="/ground-tracks/import" element={<ImportTool />} />
            </Routes>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;