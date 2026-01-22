import axios from 'axios';

// Create an axios instance
const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api', // Backend URL
});

export const setupInterceptors = (getToken) => {
  // Request interceptor - Add auth token
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

  // Response interceptor - Auto-retry on server errors
  api.interceptors.response.use(
    response => response,
    async error => {
      const { config } = error;

      // Initialize retry count
      if (!config.retryCount) config.retryCount = 0;

      // Retry on 5xx errors (server errors)
      if (config.retryCount < 2 && error.response?.status >= 500) {
        config.retryCount += 1;

        // Exponential backoff: wait 500ms, then 1000ms
        const delay = config.retryCount * 500;
        await new Promise(resolve => setTimeout(resolve, delay));

        console.log(`Retrying request (attempt ${config.retryCount}/2)...`);
        return api(config);
      }

      return Promise.reject(error);
    }
  );
};

export default api;