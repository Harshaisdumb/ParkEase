/**
 * ParkEase - Application Logic & Map Controller
 * Implements Multi-Engine Maps (Google Maps API + OpenStreetMap Leaflet),
 * Live Geocoding Search API, OSRM Driving Directions API & Smart Pass Generation
 */

let map = null;                 // Leaflet map instance
let googleMap = null;           // Google Map instance
let googleTrafficLayer = null;  // Google Traffic Layer
let markersLayer = null;        // Leaflet markers layer
let googleMarkers = [];         // Google Maps markers array
let currentRouteLayer = null;   // Active Leaflet route polyline
let currentGoogleRoute = null;  // Active Google route polyline

let activeMapEngine = 'osm';    // 'osm' or 'google'
let googleApiKey = '';
let isTrafficEnabled = true;
let isGeocodingEnabled = true;
let isRoutingEnabled = true;

let currentCity = 'delhi';
let currentVehicleType = 'fourWheeler'; // 'twoWheeler', 'fourWheeler', 'suv', 'ev'
let userCoords = null;
let activeSpotForBooking = null;
let allSpots = [];

// Initialize App on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initDataset();
    loadMapSettings();
    initActiveMap();
    setupEventListeners();
    setupGeocodingSearch();
    renderSpots();
    renderCityStats();
    loadExistingBookings();
    renderVerifiedReviews();
    populateGenericSpotDropdown();
    initUserProfileAndCrm();
});

// Load Map API preferences from localStorage and window.ENV / .env
function loadMapSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('parkease_map_settings') || '{}');
        if (saved.engine) activeMapEngine = saved.engine;
        if (saved.googleApiKey) googleApiKey = saved.googleApiKey;
        if (typeof saved.trafficLayer === 'boolean') isTrafficEnabled = saved.trafficLayer;
        if (typeof saved.geocodingApi === 'boolean') isGeocodingEnabled = saved.geocodingApi;
        if (typeof saved.routingApi === 'boolean') isRoutingEnabled = saved.routingApi;
    } catch (e) {
        console.warn("Failed to load map settings:", e);
    }

    // Check window.ENV (from env.js or synced from .env)
    if (window.ENV && window.ENV.GOOGLE_MAPS_API_KEY) {
        const envKey = window.ENV.GOOGLE_MAPS_API_KEY.trim();
        if (envKey && envKey !== 'your_google_maps_api_key_here' && envKey !== '') {
            googleApiKey = envKey;
            activeMapEngine = window.ENV.MAP_ENGINE || 'google';
        }
    }

    // Attempt to read .env file if served over local web server
    tryFetchEnvFile();

    updateActiveMapBadge();
}

// Read .env directly if served via local web server (http://localhost)
async function tryFetchEnvFile() {
    try {
        const res = await fetch('.env');
        if (res.ok) {
            const content = await res.text();
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [k, ...v] = trimmed.split('=');
                    const key = k ? k.trim() : '';
                    const val = v.join('=').trim().replace(/^["']|["']$/g, '');
                    if (key === 'GOOGLE_MAPS_API_KEY' && val && val !== 'your_google_maps_api_key_here') {
                        googleApiKey = val;
                        activeMapEngine = 'google';
                    }
                    if (key === 'GROQ_API_KEY' && val && val !== 'your_groq_api_key_here') {
                        if (!window.ENV) window.ENV = {};
                        window.ENV.GROQ_API_KEY = val;
                    }
                    if (key === 'GROQ_MODEL' && val) {
                        if (!window.ENV) window.ENV = {};
                        window.ENV.GROQ_MODEL = val;
                    }
                }
            });
            updateActiveMapBadge();
        }
    } catch (e) {
        // file:/// protocol triggers normal CORS block, fallback to env.js
    }
}

// Global Google Maps Auth Failure Handler
window.gm_authFailure = function () {
    console.error("Google Maps authentication failure. Falling back to OpenStreetMap.");
    showToast("Google Maps Key Error (Check billing/restrictions). Reverted to Free OpenStreetMap.", "error");
    initLeafletMap();
};

function updateActiveMapBadge() {
    const badge = document.getElementById('activeMapApiBadge');
    if (badge) {
        badge.innerText = activeMapEngine === 'google' ? 'Map API: Google Maps' : 'Map API: OSM';
    }
}

// Aggregate all spots for universal search
function initDataset() {
    allSpots = [];
    Object.keys(CITIES_DATA).forEach(cityKey => {
        CITIES_DATA[cityKey].spots.forEach(spot => {
            allSpots.push(spot);
        });
    });
    loadStoredRatings();
}

// Initialize active map based on engine selection
function initActiveMap() {
    if (activeMapEngine === 'google' && googleApiKey) {
        loadGoogleMapsEngine();
    } else {
        initLeafletMap();
    }
}

