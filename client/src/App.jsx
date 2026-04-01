import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from './store/auth.js';
import { getMe } from './api/client.js';

import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForYou from './pages/ForYou.jsx';
import Chat from './pages/Chat.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import Onboarding from './pages/Onboarding.jsx';

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return !isAuthenticated ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { isAuthenticated, setUser } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      getMe()
        .then((r) => setUser(r.data))
        .catch(() => {});
    }
  }, [isAuthenticated, setUser]);

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<ForYou />} />
        <Route path="discover" element={<Chat />} />
        <Route path="feed" element={<Feed />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="profile/:id" element={<Profile />} />
      </Route>
    </Routes>
  );
}
