import axios from 'axios';

function getBaseURL() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) return '/api';
  const normalized = configured.endsWith('/') ? configured.slice(0, -1) : configured;
  return `${normalized}/api`;
}

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');

// Recommendations
export const getRecommendations = (data) => api.post('/recommendations', data);
export const setReaction = (data) => api.post('/recommendations/reaction', data);
export const getReactions = () => api.get('/recommendations/reactions');
export const getHistory = () => api.get('/recommendations/history');
export const getForYou = () => api.get('/recommendations/for-you');
export const getWatchlist = () => api.get('/recommendations/watchlist');
export const addToWatchlist = (tmdbMovieId) => api.post('/recommendations/watchlist', { tmdbMovieId });
export const removeFromWatchlist = (tmdbMovieId) => api.delete(`/recommendations/watchlist/${tmdbMovieId}`);

// Social
export const getFriends = () => api.get('/social/friends');
export const sendFriendRequest = (friendId) => api.post('/social/friends/request', { friendId });
export const acceptFriendRequest = (friendshipId) => api.put('/social/friends/accept', { friendshipId });
export const getFeed = () => api.get('/social/feed');
export const getCollaborative = (friendId) => api.post('/social/collaborative', { friendId });

// Users
export const searchUsers = (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`);
export const getUserProfile = (id) => api.get(`/users/${id}/profile`);
export const getUserTaste = (id) => api.get(`/users/${id}/taste`);
export const getOnboarding = () => api.get('/users/onboarding');
export const saveOnboarding = (data) => api.post('/users/onboarding', data);

export default api;
