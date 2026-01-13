import axios from 'axios';

// Create an axios instance
const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Your Backend URL
});

export const setupInterceptors = (getToken) => {
  api.interceptors.request.use(
    async (config) => {
      // 1. Get the token from Clerk
      const token = await getToken();
      
      // 2. Attach it to the Authorization header
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
};

export default api;