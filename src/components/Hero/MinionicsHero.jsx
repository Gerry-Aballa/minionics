import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
  useMediaQuery,
} from '@mui/material';
import '@fontsource/sora/300.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';

import IonicParticleGlobe from '../Canvas/IonicParticleGlobe';

const CYAN = '#00f0ff';
const SPACE = '#02030a';

const NAV_ITEMS = [
  { id: 'home', label: 'HOME', href: '#home' },
  { id: 'projects', label: 'PROJECTS', href: '#projects' },
  { id: 'contact', label: 'GET IN TOUCH', href: '#contact' },
];

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: CYAN },
    background: { default: SPACE, paper: '#050814' },
  },
  typography: {
    fontFamily: "'Sora', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
});

const glow = (alpha = 0.6) => `0 0 12px rgba(0, 240, 255, ${alpha}), 0 0 32px rgba(0, 240, 255, ${alpha * 0.5})`;

/** Keeps the whole globe in frame on narrow / portrait viewports. */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / size.height;
    camera.position.z = Math.max(12.5, 10.6 / aspect);
  }, [camera, size]);
  return null;
}

function HamburgerButton({ onClick }) {
  const bar = {
    height: 2,
    bgcolor: '#fff',
    boxShadow: glow(0.5),
    transition: 'width 0.25s ease',
  };
  return (
    <IconButton
      aria-label="Open menu"
      onClick={onClick}
      sx={{
        justifySelf: 'end',
        p: 1.25,
        borderRadius: 1,
        '&:hover .bar-short': { width: 28 },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '7px' }}>
        <Box sx={{ ...bar, width: 28 }} />
        <Box className="bar-short" sx={{ ...bar, width: 18 }} />
      </Box>
    </IconButton>
  );
}

function CloseMenuButton({ onClick }) {
  const bar = {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 22,
    height: 2,
    bgcolor: '#fff',
    boxShadow: glow(0.5),
  };
  return (
    <IconButton
      aria-label="Close menu"
      onClick={onClick}
      sx={{
        p: 1.25,
        borderRadius: 1,
        '&:hover .close-bar': { bgcolor: CYAN },
      }}
    >
      <Box sx={{ position: 'relative', width: 22, height: 22 }}>
        <Box className="close-bar" sx={{ ...bar, transform: 'rotate(45deg)' }} />
        <Box className="close-bar" sx={{ ...bar, transform: 'rotate(-45deg)' }} />
      </Box>
    </IconButton>
  );
}

export default function MinionicsHero() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('home');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        id="home"
        component="section"
        sx={{
          position: 'relative',
          height: '100vh',
          '@supports (height: 100dvh)': { height: '100dvh' },
          overflow: 'hidden',
          bgcolor: SPACE,
        }}
      >
        {/* 3D layer */}
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <Canvas
            camera={{ position: [0, 0, 12.5], fov: 45, near: 0.1, far: 300 }}
            dpr={[1, 2]}
            gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
          >
            <color attach="background" args={[SPACE]} />
            <CameraRig />
            <Suspense fallback={null}>
              <Stars radius={90} depth={50} count={2500} factor={3} saturation={0} fade speed={0.4} />
              <IonicParticleGlobe spinSpeed={reduceMotion ? 0 : 0.06} />
            </Suspense>
            <EffectComposer multisampling={0}>
              <Bloom intensity={1.5} luminanceThreshold={0.2} luminanceSmoothing={0.4} mipmapBlur />
            </EffectComposer>
          </Canvas>
        </Box>

        {/* Vignette */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at center, rgba(2,3,10,0) 35%, rgba(2,3,10,0.85) 100%)',
          }}
        />

        {/* Header */}
        <AppBar
          position="absolute"
          color="transparent"
          elevation={0}
          sx={{ zIndex: 3, backgroundImage: 'none', pointerEvents: 'none' }}
        >
          <Toolbar
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              width: '100%',
              px: { xs: 2, md: 5 },
              minHeight: { xs: 64, md: 88 },
              '& > *': { pointerEvents: 'auto' },
            }}
          >
            <Typography
              component="a"
              href="#home"
              sx={{
                justifySelf: 'start',
                color: CYAN,
                fontWeight: 700,
                fontSize: { xs: '1.05rem', md: '1.3rem' },
                letterSpacing: '0.28em',
                textDecoration: 'none',
                textShadow: glow(0.8),
              }}
            >
              MINIONICS
            </Typography>

            <HamburgerButton onClick={() => setMenuOpen(true)} />
          </Toolbar>
        </AppBar>

        {/* Central overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            pointerEvents: 'none', // let the cursor reach the globe
          }}
        >
          <Typography
            variant="h1"
            align="center"
            sx={{
              maxWidth: '15em',
              fontWeight: 600,
              fontSize: 'clamp(2rem, 5.2vw, 4.75rem)',
              lineHeight: 1.06,
              letterSpacing: '-0.01em',
              color: '#fff',
              textShadow: `0 2px 28px rgba(2,3,10,0.95), 0 0 24px rgba(0,240,255,0.35), 0 0 80px rgba(0,240,255,0.2)`,
            }}
          >
            POWERING AI SOLUTIONS, ONE PARTICLE AT A TIME.
          </Typography>
        </Box>

        {/* Menu drawer */}
        <Drawer
          anchor="right"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          PaperProps={{
            sx: {
              width: { xs: '80vw', sm: 320 },
              bgcolor: 'rgba(5,8,20,0.95)',
              borderLeft: '1px solid rgba(0,240,255,0.2)',
              backdropFilter: 'blur(12px)',
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              px: 1.5,
              minHeight: { xs: 64, md: 88 },
            }}
          >
            <CloseMenuButton onClick={() => setMenuOpen(false)} />
          </Box>
          <List component="nav" aria-label="Primary" sx={{ pt: 1 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.id;
              return (
                <ListItemButton
                  key={item.id}
                  component="a"
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  selected={isActive}
                  onClick={() => {
                    setActive(item.id);
                    setMenuOpen(false);
                  }}
                  sx={{
                    px: 4,
                    py: 2,
                    '&.Mui-selected': {
                      bgcolor: 'transparent',
                      color: CYAN,
                      textShadow: glow(0.7),
                    },
                    '&:hover': { color: CYAN, bgcolor: 'transparent' },
                  }}
                >
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ letterSpacing: '0.22em', fontWeight: 600 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Drawer>
      </Box>
    </ThemeProvider>
  );
}