// Initialize Leaflet Map (Free OpenStreetMap)
function initLeafletMap() {
    activeMapEngine = 'osm';
    document.getElementById('mapContainer').classList.remove('hidden');
    document.getElementById('googleMapContainer').classList.add('hidden');

    if (!map) {
        const city = CITIES_DATA[currentCity] || CITIES_DATA.delhi;
        map = L.map('mapContainer', {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView(city.center, city.zoom);

        // Clean Standard OpenStreetMap Tiles (100% Free & No Watermark)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        markersLayer = L.layerGroup().addTo(map);

        setTimeout(() => { if (map) map.invalidateSize(); }, 300);
        window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
    } else {
        const city = CITIES_DATA[currentCity] || CITIES_DATA.delhi;
        map.setView(city.center, city.zoom);
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    }

    updateActiveMapBadge();
}

// Initialize Google Maps API Engine
function loadGoogleMapsEngine() {
    if (!googleApiKey) {
        showToast("Please enter a Google Maps API Key to use Google Maps.", "info");
        initLeafletMap();
        return;
    }

    if (window.google && window.google.maps) {
        initGoogleMap();
        return;
    }

    // Dynamic Google Maps Script Loader
    const scriptId = 'google-maps-api-script';
    let script = document.getElementById(scriptId);
    if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleApiKey)}&libraries=places,geometry&callback=initGoogleMap`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            showToast("Failed to load Google Maps API. Reverting to OpenStreetMap.", "error");
            initLeafletMap();
        };
        document.head.appendChild(script);
    } else {
        initGoogleMap();
    }
}

// Callback when Google Maps script finishes loading
window.initGoogleMap = function () {
    activeMapEngine = 'google';
    document.getElementById('mapContainer').classList.add('hidden');
    document.getElementById('googleMapContainer').classList.remove('hidden');

    const city = CITIES_DATA[currentCity] || CITIES_DATA.delhi;
    const centerLatLng = { lat: city.center[0], lng: city.center[1] };

    const mapOptions = {
        zoom: city.zoom,
        center: centerLatLng,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        styles: [
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
        ]
    };

    googleMap = new google.maps.Map(document.getElementById('googleMapContainer'), mapOptions);

    // Apply Live Traffic Layer if enabled
    if (isTrafficEnabled) {
        googleTrafficLayer = new google.maps.TrafficLayer();
        googleTrafficLayer.setMap(googleMap);
    }

    updateActiveMapBadge();
    renderSpots();
    showToast("Google Maps JavaScript API Connected Successfully!", "success");
};

// Render Markers & Cards for active engine
function renderSpots() {
    const spotsContainer = document.getElementById('spotsContainer');
    const spotsCountBadge = document.getElementById('spotsCountBadge');

    const filteredSpots = getFilteredSpots();
    spotsCountBadge.innerText = `${filteredSpots.length} Available`;

    // Clear previous markers
    if (markersLayer) markersLayer.clearLayers();
    if (googleMarkers && googleMarkers.length > 0) {
        googleMarkers.forEach(m => m.setMap(null));
        googleMarkers = [];
    }

    if (filteredSpots.length === 0) {
        spotsContainer.innerHTML = `
            <div class="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                <i data-lucide="search-x" class="w-12 h-12 text-slate-400 mx-auto mb-3"></i>
                <h3 class="text-base font-semibold text-slate-800">No Parking Spaces Found</h3>
                <p class="text-xs text-slate-500 mt-1">Try relaxing your search query or vehicle filter criteria.</p>
                <button onclick="resetFilters()" class="mt-4 px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700">
                    Reset All Filters
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    let cardsHTML = '';

    filteredSpots.forEach(spot => {
        // Distance calculation
        let distanceText = '';
        if (userCoords) {
            const dist = calculateDistance(userCoords.lat, userCoords.lng, spot.lat, spot.lng);
            distanceText = `<span class="inline-flex items-center text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                <i data-lucide="navigation" class="w-3 h-3 mr-1 inline"></i>${dist.toFixed(1)} km away
            </span>`;
        }

        const availRatio = spot.slots.available / spot.slots.total;
        let availClass = 'bg-emerald-500';
        let badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        let pinClass = 'pin-avail-high';

        if (spot.slots.available <= 5) {
            availClass = 'bg-rose-500';
            badgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
            pinClass = 'pin-avail-low';
        } else if (availRatio < 0.25) {
            availClass = 'bg-amber-500';
            badgeClass = 'text-amber-700 bg-amber-50 border-amber-200';
            pinClass = 'pin-avail-med';
        }

        const ratePerHour = getRateForVehicle(spot, currentVehicleType);

        // 1. If OpenStreetMap (Leaflet) is Active
        if (activeMapEngine === 'osm' && markersLayer) {
            const customIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `
                    <div class="custom-pin ${pinClass}" onclick="focusSpotCard('${spot.id}')">
                        <div class="pin-pulse"></div>
                        <span>₹${ratePerHour}</span>
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22]
            });

            const popupContent = `
                <div class="text-sm p-1">
                    <div class="font-bold text-slate-900">${spot.name}</div>
                    <div class="text-xs text-slate-500 mb-2">${spot.area}</div>
                    <div class="flex items-center justify-between text-xs mb-2">
                        <span class="font-semibold text-emerald-600">🟢 ${spot.slots.available} / ${spot.slots.total} Free</span>
                        <span class="font-bold text-sky-600">₹${ratePerHour}/hr</span>
                    </div>
                    <div class="flex gap-1.5 mt-2">
                        <button onclick="calculateRouteToSpot('${spot.id}')" class="flex-1 py-1 px-2 bg-slate-800 text-white rounded text-xs font-medium hover:bg-slate-900">
                            Driving Route
                        </button>
                        <button onclick="openBookingModal('${spot.id}')" class="flex-1 py-1 px-2 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-700 text-center">
                            Book Spot
                        </button>
                    </div>
                </div>
            `;

            const marker = L.marker([spot.lat, spot.lng], { icon: customIcon }).addTo(markersLayer);
            marker.bindPopup(popupContent);
        }

        // 2. If Google Maps API is Active
        if (activeMapEngine === 'google' && googleMap && window.google) {
            const pinColor = spot.slots.available <= 5 ? '#ef4444' : availRatio < 0.25 ? '#f59e0b' : '#10b981';
            
            const gMarker = new google.maps.Marker({
                position: { lat: spot.lat, lng: spot.lng },
                map: googleMap,
                title: spot.name,
                label: {
                    text: `₹${ratePerHour}`,
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: '11px'
                },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 18,
                    fillColor: pinColor,
                    fillOpacity: 0.95,
                    strokeWeight: 3,
                    strokeColor: '#ffffff'
                }
            });

            const gInfoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; max-width: 220px; padding: 4px;">
                        <b style="color: #0f172a; font-size: 14px;">${spot.name}</b>
                        <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${spot.area}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
                            <span style="color: #059669; font-weight: bold;">🟢 ${spot.slots.available} Slots Free</span>
                            <span style="color: #0284c7; font-weight: bold;">₹${ratePerHour}/hr</span>
                        </div>
                        <button onclick="openBookingModal('${spot.id}')" style="width: 100%; padding: 6px; background: #0284c7; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                            Book Spot Now
                        </button>
                    </div>
                `
            });

            gMarker.addListener('click', () => {
                gInfoWindow.open(googleMap, gMarker);
                focusSpotCard(spot.id);
            });

            googleMarkers.push(gMarker);
        }

        // Spot Card HTML
        cardsHTML += `
            <div id="card-${spot.id}" class="spot-card bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:border-sky-300 w-full max-w-full">
                <div class="flex gap-3 sm:gap-4 items-stretch min-w-0">
                    <div class="relative w-24 sm:w-28 h-auto min-h-[96px] sm:min-h-[110px] rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 self-stretch">
                        <img src="${spot.image}" alt="${spot.name}" class="w-full h-full object-cover">
                        <div onclick="openRatingModal('${spot.id}')" title="Click to rate this facility" class="absolute bottom-1.5 left-1.5 bg-black/75 hover:bg-amber-600 transition-colors backdrop-blur-sm text-white px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer">
                            <i data-lucide="star" class="w-3 h-3 text-amber-400 fill-amber-400"></i> ${spot.rating}
                        </div>
                    </div>

                    <div class="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                            <div class="flex items-start justify-between gap-2 min-w-0">
                                <div class="min-w-0 flex-1">
                                    <h3 class="font-bold text-slate-900 text-sm sm:text-base leading-snug truncate hover:text-sky-600 cursor-pointer" onclick="zoomToSpot(${spot.lat}, ${spot.lng})" title="${spot.name}">
                                        ${spot.name}
                                    </h3>
                                    <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1 min-w-0 truncate">
                                        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
                                        <span class="truncate">${spot.area}</span>
                                    </p>
                                </div>
                                <div class="text-right flex-shrink-0 pl-1">
                                    <div class="text-base sm:text-lg font-black text-sky-600 leading-tight">₹${ratePerHour}<span class="text-xs font-normal text-slate-500">/hr</span></div>
                                    <div class="text-[10px] text-slate-400 font-medium whitespace-nowrap">₹${spot.rates.dayPass} Day</div>
                                </div>
                            </div>

                            <div class="mt-2 flex flex-wrap items-center gap-1.5">
                                <span class="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border ${badgeClass}">
                                    <span class="w-1.5 h-1.5 rounded-full ${availClass} mr-1.5"></span>
                                    ${spot.slots.available} Slots Free
                                </span>
                                ${spot.fastagEnabled ? '<span class="badge-tag badge-fastag"><i data-lucide="zap" class="w-3 h-3"></i>FASTag Auto</span>' : ''}
                                ${spot.slots.evAvailable > 0 ? `<span class="badge-tag badge-ev"><i data-lucide="battery-charging" class="w-3 h-3"></i>${spot.slots.evAvailable} EV Ports</span>` : ''}
                                ${spot.towingFreeGuaranteed ? '<span class="badge-tag badge-towing"><i data-lucide="shield-check" class="w-3 h-3"></i>Tow-Free Zone</span>' : ''}
                                ${distanceText}
                            </div>
                        </div>

                        <!-- Card Footer: Row 1 = Operator Info, Row 2 = Action Buttons -->
                        <div class="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-2 min-w-0">
                            <div class="text-[11px] text-slate-500 flex items-center gap-1 min-w-0 truncate">
                                <span class="font-medium text-slate-700 truncate">${spot.type}</span>
                                <span class="text-slate-300">•</span>
                                <span class="truncate">${spot.operator}</span>
                            </div>
                            <div class="flex items-center gap-1.5 w-full min-w-0">
                                <button onclick="openRatingModal('${spot.id}')" title="Rate this facility" class="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 border border-amber-200 flex-shrink-0">
                                    <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-500"></i>
                                    <span class="text-[11px]">Rate</span>
                                </button>
                                <button onclick="calculateRouteToSpot('${spot.id}')" title="Calculate Driving Route" class="px-2 py-1.5 bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 flex-shrink-0">
                                    <i data-lucide="navigation" class="w-3.5 h-3.5 text-sky-600"></i>
                                    <span class="text-[11px]">Route</span>
                                </button>
                                <button onclick="openBookingModal('${spot.id}')" class="flex-1 min-w-0 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1">
                                    <span class="truncate">Book Spot</span>
                                    <i data-lucide="arrow-right" class="w-3 h-3 flex-shrink-0"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    spotsContainer.innerHTML = cardsHTML;
    lucide.createIcons();
}

// Hourly rate based on vehicle
function getRateForVehicle(spot, vType) {
    if (vType === 'twoWheeler') return spot.rates.twoWheeler;
    if (vType === 'suv') return spot.rates.suv;
    if (vType === 'ev') return spot.rates.fourWheeler + 20; // Includes EV fast charge
    return spot.rates.fourWheeler;
}

// Filter dataset
function getFilteredSpots() {
    const searchVal = document.getElementById('searchInput').value.trim().toLowerCase();
    const fastagOnly = document.getElementById('filterFastag').checked;
    const evOnly = document.getElementById('filterEv').checked;
    const towFreeOnly = document.getElementById('filterTowingFree').checked;
    const sortBy = document.getElementById('sortSelect').value;

    let spots = currentCity === 'all' ? allSpots : (CITIES_DATA[currentCity]?.spots || allSpots);

    return spots.filter(spot => {
        if (searchVal) {
            const inName = spot.name.toLowerCase().includes(searchVal);
            const inArea = spot.area.toLowerCase().includes(searchVal);
            const inCity = CITIES_DATA[spot.city]?.name.toLowerCase().includes(searchVal);
            if (!inName && !inArea && !inCity) return false;
        }

        if (fastagOnly && !spot.fastagEnabled) return false;
        if (evOnly && spot.slots.evAvailable === 0) return false;
        if (towFreeOnly && !spot.towingFreeGuaranteed) return false;

        return true;
    }).sort((a, b) => {
        if (sortBy === 'price_asc') {
            return getRateForVehicle(a, currentVehicleType) - getRateForVehicle(b, currentVehicleType);
        } else if (sortBy === 'price_desc') {
            return getRateForVehicle(b, currentVehicleType) - getRateForVehicle(a, currentVehicleType);
        } else if (sortBy === 'avail') {
            return b.slots.available - a.slots.available;
        } else if (sortBy === 'rating') {
            return b.rating - a.rating;
        } else if (sortBy === 'dist' && userCoords) {
            const distA = calculateDistance(userCoords.lat, userCoords.lng, a.lat, a.lng);
            const distB = calculateDistance(userCoords.lat, userCoords.lng, b.lat, b.lng);
            return distA - distB;
        }
        return 0;
    });
}

// ===================================================================
// Map Geocoding Search API (Photon / OpenStreetMap Geocoding)
// ===================================================================

function setupGeocodingSearch() {
    const searchInput = document.getElementById('searchInput');
    const dropdown = document.getElementById('searchSuggestionsDropdown');
    const loadingSpinner = document.getElementById('searchApiLoading');

    if (!searchInput || !dropdown) return;

    // Debounced listener
    searchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();

        // Local array search first
        renderSpots();

        if (!isGeocodingEnabled || query.length < 3) {
            dropdown.classList.add('hidden');
            return;
        }

        loadingSpinner.classList.remove('hidden');

        try {
            // Query Photon Geocoding API for India (Free, fast OSM Geocoder)
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=68.1,6.5,97.4,35.5`);
            const data = await response.json();
            
            loadingSpinner.classList.add('hidden');

            if (data && data.features && data.features.length > 0) {
                renderSearchSuggestions(data.features);
            } else {
                dropdown.classList.add('hidden');
            }
        } catch (err) {
            console.warn("Geocoding API search failed, falling back to local search:", err);
            loadingSpinner.classList.add('hidden');
            dropdown.classList.add('hidden');
        }
    }, 350));

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#searchBoxContainer')) {
            dropdown.classList.add('hidden');
        }
    });
}

function renderSearchSuggestions(features) {
    const dropdown = document.getElementById('searchSuggestionsDropdown');
    dropdown.innerHTML = '';

    features.forEach(feat => {
        const props = feat.properties;
        const coords = feat.geometry.coordinates; // [lng, lat]
        const title = props.name || props.street || 'Location';
        const subtitle = [props.district, props.city, props.state].filter(Boolean).join(', ');

        const item = document.createElement('div');
        item.className = 'search-suggestion-item';
        item.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
                <i data-lucide="map-pin" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-bold text-xs text-slate-800 truncate">${title}</div>
                <div class="text-[11px] text-slate-500 truncate">${subtitle || 'India'}</div>
            </div>
            <span class="text-[10px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">Select</span>
        `;

        item.addEventListener('click', () => {
            selectGeocodedLocation(coords[1], coords[0], title);
        });

        dropdown.appendChild(item);
    });

    dropdown.classList.remove('hidden');
    lucide.createIcons();
}

function selectGeocodedLocation(lat, lng, name) {
    const dropdown = document.getElementById('searchSuggestionsDropdown');
    dropdown.classList.add('hidden');

    userCoords = { lat: lat, lng: lng };

    zoomToSpot(lat, lng);

    // Drop Search Pin
    if (activeMapEngine === 'osm' && map) {
        L.popup()
            .setLatLng([lat, lng])
            .setContent(`<b>📍 Searched Location:</b><br>${name}`)
            .openOn(map);
    } else if (activeMapEngine === 'google' && googleMap && window.google) {
        new google.maps.InfoWindow({
            content: `<b>📍 Searched Location:</b><br>${name}`,
            position: { lat, lng }
        }).open(googleMap);
    }

    // Sort by nearest automatically
    document.getElementById('sortSelect').value = 'dist';
    renderSpots();
    showToast(`Showing parking spaces near: ${name}`, "success");
}

// ===================================================================
// Live OSRM Driving Directions API (Route Polyline & Travel Time)
// ===================================================================

async function calculateRouteToSpot(spotId) {
    if (!isRoutingEnabled) {
        showToast("Turn-by-turn routing is disabled in Map Settings.", "info");
        return;
    }

    const spot = allSpots.find(s => s.id === spotId);
    if (!spot) return;

    // Use user GPS or City Center as origin
    let origin = userCoords;
    if (!origin) {
        const city = CITIES_DATA[currentCity] || CITIES_DATA.delhi;
        origin = { lat: city.center[0], lng: city.center[1] };
    }

    showToast(`Calculating fastest driving route to ${spot.name}...`, "info");

    try {
        // Query OSRM Public Driving Routing API
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${spot.lng},${spot.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const durationMin = Math.round(route.duration / 60);

            drawRoutePolyline(route.geometry.coordinates);

            // Display Banner
            const banner = document.getElementById('routeInfoBanner');
            document.getElementById('routeDistanceText').innerText = `${distanceKm} km`;
            document.getElementById('routeDurationText').innerText = `~${durationMin} mins driving`;
            document.getElementById('routeDestinationName').innerText = `to ${spot.name}`;
            banner.classList.remove('hidden');
            lucide.createIcons();

            showToast(`Fastest Route Found: ${distanceKm} km (~${durationMin} mins)`, "success");
        } else {
            showToast("Could not calculate driving route between these points.", "error");
        }
    } catch (err) {
        console.warn("Routing API error:", err);
        showToast("Routing service temporarily unavailable. Using direct navigation.", "info");
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`, '_blank');
    }
}

function drawRoutePolyline(coordinates) {
    clearCurrentRoute();

    if (activeMapEngine === 'osm' && map) {
        // Convert [lng, lat] to Leaflet [lat, lng]
        const latLngs = coordinates.map(coord => [coord[1], coord[0]]);

        currentRouteLayer = L.polyline(latLngs, {
            color: '#0284c7',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] });
    } else if (activeMapEngine === 'google' && googleMap && window.google) {
        const path = coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));

        currentGoogleRoute = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#0284c7',
            strokeOpacity: 0.9,
            strokeWeight: 5
        });

        currentGoogleRoute.setMap(googleMap);

        const bounds = new google.maps.LatLngBounds();
        path.forEach(pt => bounds.extend(pt));
        googleMap.fitBounds(bounds);
    }
}

