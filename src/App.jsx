import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
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

// Route-level code splitting: each page loads on demand instead of shipping
// in the initial bundle.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Floors = lazy(() => import('./pages/Floors'));
const FloorDetail = lazy(() => import('./pages/FloorDetail'));
const Points = lazy(() => import('./pages/Points'));
const Labels = lazy(() => import('./pages/Labels'));
const Checklist = lazy(() => import('./pages/Checklist'));
const Configuration = lazy(() => import('./pages/Configuration'));
const Templates = lazy(() => import('./pages/Templates'));
const Projects = lazy(() => import('./pages/Projects'));
const Materials = lazy(() => import('./pages/Materials'));
const Evidence = lazy(() => import('./pages/Evidence'));

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
    <ProjectProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/proyectos" element={<Projects />} />
            <Route path="/pisos" element={<Floors />} />
            <Route path="/pisos/:floorId" element={<FloorDetail />} />
            <Route path="/puntos" element={<Points />} />
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
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ScrollToTop />
            <AppRoutes />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App