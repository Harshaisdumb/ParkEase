/**
 * ParkEase - Application Logic & Map Controller
 * Implements Real-time Search, Leaflet Integration, Booking Flow & Pass Generation
 */

let map;
let markersLayer;
let currentCity = 'delhi';
let currentVehicleType = 'fourWheeler'; // 'twoWheeler', 'fourWheeler', 'suv', 'ev'
let userCoords = null;
let activeSpotForBooking = null;
let allSpots = [];

// Initialize App on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initDataset();
    initMap();
    setupEventListeners();
    renderSpots();
    renderCityStats();
    loadExistingBookings();
});

// Aggregate all spots for universal search
function initDataset() {
    allSpots = [];
    Object.keys(CITIES_DATA).forEach(cityKey => {
        CITIES_DATA[cityKey].spots.forEach(spot => {
            allSpots.push(spot);
        });
    });
}

// Initialize Leaflet Map
function initMap() {
    const city = CITIES_DATA[currentCity];
    map = L.map('mapContainer', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView(city.center, city.zoom);

    // OpenStreetMap CartoDB Positron / OSM Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // Invalidate size to guarantee tile rendering in dynamic layouts
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 250);
    window.addEventListener('resize', () => {
        if (map) map.invalidateSize();
    });
}

// Render Custom Map Markers & List Cards
function renderSpots() {
    markersLayer.clearLayers();
    const spotsContainer = document.getElementById('spotsContainer');
    const spotsCountBadge = document.getElementById('spotsCountBadge');

    const filteredSpots = getFilteredSpots();
    spotsCountBadge.innerText = `${filteredSpots.length} Available`;

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
        // Calculate Distance if user location is active
        let distanceText = '';
        if (userCoords) {
            const dist = calculateDistance(userCoords.lat, userCoords.lng, spot.lat, spot.lng);
            distanceText = `<span class="inline-flex items-center text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                <i data-lucide="navigation" class="w-3 h-3 mr-1 inline"></i>${dist.toFixed(1)} km away
            </span>`;
        }

        // Slot status styling
        const availRatio = spot.slots.available / spot.slots.total;
        let availClass = 'bg-emerald-500';
        let badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        let pinClass = 'pin-avail-high';
        let statusText = 'Slots Available';

        if (spot.slots.available <= 5) {
            availClass = 'bg-rose-500';
            badgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
            pinClass = 'pin-avail-low';
            statusText = 'Filling Fast (Few Left)';
        } else if (availRatio < 0.25) {
            availClass = 'bg-amber-500';
            badgeClass = 'text-amber-700 bg-amber-50 border-amber-200';
            pinClass = 'pin-avail-med';
            statusText = 'Moderate Rush';
        }

        // Price according to vehicle
        const ratePerHour = getRateForVehicle(spot, currentVehicleType);

        // Marker for Leaflet
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
                <button onclick="openBookingModal('${spot.id}')" class="w-full py-1.5 px-3 bg-sky-600 text-white rounded font-medium text-xs hover:bg-sky-700 text-center block">
                    Reserve Now
                </button>
            </div>
        `;

        const marker = L.marker([spot.lat, spot.lng], { icon: customIcon }).addTo(markersLayer);
        marker.bindPopup(popupContent);

        // Card HTML
        cardsHTML += `
            <div id="card-${spot.id}" class="spot-card bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:border-sky-300">
                <div class="flex gap-4">
                    <div class="relative w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                        <img src="${spot.image}" alt="${spot.name}" class="w-full h-full object-cover">
                        <div class="absolute bottom-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1">
                            <i data-lucide="star" class="w-3 h-3 text-amber-400 fill-amber-400"></i> ${spot.rating}
                        </div>
                    </div>

                    <div class="flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-start justify-between gap-2">
                                <h3 class="font-bold text-slate-900 text-base leading-snug line-clamp-1 hover:text-sky-600 cursor-pointer" onclick="zoomToSpot(${spot.lat}, ${spot.lng})">
                                    ${spot.name}
                                </h3>
                                <div class="text-right flex-shrink-0">
                                    <div class="text-lg font-black text-sky-600">₹${ratePerHour}<span class="text-xs font-normal text-slate-500">/hr</span></div>
                                    <div class="text-[10px] text-slate-400 font-medium">₹${spot.rates.dayPass} Full Day</div>
                                </div>
                            </div>
                            
                            <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
                                <span class="line-clamp-1">${spot.area}</span>
                            </p>
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

                        <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
                                <span class="font-medium text-slate-700">${spot.type}</span>
                                <span>•</span>
                                <span>${spot.operator}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="zoomToSpot(${spot.lat}, ${spot.lng})" title="Show on Map" class="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                                    <i data-lucide="crosshair" class="w-4 h-4"></i>
                                </button>
                                <button onclick="openBookingModal('${spot.id}')" class="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1">
                                    Book Spot
                                    <i data-lucide="arrow-right" class="w-3 h-3"></i>
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

// Get appropriate hourly rate based on selected vehicle
function getRateForVehicle(spot, vType) {
    if (vType === 'twoWheeler') return spot.rates.twoWheeler;
    if (vType === 'suv') return spot.rates.suv;
    if (vType === 'ev') return spot.rates.fourWheeler + 20; // Includes charging fee
    return spot.rates.fourWheeler;
}

// Filter dataset based on UI controls
function getFilteredSpots() {
    const searchVal = document.getElementById('searchInput').value.trim().toLowerCase();
    const fastagOnly = document.getElementById('filterFastag').checked;
    const evOnly = document.getElementById('filterEv').checked;
    const towFreeOnly = document.getElementById('filterTowingFree').checked;
    const sortBy = document.getElementById('sortSelect').value;

    let spots = currentCity === 'all' ? allSpots : CITIES_DATA[currentCity].spots;

    return spots.filter(spot => {
        // Text search
        if (searchVal) {
            const inName = spot.name.toLowerCase().includes(searchVal);
            const inArea = spot.area.toLowerCase().includes(searchVal);
            const inCity = CITIES_DATA[spot.city]?.name.toLowerCase().includes(searchVal);
            if (!inName && !inArea && !inCity) return false;
        }

        // Toggle filters
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

// Event Listeners setup
function setupEventListeners() {
    // City Selector
    const citySelect = document.getElementById('citySelect');
    citySelect.addEventListener('change', (e) => {
        switchCity(e.target.value);
    });

    // Vehicle Type Buttons
    const vehicleBtns = document.querySelectorAll('.vehicle-btn');
    vehicleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            vehicleBtns.forEach(b => b.classList.remove('active', 'border-sky-600', 'bg-sky-50', 'text-sky-700'));
            btn.classList.add('active', 'border-sky-600', 'bg-sky-50', 'text-sky-700');
            currentVehicleType = btn.dataset.type;
            renderSpots();
        });
    });

    // Search and filter triggers
    document.getElementById('searchInput').addEventListener('input', debounce(renderSpots, 250));
    document.getElementById('filterFastag').addEventListener('change', renderSpots);
    document.getElementById('filterEv').addEventListener('change', renderSpots);
    document.getElementById('filterTowingFree').addEventListener('change', renderSpots);
    document.getElementById('sortSelect').addEventListener('change', renderSpots);

    // Geolocation trigger
    document.getElementById('locateMeBtn').addEventListener('click', requestUserLocation);

    // Host space earnings calculator
    const hostSlotsInput = document.getElementById('hostSlotsInput');
    const hostHoursInput = document.getElementById('hostHoursInput');
    if (hostSlotsInput && hostHoursInput) {
        const updateEarnings = () => {
            const slots = parseInt(hostSlotsInput.value) || 1;
            const hours = parseInt(hostHoursInput.value) || 8;
            const avgRate = 45; // ₹45/hr average
            const monthlyEstimate = slots * hours * avgRate * 26; // 26 working days
            document.getElementById('estimatedEarningsText').innerText = `₹${monthlyEstimate.toLocaleString('en-IN')}`;
        };
        hostSlotsInput.addEventListener('input', updateEarnings);
        hostHoursInput.addEventListener('input', updateEarnings);
    }
}