function clearCurrentRoute() {
    if (currentRouteLayer && map) {
        map.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }
    if (currentGoogleRoute) {
        currentGoogleRoute.setMap(null);
        currentGoogleRoute = null;
    }
    const banner = document.getElementById('routeInfoBanner');
    if (banner) banner.classList.add('hidden');
}

// ===================================================================
// Map Settings & Provider Modal Handlers
// ===================================================================

function openMapSettingsModal() {
    const modal = document.getElementById('mapSettingsModal');
    if (!modal) return;

    // Set UI state according to current configuration
    const radios = document.getElementsByName('mapEngine');
    radios.forEach(r => {
        r.checked = (r.value === activeMapEngine);
    });

    document.getElementById('googleMapsApiKeyInput').value = googleApiKey || '';
    document.getElementById('toggleTrafficLayer').checked = isTrafficEnabled;
    document.getElementById('toggleGeocodingApi').checked = isGeocodingEnabled;
    document.getElementById('toggleRoutingApi').checked = isRoutingEnabled;

    const envBadge = document.getElementById('envKeyStatusBadge');
    if (envBadge) {
        if (window.ENV && window.ENV.GOOGLE_MAPS_API_KEY && window.ENV.GOOGLE_MAPS_API_KEY.trim()) {
            envBadge.classList.remove('hidden');
            envBadge.innerText = 'Active from env.js / .env';
        } else {
            envBadge.classList.add('hidden');
        }
    }

    toggleMapProviderUI(activeMapEngine);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function closeMapSettingsModal() {
    const modal = document.getElementById('mapSettingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function toggleMapProviderUI(engine) {
    const osmCard = document.getElementById('providerOsmCard');
    const googleCard = document.getElementById('providerGoogleCard');
    const keySection = document.getElementById('googleApiKeySection');

    if (engine === 'google') {
        googleCard.classList.add('border-sky-500', 'bg-sky-50/50');
        googleCard.classList.remove('border-slate-200', 'bg-white');
        osmCard.classList.remove('border-sky-500', 'bg-sky-50/50');
        osmCard.classList.add('border-slate-200', 'bg-white');
        keySection.classList.remove('opacity-50');
    } else {
        osmCard.classList.add('border-sky-500', 'bg-sky-50/50');
        osmCard.classList.remove('border-slate-200', 'bg-white');
        googleCard.classList.remove('border-sky-500', 'bg-sky-50/50');
        googleCard.classList.add('border-slate-200', 'bg-white');
        keySection.classList.add('opacity-50');
    }
}

function testGoogleMapsKey() {
    const key = document.getElementById('googleMapsApiKeyInput').value.trim();
    if (!key) {
        showToast("Please paste a valid Google Maps API Key first.", "error");
        return;
    }

    showToast("Validating Google Maps API Key...", "info");

    const testScriptId = 'gmaps-test-script';
    const old = document.getElementById(testScriptId);
    if (old) old.remove();

    window.__gmapsTestCallback = function () {
        showToast("Google Maps Key Verified! Maps API loaded successfully.", "success");
        delete window.__gmapsTestCallback;
        const el = document.getElementById(testScriptId);
        if (el) el.remove();
    };

    const script = document.createElement('script');
    script.id = testScriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmapsTestCallback`;
    script.async = true;
    script.onerror = () => {
        showToast("Network error or invalid Google Maps script URL.", "error");
    };
    document.head.appendChild(script);
}

function saveAndApplyMapSettings() {
    const selectedEngine = document.querySelector('input[name="mapEngine"]:checked')?.value || 'osm';
    const enteredKey = document.getElementById('googleMapsApiKeyInput').value.trim();
    isTrafficEnabled = document.getElementById('toggleTrafficLayer').checked;
    isGeocodingEnabled = document.getElementById('toggleGeocodingApi').checked;
    isRoutingEnabled = document.getElementById('toggleRoutingApi').checked;

    activeMapEngine = selectedEngine;
    googleApiKey = enteredKey;

    // Save to localStorage
    const settings = {
        engine: activeMapEngine,
        googleApiKey: googleApiKey,
        trafficLayer: isTrafficEnabled,
        geocodingApi: isGeocodingEnabled,
        routingApi: isRoutingEnabled
    };
    localStorage.setItem('parkease_map_settings', JSON.stringify(settings));

    closeMapSettingsModal();

    if (activeMapEngine === 'google') {
        if (!googleApiKey) {
            showToast("Google Maps selected without API Key. Reverting to Free OpenStreetMap.", "info");
            initLeafletMap();
        } else {
            loadGoogleMapsEngine();
        }
    } else {
        initLeafletMap();
        renderSpots();
    }

    showToast("Map API settings saved and updated!", "success");
}

// ===================================================================
// UI Controls & Navigation
// ===================================================================

function setupEventListeners() {
    const citySelect = document.getElementById('citySelect');
    citySelect.addEventListener('change', (e) => switchCity(e.target.value));

    const vehicleBtns = document.querySelectorAll('.vehicle-btn');
    vehicleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            vehicleBtns.forEach(b => b.classList.remove('active', 'border-sky-600', 'bg-sky-50', 'text-sky-700'));
            btn.classList.add('active', 'border-sky-600', 'bg-sky-50', 'text-sky-700');
            currentVehicleType = btn.dataset.type;
            renderSpots();
        });
    });

    document.getElementById('filterFastag').addEventListener('change', renderSpots);
    document.getElementById('filterEv').addEventListener('change', renderSpots);
    document.getElementById('filterTowingFree').addEventListener('change', renderSpots);
    document.getElementById('sortSelect').addEventListener('change', renderSpots);

    document.getElementById('locateMeBtn').addEventListener('click', requestUserLocation);

    // Host space earnings calculator
    const hostSlotsInput = document.getElementById('hostSlotsInput');
    const hostHoursInput = document.getElementById('hostHoursInput');
    if (hostSlotsInput && hostHoursInput) {
        const updateEarnings = () => {
            const slots = parseInt(hostSlotsInput.value) || 1;
            const hours = parseInt(hostHoursInput.value) || 8;
            const avgRate = 45;
            const monthlyEstimate = slots * hours * avgRate * 26;
            document.getElementById('estimatedEarningsText').innerText = `₹${monthlyEstimate.toLocaleString('en-IN')}`;
        };
        hostSlotsInput.addEventListener('input', updateEarnings);
        hostHoursInput.addEventListener('input', updateEarnings);
    }
}

function switchCity(cityKey) {
    currentCity = cityKey;
    clearCurrentRoute();

    if (cityKey !== 'all' && CITIES_DATA[cityKey]) {
        const city = CITIES_DATA[cityKey];
        if (activeMapEngine === 'osm' && map) {
            map.flyTo(city.center, city.zoom, { animate: true, duration: 1.2 });
        } else if (activeMapEngine === 'google' && googleMap) {
            googleMap.panTo({ lat: city.center[0], lng: city.center[1] });
            googleMap.setZoom(city.zoom);
        }
    }

    renderSpots();
    renderCityStats();
}

function zoomToSpot(lat, lng) {
    if (activeMapEngine === 'osm' && map) {
        map.flyTo([lat, lng], 16, { animate: true, duration: 1 });
    } else if (activeMapEngine === 'google' && googleMap) {
        googleMap.panTo({ lat, lng });
        googleMap.setZoom(16);
    }
}

function focusSpotCard(spotId) {
    const card = document.getElementById(`card-${spotId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('ring-2', 'ring-sky-500');
        setTimeout(() => card.classList.remove('ring-2', 'ring-sky-500'), 1800);
    }
}

// GPS Location Request
function requestUserLocation() {
    const btn = document.getElementById('locateMeBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-1"></i> Detecting...`;
    lucide.createIcons();

    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "error");
        btn.innerHTML = originalText;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userCoords = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            if (activeMapEngine === 'osm' && map) {
                const userIcon = L.divIcon({
                    className: 'user-location-marker',
                    html: `<div class="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center animate-bounce">
                        <div class="w-2.5 h-2.5 bg-white rounded-full"></div>
                    </div>`,
                    iconSize: [24, 24]
                });

                L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
                    .addTo(map)
                    .bindPopup("<b>You are here!</b><br>Showing nearest parking spaces.")
                    .openPopup();

                map.flyTo([userCoords.lat, userCoords.lng], 14, { animate: true, duration: 1.2 });
            } else if (activeMapEngine === 'google' && googleMap && window.google) {
                new google.maps.Marker({
                    position: userCoords,
                    map: googleMap,
                    title: "You are here",
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#2563eb',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2
                    }
                });
                googleMap.panTo(userCoords);
                googleMap.setZoom(14);
            }

            document.getElementById('sortSelect').value = 'dist';
            renderSpots();
            showToast("GPS Location active! Showing nearest parking spots.", "success");
            btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 mr-1 text-emerald-500"></i> Located`;
            lucide.createIcons();
        },
        (error) => {
            console.warn("GPS error:", error);
            showToast("Location permission denied. You can pick your city from the dropdown.", "info");
            btn.innerHTML = originalText;
            lucide.createIcons();
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterFastag').checked = false;
    document.getElementById('filterEv').checked = false;
    document.getElementById('filterTowingFree').checked = false;
    document.getElementById('sortSelect').value = 'avail';
    clearCurrentRoute();
    renderSpots();
}

function renderCityStats() {
    const statsEl = document.getElementById('cityQuickStats');
    if (!statsEl) return;

    let availableCount = 0;
    let totalCount = 0;
    let evCount = 0;

    const spots = currentCity === 'all' ? allSpots : (CITIES_DATA[currentCity]?.spots || allSpots);
    spots.forEach(s => {
        availableCount += s.slots.available;
        totalCount += s.slots.total;
        evCount += s.slots.evAvailable;
    });

    statsEl.innerHTML = `
        <div class="flex items-center gap-6 text-xs text-slate-600">
            <div><span class="font-bold text-slate-900">${spots.length}</span> Hubs Listed</div>
            <div><span class="font-bold text-emerald-600">${availableCount}</span> Free Spaces</div>
            <div><span class="font-bold text-sky-600">${evCount}</span> EV Chargers Ready</div>
            <div class="hidden sm:block"><span class="font-bold text-slate-900">100%</span> Towing-Free Safe</div>
        </div>
    `;
}

// ===================================================================
// Booking Modal & Smart Pass Generation
// ===================================================================

// ===================================================================
// New Advanced Features State & Handlers
// 1. Visual Floor Plan Grid (BookMyShow Style)
// 2. EV Charging Calculator
// 3. Monthly Commuter Subscription Pass
// 4. WhatsApp Ticket Sharing
// 5. Bilingual Voice Guidance
// 6. ANPR Boom Barrier Gate Simulator
// 7. Tow-Truck Anti-Challan Warning Radar
// ===================================================================

let currentPassMode = 'hourly'; // 'hourly' or 'monthly'
let currentSelectedSlot = {
    id: 'B2-14',
    floor: 'B2',
    name: 'Basement B2 - Slot #14',
    feature: 'Standard 4W Slot • 15m from Elevator 1'
};
let activeFloor = 'B2';
let lastActiveBooking = null;

// Switch between Hourly and Monthly Corporate Pass
function switchPassMode(mode) {
    currentPassMode = mode;
    const hourlyBtn = document.getElementById('passModeHourlyBtn');
    const monthlyBtn = document.getElementById('passModeMonthlyBtn');
    const hourlyRow = document.getElementById('hourlyDurationRow');
    const monthlyRow = document.getElementById('monthlyPassRow');

    if (mode === 'monthly') {
        hourlyBtn.classList.remove('bg-white', 'text-sky-700', 'shadow-sm');
        hourlyBtn.classList.add('text-slate-600');
        monthlyBtn.classList.add('bg-white', 'text-sky-700', 'shadow-sm');
        monthlyBtn.classList.remove('text-slate-600');

        hourlyRow.classList.add('hidden');
        monthlyRow.classList.remove('hidden');
    } else {
        monthlyBtn.classList.remove('bg-white', 'text-sky-700', 'shadow-sm');
        monthlyBtn.classList.add('text-slate-600');
        hourlyBtn.classList.add('bg-white', 'text-sky-700', 'shadow-sm');
        hourlyBtn.classList.remove('text-slate-600');

        hourlyRow.classList.remove('hidden');
        monthlyRow.classList.add('hidden');
    }

    updateBookingCost();
}

function onVehicleSelectChange() {
    const vType = document.getElementById('modalVehicleSelect').value;
    const evSection = document.getElementById('evChargingAddonSection');
    const fareEvRow = document.getElementById('fareEvRow');

    if (vType === 'ev') {
        evSection.classList.remove('hidden');
        fareEvRow.classList.remove('hidden');
        currentSelectedSlot = {
            id: 'B1-EV03',
            floor: 'B1',
            name: 'Basement B1 - EV Bay #03',
            feature: '60 kW Fast DC Charger • Adjacent to Elevator'
        };
    } else {
        evSection.classList.add('hidden');
        fareEvRow.classList.add('hidden');
    }

    document.getElementById('selectedSlotNameDisplay').innerText = currentSelectedSlot.name;
    updateBookingCost();
}

// Floor Plan Slot Picker Modal Handlers
function openFloorPlanModal() {
    const modal = document.getElementById('floorPlanModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchFloorPlan(currentSelectedSlot.floor || 'B2');
    lucide.createIcons();
}

function closeFloorPlanModal() {
    const modal = document.getElementById('floorPlanModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function switchFloorPlan(floor) {
    activeFloor = floor;
    const tabB1 = document.getElementById('floorTabB1');
    const tabB2 = document.getElementById('floorTabB2');

    if (floor === 'B1') {
        tabB1.classList.add('bg-sky-600', 'text-white');
        tabB1.classList.remove('text-slate-400');
        tabB2.classList.remove('bg-sky-600', 'text-white');
        tabB2.classList.add('text-slate-400');
    } else {
        tabB2.classList.add('bg-sky-600', 'text-white');
        tabB2.classList.remove('text-slate-400');
        tabB1.classList.remove('bg-sky-600', 'text-white');
        tabB1.classList.add('text-slate-400');
    }

    renderFloorSlotsGrid(floor);
}

function renderFloorSlotsGrid(floor) {
    const row1 = document.getElementById('floorSlotsRow1');
    const row2 = document.getElementById('floorSlotsRow2');
    if (!row1 || !row2) return;

    row1.innerHTML = '';
    row2.innerHTML = '';

    // Generate 16 slots per floor (8 per row)
    for (let i = 1; i <= 16; i++) {
        const slotId = `${floor}-${String(i).padStart(2, '0')}`;
        const isOccupied = (i === 3 || i === 7 || i === 11 || i === 15);
        const isEvBay = (floor === 'B1' && (i === 2 || i === 4));
        const isSelected = (currentSelectedSlot.id === slotId);

        let statusClass = 'slot-free';
        let badgeIcon = 'car';
        let label = `#${i}`;

        if (isOccupied) {
            statusClass = 'slot-occupied';
            label = 'OCCUPIED';
        } else if (isEvBay) {
            statusClass = 'slot-ev-bay';
            label = `⚡ EV-${i}`;
            badgeIcon = 'zap';
        }

        if (isSelected) {
            statusClass += ' slot-selected';
        }

        const slotCard = document.createElement('div');
        slotCard.className = `parking-slot-card ${statusClass}`;
        slotCard.innerHTML = `
            <div class="text-[10px] font-mono text-slate-300 font-bold">${floor}</div>
            <div class="text-xs font-black truncate">${label}</div>
        `;

        if (!isOccupied) {
            slotCard.addEventListener('click', () => {
                selectSlotInModal(slotId, floor, isEvBay, i);
            });
        }

        if (i <= 8) {
            row1.appendChild(slotCard);
        } else {
            row2.appendChild(slotCard);
        }
    }
}

function selectSlotInModal(slotId, floor, isEvBay, number) {
    currentSelectedSlot = {
        id: slotId,
        floor: floor,
        name: isEvBay ? `Basement ${floor} - EV Bay #${number}` : `Basement ${floor} - Slot #${number}`,
        feature: isEvBay ? 'Dedicated 60kW Fast DC Charging Port' : `Standard Bay • Near Elevator ${floor === 'B1' ? '1' : '2'}`
    };

    document.getElementById('modalSelectedSlotName').innerText = currentSelectedSlot.name;
    document.getElementById('modalSelectedSlotFeature').innerText = currentSelectedSlot.feature;

    renderFloorSlotsGrid(floor);
}

function applySelectedSlotFromModal() {
    document.getElementById('selectedSlotNameDisplay').innerText = currentSelectedSlot.name;
    closeFloorPlanModal();
    showToast(`Slot ${currentSelectedSlot.name} selected!`, "success");
}

// WhatsApp Pass Generator
function sendPassToWhatsApp() {
    if (!lastActiveBooking) {
        showToast("No active pass to share.", "error");
        return;
    }

    const b = lastActiveBooking;
    const navLink = `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;
    const textMessage = 
        `🚗 *ParkEase Official Smart Parking Pass*\n\n` +
        `🎟️ *Pass ID:* ${b.id}\n` +
        `📍 *Location:* ${b.spotName}\n` +
        `🅿️ *Allocated Slot:* ${b.slotNumber}\n` +
        `🚘 *Vehicle No:* ${b.vehicleNumber}\n` +
        `⏱️ *Validity:* ${b.duration} (${b.timestamp})\n` +
        `💳 *Paid:* ${b.totalPaid} (${b.paymentMethod})\n\n` +
        `🗺️ *Turn-by-Turn GPS Navigation:* ${navLink}\n\n` +
        `_Show this QR pass or vehicle plate at the boom barrier for automatic contactless entry._`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textMessage)}`;
    window.open(whatsappUrl, '_blank');
}

// Bilingual Voice Guidance (SpeechSynthesis)
function playVoiceGuidance() {
    if (!lastActiveBooking) return;

    if (!('speechSynthesis' in window)) {
        showToast("Voice guidance is not supported by your browser.", "info");
        return;
    }

    const b = lastActiveBooking;
    const announcement = `ParkEase Confirmed. Welcome. Your vehicle ${b.vehicleNumber} is cleared for entry at ${b.spotName}. Please proceed to ${b.slotNumber}. Boom barrier is now open.`;

    const utterance = new SpeechSynthesisUtterance(announcement);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.lang = 'en-IN';

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    showToast("Playing voice parking guidance...", "info");
}

// ANPR Smart Boom Barrier Simulator
function openBarrierSimulatorModal() {
    const modal = document.getElementById('barrierSimulatorModal');
    if (!modal) return;

    const currentPlate = document.getElementById('vehicleNumberInput')?.value.trim() || 'DL 01 AB 1234';
    document.getElementById('simVehicleInput').value = currentPlate;
    document.getElementById('simPlateReadout').innerText = currentPlate;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function closeBarrierSimulatorModal() {
    const modal = document.getElementById('barrierSimulatorModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function runBarrierSimulation() {
    const plate = document.getElementById('simVehicleInput').value.trim().toUpperCase() || 'DL 01 AB 1234';
    const pole = document.getElementById('simulatedBarrierPole');
    const badge = document.getElementById('barrierGateStatusBadge');
    const log = document.getElementById('simLogMessage');
    const btn = document.getElementById('runBarrierSimBtn');

    document.getElementById('simPlateReadout').innerText = plate;
    btn.disabled = true;
    log.innerHTML = `<span class="text-sky-600 font-bold">Scanning license plate via Optical AI Camera...</span>`;

    // Play subtle audio beep via Web Audio API
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}

    setTimeout(() => {
        // Plate recognized & barrier raised
        pole.classList.add('barrier-open');
        badge.className = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.innerText = 'GATE OPEN - PROCEED';
        log.innerHTML = `🟢 <b class="text-emerald-600">FASTag & Pass Verified!</b> Boom barrier raised. Welcome, vehicle <b>${plate}</b>!`;

        showToast(`Boom Barrier Opened for ${plate}!`, "success");

        // Auto close after 4 seconds
        setTimeout(() => {
            pole.classList.remove('barrier-open');
            badge.className = 'bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full';
            badge.innerText = 'GATE CLOSED';
            log.innerHTML = `Gate reset to secured closed position. Vehicle entered successfully.`;
            btn.disabled = false;
        }, 4000);
    }, 1200);
}

// Anti-Challan Towing Radar Modal Handlers
function openTowingRadarModal() {
    const modal = document.getElementById('towingRadarModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function closeTowingRadarModal() {
    const modal = document.getElementById('towingRadarModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function findNearestSafeParking() {
    closeTowingRadarModal();

    // Find the first verified towing-free spot in current city
    const spots = currentCity === 'all' ? allSpots : (CITIES_DATA[currentCity]?.spots || allSpots);
    const safeSpot = spots.find(s => s.towingFreeGuaranteed && s.slots.available > 0) || spots[0];

    if (safeSpot) {
        calculateRouteToSpot(safeSpot.id);
        focusSpotCard(safeSpot.id);
        showToast(`Rerouted to Authorized Lot: ${safeSpot.name}! Towing risk avoided.`, "success");
    }
}

// ===================================================================
// Booking Modal Core Logic
// ===================================================================

function openBookingModal(spotId) {
    const spot = allSpots.find(s => s.id === spotId);
    if (!spot) return;

    activeSpotForBooking = spot;
    document.getElementById('modalSpotName').innerText = spot.name;
    document.getElementById('modalSpotArea').innerText = spot.area;
    document.getElementById('modalSpotImage').src = spot.image;
    document.getElementById('modalFreeSlots').innerText = `${spot.slots.available} Slots Free`;
    document.getElementById('modalVehicleSelect').value = currentVehicleType;

    // Auto-fill from saved user profile if available
    try {
        const profile = JSON.parse(localStorage.getItem('parkease_user_profile') || 'null');
        if (profile) {
            if (profile.vehicleNumber && document.getElementById('vehicleNumberInput')) {
                document.getElementById('vehicleNumberInput').value = profile.vehicleNumber;
            }
            if (profile.vehicleType && document.getElementById('modalVehicleSelect')) {
                document.getElementById('modalVehicleSelect').value = profile.vehicleType;
            }
        }
    } catch(e) {}

    // Reset slot display
    document.getElementById('selectedSlotNameDisplay').innerText = currentSelectedSlot.name;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(Math.ceil(now.getMinutes() / 15) * 15 % 60).padStart(2, '0');
    document.getElementById('bookingStartTime').value = `${hours}:${minutes}`;

    onVehicleSelectChange();
    switchPassMode('hourly');

    const modal = document.getElementById('bookingModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeBookingModal() {
    const modal = document.getElementById('bookingModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function updateBookingCost() {
    if (!activeSpotForBooking) return;

    const vType = document.getElementById('modalVehicleSelect').value;
    const hourlyRate = getRateForVehicle(activeSpotForBooking, vType);
    let baseFare = 0;
    let evAddon = 0;

    if (currentPassMode === 'monthly') {
        // 30-Day Monthly Pass with 35% Discount
        const standardMonthly = hourlyRate * 8 * 26; // 8 hrs/day for 26 days
        baseFare = Math.round(standardMonthly * 0.65); // 35% discount
        document.getElementById('fareRateLabel').innerText = 'Monthly Pass Rate';
        document.getElementById('fareHourlyRate').innerText = `₹${baseFare}/month`;
    } else {
        const durationHours = parseFloat(document.getElementById('bookingDuration').value) || 2;
        baseFare = hourlyRate * durationHours;
        document.getElementById('fareRateLabel').innerText = 'Parking Hourly Rate';
        document.getElementById('fareHourlyRate').innerText = `₹${hourlyRate}/hr`;
    }

    if (vType === 'ev') {
        const wattage = parseFloat(document.getElementById('evChargerWattage')?.value) || 7.4;
        evAddon = wattage >= 60 ? 150 : wattage >= 30 ? 90 : 45;
        document.getElementById('fareEvAmount').innerText = `₹${evAddon}`;
    }

    // Check for active ₹50 welcome discount
    let discount = 0;
    const discountRow = document.getElementById('fareWelcomeDiscountRow');
    try {
        const profile = JSON.parse(localStorage.getItem('parkease_user_profile') || 'null');
        if (profile && profile.discount && currentPassMode !== 'monthly') {
            discount = profile.discount;
            if (discountRow) discountRow.classList.remove('hidden');
        } else {
            if (discountRow) discountRow.classList.add('hidden');
        }
    } catch(e) {
        if (discountRow) discountRow.classList.add('hidden');
    }

    const convenienceFee = 5;
    const gst = Math.round((baseFare + evAddon) * 0.18);
    const subtotal = baseFare + evAddon + convenienceFee + gst;
    const total = Math.max(10, subtotal - discount);

    document.getElementById('fareBaseAmount').innerText = `₹${baseFare}`;
    document.getElementById('fareGstAmount').innerText = `₹${gst}`;
    document.getElementById('fareTotalAmount').innerText = `₹${total}`;
}

function confirmBooking(event) {
    event.preventDefault();
    if (!activeSpotForBooking) return;

    const vehicleNumber = document.getElementById('vehicleNumberInput').value.trim().toUpperCase();
    if (!vehicleNumber) {
        showToast("Please enter a valid vehicle license plate number.", "error");
        return;
    }

    const durationText = currentPassMode === 'monthly' ? '30 Days (Monthly Pass)' : `${document.getElementById('bookingDuration').value} Hours`;
    const vType = document.getElementById('modalVehicleSelect').value;
    const totalAmount = document.getElementById('fareTotalAmount').innerText;
    const paymentMethod = document.querySelector('input[name="payMethod"]:checked').value;

    const bookingId = (currentPassMode === 'monthly' ? 'MP-' : 'PK-') + Math.floor(100000 + Math.random() * 900000);
    const bookingTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const newBooking = {
        id: bookingId,
        spotId: activeSpotForBooking.id,
        spotName: activeSpotForBooking.name,
        area: activeSpotForBooking.area,
        lat: activeSpotForBooking.lat,
        lng: activeSpotForBooking.lng,
        vehicleNumber: vehicleNumber,
        vehicleType: vType,
        slotNumber: currentSelectedSlot.name,
        duration: durationText,
        totalPaid: totalAmount,
        paymentMethod: paymentMethod,
        timestamp: bookingTime,
        status: 'Active',
        createdAt: Date.now()
    };

    lastActiveBooking = newBooking;
    saveBooking(newBooking);

    activeSpotForBooking.slots.available = Math.max(0, activeSpotForBooking.slots.available - 1);
    renderSpots();

    closeBookingModal();
    renderPass(newBooking);
    showToast("Parking Slot Confirmed! Your smart pass has been generated.", "success");
}

function renderPass(booking) {
    lastActiveBooking = booking;
    document.getElementById('passBookingId').innerText = booking.id;
    document.getElementById('passSpotName').innerText = booking.spotName;
    document.getElementById('passArea').innerText = booking.area;
    document.getElementById('passSlotNumber').innerText = booking.slotNumber;
    document.getElementById('passVehicleNo').innerText = booking.vehicleNumber;
    document.getElementById('passDuration').innerText = booking.duration;
    document.getElementById('passTotal').innerText = booking.totalPaid;
    document.getElementById('passPayMethod').innerText = booking.paymentMethod;
    document.getElementById('passTime').innerText = booking.timestamp;

    const navBtn = document.getElementById('passGoogleMapsBtn');
    navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${booking.lat},${booking.lng}`;

    const passModal = document.getElementById('passModal');
    passModal.classList.remove('hidden');
    passModal.classList.add('flex');
    lucide.createIcons();
}

function closePassModal() {
    const passModal = document.getElementById('passModal');
    passModal.classList.add('hidden');
    passModal.classList.remove('flex');
}

function saveBooking(booking) {
    let bookings = JSON.parse(localStorage.getItem('parkease_bookings') || '[]');
    bookings.unshift(booking);
    localStorage.setItem('parkease_bookings', JSON.stringify(bookings));
    loadExistingBookings();
}

function loadExistingBookings() {
    const bookings = JSON.parse(localStorage.getItem('parkease_bookings') || '[]');
    const countBadge = document.getElementById('myBookingsCount');
    if (countBadge) {
        countBadge.innerText = bookings.length;
        countBadge.classList.toggle('hidden', bookings.length === 0);
    }
}

function openMyBookingsDrawer() {
    const bookings = JSON.parse(localStorage.getItem('parkease_bookings') || '[]');
    const container = document.getElementById('myBookingsList');
    
    if (bookings.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-500">
                <i data-lucide="ticket" class="w-12 h-12 mx-auto text-slate-300 mb-2"></i>
                <p class="font-medium text-slate-700">No active reservations</p>
                <p class="text-xs text-slate-400 mt-1">Book a slot to view your live passes here.</p>
            </div>
        `;
    } else {
        container.innerHTML = bookings.map(b => `
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-sky-300 transition-all w-full max-w-full overflow-hidden min-w-0">
                <div class="flex items-center justify-between text-xs mb-1.5 min-w-0">
                    <span class="font-bold text-sky-700 truncate mr-2">${b.id}</span>
                    <span class="px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${b.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${b.status}</span>
                </div>
                <h4 class="font-bold text-sm text-slate-900 truncate" title="${b.spotName}">${b.spotName}</h4>
                <p class="text-xs text-slate-500 mt-0.5 truncate">${b.area}</p>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-100 min-w-0">
                    <div class="truncate"><span class="text-slate-400">Slot:</span> <b class="text-slate-800">${b.slotNumber}</b></div>
                    <div class="truncate"><span class="text-slate-400">Vehicle:</span> <b class="text-slate-800">${b.vehicleNumber}</b></div>
                    <div class="truncate"><span class="text-slate-400">Duration:</span> <b class="text-slate-800">${b.duration} hrs</b></div>
                    <div class="truncate"><span class="text-slate-400">Amount:</span> <b class="text-emerald-600">${b.totalPaid}</b></div>
                </div>
                <div class="mt-3 flex items-center gap-2 w-full min-w-0">
                    <button onclick='renderPass(${JSON.stringify(b)})' class="flex-1 min-w-0 py-1.5 px-2 bg-sky-600 text-white rounded text-xs font-semibold hover:bg-sky-700 truncate">
                        View QR Pass
                    </button>
                    <button onclick='openRatingModalFromBooking(${JSON.stringify(b)})' class="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-all flex-shrink-0" title="Rate this parking service">
                        <i data-lucide="star" class="w-3.5 h-3.5 fill-white"></i>
                        <span>Rate</span>
                    </button>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" class="px-3 py-1.5 bg-slate-200 text-slate-800 rounded text-xs font-semibold hover:bg-slate-300 flex items-center justify-center flex-shrink-0" title="Start Navigation">
                        <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
                    </a>
                </div>
            </div>
        `).join('');
    }
    
    lucide.createIcons();
    document.getElementById('bookingsDrawer').classList.remove('hidden');
}

function closeMyBookingsDrawer() {
    document.getElementById('bookingsDrawer').classList.add('hidden');
}

function submitHostSpace(e) {
    e.preventDefault();
    const city = document.getElementById('hostCitySelect').value;
    const name = document.getElementById('hostNameInput').value;
    const address = document.getElementById('hostAddressInput').value;
    const slots = parseInt(document.getElementById('hostSlotsInput').value) || 2;
    const hourlyRate = parseInt(document.getElementById('hostRateInput').value) || 40;

    const newHostSpot = {
        id: `host-${Date.now()}`,
        name: name,
        city: city,
        area: address,
        lat: (CITIES_DATA[city]?.center[0] || 28.6139) + (Math.random() - 0.5) * 0.04,
        lng: (CITIES_DATA[city]?.center[1] || 77.2090) + (Math.random() - 0.5) * 0.04,
        type: "Private Host Space",
        operator: "Verified Resident Host",
        verified: true,
        rating: 5.0,
        totalReviews: 1,
        rates: { twoWheeler: Math.round(hourlyRate * 0.5), fourWheeler: hourlyRate, suv: Math.round(hourlyRate * 1.3), dayPass: hourlyRate * 5 },
        slots: { total: slots, available: slots, evSlots: 0, evAvailable: 0 },
        amenities: ["Gated Security", "CCTV", "UPI Accepted"],
        fastagEnabled: false,
        image: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&auto=format&fit=crop&q=80",
        towingFreeGuaranteed: true,
        operatingHours: "07:00 AM - 11:00 PM",
        contactPhone: "+91 99999 88888"
    };

    if (CITIES_DATA[city]) {
        CITIES_DATA[city].spots.unshift(newHostSpot);
    }
    allSpots.unshift(newHostSpot);

    closeHostModal();
    switchCity(city);
    showToast("Space Listed Successfully! You can now earn passive income.", "success");
}

function openHostModal() {
    document.getElementById('hostModal').classList.remove('hidden');
    document.getElementById('hostModal').classList.add('flex');
}

function closeHostModal() {
    document.getElementById('hostModal').classList.add('hidden');
    document.getElementById('hostModal').classList.remove('flex');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        info: 'bg-slate-800 text-white'
    };

    toast.className = `fixed bottom-5 right-5 z-[9999] px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium ${bgColors[type] || bgColors.info} animate-fade-in transition-all`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info'}" class="w-4 h-4"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ===================================================================
// Interactive Service Rating & Community Review System
// ===================================================================

let selectedRatingScore = 5;
let hoveredRatingScore = 0;
let selectedRatingTags = new Set(['Instant FASTag Gate', 'Spotless Basement', 'Helpful Guard']);
let selectedSubRatings = { speed: 'Instant', safety: 'Excellent' };
let selectedTipAmount = 0;
let activeRatingSpot = null;
let activeRatingBooking = null;

const STAR_SENTIMENTS = {
    1: '⭐ Poor - Slow boom barrier or poorly managed facility.',
    2: '⭐⭐ Below Average - Congested basement or hard to find slot.',
    3: '⭐⭐⭐ Average - Decent service, slight waiting time.',
    4: '⭐⭐⭐⭐ Good - Smooth parking, clean space & fast check-in!',
    5: '⭐⭐⭐⭐⭐ Outstanding! Lightning-fast entry, spotless & 100% safe.'
};

const DEFAULT_VERIFIED_REVIEWS = [
    {
        id: 'REV-01',
        spotId: 'del-02',
        spotName: 'Cyber Hub Basement P2 Smart Park',
        area: 'DLF Cyber City, Gurugram',
        author: 'Vikramaditya Sharma',
        badge: 'Verified Driver',
        vehicle: 'Tata Nexon EV',
        rating: 5,
        tags: ['Instant FASTag Gate', 'Fast EV Charger', 'Helpful Guard'],
        comment: 'Charged my Nexon EV at the 60kW DC rapid charger while having client meetings at CyberHub. FASTag opened gate in 1 second. Exceptional facility!',
        timeAgo: '2 hours ago'
    },
    {
        id: 'REV-02',
        spotId: 'blr-02',
        spotName: 'Indiranagar 100ft Road MLCP Multi-Level',
        area: 'Indiranagar 100ft Road, Bengaluru',
        author: 'Pooja Nair',
        badge: 'Daily Commuter',
        vehicle: 'Hyundai i20',
        rating: 5,
        tags: ['Spotless Basement', '100% Safe CCTV', 'Easy Slot Finding'],
        comment: 'Street parking on 100ft road used to be terrifying because of traffic police towing trucks. ParkEase gave me a reserved slot in minutes. Complete peace of mind!',
        timeAgo: '5 hours ago'
    },
    {
        id: 'REV-03',
        spotId: 'mum-01',
        spotName: 'BKC Multi-Level Automated Parking (MMRDA)',
        area: 'Bandra Kurla Complex, Mumbai',
        author: 'Aditya Verma',
        badge: 'Corporate Pass Holder',
        vehicle: 'Honda City',
        rating: 5,
        tags: ['Near Elevator', 'Affordable Rates', 'Instant FASTag Gate'],
        comment: 'Monthly corporate pass saves me ₹3,500 every month. The Hindi & English audio voice guidance directed me straight to slot B2-14 right beside the elevator.',
        timeAgo: 'Yesterday'
    }
];

function loadStoredRatings() {
    try {
        const stored = JSON.parse(localStorage.getItem('parkease_spot_ratings') || '{}');
        Object.keys(stored).forEach(spotId => {
            const spot = allSpots.find(s => s.id === spotId);
            if (spot) {
                spot.rating = stored[spotId].rating;
                spot.totalReviews = stored[spotId].totalReviews;
            }
        });
    } catch(e) {
        console.warn("Failed loading stored ratings:", e);
    }
}

function openRatingModalFromCurrentPass() {
    closePassModal();
    if (lastActiveBooking) {
        openRatingModal(lastActiveBooking.spotId, lastActiveBooking);
    } else if (activeSpotForBooking) {
        openRatingModal(activeSpotForBooking.id);
    } else {
        openGenericRatingModal();
    }
}

function openRatingModalFromBooking(booking) {
    closeMyBookingsDrawer();
    openRatingModal(booking.spotId, booking);
}

function openGenericRatingModal(spotId = null) {
    if (spotId) {
        openRatingModal(spotId);
    } else {
        const spots = currentCity === 'all' ? allSpots : (CITIES_DATA[currentCity]?.spots || allSpots);
        const target = spots[0] || allSpots[0];
        openRatingModal(target ? target.id : null, null, true);
    }
}

function openRatingModal(spotId, booking = null, allowSelectSpot = false) {
    const modal = document.getElementById('ratingModal');
    if (!modal) return;

    let spot = allSpots.find(s => s.id === spotId) || allSpots[0];
    activeRatingSpot = spot;
    activeRatingBooking = booking;

    // Reset Form vs Success UI
    document.getElementById('ratingFormContainer').classList.remove('hidden');
    document.getElementById('ratingSuccessCard').classList.add('hidden');

    // Setup Header Text
    const spotNameEl = document.getElementById('ratingTargetSpotName');
    const spotAreaEl = document.getElementById('ratingTargetSpotArea');
    const metaInfoEl = document.getElementById('ratingTargetMetaInfo');
    const selectWrapper = document.getElementById('genericSpotSelectWrapper');
    const summaryCard = document.getElementById('ratingHubSummaryCard');

    if (spot) {
        spotNameEl.innerText = spot.name;
        spotAreaEl.innerText = spot.area;
    }

    if (booking) {
        metaInfoEl.innerText = `Pass #${booking.id} • Vehicle: ${booking.vehicleNumber} • Slot: ${booking.slotNumber}`;
        document.getElementById('ratingVehicleModel').value = booking.vehicleNumber;
        summaryCard.classList.remove('hidden');
        selectWrapper.classList.add('hidden');
    } else if (allowSelectSpot) {
        selectWrapper.classList.remove('hidden');
        summaryCard.classList.remove('hidden');
        metaInfoEl.innerText = `Verified Driver Feedback • Tier-1 Parking Hub`;
        populateGenericSpotDropdown(spot ? spot.id : null);
    } else {
        summaryCard.classList.remove('hidden');
        selectWrapper.classList.add('hidden');
        metaInfoEl.innerText = `Verified Driver Feedback • Tier-1 Parking Hub`;
    }

    // Reset stars & tags
    selectStarRating(5);
    resetFeedbackTags();
    resetSubRatings();
    selectValetTip(0, document.querySelector('.tip-pill'));
    document.getElementById('ratingReviewText').value = '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function closeRatingModal() {
    const modal = document.getElementById('ratingModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function populateGenericSpotDropdown(selectedId = null) {
    const select = document.getElementById('genericSpotSelect');
    if (!select) return;

    select.innerHTML = allSpots.map(s => `
        <option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>
            ${s.name} (${s.area})
        </option>
    `).join('');
}

function onGenericSpotSelected() {
    const select = document.getElementById('genericSpotSelect');
    const spotId = select.value;
    const spot = allSpots.find(s => s.id === spotId);
    if (spot) {
        activeRatingSpot = spot;
        document.getElementById('ratingTargetSpotName').innerText = spot.name;
        document.getElementById('ratingTargetSpotArea').innerText = spot.area;
    }
}

function selectStarRating(score) {
    selectedRatingScore = score;
    updateStarVisuals(score);
    updateSentimentText(score);

    // Play micro audio feedback
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440 + score * 80, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
}

function hoverStarRating(score) {
    hoveredRatingScore = score;
    updateStarVisuals(score);
    updateSentimentText(score);
}

function resetStarHover() {
    hoveredRatingScore = 0;
    updateStarVisuals(selectedRatingScore);
    updateSentimentText(selectedRatingScore);
}

function updateStarVisuals(score) {
    for (let i = 1; i <= 5; i++) {
        const icon = document.getElementById(`star-icon-${i}`);
        if (!icon) continue;

        if (i <= score) {
            icon.classList.remove('star-empty');
            icon.classList.add('star-filled');
        } else {
            icon.classList.remove('star-filled');
            icon.classList.add('star-empty');
        }
    }
}

function updateSentimentText(score) {
    const descEl = document.getElementById('starSentimentDescription');
    if (descEl && STAR_SENTIMENTS[score]) {
        descEl.innerText = STAR_SENTIMENTS[score];
    }
}

function toggleRatingTag(element, tag) {
    if (selectedRatingTags.has(tag)) {
        selectedRatingTags.delete(tag);
        element.classList.remove('active');
    } else {
        selectedRatingTags.add(tag);
        element.classList.add('active');
    }
}

function resetFeedbackTags() {
    selectedRatingTags = new Set(['Instant FASTag Gate', 'Spotless Basement', 'Helpful Guard']);
    const chips = document.querySelectorAll('.rating-tag-chip');
    chips.forEach(chip => {
        const tagText = chip.innerText.trim();
        if (selectedRatingTags.has(tagText)) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

function setSubRating(category, value, element) {
    selectedSubRatings[category] = value;
    const parent = element.parentElement;
    parent.querySelectorAll('.sub-rating-pill').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function resetSubRatings() {
    selectedSubRatings = { speed: 'Instant', safety: 'Excellent' };
    const pills = document.querySelectorAll('.sub-rating-pill');
    pills.forEach(p => {
        if (p.innerText.includes('Instant') || p.innerText.includes('Excellent')) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

function selectValetTip(amount, element) {
    selectedTipAmount = amount;
    const pills = document.querySelectorAll('.tip-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (element) element.classList.add('active');
}

function submitParkingRating() {
    if (!activeRatingSpot) {
        showToast("Please select a parking facility to rate.", "error");
        return;
    }

    const authorName = document.getElementById('ratingAuthorName').value.trim() || 'Verified Driver';
    const vehicleModel = document.getElementById('ratingVehicleModel').value.trim() || 'Car / EV';
    const reviewComment = document.getElementById('ratingReviewText').value.trim() ||
        (selectedRatingScore >= 4 
            ? 'Very smooth parking experience with instantaneous barrier entry and clean, secure parking bays.' 
            : 'Average experience, reasonable parking rates but could improve wayfinding.');

    // 1. Recalculate parking spot rating score
    const oldRating = activeRatingSpot.rating || 4.5;
    const oldReviews = activeRatingSpot.totalReviews || 120;
    const newReviews = oldReviews + 1;
    const newRating = parseFloat(((oldRating * oldReviews + selectedRatingScore) / newReviews).toFixed(1));

    activeRatingSpot.rating = newRating;
    activeRatingSpot.totalReviews = newReviews;

    // Persist spot ratings in localStorage
    try {
        const spotRatings = JSON.parse(localStorage.getItem('parkease_spot_ratings') || '{}');
        spotRatings[activeRatingSpot.id] = { rating: newRating, totalReviews: newReviews };
        localStorage.setItem('parkease_spot_ratings', JSON.stringify(spotRatings));
    } catch(e) {}

    // 2. Save new review object
    const newReview = {
        id: 'REV-' + Date.now(),
        spotId: activeRatingSpot.id,
        spotName: activeRatingSpot.name,
        area: activeRatingSpot.area,
        author: authorName,
        badge: 'Verified Commuter',
        vehicle: vehicleModel,
        rating: selectedRatingScore,
        tags: Array.from(selectedRatingTags),
        comment: reviewComment,
        subRatings: { ...selectedSubRatings },
        tip: selectedTipAmount,
        timeAgo: 'Just now',
        timestamp: Date.now()
    };

    try {
        const customReviews = JSON.parse(localStorage.getItem('parkease_custom_reviews') || '[]');
        customReviews.unshift(newReview);
        localStorage.setItem('parkease_custom_reviews', JSON.stringify(customReviews));
    } catch(e) {}

    // 3. Update Spot Cards & Map Popups
    renderSpots();
    renderVerifiedReviews();

    // 4. Show Celebration Success Screen
    document.getElementById('ratingFormContainer').classList.add('hidden');
    const successCard = document.getElementById('ratingSuccessCard');
    document.getElementById('ratingSuccessSpotName').innerText = activeRatingSpot.name;
    document.getElementById('ratingSuccessScoreBadge').innerText = `${newRating} / 5.0`;
    document.getElementById('ratingSuccessReviewsBadge').innerText = `Based on ${newReviews.toLocaleString('en-IN')} driver reviews`;
    successCard.classList.remove('hidden');

    // 5. Play Joyful Success Chime (Web Audio API Chord)
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => { // C-E-G-C Major
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.08);
            gain.gain.setValueAtTime(0.06, audioCtx.currentTime + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.08 + 0.35);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + i * 0.08);
            osc.stop(audioCtx.currentTime + i * 0.08 + 0.35);
        });
    } catch(e) {}

    showToast(`⭐ ${selectedRatingScore}-Star Review Submitted for ${activeRatingSpot.name}!`, "success");
    lucide.createIcons();
}

function renderVerifiedReviews() {
    const container = document.getElementById('verifiedReviewsContainer');
    if (!container) return;

    let customReviews = [];
    try {
        customReviews = JSON.parse(localStorage.getItem('parkease_custom_reviews') || '[]');
    } catch(e) {}

    const allReviews = [...customReviews, ...DEFAULT_VERIFIED_REVIEWS];

    // Compute live average
    let totalScore = 0;
    allReviews.forEach(r => totalScore += r.rating);
    const avgScore = (totalScore / allReviews.length).toFixed(1);
    const scoreEl = document.getElementById('overallRatingScore');
    if (scoreEl) scoreEl.innerText = avgScore;

    const countEl = document.getElementById('totalReviewsCountDisplay');
    if (countEl) countEl.innerText = `Based on ${(18420 + customReviews.length).toLocaleString('en-IN')}+ verified visits`;

    container.innerHTML = allReviews.slice(0, 6).map(rev => {
        const starsHtml = Array.from({ length: 5 }, (_, i) => `
            <i data-lucide="star" class="w-3.5 h-3.5 ${i < rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-100'}"></i>
        `).join('');

        const tagsHtml = (rev.tags || []).map(tag => `
            <span class="inline-flex items-center text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-full">
                ${tag}
            </span>
        `).join('');

        return `
            <div class="review-card-hover bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between w-full max-w-full overflow-hidden min-w-0">
                <div class="min-w-0">
                    <!-- Reviewer Header -->
                    <div class="flex items-start justify-between gap-3 mb-3 min-w-0">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
                                ${rev.author.charAt(0)}
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-xs text-slate-900 leading-snug flex items-center gap-1.5 truncate">
                                    <span class="truncate">${rev.author}</span>
                                    <span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full flex-shrink-0">Verified</span>
                                </div>
                                <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                                    <span class="truncate">${rev.vehicle}</span>
                                    <span>•</span>
                                    <span class="flex-shrink-0">${rev.timeAgo}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center flex-shrink-0">
                            ${starsHtml}
                        </div>
                    </div>

                    <!-- Facility Name -->
                    <div class="text-xs font-bold text-sky-800 flex items-center gap-1 mb-2 min-w-0">
                        <i data-lucide="map-pin" class="w-3 h-3 text-sky-600 flex-shrink-0"></i>
                        <span class="truncate">${rev.spotName}</span>
                    </div>

                    <!-- Review Comment -->
                    <p class="text-xs text-slate-600 leading-relaxed italic mb-3 break-words">
                        "${rev.comment}"
                    </p>
                </div>

                <!-- Feedback Tag Chips -->
                <div class="pt-3 border-t border-slate-100 flex flex-wrap gap-1 min-w-0">
                    ${tagsHtml}
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

// ===================================================================
// Groq AI Parking Copilot Controller (Powered by Groq Cloud API)
// ===================================================================

let aiChatHistory = [];

function openAiCopilotModal() {
    const modal = document.getElementById('aiCopilotModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const groqKey = getActiveGroqKey();
    const statusText = document.getElementById('groqStatusText');
    const statusDot = document.getElementById('groqStatusDot');
    const pingDot = document.getElementById('groqPingDot');
    const modelBadge = document.getElementById('aiModelBadge');

    const modelName = (window.ENV && window.ENV.GROQ_MODEL) || 'llama-3.3-70b-versatile';
    if (modelBadge) modelBadge.innerText = modelName;

    if (groqKey) {
        statusText.innerHTML = `<b>Groq LPU Live:</b> Connected (${modelName})`;
        statusDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-500';
        pingDot.classList.remove('hidden');
    } else {
        statusText.innerHTML = `Demo Mode • Add <code class="bg-amber-200/80 px-1 py-0.5 rounded font-mono">GROQ_API_KEY</code> in .env to activate live LLaMA`;
        statusDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-amber-500';
        pingDot.classList.add('hidden');
    }

    lucide.createIcons();
    setTimeout(() => {
        const input = document.getElementById('aiChatInput');
        if (input) input.focus();
    }, 200);
}

function closeAiCopilotModal() {
    const modal = document.getElementById('aiCopilotModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function getActiveGroqKey() {
    if (window.ENV && window.ENV.GROQ_API_KEY) {
        const k = window.ENV.GROQ_API_KEY.trim();
        if (k && k !== 'your_groq_api_key_here' && k !== '') return k;
    }
    const stored = localStorage.getItem('parkease_groq_key');
    if (stored && stored.trim()) return stored.trim();
    return null;
}

function sendQuickAiPrompt(text) {
    const input = document.getElementById('aiChatInput');
    if (input) {
        input.value = text;
        handleAiChatSubmit(new Event('submit'));
    }
}

async function handleAiChatSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const input = document.getElementById('aiChatInput');
    const query = input.value.trim();
    if (!query) return;

    input.value = '';

    // Append user message
    appendChatMessage('user', query);

    // Append typing indicator
    const typingId = 'typing-' + Date.now();
    appendTypingIndicator(typingId);

    // Call Groq or localized assistant
    const groqKey = getActiveGroqKey();
    const model = (window.ENV && window.ENV.GROQ_MODEL) || 'llama-3.3-70b-versatile';

    if (groqKey) {
        try {
            const systemContext = `You are "ParkEase AI Copilot", an expert urban parking assistant for Indian Tier-1 cities (Delhi NCR, Bengaluru, Mumbai, Pune, Hyderabad).
Current city selected: ${currentCity}.
Available spots summary: ${allSpots.slice(0, 8).map(s => `${s.name} in ${s.area} (₹${s.rates.fourWheeler}/hr, ${s.slots.available} free slots, EV:${s.slots.evAvailable > 0 ? 'Yes' : 'No'}, TowingSafe:${s.towingFreeGuaranteed ? 'Yes' : 'No'})`).join('; ')}.
Answer crisply and concisely in 2-4 sentences with relevant prices, safety, or routes. Use helpful bullet points if needed. You understand English, Hindi, and Hinglish.`;

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemContext },
                        ...aiChatHistory.slice(-4),
                        { role: 'user', content: query }
                    ],
                    temperature: 0.6,
                    max_tokens: 350
                })
            });

            const data = await response.json();
            removeTypingIndicator(typingId);

            if (data.choices && data.choices[0] && data.choices[0].message) {
                const aiReply = data.choices[0].message.content;
                aiChatHistory.push({ role: 'user', content: query });
                aiChatHistory.push({ role: 'assistant', content: aiReply });
                appendChatMessage('bot', aiReply);
            } else if (data.error) {
                appendChatMessage('bot', `⚠️ Groq API Error: ${data.error.message || 'Authentication issue'}. Please verify your key in .env`);
            }
        } catch (err) {
            console.warn("Groq API request error:", err);
            removeTypingIndicator(typingId);
            appendChatMessage('bot', getOfflineAiAnswer(query));
        }
    } else {
        // Fallback intelligent response + key instruction
        setTimeout(() => {
            removeTypingIndicator(typingId);
            appendChatMessage('bot', getOfflineAiAnswer(query));
        }, 600);
    }
}

function appendChatMessage(sender, text) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    const isUser = sender === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = `flex items-start gap-2.5 ${isUser ? 'justify-end' : ''} animate-fade-in`;

    // Format newlines and bold markdown
    const formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');

    if (isUser) {
        msgDiv.innerHTML = `
            <div class="p-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] leading-relaxed">
                ${formatted}
            </div>
            <div class="w-8 h-8 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center flex-shrink-0 text-[11px] shadow-sm">
                You
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                <i data-lucide="bot" class="w-4 h-4"></i>
            </div>
            <div class="p-3 bg-white rounded-2xl rounded-tl-sm border border-slate-200 text-slate-800 shadow-sm max-w-[85%] leading-relaxed">
                ${formatted}
            </div>
        `;
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
}

function appendTypingIndicator(id) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex items-start gap-2.5 animate-fade-in';
    div.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
            <i data-lucide="bot" class="w-4 h-4 animate-spin"></i>
        </div>
        <div class="p-3 bg-white rounded-2xl rounded-tl-sm border border-slate-200 text-slate-500 shadow-sm flex items-center gap-1.5 text-xs">
            <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></span>
            <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
            <span class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
            <span class="ml-1 text-[11px] text-slate-400 font-mono">Groq LPU thinking...</span>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function getOfflineAiAnswer(query) {
    const q = query.toLowerCase();
    let reply = "";

    if (q.includes('ev') || q.includes('charg')) {
        reply = `⚡ <b>EV Fast Charging Hubs:</b><br>
        • <b>Cyber Hub Basement P2</b> (Gurugram) - 60kW DC Rapid Chargers<br>
        • <b>Select Citywalk</b> (Saket, Delhi) - 30kW DC Fast Chargers<br>
        • <b>Indiranagar 100ft Road</b> (Bengaluru) - 7.4kW AC & 30kW DC<br>
        Rates are standard parking fare + ₹45-₹150 for power recharge.`;
    } else if (q.includes('cheap') || q.includes('sasta') || q.includes('rate') || q.includes('price')) {
        reply = `💰 <b>Most Affordable Parking Options:</b><br>
        • <b>CP Block B Underground</b>: ₹40/hr (2-Wheeler: ₹20/hr, Day pass ₹250)<br>
        • <b>Indiranagar Metro MLCP</b>: ₹40/hr with full day pass ₹220<br>
        • Monthly corporate pass offers an instant <b>35% discount</b>!`;
    } else if (q.includes('tow') || q.includes('challan') || q.includes('police') || q.includes('fine')) {
        reply = `🚨 <b>Anti-Challan Warning:</b><br>
        Street parking in CP Outer Circle, 100ft Road Indiranagar & BKC carries heavy towing squads:<br>
        • Towing charge: ₹1,500<br>
        • No-parking fine: ₹500<br>
        • <b>Total penalty: ₹2,000</b>.<br>
        Always use ParkEase verified covered hubs to guarantee zero towing.`;
    } else if (q.includes('fastag') || q.includes('barrier') || q.includes('gate')) {
        reply = `🤖 <b>FASTag & RFID Barrier Clearance:</b><br>
        Our AI camera scans your license plate on approach. If you have an active ParkEase Smart Pass or FASTag RFID sticker, the boom barrier swings open in <b>1.5 seconds</b> without cash exchange.`;
    } else {
        reply = `🚗 Found multiple verified parking facilities in <b>${currentCity.toUpperCase()}</b>! All lots feature CCTV surveillance, 24/7 security guards, and guaranteed towing protection. You can book an instant slot with visual 2D floor plans from the home screen.`;
    }

    reply += `<br><br><span class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded block">💡 <b>Tip:</b> Add your <code>GROQ_API_KEY</code> in <b>.env</b> or <b>env.js</b> to unlock live conversational LLaMA-3.3 70B!</span>`;

    return reply;
}

// ===================================================================
// User Onboarding, Problem Resolution Tracker & CRM Controller
// ===================================================================

const DEFAULT_SAMPLE_LEADS = [
    {
        id: 'LEAD-101',
        name: 'Amit Verma',
        phone: '9871123456',
        city: 'delhi',
        vehicleNumber: 'DL 04 CA 7890',
        vehicleType: 'fourWheeler',
        status: 'Smooth',
        issueDetail: 'No issues reported. Smooth booking at Cyber Hub.',
        registeredAt: Date.now() - 86400000 * 2,
        registeredDate: '2 days ago'
    },
    {
        id: 'LEAD-102',
        name: 'Priya Sharma',
        phone: '9988765432',
        city: 'bengaluru',
        vehicleNumber: 'KA 03 MH 4321',
        vehicleType: 'suv',
        status: 'Reported Issue',
        issueDetail: 'Delay in barrier scan at Indiranagar MLCP',
        registeredAt: Date.now() - 86400000 * 1,
        registeredDate: 'Yesterday'
    },
    {
        id: 'LEAD-103',
        name: 'Rohit Mehta',
        phone: '9820011223',
        city: 'mumbai',
        vehicleNumber: 'MH 01 DE 9988',
        vehicleType: 'ev',
        status: 'Resolved',
        issueDetail: 'Resolved: Guided to 60kW DC charger plug in BKC',
        registeredAt: Date.now() - 3600000 * 4,
        registeredDate: '4 hours ago'
    }
];

function initUserProfileAndCrm() {
    // 1. Seed default customer leads if not present
    let leads = [];
    try {
        const storedLeads = localStorage.getItem('parkease_registered_leads');
        if (!storedLeads) {
            localStorage.setItem('parkease_registered_leads', JSON.stringify(DEFAULT_SAMPLE_LEADS));
            leads = DEFAULT_SAMPLE_LEADS;
        } else {
            leads = JSON.parse(storedLeads);
        }
    } catch(e) {
        leads = DEFAULT_SAMPLE_LEADS;
    }

    updateCrmBadge(leads.length);

    // 2. Check if user already completed onboarding
    let profile = null;
    try {
        profile = JSON.parse(localStorage.getItem('parkease_user_profile') || 'null');
    } catch(e) {}

    const profileNavText = document.getElementById('userProfileNavText');
    const profileNavBtn = document.getElementById('userProfileNavBtn');

    if (profile && profile.name) {
        if (profileNavText) {
            const firstName = profile.name.trim().split(' ')[0];
            profileNavText.innerText = `👤 ${firstName}`;
        }
        if (profileNavBtn) {
            profileNavBtn.title = `Profile: ${profile.name} (${profile.vehicleNumber})`;
            profileNavBtn.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
            profileNavBtn.classList.add('bg-slate-100', 'text-slate-800', 'border-slate-300');
        }
    } else {
        // First-time user popup after 1.2s delay
        setTimeout(() => {
            openUserOnboardingModal();
        }, 1200);
    }
}

function updateCrmBadge(count) {
    const badge = document.getElementById('crmUsersCountBadge');
    if (badge) {
        badge.innerText = count || 0;
    }
}

function openUserOnboardingModal() {
    const modal = document.getElementById('userOnboardingModal');
    if (!modal) return;

    // Prefill form if profile already exists
    try {
        const profile = JSON.parse(localStorage.getItem('parkease_user_profile') || 'null');
        if (profile) {
            if (document.getElementById('onboardNameInput')) document.getElementById('onboardNameInput').value = profile.name || '';
            if (document.getElementById('onboardPhoneInput')) document.getElementById('onboardPhoneInput').value = profile.phone || '';
            if (document.getElementById('onboardCitySelect')) document.getElementById('onboardCitySelect').value = profile.city || currentCity || 'delhi';
            if (document.getElementById('onboardVehicleNoInput')) document.getElementById('onboardVehicleNoInput').value = profile.vehicleNumber || '';
            if (document.getElementById('onboardVehicleTypeSelect')) document.getElementById('onboardVehicleTypeSelect').value = profile.vehicleType || currentVehicleType || 'fourWheeler';
        }
    } catch(e) {}

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function closeUserOnboardingModal() {
    const modal = document.getElementById('userOnboardingModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function handleUserOnboardingSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();

    const name = document.getElementById('onboardNameInput').value.trim();
    const phoneRaw = document.getElementById('onboardPhoneInput').value.trim().replace(/[^0-9]/g, '');
    const city = document.getElementById('onboardCitySelect').value;
    const vehicleNumber = document.getElementById('onboardVehicleNoInput').value.trim().toUpperCase();
    const vehicleType = document.getElementById('onboardVehicleTypeSelect').value;

    if (!name) {
        showToast("Please enter your name.", "error");
        return;
    }
    if (phoneRaw.length < 10) {
        showToast("Please enter a valid 10-digit mobile number.", "error");
        return;
    }
    if (!vehicleNumber) {
        showToast("Please enter your vehicle license plate.", "error");
        return;
    }

    const cleanPhone = phoneRaw.slice(-10);

    const userProfile = {
        name: name,
        phone: cleanPhone,
        city: city,
        vehicleNumber: vehicleNumber,
        vehicleType: vehicleType,
        discount: 50,
        couponCode: 'PARK50',
        registeredAt: Date.now()
    };

    // Save active profile
    localStorage.setItem('parkease_user_profile', JSON.stringify(userProfile));

    // Save lead into CRM registered leads
    let leads = [];
    try {
        leads = JSON.parse(localStorage.getItem('parkease_registered_leads') || '[]');
    } catch(e) {
        leads = [];
    }

    // Check if lead already exists with same phone
    const existingIndex = leads.findIndex(l => l.phone === cleanPhone);
    const newLead = {
        id: existingIndex >= 0 ? leads[existingIndex].id : 'LEAD-' + Date.now(),
        name: name,
        phone: cleanPhone,
        city: city,
        vehicleNumber: vehicleNumber,
        vehicleType: vehicleType,
        status: existingIndex >= 0 ? leads[existingIndex].status : 'Smooth',
        issueDetail: existingIndex >= 0 ? leads[existingIndex].issueDetail : 'New Registration - Verified Driver',
        registeredAt: Date.now(),
        registeredDate: 'Just now'
    };

    if (existingIndex >= 0) {
        leads[existingIndex] = newLead;
    } else {
        leads.unshift(newLead);
    }

    localStorage.setItem('parkease_registered_leads', JSON.stringify(leads));
    updateCrmBadge(leads.length);

    // Update UI badge
    const profileNavText = document.getElementById('userProfileNavText');
    const profileNavBtn = document.getElementById('userProfileNavBtn');
    if (profileNavText) {
        const firstName = name.split(' ')[0];
        profileNavText.innerText = `👤 ${firstName}`;
    }
    if (profileNavBtn) {
        profileNavBtn.title = `Profile: ${name} (${vehicleNumber})`;
        profileNavBtn.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        profileNavBtn.classList.add('bg-slate-100', 'text-slate-800', 'border-slate-300');
    }

    // Pre-fill booking fields if open
    const vehicleNumInput = document.getElementById('vehicleNumberInput');
    if (vehicleNumInput && !vehicleNumInput.value) {
        vehicleNumInput.value = vehicleNumber;
    }

    closeUserOnboardingModal();

    // Play celebration chime
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.08);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.08 + 0.35);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + i * 0.08);
            osc.stop(audioCtx.currentTime + i * 0.08 + 0.35);
        });
    } catch(e) {}

    showToast(`🎉 Welcome ${name}! ₹50 Discount Voucher PARK50 Activated.`, "success");
}

function openCrmModal() {
    const modal = document.getElementById('crmModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    renderCrmDashboard();
    lucide.createIcons();
}

function closeCrmModal() {
    const modal = document.getElementById('crmModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function renderCrmDashboard(filterQuery = '') {
    let leads = [];
    try {
        leads = JSON.parse(localStorage.getItem('parkease_registered_leads') || '[]');
    } catch(e) {
        leads = [];
    }

    let bookings = [];
    try {
        bookings = JSON.parse(localStorage.getItem('parkease_bookings') || '[]');
    } catch(e) {}

    // Update metrics
    const metricUsers = document.getElementById('crmMetricTotalUsers');
    if (metricUsers) metricUsers.innerText = leads.length;

    const metricBookings = document.getElementById('crmMetricActiveBookings');
    if (metricBookings) metricBookings.innerText = bookings.length;

    // Filter leads
    const q = filterQuery.toLowerCase().trim();
    const filtered = leads.filter(l => {
        if (!q) return true;
        return (
            (l.name && l.name.toLowerCase().includes(q)) ||
            (l.phone && l.phone.includes(q)) ||
            (l.vehicleNumber && l.vehicleNumber.toLowerCase().includes(q)) ||
            (l.city && l.city.toLowerCase().includes(q)) ||
            (l.status && l.status.toLowerCase().includes(q))
        );
    });

    const container = document.getElementById('crmUsersListContainer');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                <i data-lucide="user-x" class="w-10 h-10 mx-auto text-slate-300 mb-2"></i>
                <p class="font-bold text-slate-700">No matching users found</p>
                <p class="text-xs text-slate-400 mt-1">Try searching by a different name, phone or vehicle plate.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = filtered.map(lead => {
        const cleanPhone = (lead.phone || '').replace(/[^0-9]/g, '').slice(-10);
        const cityLabel = (lead.city || 'Delhi').toUpperCase();
        
        // Status badge styling
        let statusBadge = '';
        if (lead.status === 'Reported Issue') {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                <i data-lucide="alert-circle" class="w-3 h-3 text-rose-600"></i> Issue Reported
            </span>`;
        } else if (lead.status === 'Resolved') {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1">
                <i data-lucide="check-circle-2" class="w-3 h-3 text-sky-600"></i> Issue Resolved
            </span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <i data-lucide="check" class="w-3 h-3 text-emerald-600"></i> Smooth (No Issues)
            </span>`;
        }

        // WhatsApp Problem Check-in Message
        const problemMessage = `Hello ${lead.name}, this is Hemant from ParkEase Support team. We noticed you recently registered your vehicle (${lead.vehicleNumber}) on ParkEase in ${cityLabel}. Did you face any difficulty with parking slot booking, navigation, or gate entry? We are here to help and ensure a smooth experience!`;
        const problemWaUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(problemMessage)}`;

        // WhatsApp Promotional Offer Message
        const offerMessage = `Hello ${lead.name}! 🎉 Special Offer from ParkEase: Use coupon code PARK50 to get ₹50 OFF on your next parking reservation for your vehicle ${lead.vehicleNumber} in ${cityLabel}. 100% CCTV-guarded slots, FASTag express clearance, and zero towing guarantee! Book now: ${window.location.href}`;
        const offerWaUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(offerMessage)}`;

        return `
            <div class="p-4 bg-white rounded-2xl border border-slate-200 hover:border-purple-300 shadow-sm transition-all space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center flex-shrink-0">
                            ${(lead.name || 'U').charAt(0)}
                        </div>
                        <div>
                            <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <span>${lead.name}</span>
                                <span class="text-[10px] text-slate-400 font-mono">(${cityLabel})</span>
                            </div>
                            <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                                <span>📞 +91 ${cleanPhone}</span>
                                <span>•</span>
                                <span class="bg-slate-100 text-slate-800 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider text-[10px]">${lead.vehicleNumber}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${statusBadge}
                        <button onclick="toggleLeadIssueStatus('${lead.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-semibold transition-colors" title="Toggle Problem Status (Smooth / Issue / Resolved)">
                            Toggle Status
                        </button>
                    </div>
                </div>

                <!-- Issue Details / Notes -->
                <div class="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start justify-between gap-2">
                    <div class="flex-1">
                        <span class="font-semibold text-slate-800">Support Log:</span>
                        <span class="text-slate-600 ml-1">${lead.issueDetail || 'No problems reported'}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 flex-shrink-0">${lead.registeredDate || 'Recently'}</span>
                </div>

                <!-- 1-Click WhatsApp Support & Offers Outreach Bar -->
                <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    <a href="${problemWaUrl}" target="_blank" class="flex-1 min-w-[140px] py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all">
                        <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                        <span>Check Problem (WhatsApp)</span>
                    </a>

                    <a href="${offerWaUrl}" target="_blank" class="flex-1 min-w-[140px] py-1.5 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/20 transition-all">
                        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-300"></i>
                        <span>Send ₹50 Offer</span>
                    </a>

                    <button onclick="deleteCrmLead('${lead.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Remove customer from list">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

function filterCrmUsers() {
    const input = document.getElementById('crmSearchInput');
    const query = input ? input.value : '';
    renderCrmDashboard(query);
}

function toggleLeadIssueStatus(leadId) {
    let leads = [];
    try {
        leads = JSON.parse(localStorage.getItem('parkease_registered_leads') || '[]');
    } catch(e) {
        leads = [];
    }

    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (lead.status === 'Smooth' || !lead.status) {
        lead.status = 'Reported Issue';
        lead.issueDetail = prompt("Enter problem description (e.g. barrier scan issue, slot occupied, payment difficulty):") || "User reported an issue during check-in.";
    } else if (lead.status === 'Reported Issue') {
        lead.status = 'Resolved';
        lead.issueDetail = "Support team contacted user via WhatsApp. Issue resolved.";
    } else {
        lead.status = 'Smooth';
        lead.issueDetail = "Service running normally without issues.";
    }

    localStorage.setItem('parkease_registered_leads', JSON.stringify(leads));
    filterCrmUsers();
    showToast(`Status updated to: ${lead.status}`, "info");
}

function deleteCrmLead(leadId) {
    if (!confirm("Are you sure you want to remove this user from the CRM?")) return;

    let leads = [];
    try {
        leads = JSON.parse(localStorage.getItem('parkease_registered_leads') || '[]');
    } catch(e) {
        leads = [];
    }

    leads = leads.filter(l => l.id !== leadId);
    localStorage.setItem('parkease_registered_leads', JSON.stringify(leads));
    updateCrmBadge(leads.length);
    filterCrmUsers();
    showToast("User removed from list.", "info");
}

function exportUsersToCSV() {
    let leads = [];
    try {
        leads = JSON.parse(localStorage.getItem('parkease_registered_leads') || '[]');
    } catch(e) {
        leads = [];
    }

    if (leads.length === 0) {
        showToast("No registered users to export.", "error");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Lead ID,Name,Phone,City,Vehicle Number,Vehicle Type,Status,Issue Description,Registration Date\n";

    leads.forEach(l => {
        const row = [
            `"${l.id || ''}"`,
            `"${(l.name || '').replace(/"/g, '""')}"`,
            `"'+91${l.phone || ''}"`,
            `"${l.city || ''}"`,
            `"${l.vehicleNumber || ''}"`,
            `"${l.vehicleType || ''}"`,
            `"${l.status || ''}"`,
            `"${(l.issueDetail || '').replace(/"/g, '""')}"`,
            `"${l.registeredDate || ''}"`
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `parkease_customers_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("📁 Exported leads to CSV file successfully!", "success");
}

