const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize cache. stdTTL is the standard time-to-live in seconds for every cache entry.
const apiCache = new NodeCache({ stdTTL: 30 });

// Caching Middleware
// This function intercepts requests and checks if a valid response is already in the cache.
const cacheMiddleware = (req, res, next) => {
    const key = req.originalUrl;
    const cachedResponse = apiCache.get(key);

    if (cachedResponse) {
        console.log(`[CACHE HIT] Serving from cache: ${key}`);
        return res.json(cachedResponse);
    }

    console.log(`[CACHE MISS] Fetching from API: ${key}`);
    // If not in cache, proceed to the route handler, but first,
    // override res.json to cache the result before sending it.
    const originalJson = res.json;
    res.json = (body) => {
        apiCache.set(key, body);
        originalJson.call(res, body);
    };
    next();
};

// Enable CORS for all requests
app.use(cors());
app.use(express.json());

// Health check endpoint (not cached)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Grid Bot API Proxy Running' });
});

// --- PROXY ENDPOINTS ---
// The cacheMiddleware is now applied to every API proxy route.

// Binance Kline (Chart) Data
app.get('/api/binance/futures/klines', cacheMiddleware, async (req, res) => {
    try {
        const response = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Binance Funding Rate
app.get('/api/binance/futures/fundingRate', cacheMiddleware, async (req, res) => {
    try {
        const response = await axios.get('https://fapi.binance.com/fapi/v1/fundingRate', {
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bybit Tickers
app.get('/api/bybit/market/tickers', cacheMiddleware, async (req, res) => {
    try {
        const response = await axios.get('https://api.bybit.com/v5/market/tickers', {
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bybit Kline (Chart) Data
app.get('/api/bybit/market/kline', cacheMiddleware, async (req, res) => {
    try {
        const response = await axios.get('https://api.bybit.com/v5/market/kline', {
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bitget Tickers
app.get('/api/bitget/market/tickers', cacheMiddleware, async (req, res) => {
    try {
        const response = await axios.get('https://api.bitget.com/api/mix/v1/market/tickers', {
            params: req.query
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- AUTHENTICATED ENDPOINTS ---

// Bitget Authenticated Endpoint Example: Get Wallet Balance
app.get('/api/bitget/account/wallet', async (req, res) => {
    // It's crucial these are set in your Vercel environment variables for production
    const apiKey = process.env.BITGET_TESTNET_API_KEY;
    const apiSecret = process.env.BITGET_TESTNET_API_SECRET;
    const passphrase = process.env.BITGET_TESTNET_API_PASSWORD;

    if (!apiKey || !apiSecret || !passphrase) {
        return res.status(400).json({ error: 'Bitget API credentials are not configured on the server.' });
    }

    try {
        const timestamp = Date.now().toString();
        const method = 'GET';
        const productType = 'umcbl'; // USDT-M Futures
        const requestPath = `/api/mix/v1/account/accounts?productType=${productType}`;
        
        // Create the string to sign
        const prehash = timestamp + method + requestPath;
        
        // Generate the signature
        const signature = crypto.createHmac('sha256', apiSecret)
            .update(prehash)
            .digest('base64');

        const headers = {
            'ACCESS-KEY': apiKey,
            'ACCESS-SIGN': signature,
            'ACCESS-TIMESTAMP': timestamp,
            'ACCESS-PASSPHRASE': passphrase,
            'Content-Type': 'application/json'
        };

        const baseUrl = 'https://api.bitget.com'; // Using mainnet (real) URL
        const response = await axios.get(`${baseUrl}${requestPath}`, { headers });

        res.json(response.data);
    } catch (error) {
        const errorDetails = error.response ? error.response.data : { message: error.message };
        console.error('Bitget authenticated request error:', errorDetails);
        res.status(500).json({ error: 'Failed to fetch Bitget account data.', details: errorDetails });
    }
});

app.listen(PORT, () => {
    console.log(`Grid Bot API Proxy running on http://localhost:${PORT}`);
});