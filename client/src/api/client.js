import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
      window.location.href = '/login';
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

export default api;
