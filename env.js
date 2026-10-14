// ===================================================================
// ParkEase India - Browser Environment Configuration (env.js)
// ===================================================================
// Browser JavaScript cannot read .env directly when opening index.html
// as a local file (file:/// protocol). 
// You can paste your Google Maps JavaScript API Key right here or in .env:

window.ENV = {
    // Paste your Google Maps API Key here (starts with AIzaSy...):
    GOOGLE_MAPS_API_KEY: "",

    // Choose default map engine: "google" or "osm" (Free OpenStreetMap)
    MAP_ENGINE: "google",

    // Enable live Google traffic overlay
    ENABLE_TRAFFIC: true
};
