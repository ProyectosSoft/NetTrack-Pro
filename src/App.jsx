import { Toaster } from "@/components/ui/toaster"
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazy, Suspense } from 'react';
import ScrollToTop from './components/ScrollToTop';
import AppLayout from './components/layout/AppLayout';
import { useTemplates } from './lib/queries';
import { ProjectProvider } from './lib/ProjectContext';
import { UndoProvider } from './lib/UndoContext';

// Persist the react-query cache to localStorage so data stays readable offline
// after the first load (the PWA already precaches the app shell).
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'nettrack.query-cache',
});

// Lazy import with a one-time auto-reload. After a new deploy, chunk filenames
// change, so a tab left open references files that 404 ("Failed to fetch
// dynamically imported module"). On that failure we reload once (fetching the
// fresh index + chunks) instead of showing an error; a per-session flag prevents
// a reload loop if the import is genuinely broken.
const CHUNK_RELOAD_KEY = 'nettrack:chunk-reloaded';
function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'; } catch { /* ignore */ }
      if (!reloaded) {
        try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch { /* ignore */ }
        window.location.reload();
        return new Promise(() => {}); // hold the UI while the page reloads
      }
      throw err;
    }
  });
}

// Route-level code splitting: each page loads on demand instead of shipping
// in the initial bundle.
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Floors = lazyWithRetry(() => import('./pages/Floors'));
const FloorDetail = lazyWithRetry(() => import('./pages/FloorDetail'));
const Points = lazyWithRetry(() => import('./pages/Points'));
const Labels = lazyWithRetry(() => import('./pages/Labels'));
const Checklist = lazyWithRetry(() => import('./pages/Checklist'));
const Configuration = lazyWithRetry(() => import('./pages/Configuration'));
const Templates = lazyWithRetry(() => import('./pages/Templates'));
const Projects = lazyWithRetry(() => import('./pages/Projects'));
const Materials = lazyWithRetry(() => import('./pages/Materials'));
const Evidence = lazyWithRetry(() => import('./pages/Evidence'));
const BulkChecklist = lazyWithRetry(() => import('./pages/BulkChecklist'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AppRoutes = () => {
  // Prime the checklist-template cache via react-query. Sharing the ["templates"]
  // query key means pages that also call useTemplates() reuse this one request
  // instead of issuing a duplicate fetch on startup.
  useTemplates();

  return (
    <UndoProvider>
    <ProjectProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/proyectos" element={<Projects />} />
            <Route path="/pisos" element={<Floors />} />
            <Route path="/pisos/:floorId" element={<FloorDetail />} />
            <Route path="/puntos" element={<Points />} />
            <Route path="/checklist-masivo" element={<BulkChecklist />} />
            <Route path="/rotulos" element={<Labels />} />
            <Route path="/materiales" element={<Materials />} />
            <Route path="/evidencia" element={<Evidence />} />
            <Route path="/checklist/:pointId" element={<Checklist />} />
            <Route path="/configuracion" element={<Configuration />} />
            <Route path="/plantillas" element={<Templates />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </ProjectProvider>
    </UndoProvider>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <PersistQueryClientProvider
          client={queryClientInstance}
          persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000, buster: 'v1' }}
        >
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTop />
            <AppRoutes />
          </Router>
          <Toaster />
        </PersistQueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App