// Switch City View
function switchCity(cityKey) {
    currentCity = cityKey;
    if (cityKey !== 'all' && CITIES_DATA[cityKey]) {
        const city = CITIES_DATA[cityKey];
        map.flyTo(city.center, city.zoom, { animate: true, duration: 1.2 });
    }
    renderSpots();
    renderCityStats();
}

// Zoom into a specific spot on map
function zoomToSpot(lat, lng) {
    map.flyTo([lat, lng], 16, { animate: true, duration: 1 });
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

            // Add user pin on map
            const userIcon = L.divIcon({
                className: 'user-location-marker',
                html: `<div class="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center animate-bounce">
                    <div class="w-2.5 h-2.5 bg-white rounded-full"></div>
                </div>`,
                iconSize: [24, 24]
            });

            L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
                .addTo(map)
                .bindPopup("<b>You are here!</b><br>Searching nearest parking spaces.")
                .openPopup();

            map.flyTo([userCoords.lat, userCoords.lng], 14, { animate: true, duration: 1.2 });

            // Sort by nearest distance automatically
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

// Reset Filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterFastag').checked = false;
    document.getElementById('filterEv').checked = false;
    document.getElementById('filterTowingFree').checked = false;
    document.getElementById('sortSelect').value = 'avail';
    renderSpots();
}

