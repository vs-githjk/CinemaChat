import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  onboardingStatus: 'unknown',

  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    set({ token, user, isAuthenticated: true, onboardingStatus: 'unknown' });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null, isAuthenticated: false, onboardingStatus: 'unknown' });
  },

  setUser: (user) => set({ user }),
  setOnboardingStatus: (status) => set({ onboardingStatus: status }),
}));

export default useAuthStore;
