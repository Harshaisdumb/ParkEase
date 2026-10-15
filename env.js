// ===================================================================
// ParkEase India - Browser Environment Configuration (env.js)
// ===================================================================
// Browser JavaScript cannot read .env directly when opening index.html
// as a local file (file:/// protocol). 
// You can paste your keys right here or in .env:

window.ENV = {
    // 1. Groq Cloud API Key (Get free at https://console.groq.com/keys)
    GROQ_API_KEY: "your_groq_api_key_here",
    GROQ_MODEL: "llama-3.3-70b-versatile",

    // 2. Google Maps API Key (Optional, starts with AIzaSy...):
    GOOGLE_MAPS_API_KEY: "",

    // Default map engine: "osm" (Free OpenStreetMap) or "google"
    MAP_ENGINE: "osm",

    // Live Google traffic overlay
    ENABLE_TRAFFIC: true
};