// Render dynamic city stats bar
function renderCityStats() {
    const statsEl = document.getElementById('cityQuickStats');
    if (!statsEl) return;

    let availableCount = 0;
    let totalCount = 0;
    let evCount = 0;

    const spots = currentCity === 'all' ? allSpots : CITIES_DATA[currentCity].spots;
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
// Booking Modal & Pass Generation
// ===================================================================

function openBookingModal(spotId) {
    const spot = allSpots.find(s => s.id === spotId);
    if (!spot) return;

    activeSpotForBooking = spot;
    document.getElementById('modalSpotName').innerText = spot.name;
    document.getElementById('modalSpotArea').innerText = spot.area;
    document.getElementById('modalSpotImage').src = spot.image;
    document.getElementById('modalFreeSlots').innerText = `${spot.slots.available} Slots Free`;

    // Populate vehicle pill selection
    document.getElementById('modalVehicleSelect').value = currentVehicleType;

    // Set Default Entry Time as Now
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(Math.ceil(now.getMinutes() / 15) * 15 % 60).padStart(2, '0');
    document.getElementById('bookingStartTime').value = `${hours}:${minutes}`;

    updateBookingCost();

    // Show Modal
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
    const durationHours = parseFloat(document.getElementById('bookingDuration').value) || 2;
    const hourlyRate = getRateForVehicle(activeSpotForBooking, vType);

    const baseFare = hourlyRate * durationHours;
    const convenienceFee = 5; // ₹5 platform fee
    const gst = Math.round(baseFare * 0.18); // 18% GST
    const total = baseFare + convenienceFee + gst;

    document.getElementById('fareHourlyRate').innerText = `₹${hourlyRate}/hr`;
    document.getElementById('fareBaseAmount').innerText = `₹${baseFare}`;
    document.getElementById('fareGstAmount').innerText = `₹${gst}`;
    document.getElementById('fareTotalAmount').innerText = `₹${total}`;
}

// Confirm Reservation and Generate Smart Pass
function confirmBooking(event) {
    event.preventDefault();
    if (!activeSpotForBooking) return;

    const vehicleNumber = document.getElementById('vehicleNumberInput').value.trim().toUpperCase();
    if (!vehicleNumber) {
        showToast("Please enter a valid vehicle license plate number.", "error");
        return;
    }

    const duration = document.getElementById('bookingDuration').value;
    const vType = document.getElementById('modalVehicleSelect').value;
    const totalAmount = document.getElementById('fareTotalAmount').innerText;
    const paymentMethod = document.querySelector('input[name="payMethod"]:checked').value;

    const slotRandomNumber = `B${Math.floor(Math.random() * 2) + 1}-#${Math.floor(Math.random() * 50) + 1}`;
    const bookingId = 'PK-' + Math.floor(100000 + Math.random() * 900000);
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
        slotNumber: slotRandomNumber,
        duration: duration,
        totalPaid: totalAmount,
        paymentMethod: paymentMethod,
        timestamp: bookingTime,
        status: 'Active',
        createdAt: Date.now()
    };

    // Save to LocalStorage
    saveBooking(newBooking);

    // Reduce visual count
    activeSpotForBooking.slots.available = Math.max(0, activeSpotForBooking.slots.available - 1);
    renderSpots();

    closeBookingModal();
    renderPass(newBooking);
    showToast("Parking Slot Confirmed! Your smart pass has been generated.", "success");
}

