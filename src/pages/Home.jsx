import { Container, Typography, Stack, Link, Box } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';

const Home = () => {
  return (
    <Container maxWidth="sm" sx={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
      <Box mb={4}>
        <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 800 }}>
          Dallas Epperson
        </Typography>
        <Typography variant="h5" color="text.secondary">
          Software Architect & Explorer
        </Typography>
      </Box>

      <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.8 }}>
        Building robust systems at scale and navigating the world by wing, bike, and boot. 
        This site is my professional home and a curated archive of my ground tracks, from 
        the Blue Ridge Mountains to the Julian Alps.
      </Typography>

      <Stack direction="row" spacing={3} justifyContent="center">
        <Link href="https://github.com" target="_blank" color="inherit">
          <GitHubIcon fontSize="large" />
        </Link>
        <Link href="https://linkedin.com" target="_blank" color="inherit">
          <LinkedInIcon fontSize="large" />
        </Link>
        <Link href="https://strava.com" target="_blank" color="inherit">
          <DirectionsBikeIcon fontSize="large" />
        </Link>
      </Stack>
    </Container>
  );
};

export default Home;