import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from './store/auth.js';
import { getMe, getOnboarding } from './api/client.js';

import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForYou from './pages/ForYou.jsx';
import Chat from './pages/Chat.jsx';
import Feed from './pages/Feed.jsx';
import Library from './pages/Library.jsx';
import Profile from './pages/Profile.jsx';
import Onboarding from './pages/Onboarding.jsx';

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function OnboardingRequiredRoute({ children }) {
  const onboardingStatus = useAuthStore((s) => s.onboardingStatus);
  if (onboardingStatus === 'unknown') {
    return <div className="py-20 text-center text-gray-500">Loading your taste profile...</div>;
  }
  return onboardingStatus === 'complete' ? children : <Navigate to="/onboarding" replace />;
}

function OnboardingOnlyRoute({ children }) {
  const onboardingStatus = useAuthStore((s) => s.onboardingStatus);
  if (onboardingStatus === 'unknown') {
    return <div className="py-20 text-center text-gray-500">Loading your taste profile...</div>;
  }
  return onboardingStatus === 'complete' ? <Navigate to="/" replace /> : children;
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return !isAuthenticated ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { isAuthenticated, setUser, setOnboardingStatus } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      Promise.all([getMe(), getOnboarding()])
        .then(([me, onboarding]) => {
          setUser(me.data);
          setOnboardingStatus(onboarding.data?.completed ? 'complete' : 'incomplete');
        })
        .catch(() => {
          setOnboardingStatus('incomplete');
        });
    } else {
      setOnboardingStatus('unknown');
    }
  }, [isAuthenticated, setUser, setOnboardingStatus]);

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<OnboardingRequiredRoute><ForYou /></OnboardingRequiredRoute>} />
        <Route path="discover" element={<OnboardingRequiredRoute><Chat /></OnboardingRequiredRoute>} />
        <Route path="library" element={<OnboardingRequiredRoute><Library /></OnboardingRequiredRoute>} />
        <Route path="feed" element={<OnboardingRequiredRoute><Feed /></OnboardingRequiredRoute>} />
        <Route path="onboarding" element={<OnboardingOnlyRoute><Onboarding /></OnboardingOnlyRoute>} />
        <Route path="profile/:id" element={<OnboardingRequiredRoute><Profile /></OnboardingRequiredRoute>} />
      </Route>
    </Routes>
  );
}
