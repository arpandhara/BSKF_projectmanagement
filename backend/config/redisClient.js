import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

let redis;

if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);

    redis.on('connect', () => {
        console.log('✅ Redis Connected');
    });

    redis.on('error', (err) => {
        console.error('❌ Redis Connection Error:', err);
    });
} else {
    console.warn('⚠️ REDIS_URL not found in .env. Caching will be disabled.');
    // Mock redis to prevent crashes if not configured
    redis = {
        get: async () => null,
        set: async () => null,
        setex: async () => null,
        del: async () => null,
        keys: async () => [],
        on: () => { },
        quit: async () => { },
    };
}

export default redis;