function renderPass(booking) {
    document.getElementById('passBookingId').innerText = booking.id;
    document.getElementById('passSpotName').innerText = booking.spotName;
    document.getElementById('passArea').innerText = booking.area;
    document.getElementById('passSlotNumber').innerText = booking.slotNumber;
    document.getElementById('passVehicleNo').innerText = booking.vehicleNumber;
    document.getElementById('passDuration').innerText = `${booking.duration} Hours`;
    document.getElementById('passTotal').innerText = booking.totalPaid;
    document.getElementById('passPayMethod').innerText = booking.paymentMethod;
    document.getElementById('passTime').innerText = booking.timestamp;

    // Google Maps Navigation URL
    const navBtn = document.getElementById('passGoogleMapsBtn');
    navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${booking.lat},${booking.lng}`;

    // Show Pass Modal
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

// Local Storage Handlers
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
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-sky-300 transition-all">
                <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="font-bold text-sky-700">${b.id}</span>
                    <span class="px-2 py-0.5 rounded-full font-semibold ${b.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${b.status}</span>
                </div>
                <h4 class="font-bold text-sm text-slate-900">${b.spotName}</h4>
                <p class="text-xs text-slate-500 mt-0.5">${b.area}</p>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-100">
                    <div><span class="text-slate-400">Slot:</span> <b class="text-slate-800">${b.slotNumber}</b></div>
                    <div><span class="text-slate-400">Vehicle:</span> <b class="text-slate-800">${b.vehicleNumber}</b></div>
                    <div><span class="text-slate-400">Duration:</span> <b class="text-slate-800">${b.duration} hrs</b></div>
                    <div><span class="text-slate-400">Amount:</span> <b class="text-emerald-600">${b.totalPaid}</b></div>
                </div>
                <div class="mt-3 flex gap-2">
                    <button onclick='renderPass(${JSON.stringify(b)})' class="flex-1 py-1.5 bg-sky-600 text-white rounded text-xs font-semibold hover:bg-sky-700">
                        View QR Pass
                    </button>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" class="px-3 py-1.5 bg-slate-200 text-slate-800 rounded text-xs font-semibold hover:bg-slate-300 flex items-center">
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

// Host Space Submission
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
        lat: CITIES_DATA[city]?.center[0] + (Math.random() - 0.5) * 0.04 || 28.6139,
        lng: CITIES_DATA[city]?.center[1] + (Math.random() - 0.5) * 0.04 || 77.2090,
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

    // Add to city data
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

// Distance Calculation (Haversine formula in KM)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in KM
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

// Utility: Debounce for search
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Notification Toast
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
